import { Router } from "express";
import { config } from "../config.js";
import {
  browserOrigin,
  callbackOrigin,
  isPublicRequest,
  useLiveSso,
} from "../origin.js";
import { db, save } from "../db.js";
import {
  clearSessionCookie,
  createSession,
  publicUser,
  setSessionCookie,
  userFromRequest,
  verifyPassword,
} from "../security.js";
import {
  addMembership,
  createOrganization,
  createUser,
  findUserByEmail,
  linkMicrosoft,
} from "../provision.js";
import {
  consumeState,
  exchangeCode,
  startMicrosoftLogin,
} from "../entra.js";

export const authRouter = Router();

authRouter.post("/signup", (req, res) => {
  const { name, email, password, organization_name } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    organization_name?: string;
  };
  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email, and password are required." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  if (findUserByEmail(email)) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  const user = createUser({ email, name, password });
  const org = createOrganization(
    organization_name?.trim() || `${name}'s workspace`,
    "direct"
  );
  addMembership(user, org, "admin");
  const session = createSession(user.id);
  setSessionCookie(res, session.id, req);
  res.json({ user: publicUser(user), organization: org });
});

authRouter.post("/signin", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  const user = findUserByEmail(email);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  const session = createSession(user.id);
  setSessionCookie(res, session.id, req);
  res.json({ user: publicUser(user) });
});

authRouter.post("/signout", (req, res) => {
  const sid = req.cookies?.sid as string | undefined;
  if (sid) {
    db.sessions = db.sessions.filter((s) => s.id !== sid);
    save();
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.json({ user: publicUser(user) });
});

authRouter.get("/microsoft/start", (req, res) => {
  const live = useLiveSso(req);
  const origin = callbackOrigin(req);
  const redirectUri = isPublicRequest(req)
    ? `${origin}/api/auth/microsoft/callback`
    : config.buyer.signinRedirectUri;
  const url = startMicrosoftLogin({
    purpose: "signin",
    sessionId: null,
    redirectUri,
    publicOrigin: origin,
    live,
  });
  res.redirect(url);
});

authRouter.get("/microsoft/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const row = consumeState(state);
    const ui = browserOrigin(req);
    const redirectUri = isPublicRequest(req)
      ? `${callbackOrigin(req)}/api/auth/microsoft/callback`
      : config.buyer.signinRedirectUri;
    if (!row || row.purpose !== "signin") {
      res.redirect(
        `${ui}/signin?error=${encodeURIComponent("Sign-in expired. Try again.")}`
      );
      return;
    }
    const identity = await exchangeCode({
      code,
      redirectUri,
      live: Boolean(row.live),
    });
    if (!identity.email || !identity.oid) {
      res.redirect(
        `${ui}/signin?error=${encodeURIComponent("Microsoft did not return an email.")}`
      );
      return;
    }
    let user =
      db.users.find((u) => u.msOid === identity.oid && u.msTid === identity.tid) ||
      findUserByEmail(identity.email);
    if (!user) {
      user = createUser({
        email: identity.email,
        name: identity.name,
        msOid: identity.oid,
        msTid: identity.tid,
      });
      const org = createOrganization(`${identity.name}'s workspace`, "direct");
      addMembership(user, org, "admin");
    } else {
      linkMicrosoft(user, identity.oid, identity.tid);
    }
    const session = createSession(user.id);
    setSessionCookie(res, session.id, req);
    res.redirect(`${browserOrigin(req)}/app`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Microsoft sign-in failed.";
    res.redirect(
      `${browserOrigin(req)}/signin?error=${encodeURIComponent(message)}`
    );
  }
});

