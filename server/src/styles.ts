import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Champion } from "./ddragon.js";
import type { PersonalStats } from "./riot.js";
import { getW } from "./weights.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STYLE_DIMS = ["splitpush", "teamfight", "pick", "poke", "engage", "peel", "roam"] as const;
export type StyleDim = (typeof STYLE_DIMS)[number];
export type StyleVector = Record<StyleDim, number>;

export interface ChampionStyle {
  archetype: string;
  style: StyleVector;
  tempo: number;
  plan?: { early: string; mid: string; late: string; draft: string };
  provenance: "curated" | "draft";
  sources: string[];
}

export interface PlayerProfile {
  style: StyleVector;
  tempo: number;
  games: number; // parties pondérées ayant contribué
  topTags: string[]; // dimensions dominantes, pour l'affichage
}

const FR_LABELS: Record<StyleDim, string> = {
  splitpush: "Splitpush",
  teamfight: "Teamfight",
  pick: "Pick",
  poke: "Poke",
  engage: "Engage",
  peel: "Peel",
  roam: "Roam",
};

let stylesById: Map<string, ChampionStyle> | null = null;

const STYLES_FILE = path.join(__dirname, "..", "data", "champion-styles.json");

export function loadStyles(): Map<string, ChampionStyle> {
  if (stylesById) return stylesById;
  const raw = JSON.parse(fs.readFileSync(STYLES_FILE, "utf8")) as Record<string, any>;
  stylesById = new Map();
  for (const [id, entry] of Object.entries(raw)) {
    if (id.startsWith("_")) continue;
    stylesById.set(id, entry as ChampionStyle);
  }
  return stylesById;
}

// Met à jour (ou crée) la fiche d'un champion et persiste le fichier
export function updateStyle(
  id: string,
  patch: { style?: StyleVector; tempo?: number; archetype?: string },
  fallbackArchetype: string,
): ChampionStyle {
  const raw = JSON.parse(fs.readFileSync(STYLES_FILE, "utf8")) as Record<string, any>;
  const existing = raw[id] ?? {
    archetype: fallbackArchetype,
    style: { splitpush: 30, teamfight: 40, pick: 30, poke: 20, engage: 30, peel: 20, roam: 20 },
    tempo: 50,
    provenance: "draft",
    sources: [],
  };
  if (patch.style) {
    for (const d of STYLE_DIMS) {
      existing.style[d] = Math.min(100, Math.max(0, Math.round(Number(patch.style[d]) || 0)));
    }
  }
  if (patch.tempo !== undefined) {
    existing.tempo = Math.min(100, Math.max(0, Math.round(Number(patch.tempo) || 0)));
  }
  if (patch.archetype) existing.archetype = String(patch.archetype);
  existing.editedAt = new Date().toISOString().slice(0, 10);
  raw[id] = existing;
  fs.writeFileSync(STYLES_FILE, JSON.stringify(raw, null, 2));
  stylesById = null; // force le rechargement
  return existing as ChampionStyle;
}

export function styleTags(s: ChampionStyle): string[] {
  const dims = [...STYLE_DIMS].sort((a, b) => s.style[b] - s.style[a]);
  return dims.filter((d) => s.style[d] >= 60).slice(0, 2).map((d) => FR_LABELS[d]);
}

// Profil du joueur : moyenne des vecteurs de ses champions, pondérée par le
// nombre de parties (plafonné) et légèrement par le winrate
export function computeProfile(
  personal: PersonalStats,
  champions: Map<string, Champion>,
): PlayerProfile | null {
  const styles = loadStyles();
  const acc: StyleVector = { splitpush: 0, teamfight: 0, pick: 0, poke: 0, engage: 0, peel: 0, roam: 0 };
  let tempoAcc = 0;
  let totalW = 0;

  for (const [key, stats] of Object.entries(personal.byChampRole)) {
    const [champKey, role] = key.split("|");
    if (role !== "*") continue; // une seule entrée par champion (toutes positions)
    const champ = champions.get(champKey);
    const style = champ ? styles.get(champ.id) : undefined;
    if (!style || stats.games < 2) continue;
    const wr = stats.wins / stats.games;
    // 24 parties à 67 % pèsent plus que 8 à 38 %
    const w = Math.min(stats.games, getW("style.profileGamesCap")) * (0.5 + wr);
    for (const d of STYLE_DIMS) acc[d] += style.style[d] * w;
    tempoAcc += style.tempo * w;
    totalW += w;
  }

  if (totalW <= 0) return null;
  const style = {} as StyleVector;
  for (const d of STYLE_DIMS) style[d] = Math.round(acc[d] / totalW);
  const tempo = Math.round(tempoAcc / totalW);

  const sorted = [...STYLE_DIMS].sort((a, b) => style[b] - style[a]);
  const topTags = sorted.slice(0, 3).filter((d) => style[d] >= 40).map((d) => FR_LABELS[d]);

  return { style, tempo, games: Math.round(totalW), topTags };
}

// Affinité -1..1 : corrélation (cosinus centré) des 7 dimensions + proximité
// de tempo. Le centrage est indispensable : des vecteurs positifs ont sinon
// toujours un cosinus proche de 1 et rien ne se distingue.
export function affinity(profile: PlayerProfile, champ: ChampionStyle): number {
  const meanP = STYLE_DIMS.reduce((s, d) => s + profile.style[d], 0) / STYLE_DIMS.length;
  const meanC = STYLE_DIMS.reduce((s, d) => s + champ.style[d], 0) / STYLE_DIMS.length;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const d of STYLE_DIMS) {
    const a = profile.style[d] - meanP;
    const b = champ.style[d] - meanC;
    dot += a * b;
    na += a * a;
    nb += b * b;
  }
  const corr = na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  const tempoProx = 1 - Math.abs(profile.tempo - champ.tempo) / 50; // 1 → -1 sur 0..100 d'écart
  const cw = getW("style.corrWeight");
  return corr * cw + Math.max(-1, tempoProx) * (1 - cw);
}
