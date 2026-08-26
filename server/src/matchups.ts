import { type Role } from "./ugg.js";
import type { Champion } from "./ddragon.js";
import { loadStyles } from "./styles.js";
import { getLolaCounters, getSlugs } from "./lolalytics.js";

// Source des matchups : LOLALYTICS (u.gg abandonné le 2026-07-26 sur demande —
// lolalytics fournit en plus les écarts Δ1/Δ2 et un winrate ajusté).
// Voir lolalytics.ts pour la récupération et l'analyse des pages.

export interface MatchupLine {
  key: string; // clé numérique Riot de l'adversaire
  wr: number; // winrate du champion étudié dans ce duel, en %
  delta1: number | null;
  delta2: number | null;
  wrAjuste: number | null;
}

// Récupère les matchups d'un champion pour un rôle, traduits en clés Riot.
async function getMatchups(
  champ: Champion,
  role: Role,
  ddVersion: string,
  byKey: Map<string, Champion>,
): Promise<MatchupLine[]> {
  const slugs = await getSlugs(ddVersion);
  const slug = slugs.get(champ.id);
  if (!slug) return [];

  // slug lolalytics -> clé Riot, pour retraduire les adversaires
  const parSlug = new Map<string, string>();
  for (const c of byKey.values()) {
    const s = slugs.get(c.id);
    if (s) parSlug.set(s, c.key);
  }

  const brut = await getLolaCounters(slug, role);
  const out: MatchupLine[] = [];
  for (const m of brut) {
    const key = parSlug.get(m.slug);
    if (!key || key === champ.key) continue; // on ignore le miroir
    out.push({ key, wr: m.wr, delta1: m.delta1, delta2: m.delta2, wrAjuste: m.wrAjuste });
  }
  return out;
}

// Table de counters vue depuis l'adversaire, puis INVERSÉE : un seul
// téléchargement (celui de l'adversaire de lane) donne le winrate de tous les
// candidats contre lui.
export interface CounterLine {
  wr: number; // winrate du candidat contre l'adversaire, en %
  delta1: number | null;
}

export async function getCounterTable(
  enemyKey: string,
  role: Role,
  ddVersion: string,
  byKey: Map<string, Champion>,
): Promise<Map<string, CounterLine>> {
  const out = new Map<string, CounterLine>();
  const enemy = byKey.get(enemyKey);
  if (!enemy) return out;
  let lines: MatchupLine[];
  try {
    lines = await getMatchups(enemy, role, ddVersion, byKey);
  } catch {
    return out; // lolalytics indisponible : la draft continue sans counters
  }
  for (const line of lines) {
    // line.wr est le winrate de l'ADVERSAIRE contre ce champion : on inverse
    out.set(line.key, {
      wr: Math.round((100 - line.wr) * 10) / 10,
      delta1: line.delta1 === null ? null : -line.delta1,
    });
  }
  return out;
}

export interface MatchupView {
  name: string;
  icon: string;
  wr: number;
  delta1: number | null; // écart avec le winrate habituel du champion
  tips: string[]; // comment jouer contre CE champion
}

export interface MatchupReport {
  role: Role;
  sample: number; // nombre de duels couverts
  avgWr: number | null; // winrate médian, repère de lecture
  hardest: MatchupView[];
  easiest: MatchupView[];
  versus: MatchupView | null; // duel direct si un adversaire est fourni
}

function toView(line: MatchupLine, byKey: Map<string, Champion>): MatchupView | null {
  const champ = byKey.get(line.key);
  if (!champ) return null;
  // Conseils Riot pour jouer contre lui ; repli sur la ligne « draft » de notre
  // fiche pour les champions que Riot ne documente pas
  const fiche = loadStyles().get(champ.id);
  const tips = champ.enemytips.length
    ? champ.enemytips
    : fiche?.plan?.draft
      ? [fiche.plan.draft]
      : [];
  return { name: champ.name, icon: champ.iconUrl, wr: line.wr, delta1: line.delta1, tips };
}

export async function getMatchupReport(
  champ: Champion,
  role: Role,
  ddVersion: string,
  byKey: Map<string, Champion>,
  enemy: Champion | null,
): Promise<MatchupReport | null> {
  let lines: MatchupLine[];
  try {
    lines = await getMatchups(champ, role, ddVersion, byKey);
  } catch {
    return null; // lolalytics indisponible : la fiche s'affiche sans matchups
  }
  if (!lines.length) return null;

  const sorted = [...lines].sort((a, b) => a.wr - b.wr);
  const view = (arr: MatchupLine[]) =>
    arr.map((l) => toView(l, byKey)).filter((v): v is MatchupView => v !== null);

  // Repère de lecture : le winrate médian du champion sur l'ensemble de ses duels
  const median = sorted[Math.floor(sorted.length / 2)]?.wr ?? null;

  return {
    role,
    sample: lines.length,
    avgWr: median,
    hardest: view(sorted.slice(0, 5)),
    easiest: view(sorted.slice(-5).reverse()),
    versus: enemy ? (view(lines.filter((l) => l.key === enemy.key))[0] ?? null) : null,
  };
}
