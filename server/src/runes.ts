import { config } from "./config.js";
import { cacheGet, cacheSet } from "./cache.js";
import { curlJson, type Role } from "./ugg.js";
import type { Champion } from "./ddragon.js";
import { loadStyles, type ChampionStyle } from "./styles.js";

const DD = "https://ddragon.leagueoflegends.com";

interface PerkInfo {
  id: number;
  name: string;
  icon: string; // URL complète
  desc: string;
}

interface TreeInfo {
  id: number;
  name: string;
  icon: string;
  perks: Set<number>;
}

let perkCache: {
  version: string;
  perks: Map<number, PerkInfo>;
  trees: Map<number, TreeInfo>;
  keystones: Set<number>;
} | null = null;

// Charge runesReforged (fr) : id de rune -> nom/icône, id d'arbre -> contenu
export async function getPerkData(version: string) {
  if (perkCache && perkCache.version === version) return perkCache;
  const key = `dd-runes-${version}-${config.locale}`;
  let raw = cacheGet<any[]>(key, config.ttl.ddragon);
  if (!raw) {
    const res = await fetch(`${DD}/cdn/${version}/data/${config.locale}/runesReforged.json`);
    if (!res.ok) throw new Error(`runesReforged.json HTTP ${res.status}`);
    raw = (await res.json()) as any[];
    cacheSet(key, raw);
  }
  const perks = new Map<number, PerkInfo>();
  const trees = new Map<number, TreeInfo>();
  const keystones = new Set<number>();
  for (const tree of raw) {
    const treePerks = new Set<number>();
    tree.slots.forEach((slot: any, slotIdx: number) => {
      for (const r of slot.runes) {
        if (slotIdx === 0) keystones.add(r.id); // slot 0 = keystones
        perks.set(r.id, {
          id: r.id,
          name: r.name,
          icon: `${DD}/cdn/img/${r.icon}`,
          desc: r.shortDesc?.replace(/<[^>]+>/g, "") ?? "",
        });
        treePerks.add(r.id);
      }
    });
    trees.set(tree.id, {
      id: tree.id,
      name: tree.name,
      icon: `${DD}/cdn/img/${tree.icon}`,
      perks: treePerks,
    });
  }
  perkCache = { version, perks, trees, keystones };
  return perkCache;
}

// Indices u.gg : région 12 = monde, tier 16 = émeraude+ (config du tier list)
const UGG_REGION = "12";
const UGG_TIER = "16";
const UGG_ROLE: Record<Role, string> = { jungle: "1", support: "2", adc: "3", top: "4", mid: "5" };

interface RawRunePage {
  matches: number;
  wins: number;
  primaryStyle: number;
  subStyle: number;
  perkIds: number[];
}

// Récupère (avec cache 24h) les pages de runes u.gg d'un champion, par rôle
async function getOverviewRunes(champKey: string, ddVersion: string): Promise<Record<string, RawRunePage>> {
  const [major, minor] = ddVersion.split(".");
  const patch = `${major}_${minor}`;
  const key = `ugg-runes-${patch}-${champKey}`;
  const cached = cacheGet<Record<string, RawRunePage>>(key, config.ttl.ugg);
  if (cached) return cached;

  const url = `https://stats2.u.gg/lol/1.5/overview/${patch}/ranked_solo_5x5/${champKey}/1.5.0.json`;
  const raw = await curlJson(url);
  const slim: Record<string, RawRunePage> = {};
  const tiers = raw?.[UGG_REGION]?.[UGG_TIER] ?? {};
  for (const [role, roleKey] of Object.entries(UGG_ROLE)) {
    const entry = tiers[roleKey]?.[0];
    const r = entry?.[0];
    if (!Array.isArray(r) || !Array.isArray(r[4])) continue;
    slim[role] = {
      matches: Number(r[0]) || 0,
      wins: Number(r[1]) || 0,
      primaryStyle: Number(r[2]),
      subStyle: Number(r[3]),
      perkIds: r[4].map(Number),
    };
  }
  cacheSet(key, slim);
  return slim;
}

