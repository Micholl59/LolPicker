import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import fs from "node:fs";
import { config, getRiotApiKey, setRiotApiKey } from "./config.js";
import { getVersion, getChampions } from "./ddragon.js";
import { getPatchStats, ROLES, type Role } from "./ugg.js";
import { resolveAccount, getPersonalStats, getPersonalCacheAge, RiotError } from "./riot.js";
import { computeRole } from "./score.js";
import { computeProfile, loadStyles, styleTags, type PlayerProfile } from "./styles.js";
import { analyzeTeam, adjustForDraft, loadAttributes, updateAttributes } from "./draft.js";
import { updateStyle } from "./styles.js";
import { allWeights, saveWeights, resetWeights } from "./weights.js";
import { getRunesFor } from "./runes.js";
import { getMatchupReport } from "./matchups.js";
import { getLcuDraft } from "./lcu.js";

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, { origin: true });

if (fs.existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist });
}

app.get("/api/health", async () => ({ ok: true }));

// Page Réglages : la clé API Riot (dev) expire toutes les 24h et se change
// ici sans redémarrer le serveur. Pas d'authentification volontairement (app
// mono-utilisateur, usage local pour l'instant) — la clé n'est jamais
// renvoyée en clair, seulement son statut.
app.get("/api/settings", async () => {
  const key = getRiotApiKey();
  return {
    hasKey: key.length > 0,
    keyPreview: key ? `${key.slice(0, 9)}…${key.slice(-4)}` : null,
    cluster: config.cluster,
  };
});

app.post<{ Body: { apiKey?: string } }>("/api/settings/riot-key", async (req, reply) => {
  const apiKey = (req.body?.apiKey ?? "").trim();
  if (!apiKey) return reply.code(400).send({ error: "Clé vide" });
  setRiotApiKey(apiKey);
  // Test immédiat contre une route Riot légère (ne consomme presque rien du quota)
  try {
    const res = await fetch(
      `https://${config.cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Riot/Games`,
      { headers: { "X-Riot-Token": apiKey } },
    );
    if (res.status === 401 || res.status === 403) {
      return { saved: true, valid: false, message: "Clé enregistrée mais rejetée par Riot (invalide/expirée)" };
    }
    // 404 = clé valide, ce Riot ID précis n'existe juste pas
    return { saved: true, valid: true, message: "Clé enregistrée et validée par Riot" };
  } catch {
    return { saved: true, valid: null, message: "Clé enregistrée, impossible de la tester (hors-ligne ?)" };
  }
});

