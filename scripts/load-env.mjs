import fs from "node:fs";
import path from "node:path";

export function loadEnv(root) {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const i = text.indexOf("=");
    if (i < 1) continue;
    const key = text.slice(0, i).trim();
    const value = text.slice(i + 1).trim();
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

export function asOrigin(value) {
  const v = String(value || "").trim().replace(/\/$/, "");
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

export function hostOnly(value) {
  const origin = asOrigin(value);
  if (!origin) return "";
  return new URL(origin).host;
}
