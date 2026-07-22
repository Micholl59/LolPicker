import { config } from "./config.js";
import { cacheGet, cacheSet } from "./cache.js";

export interface Champion {
  key: string; // id numérique Riot, ex. "82"
  id: string; // id Data Dragon, ex. "Mordekaiser"
  name: string;
  title: string;
  blurb: string;
  allytips: string[];
  difficulty: number; // 1-10
  tags: string[];
  iconUrl: string;
  adShare: number; // 0-100 : part des dégâts physiques (info.attack vs info.magic)
  ranged: boolean; // portée d'attaque >= 300
}

const DD = "https://ddragon.leagueoflegends.com";

export async function getVersion(): Promise<string> {
  const cached = cacheGet<string>("dd-version", config.ttl.versions);
  if (cached) return cached;
  const res = await fetch(`${DD}/api/versions.json`);
  if (!res.ok) throw new Error(`versions.json HTTP ${res.status}`);
  const versions = (await res.json()) as string[];
  cacheSet("dd-version", versions[0]);
  return versions[0];
}

export async function getChampions(version: string): Promise<Map<string, Champion>> {
  const key = `dd-champions-v3-${version}-${config.locale}`;
  let list = cacheGet<Champion[]>(key, config.ttl.ddragon);
  if (!list) {
    const res = await fetch(`${DD}/cdn/${version}/data/${config.locale}/championFull.json`);
    if (!res.ok) throw new Error(`championFull.json HTTP ${res.status}`);
    const data = (await res.json()) as { data: Record<string, any> };
    list = Object.values(data.data).map((c) => ({
      key: String(c.key),
      id: c.id,
      name: c.name,
      title: c.title,
      blurb: c.blurb,
      allytips: c.allytips ?? [],
      // Certains champions récents ont une difficulté absente ou à 0 chez
      // Riot : on considère alors une difficulté moyenne
      difficulty: c.info?.difficulty > 0 ? c.info.difficulty : 5,
      tags: c.tags ?? [],
      iconUrl: `${DD}/cdn/${version}/img/champion/${c.image.full}`,
      adShare:
        (c.info?.attack ?? 0) + (c.info?.magic ?? 0) > 0
          ? Math.round((c.info.attack / (c.info.attack + c.info.magic)) * 100)
          : 50,
      ranged: (c.stats?.attackrange ?? 125) >= 300,
    }));
    cacheSet(key, list);
  }
  return new Map(list.map((c) => [c.key, c]));
}
