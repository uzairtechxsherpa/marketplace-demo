import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { DB } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
const file = path.join(dataDir, "store.json");

function empty(): DB {
  return {
    users: [],
    organizations: [],
    memberships: [],
    marketplaceSubscriptions: [],
    pendingSessions: [],
    oauthStates: [],
    sessions: [],
    webhookEvents: [],
    mockAuthCodes: [],
    mockOperations: [],
    mockTokens: [],
    publisherToken: null,
  };
}

function load(): DB {
  try {
    if (!fs.existsSync(file)) return empty();
    return { ...empty(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return empty();
  }
}

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}

export const db: DB = load();

export function save() {
  persist();
}

export function nowIso() {
  return new Date().toISOString();
}

export function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function pruneExpired() {
  const now = Date.now();
  const keep = (iso: string) => new Date(iso).getTime() > now;
  db.pendingSessions = db.pendingSessions.filter((s) => keep(s.expiresAt));
  db.oauthStates = db.oauthStates.filter((s) => keep(s.expiresAt));
  db.sessions = db.sessions.filter((s) => keep(s.expiresAt));
  db.mockAuthCodes = db.mockAuthCodes.filter((s) => keep(s.expiresAt));
  db.mockTokens = db.mockTokens.filter((s) => keep(s.expiresAt));
  save();
}
