import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Champion } from "./ddragon.js";
import { loadStyles, type ChampionStyle } from "./styles.js";
import type { Recommendation } from "./score.js";
import type { PatchStats, Role } from "./ugg.js";
import { ROLES } from "./ugg.js";
import { getW } from "./weights.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTRS_FILE = path.join(__dirname, "..", "data", "champion-attributes.json");

export interface Attributes {
  cc: number;
  mobility: number;
}

let attrsById: Map<string, Attributes> | null = null;

export function loadAttributes(): Map<string, Attributes> {
  if (attrsById) return attrsById;
  const raw = JSON.parse(fs.readFileSync(ATTRS_FILE, "utf8")) as Record<string, any>;
  attrsById = new Map();
  for (const [id, entry] of Object.entries(raw)) {
    if (id.startsWith("_")) continue;
    attrsById.set(id, entry as Attributes);
  }
  return attrsById;
}

export function updateAttributes(id: string, attrs: Partial<Attributes>): void {
  const raw = JSON.parse(fs.readFileSync(ATTRS_FILE, "utf8")) as Record<string, any>;
  const existing = raw[id] ?? { cc: 40, mobility: 40 };
  for (const k of ["cc", "mobility"] as const) {
    if (attrs[k] !== undefined) {
      existing[k] = Math.min(100, Math.max(0, Math.round(Number(attrs[k]) || 0)));
    }
  }
  raw[id] = existing;
  fs.writeFileSync(ATTRS_FILE, JSON.stringify(raw, null, 2));
  attrsById = null;
}

// Frontline dérivée de l'archétype (fiche de style), sinon des tags Data Dragon
function frontlineScore(champ: Champion, style: ChampionStyle | undefined): number {
  const byArchetype: Record<string, number> = {
    Vanguard: 90,
    Warden: 85,
    Juggernaut: 70,
    Diver: 55,
    Skirmisher: 35,
  };
  if (style && byArchetype[style.archetype] !== undefined) return byArchetype[style.archetype];
  if (champ.tags.includes("Tank")) return 80;
  if (champ.tags.includes("Fighter")) return 55;
  return 15;
}

export interface TeamGauges {
  cc: number;
  frontline: number;
  engage: number;
  peel: number;
  adPct: number; // 0 = full AP, 100 = full AD
}

export interface TeamAnalysis {
  picks: string[]; // ids Data Dragon
  lanes: (Role | null)[]; // lane probable de chaque pick, sans doublon
  gauges: TeamGauges;
  labels: string[];
}

interface ChampInfo {
  champ: Champion;
  style: ChampionStyle | undefined;
  attrs: Attributes;
  frontline: number;
}

function infoFor(id: string, byId: Map<string, Champion>): ChampInfo | null {
  const champ = byId.get(id);
  if (!champ) return null;
  const style = loadStyles().get(id);
  const attrs = loadAttributes().get(id) ?? { cc: 40, mobility: 40 };
  return { champ, style, attrs, frontline: frontlineScore(champ, style) };
}

// Attribue une lane distincte à chaque pick : gloutonnement, la paire
// (champion, lane) au taux de pick le plus élevé d'abord
function assignLanes(infos: ChampInfo[], patch: PatchStats): (Role | null)[] {
  const lanes: (Role | null)[] = infos.map(() => null);
  const freeRoles = new Set<Role>(ROLES);
  const freePicks = new Set<number>(infos.map((_, i) => i));
  while (freePicks.size > 0 && freeRoles.size > 0) {
    let best: { pick: number; role: Role; rate: number } | null = null;
    for (const i of freePicks) {
      for (const role of freeRoles) {
        const rate = patch.byRole[role]?.[infos[i].champ.key]?.pickRate ?? 0;
        if (!best || rate > best.rate) best = { pick: i, role, rate };
      }
    }
    if (!best || best.rate < 0.002) break; // personne ne joue vraiment les lanes restantes
    lanes[best.pick] = best.role;
    freePicks.delete(best.pick);
    freeRoles.delete(best.role);
  }
  return lanes;
}

