import type { Champion } from "./ddragon.js";
import type { PatchStats, Role } from "./ugg.js";
import type { PersonalStats } from "./riot.js";
import { affinity, loadStyles, styleTags, type PlayerProfile } from "./styles.js";
import { getW } from "./weights.js";

export interface Recommendation {
  key: string;
  name: string;
  title: string;
  icon: string;
  tags: string[];
  score: number;
  wrPatch: number | null; // en %
  gamesPatch: number;
  pickRate: number | null; // en %
  difficulty: number;
  persoGames: number;
  persoWr: number | null; // en %
  persoKda: number | null;
  reason: string;
  blurb: string;
  tips: string[];
  archetype: string | null;
  styleTags: string[];
  plan: { early: string; mid: string; late: string; draft: string } | null;
  styleBonus: number;
}

export interface RoleRecommendations {
  pool: Recommendation[];
  discover: Recommendation[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function patchDesc(wr: number | null): string {
  if (wr === null) return "peu de données ce patch";
  const pct = wr * 100;
  if (pct >= 51.5) return "très fort ce patch";
  if (pct >= 50.5) return "fort ce patch";
  if (pct >= 49.5) return "stable ce patch";
  if (pct >= 48.5) return "faible ce patch";
  return "très faible ce patch";
}

function difficultyDesc(d: number): string {
  if (d <= 3) return "facile à prendre en main";
  if (d <= 6) return "difficulté moyenne";
  if (d <= 8) return "exigeant";
  return "très technique";
}

export function computeRole(
  role: Role,
  patch: PatchStats,
  champions: Map<string, Champion>,
  personal: PersonalStats | null,
  profile: PlayerProfile | null,
): RoleRecommendations {
  const styles = loadStyles();
  const lines = patch.byRole[role] ?? {};
  const MIN_PICK_RATE = getW("score.minPickRate") / 100;
  const POOL_MIN_GAMES = getW("score.poolMinGames");
  const pool: Recommendation[] = [];
  const discover: Recommendation[] = [];

  const candidates = new Set<string>(Object.keys(lines));
  if (personal) {
    for (const k of Object.keys(personal.byChampRole)) {
      const [champKey, r] = k.split("|");
      if (r === role) candidates.add(champKey);
    }
  }

  for (const champKey of candidates) {
    const champ = champions.get(champKey);
    if (!champ) continue;

    const champStyle = styles.get(champ.id) ?? null;
    // Difficulté effective : notre valeur curée (fiable) prime sur celle de Riot
    // (Data Dragon), dont l'échelle est trop grossière (Garen=5, Locke=5…)
    const difficulty = champStyle?.difficulty ?? champ.difficulty;

    const line = lines[champKey] ?? null;
    const perso = personal?.byChampRole[`${champKey}|${role}`] ?? null;
    const persoAll = personal?.byChampRole[`${champKey}|*`] ?? null;
    const pGames = perso?.games ?? 0;
    const pAllGames = persoAll?.games ?? 0;
    // Le pool est strictement par rôle ; un champion joué ailleurs reste en
    // découverte (sans malus de difficulté, voir plus bas)
    const isPool = pGames >= POOL_MIN_GAMES;

    if (!isPool && (!line || line.pickRate < MIN_PICK_RATE)) continue;

    const wrPatch = line ? line.wr : null;
    // Note de base : winrate du patch
    const base =
      wrPatch === null
        ? 48
        : clamp(
            50 + (wrPatch * 100 - 50) * getW("score.patchFactor"),
            getW("score.baseMin"),
            getW("score.baseMax"),
          );

    let score: number;
    let reason: string;
    let persoWr: number | null = null;
    let persoKda: number | null = null;

    if (isPool) {
      const games = perso!.games;
      persoWr = (perso!.wins / games) * 100;
      persoKda =
        perso!.deaths > 0 ? (perso!.kills + perso!.assists) / perso!.deaths : perso!.kills + perso!.assists;
      // Poids de l'expérience : tend vers 1 avec le nombre de parties
      const w = games / (games + getW("score.persoPriorGames"));
      score =
        base +
        (persoWr - 50) * w * getW("score.persoFactor") +
        (Math.min(games, 40) / 40) * getW("score.expBonusMax");
      reason = `${persoWr.toFixed(0)} % de winrate perso sur ${games} parties · ${patchDesc(wrPatch)}`;
    } else if (pAllGames >= POOL_MIN_GAMES) {
      // Champion maîtrisé sur un autre rôle : pas de malus de difficulté
      const wrAll = (persoAll!.wins / pAllGames) * 100;
      persoWr = Math.round(wrAll * 10) / 10;
      const w = pAllGames / (pAllGames + getW("score.persoPriorGames"));
      score = base + (wrAll - 50) * w * getW("score.otherRolesFactor") + 2;
      reason = `Tu le joues sur d'autres rôles (${wrAll.toFixed(0)} % WR sur ${pAllGames} parties) · ${patchDesc(wrPatch)}`;
    } else {
      // Champion à découvrir : malus proportionnel à la difficulté
      score = base - (difficulty - 1) * getW("score.difficultyMalus");
      const tried = (perso?.games ?? 0) + (persoAll?.games ?? 0);
      if (tried > 0) score += getW("score.triedBonus");
      reason = `${tried > 0 ? "Déjà essayé" : "Jamais joué"} · difficulté ${difficulty}/10, ${difficultyDesc(difficulty)} · ${patchDesc(wrPatch)}`;
    }

    // Bonus d'affinité de style : fort en découverte (le perso ne dit rien),
    // léger sur le pool (le winrate perso capture déjà l'adéquation)
    let styleBonus = 0;
    if (profile && champStyle) {
      const a = affinity(profile, champStyle); // -1..1
      styleBonus = isPool
        ? clamp(a * getW("style.poolFactor"), -2, 3)
        : clamp(a * getW("style.discoverFactor"), getW("style.discoverMin"), getW("style.discoverMax"));
      score += styleBonus;
      if (!isPool) {
        if (styleBonus >= 3) reason += " · proche de ton style";
        else if (styleBonus <= -3) reason += " · loin de ton style";
      }
    }

    const rec: Recommendation = {
      key: champ.key,
      name: champ.name,
      title: champ.title,
      icon: champ.iconUrl,
      tags: champ.tags,
      score: Math.round(clamp(score, 5, 99)),
      wrPatch: wrPatch === null ? null : Math.round(wrPatch * 1000) / 10,
      gamesPatch: line?.games ?? 0,
      pickRate: line ? Math.round(line.pickRate * 1000) / 10 : null,
      difficulty,
      persoGames: pGames >= POOL_MIN_GAMES ? pGames : pAllGames,
      persoWr: persoWr === null ? null : Math.round(persoWr * 10) / 10,
      persoKda: persoKda === null ? null : Math.round(persoKda * 10) / 10,
      reason,
      blurb: champ.blurb,
      tips: champ.allytips,
      archetype: champStyle?.archetype ?? null,
      styleTags: champStyle ? styleTags(champStyle) : [],
      plan: champStyle?.plan ?? null,
      styleBonus: Math.round(styleBonus),
    };

    (isPool ? pool : discover).push(rec);
  }

  pool.sort((a, b) => b.score - a.score);
  discover.sort((a, b) => b.score - a.score);
  return { pool: pool.slice(0, 10), discover: discover.slice(0, 8) };
}
