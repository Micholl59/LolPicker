import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, "..", ".env");
dotenv.config({ path: ENV_FILE });

// La clé Riot dev expire toutes les 24h : on la relit à chaque appel plutôt
// que de la figer au démarrage, pour qu'un changement via /api/settings soit
// pris en compte sans redémarrer le serveur.
function readEnvFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(ENV_FILE, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function getRiotApiKey(): string {
  return readEnvFile().RIOT_API_KEY ?? process.env.RIOT_API_KEY ?? "";
}

export function setRiotApiKey(key: string): void {
  const env = readEnvFile();
  env.RIOT_API_KEY = key.trim();
  if (!env.RIOT_CLUSTER) env.RIOT_CLUSTER = config.cluster;
  if (!env.API_PORT) env.API_PORT = String(config.port);
  const body = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(ENV_FILE, body + "\n");
  process.env.RIOT_API_KEY = env.RIOT_API_KEY; // cohérence si relu via process.env
}

export const config = {
  cluster: process.env.RIOT_CLUSTER ?? "europe",
  port: Number(process.env.API_PORT ?? 3001),
  cacheDir: path.join(__dirname, "..", "cache"),
  webDist: path.join(__dirname, "..", "..", "web", "dist"),
  locale: "fr_FR",
  uggTier: "emerald_plus",
  // TTL des caches (ms)
  ttl: {
    versions: 12 * 3600_000,
    ddragon: 24 * 3600_000,
    ugg: 24 * 3600_000,
    account: 7 * 24 * 3600_000,
    personal: 3600_000,
  },
  // Nombre max de nouveaux matchs téléchargés par rafraîchissement
  // (limite clé dev : 100 requêtes / 2 min, dont ~7 pour compte + listes d'ids).
  // L'historique complet se remplit progressivement à chaque rafraîchissement,
  // les matchs déjà téléchargés étant cachés définitivement.
  maxNewMatches: 80,
};
