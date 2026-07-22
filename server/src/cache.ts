import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

interface Entry<T> {
  savedAt: number;
  value: T;
}

function fileFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(config.cacheDir, `${safe}.json`);
}

export function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = fs.readFileSync(fileFor(key), "utf8");
    const entry: Entry<T> = JSON.parse(raw);
    if (ttlMs > 0 && Date.now() - entry.savedAt > ttlMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function cacheGetWithAge<T>(key: string): { value: T; savedAt: number } | null {
  try {
    const raw = fs.readFileSync(fileFor(key), "utf8");
    const entry: Entry<T> = JSON.parse(raw);
    return { value: entry.value, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  const entry: Entry<T> = { savedAt: Date.now(), value };
  fs.writeFileSync(fileFor(key), JSON.stringify(entry));
}
