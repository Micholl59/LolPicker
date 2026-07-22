import fs from "node:fs";
import https from "node:https";
import type { Champion } from "./ddragon.js";
import type { Role } from "./ugg.js";

// Lecture du champ select en temps réel via l'API locale du client LoL (LCU).
// Le client écrit un "lockfile" (PID:port:mot de passe) à son lancement ; on
// s'y connecte en HTTPS local avec un certificat auto-signé Riot.

const LOCKFILE_CANDIDATES = [
  process.env.LOL_LOCKFILE ?? "",
  "C:\\Riot Games\\League of Legends\\lockfile",
  "D:\\Riot Games\\League of Legends\\lockfile",
  "C:\\Program Files\\Riot Games\\League of Legends\\lockfile",
  "/Applications/League of Legends.app/Contents/LoL/lockfile",
].filter(Boolean);

interface LcuCreds {
  port: number;
  password: string;
}

function readLockfile(): LcuCreds | null {
  for (const path of LOCKFILE_CANDIDATES) {
    try {
      const raw = fs.readFileSync(path, "utf8");
      const [, , port, password] = raw.split(":");
      if (port && password) return { port: Number(port), password };
    } catch {
      /* fichier absent : client fermé ou autre chemin */
    }
  }
  return null;
}

function lcuGet(creds: LcuCreds, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: creds.port,
        path,
        method: "GET",
        rejectUnauthorized: false, // certificat auto-signé Riot
        headers: {
          Authorization: `Basic ${Buffer.from(`riot:${creds.password}`).toString("base64")}`,
        },
        timeout: 3000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: null });
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("LCU timeout"));
    });
    req.end();
  });
}

const POSITION_TO_ROLE: Record<string, Role> = {
  top: "top",
  jungle: "jungle",
  middle: "mid",
  bottom: "adc",
  utility: "support",
};

export interface LcuDraft {
  connected: boolean; // client LoL détecté
  inChampSelect: boolean;
  ally: string[]; // ids Data Dragon
  enemy: string[];
  myRole: Role | null;
}

export async function getLcuDraft(byKey: Map<string, Champion>): Promise<LcuDraft> {
  const empty: LcuDraft = { connected: false, inChampSelect: false, ally: [], enemy: [], myRole: null };
  const creds = readLockfile();
  if (!creds) return empty;

  let session;
  try {
    session = await lcuGet(creds, "/lol-champ-select/v1/session");
  } catch {
    return empty; // lockfile périmé (client fermé sans nettoyer)
  }
  if (session.status !== 200 || !session.body) {
    return { ...empty, connected: true };
  }

  const s = session.body;
  const toId = (championId: number): string | null =>
    championId > 0 ? (byKey.get(String(championId))?.id ?? null) : null;

  const ally = (s.myTeam ?? [])
    .map((p: any) => toId(p.championId))
    .filter((x: string | null): x is string => x !== null);
  const enemy = (s.theirTeam ?? [])
    .map((p: any) => toId(p.championId))
    .filter((x: string | null): x is string => x !== null);

  const me = (s.myTeam ?? []).find((p: any) => p.cellId === s.localPlayerCellId);
  const myRole = me?.assignedPosition ? (POSITION_TO_ROLE[me.assignedPosition] ?? null) : null;

  return { connected: true, inChampSelect: true, ally, enemy, myRole };
}