export interface RunePageView {
  wr: number | null;
  matches: number;
  primary: { name: string; icon: string };
  sub: { name: string; icon: string };
  keystone: { name: string; icon: string; desc: string } | null;
  primaryMinors: { name: string; icon: string }[];
  subMinors: { name: string; icon: string }[];
}

export interface MatchupHint {
  keystone: { id: number; name: string; icon: string } | null;
  note: string;
}

function buildView(
  page: RawRunePage,
  perkData: Awaited<ReturnType<typeof getPerkData>>,
): RunePageView | null {
  const primary = perkData.trees.get(page.primaryStyle);
  const sub = perkData.trees.get(page.subStyle);
  if (!primary || !sub) return null;
  // Les keystones sont dérivées du slot 0 des arbres (runesReforged), pas
  // codées en dur — robuste face aux nouvelles runes
  let keystone: PerkInfo | null = null;
  const primaryMinors: PerkInfo[] = [];
  const subMinors: PerkInfo[] = [];
  for (const id of page.perkIds) {
    const info = perkData.perks.get(id);
    if (!info) continue;
    if (perkData.keystones.has(id)) keystone = info;
    else if (primary.perks.has(id)) primaryMinors.push(info);
    else if (sub.perks.has(id)) subMinors.push(info);
  }
  return {
    wr: page.matches > 0 ? Math.round((page.wins / page.matches) * 1000) / 10 : null,
    matches: page.matches,
    primary: { name: primary.name, icon: primary.icon },
    sub: { name: sub.name, icon: sub.icon },
    keystone: keystone ? { name: keystone.name, icon: keystone.icon, desc: keystone.desc } : null,
    primaryMinors: primaryMinors.map((p) => ({ name: p.name, icon: p.icon })),
    subMinors: subMinors.map((p) => ({ name: p.name, icon: p.icon })),
  };
}

// Règles de matchup annotées dans les fiches : bloc "runes" optionnel
interface RuneRule {
  keystone: number;
  quand: string;
  cond: { melee?: boolean; ranged?: boolean; archetypes?: string[] };
}

function matchRule(
  rules: RuneRule[],
  enemy: Champion,
  enemyStyle: ChampionStyle | undefined,
): RuneRule | null {
  for (const rule of rules) {
    const c = rule.cond ?? {};
    if (c.ranged && !enemy.ranged) continue;
    if (c.melee && enemy.ranged) continue;
    if (c.archetypes && (!enemyStyle || !c.archetypes.includes(enemyStyle.archetype))) continue;
    return rule;
  }
  return null;
}

export async function getRunesFor(
  champ: Champion,
  role: Role,
  ddVersion: string,
  enemy: Champion | null,
): Promise<{ page: RunePageView | null; hint: MatchupHint | null }> {
  const perkData = await getPerkData(ddVersion);
  let page: RunePageView | null = null;
  try {
    const byRole = await getOverviewRunes(champ.key, ddVersion);
    if (byRole[role]) page = buildView(byRole[role], perkData);
  } catch {
    // u.gg indisponible : on continue sans page par défaut
  }

  let hint: MatchupHint | null = null;
  const fiche = loadStyles().get(champ.id) as (ChampionStyle & { runes?: RuneRule[] }) | undefined;
  if (enemy && fiche?.runes?.length) {
    const enemyStyle = loadStyles().get(enemy.id);
    const rule = matchRule(fiche.runes, enemy, enemyStyle);
    if (rule) {
      const perk = perkData.perks.get(rule.keystone) ?? null;
      const sameAsDefault =
        page?.keystone && perk && page.keystone.name === perk.name;
      hint = {
        keystone: perk ? { id: perk.id, name: perk.name, icon: perk.icon } : null,
        note: sameAsDefault
          ? `Contre ${enemy.name}, la page standard convient : ${rule.quand}.`
          : `Contre ${enemy.name}, privilégie ${perk?.name ?? "une autre keystone"} — ${rule.quand}.`,
      };
    }
  }

  return { page, hint };
}
