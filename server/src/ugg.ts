import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { cacheGet, cacheGetWithAge, cacheSet } from "./cache.js";

const execFileAsync = promisify(execFile);

// Rôles internes de l'app : top | jungle | mid | adc | support
export type Role = "top" | "jungle" | "mid" | "adc" | "support";
export const ROLES: Role[] = ["top", "jungle", "mid", "adc", "support"];

const UGG_ROLE: Record<Role, string> = {
  top: "top",
  jungle: "jungle",
  mid: "mid",
  adc: "adc",
  support: "supp",
};

export interface PatchLine {
  wins: number;
  games: number;
  wr: number; // 0-1
  pickRate: number; // 0-1, part des parties du rôle
}

export interface PatchStats {
  patch: string; // ex. "16_14"
  fetchedAt: number;
  totalGames: Record<Role, number>;
  // champKey -> stats, par rôle
  byRole: Record<Role, Record<string, PatchLine>>;
}

// Cloudflare bloque l'empreinte TLS de Node (fetch et https) mais accepte curl,
// préinstallé sur Windows 10+ et macOS — on passe donc par un sous-processus.
export async function curlJson(url: string): Promise<any> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-s",
      "--fail-with-body",
      "-H",
      "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "-H",
      "Accept: application/json",
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

// Format u.gg champion_ranking : { adc|jungle|mid|supp|top: [ [champId, [counters], wins, games, ...], ... ] }
export async function getPatchStats(ddVersion: string): Promise<PatchStats> {
  const [major, minor] = ddVersion.split(".");
  const patch = `${major}_${minor}`;
  const key = `ugg-ranking-${patch}-${config.uggTier}`;

  const cached = cacheGet<PatchStats>(key, config.ttl.ugg);
  if (cached) return cached;

  const url = `https://stats2.u.gg/lol/1.5/champion_ranking/world/${patch}/ranked_solo_5x5/${config.uggTier}/1.5.0.json`;
  let raw: any[];
  try {
    raw = await curlJson(url);
  } catch (e) {
    // Si le fichier du patch n'existe pas encore ou que u.gg bloque, on garde
    // l'ancien cache même périmé plutôt que d'échouer
    const stale = cacheGetWithAge<PatchStats>(key);
    if (stale) return stale.value;
    throw new Error(`u.gg champion_ranking inaccessible : ${e instanceof Error ? e.message : e}`);
  }
  const roleData = raw[0] as Record<string, any[]>;

  const byRole = {} as PatchStats["byRole"];
  const totalGames = {} as PatchStats["totalGames"];
  for (const role of ROLES) {
    const arr = roleData[UGG_ROLE[role]] ?? [];
    const lines: Record<string, PatchLine> = {};
    let total = 0;
    for (const e of arr) {
      const games = Number(e[3]) || 0;
      total += games;
    }
    for (const e of arr) {
      const champKey = String(e[0]);
      const wins = Number(e[2]) || 0;
      const games = Number(e[3]) || 0;
      if (games <= 0) continue;
      lines[champKey] = {
        wins,
        games,
        wr: wins / games,
        pickRate: total > 0 ? games / total : 0,
      };
    }
    byRole[role] = lines;
    totalGames[role] = total;
  }

  const stats: PatchStats = { patch, fetchedAt: Date.now(), totalGames, byRole };
  cacheSet(key, stats);
  return stats;
}