app.get("/api/champions", async () => {
  const ddVersion = await getVersion();
  const [champions, patch] = await Promise.all([getChampions(ddVersion), getPatchStats(ddVersion)]);
  const styles = loadStyles();
  const list = [...champions.values()]
    .map((c) => {
      const s = styles.get(c.id) ?? null;
      const wrByRole: Record<string, { wr: number; pickRate: number }> = {};
      for (const role of ROLES) {
        const line = patch.byRole[role]?.[c.key];
        if (line && line.pickRate >= 0.005) {
          wrByRole[role] = {
            wr: Math.round(line.wr * 1000) / 10,
            pickRate: Math.round(line.pickRate * 1000) / 10,
          };
        }
      }
      const attrs = loadAttributes().get(c.id) ?? { cc: 40, mobility: 40 };
      return {
        key: c.key,
        id: c.id,
        name: c.name,
        title: c.title,
        icon: c.iconUrl,
        tags: c.tags,
        difficulty: s?.difficulty ?? c.difficulty,
        difficultySource: s?.difficulty !== undefined ? "curated" : "riot",
        cc: attrs.cc,
        mobility: attrs.mobility,
        blurb: c.blurb,
        tips: c.allytips,
        archetype: s?.archetype ?? null,
        style: s?.style ?? null,
        tempo: s?.tempo ?? null,
        styleTags: s ? styleTags(s) : [],
        plan: s?.plan ?? null,
        provenance: s?.provenance ?? null,
        sources: s?.sources ?? [],
        wrByRole,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { version: ddVersion, champions: list };
});

app.get("/api/weights", async () => ({ weights: allWeights() }));

app.post<{ Body: { values?: Record<string, unknown>; reset?: boolean } }>(
  "/api/weights",
  async (req) => {
    if (req.body?.reset) resetWeights();
    else saveWeights(req.body?.values ?? {});
    return { ok: true, weights: allWeights() };
  },
);

interface FicheBody {
  style?: Record<string, number>;
  tempo?: number;
  difficulty?: number;
  cc?: number;
  mobility?: number;
}

app.post<{ Params: { id: string }; Body: FicheBody }>("/api/fiches/:id", async (req, reply) => {
  const ddVersion = await getVersion();
  const champions = await getChampions(ddVersion);
  const champ = [...champions.values()].find((c) => c.id === req.params.id);
  if (!champ) return reply.code(404).send({ error: "Champion inconnu" });
  const body = req.body ?? {};
  if (body.style || body.tempo !== undefined || body.difficulty !== undefined) {
    updateStyle(
      champ.id,
      { style: body.style as any, tempo: body.tempo, difficulty: body.difficulty },
      champ.tags[0] ?? "Specialist",
    );
  }
  if (body.cc !== undefined || body.mobility !== undefined) {
    updateAttributes(champ.id, { cc: body.cc, mobility: body.mobility });
  }
  return { ok: true };
});

interface RunesQuery {
  champ?: string; // clé numérique Riot
  role?: string;
  enemy?: string; // id Data Dragon de l'adversaire de lane
}

app.get<{ Querystring: RunesQuery }>("/api/runes", async (req, reply) => {
  const role = (req.query.role ?? "top") as Role;
  if (!ROLES.includes(role)) return reply.code(400).send({ error: "Rôle invalide" });
  const ddVersion = await getVersion();
  const champions = await getChampions(ddVersion);
  const champ = champions.get(req.query.champ ?? "");
  if (!champ) return reply.code(404).send({ error: "Champion inconnu" });
  const enemy = req.query.enemy
    ? ([...champions.values()].find((c) => c.id === req.query.enemy) ?? null)
    : null;
  return getRunesFor(champ, role, ddVersion, enemy);
});

// Matchups réels (u.gg) : contre-picks chiffrés, et duel direct si `enemy`
app.get<{ Querystring: RunesQuery }>("/api/matchups", async (req, reply) => {
  const role = (req.query.role ?? "top") as Role;
  if (!ROLES.includes(role)) return reply.code(400).send({ error: "Rôle invalide" });
  const ddVersion = await getVersion();
  const champions = await getChampions(ddVersion);
  const champ = champions.get(req.query.champ ?? "");
  if (!champ) return reply.code(404).send({ error: "Champion inconnu" });
  const enemy = req.query.enemy
    ? ([...champions.values()].find((c) => c.id === req.query.enemy) ?? null)
    : null;
  return (await getMatchupReport(champ, role, ddVersion, champions, enemy)) ?? { role, sample: 0 };
});

app.get("/api/lcu/draft", async () => {
  const ddVersion = await getVersion();
  const champions = await getChampions(ddVersion);
  return getLcuDraft(champions);
});

interface DraftQuery {
  ally?: string;
  enemy?: string;
  role?: string;
  riotId?: string;
  refresh?: string;
}

// Écran principal fusionné : recommandations d'un rôle, ajustées à la draft en
// cours (compos vides = score général du patch). Renvoie aussi les infos joueur
// et patch pour la ligne de statut.
app.get<{ Querystring: DraftQuery }>("/api/draft", async (req, reply) => {
  const role = (req.query.role ?? "top") as Role;
  if (!ROLES.includes(role)) {
    return reply.code(400).send({ error: "Rôle invalide" });
  }
  const parseIds = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const allyIds = parseIds(req.query.ally);
  const enemyIds = parseIds(req.query.enemy);
  const refresh = req.query.refresh === "1";

  const ddVersion = await getVersion();
  const [champions, patch] = await Promise.all([getChampions(ddVersion), getPatchStats(ddVersion)]);
  const byId = new Map([...champions.values()].map((c) => [c.id, c]));

  let personal = null;
  let profile: PlayerProfile | null = null;
  let personalError: string | null = null;
  let personalFetchedAt: number | null = null;
  const riotId = (req.query.riotId ?? "").trim();
  const m = riotId.match(/^(.{3,16})#(.{3,5})$/);
  if (m) {
    try {
      const account = await resolveAccount(m[1], m[2]);
      personal = await getPersonalStats(account.puuid, refresh);
      personalFetchedAt = getPersonalCacheAge(account.puuid) ?? personal.fetchedAt;
      profile = computeProfile(personal, champions);
    } catch (e) {
      personalError = e instanceof RiotError ? e.message : "Stats perso indisponibles pour le moment";
      req.log.warn({ err: e }, "draft: personal stats unavailable");
    }
  }

  const ally = analyzeTeam(allyIds, byId, patch);
  const enemy = analyzeTeam(enemyIds, byId, patch);
  const picked = new Set([...allyIds, ...enemyIds]);

  const base = computeRole(role, patch, champions, personal, profile);
  const adjust = (recs: typeof base.pool) =>
    recs
      .filter((r) => {
        const c = champions.get(r.key);
        return c && !picked.has(c.id);
      })
      .map((r) => {
        const { delta, notes } = adjustForDraft(r, ally, enemy, byId, champions);
        return {
          ...r,
          score: Math.min(99, Math.max(5, r.score + delta)),
          draftDelta: delta,
          reason: notes.length > 0 ? `${r.reason} · ${notes.join(" · ")}` : r.reason,
        };
      })
      .sort((a, b) => b.score - a.score);

  const [major, minor] = ddVersion.split(".");
  return {
    role,
    patch: {
      ddragonVersion: ddVersion,
      display: `${Number(major) + 10}.${minor}`,
      statsFetchedAt: patch.fetchedAt,
    },
    player: {
      riotId: m ? `${m[1]}#${m[2]}` : null,
      personalAvailable: personal !== null,
      personalError,
      analyzedMatches: personal?.analyzedMatches ?? 0,
      pendingMatches: personal?.pendingMatches ?? 0,
      fetchedAt: personalFetchedAt,
      profile,
    },
    ally,
    enemy,
    recommendations: { pool: adjust(base.pool), discover: adjust(base.discover) },
  };
});

// SPA fallback : toute route non-API renvoie l'index du front buildé
app.setNotFoundHandler((req, reply) => {
  if (!req.url.startsWith("/api") && fs.existsSync(config.webDist)) {
    return reply.sendFile("index.html");
  }
  reply.code(404).send({ error: "Not found" });
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => console.log(`LolPicker server sur http://localhost:${config.port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
