import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

export const config = {
  riotApiKey: process.env.RIOT_API_KEY ?? "",
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
