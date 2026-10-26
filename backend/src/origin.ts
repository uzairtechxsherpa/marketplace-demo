import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Request } from "express";
import { buyerConfigured, config, liveMicrosoftEnabled } from "./config.js";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const originFile = path.join(dataDir, "public-origin.txt");
const stableFile = path.join(dataDir, "tunnel-domain.txt");

function asOrigin(value: string) {
  const v = value.trim().replace(/\/$/, "");
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

function readOriginFile(file: string) {
  try {
    return asOrigin(fs.readFileSync(file, "utf8"));
  } catch {
    return "";
  }
}

export function configuredPublicOrigin() {
  const fromEnv = asOrigin(
    process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.TUNNEL_DOMAIN ||
      ""
  );
  if (fromEnv) return fromEnv;
  return readOriginFile(stableFile) || readOriginFile(originFile);
}

export function isLocalHost(host: string) {
  const h = host.split(":")[0].toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function requestOrigin(req: Request) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = (req.get("x-forwarded-host") || req.get("host") || "localhost")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

export function isPublicRequest(req: Request) {
  try {
    return !isLocalHost(new URL(requestOrigin(req)).hostname);
  } catch {
    return false;
  }
}

export function browserOrigin(req: Request) {
  if (isPublicRequest(req)) {
    return requestOrigin(req).replace(/\/$/, "");
  }
  return config.frontendOrigin;
}

export function callbackOrigin(req: Request) {
  if (isPublicRequest(req)) {
    return requestOrigin(req).replace(/\/$/, "");
  }
  return `http://localhost:${config.port}`;
}

export function useLiveSso(req: Request) {
  return liveMicrosoftEnabled() || (buyerConfigured() && isPublicRequest(req));
}

export function marketplaceUrls(req?: Request) {
  const incoming =
    req && isPublicRequest(req) ? requestOrigin(req).replace(/\/$/, "") : "";
  const base = configuredPublicOrigin() || incoming;
  return {
    publicOrigin: base || null,
    landingUrl: base
      ? `${base}/marketplace/landing`
      : `${config.frontendOrigin}/marketplace/landing`,
    webhookUrl: base
      ? `${base}/api/marketplace/webhook`
      : `http://localhost:${config.port}/api/marketplace/webhook`,
    landingRedirectUri: base
      ? `${base}/api/marketplace/auth/callback`
      : config.buyer.landingRedirectUri,
    signinRedirectUri: base
      ? `${base}/api/auth/microsoft/callback`
      : config.buyer.signinRedirectUri,
    httpsReady: Boolean(base && base.startsWith("https://")),
  };
}
