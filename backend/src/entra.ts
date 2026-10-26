import { config } from "./config.js";
import { db, save, nowIso } from "./db.js";
import { newToken } from "./security.js";

export type Identity = {
  email: string;
  name: string;
  oid: string;
  tid: string;
};

export function startMicrosoftLogin(input: {
  purpose: "marketplace" | "signin";
  sessionId: string | null;
  redirectUri: string;
  publicOrigin: string;
  live: boolean;
}) {
  const state = newToken(24);
  db.oauthStates.push({
    state,
    sessionId: input.sessionId,
    purpose: input.purpose,
    live: input.live,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  save();

  if (!input.live) {
    const url = new URL("/api/mock-entra/authorize", input.publicOrigin);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("purpose", input.purpose);
    if (input.sessionId) url.searchParams.set("session_id", input.sessionId);
    return url.toString();
  }

  const url = new URL(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
  );
  url.searchParams.set("client_id", config.buyer.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid email profile User.Read");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function consumeState(state: string) {
  const row = db.oauthStates.find(
    (s) => s.state === state && new Date(s.expiresAt).getTime() > Date.now()
  );
  if (!row) return null;
  db.oauthStates = db.oauthStates.filter((s) => s.state !== state);
  save();
  return row;
}

function decodeJwt(token: string) {
  const part = token.split(".")[1];
  if (!part) return {};
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<
    string,
    string
  >;
}

export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  live: boolean;
}): Promise<Identity> {
  if (!input.live) {
    const row = db.mockAuthCodes.find(
      (c) => c.code === input.code && new Date(c.expiresAt).getTime() > Date.now()
    );
    if (!row) throw new Error("Mock authorization code expired.");
    db.mockAuthCodes = db.mockAuthCodes.filter((c) => c.code !== input.code);
    save();
    return {
      email: row.email,
      name: row.name,
      oid: row.oid,
      tid: row.tid,
    };
  }

  const body = new URLSearchParams({
    client_id: config.buyer.clientId,
    client_secret: config.buyer.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    scope: "openid email profile User.Read",
  });
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const data = (await res.json()) as {
    id_token?: string;
    error_description?: string;
  };
  if (!res.ok || !data.id_token) {
    throw new Error(data.error_description || "Microsoft token exchange failed.");
  }
  const claims = decodeJwt(data.id_token);
  if (claims.aud && claims.aud !== config.buyer.clientId) {
    throw new Error("ID token audience did not match the buyer app.");
  }
  return {
    email: (
      claims.preferred_username ||
      claims.email ||
      claims.upn ||
      ""
    ).toLowerCase(),
    name: claims.name || claims.preferred_username || "Microsoft user",
    oid: claims.oid,
    tid: claims.tid,
  };
}
