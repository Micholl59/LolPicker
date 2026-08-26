import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { cacheGet, cacheSet } from "./cache.js";
import type { Role } from "./ugg.js";

const execFileAsync = promisify(execFile);

// Lolalytics n'expose aucune API : les pages sont rendues côté serveur et les
// chiffres sont dans le HTML. On télécharge donc la page « counters » du
// champion (~186 Ko compressée) et on lit les cartes de matchup.
//
// Vérifié le 2026-07-26 en recoupant avec l'affichage réel du site :
//   carte = « Ahri | 45.14% | Δ1 -0.85 • Δ2 -5.14 | 45.99% »
// L'identité de l'adversaire est prise dans le lien (/vs/<slug>/), jamais dans
// le texte : un premier essai basé sur le texte donnait de faux champions.

async function curlText(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-s",
      "--compressed", // 1,7 Mo -> ~186 Ko
      "--fail-with-body",
      "-H",
      "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      url,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout;
}

// Le slug lolalytics est le nom ANGLAIS du champion, en minuscules, sans
// caractère spécial (MonkeyKing -> « wukong », Kai'Sa -> « kaisa »).
let slugsById: Map<string, string> | null = null;

export async function getSlugs(version: string): Promise<Map<string, string>> {
  if (slugsById) return slugsById;
  const key = `lola-slugs-${version}`;
  let pairs = cacheGet<[string, string][]>(key, config.ttl.ddragon);
  if (!pairs) {
    const res = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    );
    if (!res.ok) throw new Error(`champion.json en_US HTTP ${res.status}`);
    const data = (await res.json()) as { data: Record<string, { id: string; name: string }> };
    pairs = Object.values(data.data).map((c) => [
      c.id,
      c.name
        .toLowerCase()
        .replace(/\s*&.*$/, "") // « Nunu & Willump » -> nunu
        .replace(/[^a-z0-9]/g, ""),
    ]);
    cacheSet(key, pairs);
  }
  slugsById = new Map(pairs);
  return slugsById;
}

export interface LolaMatchup {
  slug: string;
  wr: number; // winrate du champion dans ce duel
  delta1: number | null; // écart vs son winrate habituel
  delta2: number | null; // écart vs l'attendu
  wrAjuste: number | null; // second winrate affiché par le site
}

const LANE_PARAM: Record<Role, string> = {
  top: "top",
  jungle: "jungle",
  mid: "middle",
  adc: "bottom",
  support: "support",
};

// patch=30 = 30 derniers jours : indispensable, sinon le site ne renvoie
// qu'une trentaine de matchups au lieu de la table complète.
export async function getLolaCounters(
  slug: string,
  role: Role,
  tier = "platinum_plus",
): Promise<LolaMatchup[]> {
  const key = `lola-counters-${slug}-${role}-${tier}`;
  const cached = cacheGet<LolaMatchup[]>(key, config.ttl.ugg);
  if (cached) return cached;

  const url =
    `https://lolalytics.com/lol/${slug}/counters/` +
    `?patch=30&tier=${tier}&lane=${LANE_PARAM[role]}&vslane=${LANE_PARAM[role]}`;

  let html: string;
  try {
    html = await curlText(url);
  } catch {
    return []; // champion absent du site ou page indisponible
  }

  const out: LolaMatchup[] = [];
  // Chaque carte de matchup a une largeur fixe : on s'ancre dessus
  for (const carte of html.split('w-[118px]').slice(1)) {
    const adv = /\/vs\/([a-z0-9]+)\/build\//.exec(carte);
    if (!adv) continue;
    const wrs = [...carte.matchAll(/-->(\d{1,2}\.\d{1,2})<!---->%/g)].map((m) => Number(m[1]));
    if (!wrs.length) continue;
    // Dans le HTML les indices sont balisés : « Δ<sub>1</sub> -0.85 ».
    // Après retrait des balises il reste un espace entre Δ et son indice.
    const deltas = /Δ\s*1\s*(-?[\d.]+)[^\d-]*Δ\s*2\s*(-?[\d.]+)/.exec(
      carte.replace(/<[^>]+>/g, " "),
    );
    out.push({
      slug: adv[1],
      wr: wrs[0],
      delta1: deltas ? Number(deltas[1]) : null,
      delta2: deltas ? Number(deltas[2]) : null,
      wrAjuste: wrs[1] ?? null,
    });
  }

  if (out.length) cacheSet(key, out);
  return out;
}