export function analyzeTeam(
  ids: string[],
  byId: Map<string, Champion>,
  patch: PatchStats,
): TeamAnalysis {
  const infos = ids.map((id) => infoFor(id, byId)).filter((x): x is ChampInfo => x !== null);
  const n = infos.length;
  const avg = (f: (i: ChampInfo) => number) =>
    n > 0 ? Math.round(infos.reduce((s, i) => s + f(i), 0) / n) : 0;

  const gauges: TeamGauges = {
    cc: avg((i) => i.attrs.cc),
    frontline: avg((i) => i.frontline),
    engage: avg((i) => i.style?.style.engage ?? 30),
    peel: avg((i) => i.style?.style.peel ?? 20),
    adPct: avg((i) => i.champ.adShare),
  };

  const labels: string[] = [];
  if (n >= 3) {
    if (gauges.cc >= 60) labels.push("CC-heavy");
    else if (gauges.cc <= 25) labels.push("Pauvre en CC");
    if (gauges.frontline >= 60) labels.push("Bonne frontline");
    else if (gauges.frontline < 30) labels.push("Sans frontline");
    if (gauges.adPct >= 68) labels.push("Full AD");
    else if (gauges.adPct <= 32) labels.push("Full AP");
    if (gauges.engage >= 50) labels.push("Bon engage");
    else if (gauges.engage < 25) labels.push("Sans engage");
  }

  return { picks: infos.map((i) => i.champ.id), lanes: assignLanes(infos, patch), gauges, labels };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Ajuste une recommandation selon les deux compositions. Retourne le delta et
// les explications, sans muter l'original.
export function adjustForDraft(
  rec: Recommendation,
  ally: TeamAnalysis,
  enemy: TeamAnalysis,
  byId: Map<string, Champion>,
  byKey: Map<string, Champion>,
): { delta: number; notes: string[] } {
  const champ = byKey.get(rec.key);
  if (!champ) return { delta: 0, notes: [] };
  const info = infoFor(champ.id, byId);
  if (!info) return { delta: 0, notes: [] };

  let delta = 0;
  const notes: string[] = [];
  const nAlly = ally.picks.length;
  const nEnemy = enemy.picks.length;

  // Compo ennemie riche en CC : dangereux pour les carries mêlée peu mobiles
  const ccThreshold = getW("draft.ccThreshold");
  if (nEnemy >= 3 && enemy.gauges.cc >= ccThreshold) {
    let vuln = (100 - info.attrs.mobility) / 100;
    if (info.frontline >= 60) vuln *= getW("draft.tankCcReduction"); // un tank encaisse le CC
    const over = (enemy.gauges.cc - (ccThreshold - 5)) / (100 - ccThreshold + 5);
    const malus = Math.round(vuln * over * getW("draft.ccFactor"));
    if (malus > 0) {
      delta -= malus;
      if (malus >= 3 && info.frontline < 60) notes.push("compo ennemie CC-heavy, risqué sans mobilité");
    }
  }

  if (nAlly >= 2) {
    const engageMax = Math.max(
      ...ally.picks.map((id) => loadStyles().get(id)?.style.engage ?? 0),
      0,
    );
    const candEngage = info.style?.style.engage ?? 0;
    if (engageMax < 45 && candEngage >= 50) {
      const bonus = Math.round(((candEngage - 40) / 60) * getW("draft.engageBonus"));
      delta += bonus;
      if (bonus >= 3) notes.push("apporte l'engage qui manque à ton équipe");
    }
    if (ally.gauges.frontline < 35 && info.frontline >= 55) {
      const bonus = Math.round(((info.frontline - 40) / 60) * getW("draft.frontlineBonus"));
      delta += bonus;
      if (bonus >= 3) notes.push("apporte la frontline qui manque");
    }
    if (ally.gauges.adPct >= 70 && champ.adShare <= 40) {
      delta += getW("draft.damageBalanceBonus");
      notes.push("équilibre les dégâts (AP dans une équipe AD)");
    } else if (ally.gauges.adPct <= 30 && champ.adShare >= 60) {
      delta += getW("draft.damageBalanceBonus");
      notes.push("équilibre les dégâts (AD dans une équipe AP)");
    }
  }

  if (nEnemy >= 3 && info.frontline >= 60) {
    if (enemy.gauges.adPct >= 68) {
      delta += getW("draft.resistBonus");
      notes.push("ennemis full AD : stacke l'armure");
    } else if (enemy.gauges.adPct <= 32) {
      delta += getW("draft.resistBonus");
      notes.push("ennemis full AP : stacke la résistance magique");
    }
  }

  const cap = getW("draft.deltaClamp");
  return { delta: clamp(delta, -cap, cap), notes };
}
