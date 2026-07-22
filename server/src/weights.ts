import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "..", "data", "weights.json");

export interface WeightDef {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  group: string;
}

// Toutes les pondérations réglables de l'application. Les valeurs modifiées
// sont persistées dans data/weights.json ; les absentes prennent le défaut.
export const WEIGHT_DEFS: WeightDef[] = [
  {
    key: "score.patchFactor",
    label: "Poids du winrate patch",
    description: "Points de note par point de winrate au-dessus (ou en dessous) de 50 %.",
    min: 0, max: 10, step: 0.5, default: 4, group: "Note de base",
  },
  {
    key: "score.baseMin",
    label: "Plancher de la note de base",
    description: "La note issue du patch ne descend jamais sous cette valeur.",
    min: 0, max: 50, step: 1, default: 30, group: "Note de base",
  },
  {
    key: "score.baseMax",
    label: "Plafond de la note de base",
    description: "La note issue du patch ne dépasse jamais cette valeur.",
    min: 50, max: 100, step: 1, default: 70, group: "Note de base",
  },
  {
    key: "score.minPickRate",
    label: "Présence minimale dans le rôle (%)",
    description: "En dessous de ce taux de pick, un champion n'est pas proposé en découverte.",
    min: 0, max: 5, step: 0.1, default: 0.5, group: "Note de base",
  },
  {
    key: "score.poolMinGames",
    label: "Parties minimum pour le pool",
    description: "Nombre de parties dans le rôle à partir duquel un champion compte dans « Ton pool ».",
    min: 1, max: 20, step: 1, default: 3, group: "Ton pool",
  },
  {
    key: "score.persoFactor",
    label: "Poids du winrate perso",
    description: "Multiplicateur de l'écart entre ton winrate et 50 % (pondéré par le nombre de parties).",
    min: 0, max: 4, step: 0.1, default: 1.2, group: "Ton pool",
  },
  {
    key: "score.persoPriorGames",
    label: "Inertie du winrate perso",
    description: "Plus c'est haut, plus il faut de parties pour que ton winrate pèse à plein. Poids = parties / (parties + inertie).",
    min: 1, max: 50, step: 1, default: 12, group: "Ton pool",
  },
  {
    key: "score.expBonusMax",
    label: "Bonus d'expérience max",
    description: "Bonus maximal pour un champion très joué (atteint à 40 parties).",
    min: 0, max: 20, step: 1, default: 6, group: "Ton pool",
  },
  {
    key: "score.otherRolesFactor",
    label: "Poids du perso hors-rôle",
    description: "Poids du winrate des parties jouées sur d'autres rôles (champions « Tu le joues ailleurs »).",
    min: 0, max: 2, step: 0.1, default: 0.6, group: "Ton pool",
  },
  {
    key: "score.difficultyMalus",
    label: "Malus par point de difficulté",
    description: "En découverte : note − (difficulté − 1) × ce facteur (difficulté Data Dragon 1-10).",
    min: 0, max: 8, step: 0.2, default: 2, group: "Découverte",
  },
  {
    key: "score.triedBonus",
    label: "Bonus « déjà essayé »",
    description: "Petit bonus si tu as déjà joué le champion au moins une fois.",
    min: 0, max: 10, step: 1, default: 3, group: "Découverte",
  },
  {
    key: "style.corrWeight",
    label: "Corrélation vs tempo",
    description: "Part de la corrélation des 7 dimensions dans l'affinité (le reste = proximité de tempo).",
    min: 0, max: 1, step: 0.05, default: 0.85, group: "Affinité de style",
  },
  {
    key: "style.discoverFactor",
    label: "Force de l'affinité (découverte)",
    description: "Bonus/malus = affinité (−1 à 1) × ce facteur, borné ci-dessous.",
    min: 0, max: 25, step: 1, default: 10, group: "Affinité de style",
  },
  {
    key: "style.discoverMax",
    label: "Bonus d'affinité max (découverte)",
    description: "Borne haute du bonus de style en découverte.",
    min: 0, max: 20, step: 1, default: 8, group: "Affinité de style",
  },
  {
    key: "style.discoverMin",
    label: "Malus d'affinité max (découverte)",
    description: "Borne basse (valeur négative) du malus de style en découverte.",
    min: -20, max: 0, step: 1, default: -5, group: "Affinité de style",
  },
  {
    key: "style.poolFactor",
    label: "Force de l'affinité (pool)",
    description: "Même principe que pour la découverte, mais sur tes champions (borné à ±3 par défaut).",
    min: 0, max: 10, step: 0.5, default: 4, group: "Affinité de style",
  },
  {
    key: "style.profileGamesCap",
    label: "Plafond de parties par champion (profil)",
    description: "Au-delà, un champion ne pèse pas plus lourd dans le calcul de ton profil de style.",
    min: 5, max: 200, step: 5, default: 40, group: "Affinité de style",
  },
  {
    key: "draft.ccThreshold",
    label: "Seuil CC ennemi",
    description: "Jauge CC moyenne ennemie à partir de laquelle le malus anti-CC s'applique.",
    min: 0, max: 100, step: 5, default: 50, group: "Mode draft",
  },
  {
    key: "draft.ccFactor",
    label: "Force du malus CC",
    description: "Malus = (1 − mobilité/100) × dépassement du seuil × ce facteur.",
    min: 0, max: 30, step: 1, default: 12, group: "Mode draft",
  },
  {
    key: "draft.tankCcReduction",
    label: "Réduction du malus CC pour les tanks",
    description: "Multiplicateur appliqué au malus CC quand le candidat est une frontline (0.4 = −60 %).",
    min: 0, max: 1, step: 0.05, default: 0.4, group: "Mode draft",
  },
  {
    key: "draft.engageBonus",
    label: "Bonus engage manquant",
    description: "Bonus max pour un candidat qui apporte l'engage absent de ton équipe.",
    min: 0, max: 15, step: 1, default: 6, group: "Mode draft",
  },
  {
    key: "draft.frontlineBonus",
    label: "Bonus frontline manquante",
    description: "Bonus max pour un candidat qui apporte la frontline absente de ton équipe.",
    min: 0, max: 15, step: 1, default: 6, group: "Mode draft",
  },
  {
    key: "draft.damageBalanceBonus",
    label: "Bonus équilibre des dégâts",
    description: "Bonus pour un candidat AP dans une équipe full AD (et inversement).",
    min: 0, max: 15, step: 1, default: 4, group: "Mode draft",
  },
  {
    key: "draft.resistBonus",
    label: "Bonus contre-résistances",
    description: "Bonus pour une frontline face à une compo ennemie mono-dégâts (stack armure ou RM).",
    min: 0, max: 15, step: 1, default: 4, group: "Mode draft",
  },
  {
    key: "draft.deltaClamp",
    label: "Ajustement draft max",
    description: "L'ensemble des bonus/malus de draft est borné à ± cette valeur.",
    min: 0, max: 30, step: 1, default: 10, group: "Mode draft",
  },
];

const DEFS_BY_KEY = new Map(WEIGHT_DEFS.map((d) => [d.key, d]));

let overrides: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (overrides) return overrides;
  try {
    overrides = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    overrides = {};
  }
  return overrides!;
}

export function getW(key: string): number {
  const def = DEFS_BY_KEY.get(key);
  if (!def) throw new Error(`Pondération inconnue : ${key}`);
  const v = load()[key];
  return typeof v === "number" ? v : def.default;
}

export function allWeights(): Array<WeightDef & { value: number }> {
  return WEIGHT_DEFS.map((d) => ({ ...d, value: getW(d.key) }));
}

export function saveWeights(values: Record<string, unknown>): void {
  const clean: Record<string, number> = { ...load() };
  for (const [key, raw] of Object.entries(values)) {
    const def = DEFS_BY_KEY.get(key);
    if (!def) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const clamped = Math.min(def.max, Math.max(def.min, v));
    if (clamped === def.default) delete clean[key];
    else clean[key] = clamped;
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
  overrides = clean;
}

export function resetWeights(): void {
  try {
    fs.unlinkSync(FILE);
  } catch {
    /* déjà absent */
  }
  overrides = {};
}
