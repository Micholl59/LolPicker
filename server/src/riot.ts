import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { cacheGet, cacheGetWithAge, cacheSet } from "./cache.js";
import type { Role } from "./ugg.js";

export class RiotError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function riotFetch<T>(url: string, retries = 2): Promise<T> {
  if (!config.riotApiKey) throw new RiotError("Clé API Riot absente (server/.env)", 0);
  const res = await fetch(url, { headers: { "X-Riot-Token": config.riotApiKey } });
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get("Retry-After") ?? 10);
    await sleep(Math.min(wait, 30) * 1000);
    return riotFetch(url, retries - 1);
  }
  if (!res.ok) {
    const messages: Record<number, string> = {
      401: "Clé API Riot invalide ou expirée — régénère-la sur developer.riotgames.com",
      403: "Clé API Riot expirée ou révoquée — régénère-la sur developer.riotgames.com",
      404: "Introuvable — vérifie le Riot ID (Pseudo#TAG)",
    };
    throw new RiotError(messages[res.status] ?? `Erreur API Riot (HTTP ${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export async function resolveAccount(gameName: string, tagLine: string): Promise<Account> {
  const key = `account-${gameName.toLowerCase()}-${tagLine.toLowerCase()}`;
  const cached = cacheGet<Account>(key, config.ttl.account);
  if (cached) return cached;
  const acc = await riotFetch<Account>(
    `https://${config.cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  cacheSet(key, acc);
  return acc;
}

// File d'attente basique pour rester sous la limite de la clé dev (100 req / 2 min)
async function getMatch(matchId: string): Promise<any> {
  const dir = path.join(config.cacheDir, "matches");
  const file = path.join(dir, `${matchId}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* pas en cache */
  }
  const match = await riotFetch<any>(
    `https://${config.cluster}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(match));
  return match;
}

export interface ChampRoleStats {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface PersonalStats {
  puuid: string;
  analyzedMatches: number;
  // Matchs de l'historique pas encore téléchargés (limite de débit) :
  // un prochain rafraîchissement les récupérera
  pendingMatches: number;
  fetchedAt: number;
  // clé : `${championKey}|${role}` (role interne app) et `${championKey}|*` toutes positions
  byChampRole: Record<string, ChampRoleStats>;
}

// teamPosition Riot -> rôle interne
const POSITION_TO_ROLE: Record<string, Role> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

// Files SR avec picks classiques (normal draft, soloQ, flex, blind, quickplay)
const SR_QUEUES = new Set([400, 420, 430, 440, 490]);

export async function getPersonalStats(puuid: string, forceRefresh: boolean): Promise<PersonalStats> {
  const key = `personal-${puuid}`;
  if (!forceRefresh) {
    const cached = cacheGet<PersonalStats>(key, config.ttl.personal);
    if (cached) return cached;
  }

  // Historique paginé : jusqu'à 400 classées + 200 normales. Les pages
  // au-delà de l'historique réel renvoient simplement [].
  const base = `https://${config.cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`;
  const pageUrls = [
    ...[0, 100, 200, 300].map((s) => `${base}?type=ranked&start=${s}&count=100`),
    ...[0, 100].map((s) => `${base}?queue=400&start=${s}&count=100`),
  ];
  const pages = await Promise.all(pageUrls.map((u) => riotFetch<string[]>(u)));
  const ids = [...new Set(pages.flat())].sort().reverse();

  const stats: PersonalStats = {
    puuid,
    analyzedMatches: 0,
    pendingMatches: 0,
    fetchedAt: Date.now(),
    byChampRole: {},
  };

  let newFetches = 0;
  for (const id of ids) {
    const inCache = fs.existsSync(path.join(config.cacheDir, "matches", `${id}.json`));
    if (!inCache) {
      if (newFetches >= config.maxNewMatches) {
        stats.pendingMatches++;
        continue;
      }
      newFetches++;
      await sleep(60); // ~16 req/s max, sous la limite 20/s
    }
    let match: any;
    try {
      match = await getMatch(id);
    } catch (e) {
      if (e instanceof RiotError && (e.status === 401 || e.status === 403)) throw e;
      continue; // match individuel en erreur : on passe
    }
    const info = match?.info;
    if (!info || !SR_QUEUES.has(info.queueId) || (info.gameDuration ?? 0) < 300) continue;
    const p = info.participants?.find((x: any) => x.puuid === puuid);
    if (!p) continue;
    const role = POSITION_TO_ROLE[p.teamPosition] ?? null;
    stats.analyzedMatches++;
    const bump = (k: string) => {
      const s = (stats.byChampRole[k] ??= { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
      s.games++;
      if (p.win) s.wins++;
      s.kills += p.kills;
      s.deaths += p.deaths;
      s.assists += p.assists;
    };
    bump(`${p.championId}|*`);
    if (role) bump(`${p.championId}|${role}`);
  }

  cacheSet(key, stats);
  return stats;
}

export function getPersonalCacheAge(puuid: string): number | null {
  const entry = cacheGetWithAge<PersonalStats>(`personal-${puuid}`);
  return entry ? entry.savedAt : null;
}
