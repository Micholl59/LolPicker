import { config } from "./config.js";
import { cacheGet, cacheSet } from "./cache.js";
import { curlJson, type Role } from "./ugg.js";
import type { Champion } from "./ddragon.js";
import { loadStyles } from "./styles.js";

// Matchups réels u.gg : victoires/parties pour chaque paire de champions.
// Format décodé : { region: { tier: { role: [ [ [champId, wins, games, ...deltas], … ], date ] } } }
// Vérifié en recoupant le winrate agrégé avec le tier list (Garen top ≈ 49-50 %).

const UGG_REGION = "12"; // monde
const UGG_TIER = "16"; // émeraude+
const UGG_ROLE: Record<Role, string> = { jungle: "1", support: "2", adc: "3", top: "4", mid: "5" };

// En dessous, l'échantillon est trop faible pour être significatif
const MIN_GAMES = 300;

export interface MatchupLine {
  key: string; // clé numérique Riot de l'adversaire
  wins: number;
  games: number;
  wr: number; // winrate du champion étudié, en %
}

type ByRole = Partial<Record<Role, MatchupLine[]>>;

// Le fichier brut fait ~3 Mo par champion : on ne cache que l'essentiel
async function getMatchups(champKey: string, ddVersion: string): Promise<ByRole> {
  const [major, minor] = ddVersion.split(".");
  const patch = `${major}_${minor}`;
  const key = `ugg-matchups-${patch}-${champKey}`;
  const cached = cacheGet<ByRole>(key, config.ttl.ugg);
  if (cached) return cached;

  const url = `https://stats2.u.gg/lol/1.5/matchups/${patch}/ranked_solo_5x5/${champKey}/1.5.0.json`;
  const raw = await curlJson(url);
  const tiers = raw?.[UGG_REGION]?.[UGG_TIER] ?? {};

  const out: ByRole = {};
  for (const [role, roleKey] of Object.entries(UGG_ROLE) as [Role, string][]) {
    const entries = tiers[roleKey]?.[0];
    if (!Array.isArray(entries)) continue;
    const lines: MatchupLine[] = [];
    for (const e of entries) {
      const games = Number(e?.[2]) || 0;
      const wins = Number(e?.[1]) || 0;
      if (games < MIN_GAMES) continue;
      lines.push({
        key: String(e[0]),
        wins,
        games,
        wr: Math.round((wins / games) * 1000) / 10,
      });
    }
    if (lines.length) out[role] = lines;
  }

  cacheSet(key, out);
  return out;
}

// Table de counters vue depuis l'adversaire, puis INVERSÉE : un seul
// téléchargement (celui de l'adversaire de lane) donne le winrate de tous les
// candidats contre lui, au lieu d'un fichier de 3 Mo par candidat.
export interface CounterLine {
  wr: number; // winrate du candidat contre l'adversaire, en %
  games: number;
}

export async function getCounterTable(
  enemyKey: string,
  role: Role,
  ddVersion: string,
): Promise<Map<string, CounterLine>> {
  const out = new Map<string, CounterLine>();
  let byRole: ByRole;
  try {
    byRole = await getMatchups(enemyKey, ddVersion);
  } catch {
    return out; // u.gg indisponible : la draft continue sans counters
  }
  for (const line of byRole[role] ?? []) {
    // line.wr est le winrate de l'ADVERSAIRE contre ce champion
    out.set(line.key, { wr: Math.round((100 - line.wr) * 10) / 10, games: line.games });
  }
  return out;
}

export interface MatchupView {
  name: string;
  icon: string;
  wr: number;
  games: number;
  tips: string[]; // comment jouer contre CE champion
}

export interface MatchupReport {
  role: Role;
  sample: number; // total de parties couvertes
  avgWr: number | null; // winrate agrégé, repère de lecture
  hardest: MatchupView[];
  easiest: MatchupView[];
  versus: MatchupView | null; // duel direct si un adversaire est fourni
}

function toView(line: MatchupLine, byKey: Map<string, Champion>): MatchupView | null {
  const champ = byKey.get(line.key);
  if (!champ) return null;
  // Conseils Riot pour jouer contre lui ; repli sur la ligne « draft » de notre
  // fiche pour les 26 champions que Riot ne documente pas
  const fiche = loadStyles().get(champ.id);
  const tips = champ.enemytips.length
    ? champ.enemytips
    : fiche?.plan?.draft
      ? [fiche.plan.draft]
      : [];
  return { name: champ.name, icon: champ.iconUrl, wr: line.wr, games: line.games, tips };
}

export async function getMatchupReport(
  champ: Champion,
  role: Role,
  ddVersion: string,
  byKey: Map<string, Champion>,
  enemy: Champion | null,
): Promise<MatchupReport | null> {
  let byRole: ByRole;
  try {
    byRole = await getMatchups(champ.key, ddVersion);
  } catch {
    return null; // u.gg indisponible : la fiche s'affiche sans matchups
  }
  const lines = byRole[role];
  if (!lines?.length) return null;

  const sorted = [...lines].sort((a, b) => a.wr - b.wr);
  const view = (arr: MatchupLine[]) =>
    arr.map((l) => toView(l, byKey)).filter((v): v is MatchupView => v !== null);

  const totalGames = lines.reduce((n, l) => n + l.games, 0);
  const totalWins = lines.reduce((n, l) => n + l.wins, 0);

  return {
    role,
    sample: totalGames,
    avgWr: totalGames > 0 ? Math.round((totalWins / totalGames) * 1000) / 10 : null,
    hardest: view(sorted.slice(0, 5)),
    easiest: view(sorted.slice(-5).reverse()),
    versus: enemy ? (view(lines.filter((l) => l.key === enemy.key))[0] ?? null) : null,
  };
}
