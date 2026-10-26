import { Router } from "express";
import { config } from "../config.js";
import {
  browserOrigin,
  callbackOrigin,
  isPublicRequest,
  useLiveSso,
} from "../origin.js";
import { db, save, nowIso, addDays } from "../db.js";
import { getPlan, entitlementsFor } from "../plans.js";
import {
  createSession,
  newId,
  requireAuth,
  setSessionCookie,
} from "../security.js";
import {
  consumeState,
  exchangeCode,
  startMicrosoftLogin,
} from "../entra.js";
import {
  activateSubscription,
  getOperation,
  patchOperation,
  resolvePurchaseToken,
  upsertResolvedSubscription,
} from "../fulfillment.js";
import {
  addMembership,
  createOrganization,
  createUser,
  findUserByEmail,
  linkMicrosoft,
  orgForUser,
  subscriptionForOrg,
} from "../provision.js";
import type { MarketplaceSubscription } from "../types.js";

export const marketplaceRouter = Router();

function sessionPayload(sessionId: string) {
  const pending = db.pendingSessions.find((s) => s.id === sessionId);
  if (!pending) return null;
  const sub = db.marketplaceSubscriptions.find(
    (s) => s.id === pending.subscriptionId
  );
  if (!sub) return null;
  return {
    session_id: pending.id,
    subscription_id: sub.id,
    offer_id: sub.offerId,
    plan_id: sub.planId,
    plan: getPlan(sub.planId),
    quantity: sub.quantity,
    status: sub.status,
    purchaser: sub.purchaser,
    beneficiary: sub.beneficiary,
    term: {
      startDate: sub.termStart,
      endDate: sub.termEnd,
      termUnit: sub.termUnit,
    },
    is_return_visit: Boolean(sub.organizationId),
    already_activated: sub.status === "Subscribed" && Boolean(sub.organizationId),
    matched_email: pending.matchedEmail,
    mismatch: pending.mismatch,
    mismatch_signed_in_as: pending.mismatchSignedInAs,
    ready_to_activate: Boolean(pending.matchedOid) && !pending.mismatch,
  };
}

marketplaceRouter.post("/resolve", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      res.status(400).json({ error: "Purchase token is required." });
      return;
    }
    const resolved = await resolvePurchaseToken(token);
    const sub = upsertResolvedSubscription(resolved);
    let pending = db.pendingSessions.find(
      (s) => s.subscriptionId === sub.id && s.purchaseToken === decodeURIComponent(token)
    );
    if (!pending) {
      pending = {
        id: newId(),
        purchaseToken: decodeURIComponent(token),
        subscriptionId: sub.id,
        matchedUserId: null,
        matchedEmail: null,
        matchedOid: null,
        matchedTid: null,
        mismatch: false,
        mismatchSignedInAs: null,
        createdAt: nowIso(),
        expiresAt: addDays(1),
      };
      db.pendingSessions.push(pending);
      save();
    }
    res.json(sessionPayload(pending.id));
  } catch (err) {
    const status = (err as { status?: number }).status || 400;
    res.status(status).json({
      error:
        err instanceof Error
          ? err.message
          : "Could not resolve this Marketplace purchase.",
      guidance:
        "Return to the Azure portal and click Configure account to get a new landing link. Purchase tokens expire after 24 hours.",
    });
  }
});

marketplaceRouter.get("/session/:id", (req, res) => {
  const payload = sessionPayload(req.params.id);
  if (!payload) {
    res.status(404).json({ error: "Marketplace session expired." });
    return;
  }
  res.json(payload);
});

marketplaceRouter.get("/auth/start", (req, res) => {
  const sessionId = String(req.query.session_id || "");
  const pending = db.pendingSessions.find((s) => s.id === sessionId);
  if (!pending) {
    res.redirect(
      `${browserOrigin(req)}/marketplace/landing?error=${encodeURIComponent("Session expired. Open the landing link from Marketplace again.")}`
    );
    return;
  }
  const origin = callbackOrigin(req);
  const redirectUri = isPublicRequest(req)
    ? `${origin}/api/marketplace/auth/callback`
    : config.buyer.landingRedirectUri;
  const url = startMicrosoftLogin({
    purpose: "marketplace",
    sessionId,
    redirectUri,
    publicOrigin: origin,
    live: useLiveSso(req),
  });
  res.redirect(url);
});

marketplaceRouter.get("/auth/callback", async (req, res) => {
  const lobby = `${browserOrigin(req)}/marketplace/landing`;
  const redirectUri = isPublicRequest(req)
    ? `${callbackOrigin(req)}/api/marketplace/auth/callback`
    : config.buyer.landingRedirectUri;
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const row = consumeState(state);
    if (!row || row.purpose !== "marketplace" || !row.sessionId) {
      res.redirect(
        `${lobby}?error=${encodeURIComponent("Microsoft sign-in expired. Try Continue with Microsoft again.")}`
      );
      return;
    }
    const pending = db.pendingSessions.find((s) => s.id === row.sessionId);
    const sub = pending
      ? db.marketplaceSubscriptions.find((s) => s.id === pending.subscriptionId)
      : null;
    if (!pending || !sub) {
      res.redirect(`${lobby}?error=${encodeURIComponent("Purchase session was not found.")}`);
      return;
    }
    const identity = await exchangeCode({
      code,
      redirectUri,
      live: Boolean(row.live),
    });
    const purchaserMatch =
      identity.oid === sub.purchaser.objectId &&
      identity.tid === sub.purchaser.tenantId;

    if (!purchaserMatch) {
      pending.mismatch = true;
      pending.mismatchSignedInAs = identity.email || identity.oid;
      pending.matchedOid = null;
      pending.matchedTid = null;
      pending.matchedEmail = null;
      save();
      res.redirect(
        `${lobby}?session_id=${pending.id}&error=${encodeURIComponent(
          `You signed in as ${identity.email || identity.oid}; this purchase belongs to ${sub.purchaser.emailId}.`
        )}`
      );
      return;
    }

    pending.mismatch = false;
    pending.mismatchSignedInAs = null;
    pending.matchedEmail = identity.email;
    pending.matchedOid = identity.oid;
    pending.matchedTid = identity.tid;
    save();

    if (sub.organizationId) {
      const user = signPurchaserIntoOrg(sub, identity);
      const session = createSession(user.id);
      setSessionCookie(res, session.id, req);
      res.redirect(`${browserOrigin(req)}/app`);
      return;
    }

    res.redirect(`${lobby}?session_id=${pending.id}&ready=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Microsoft sign-in failed.";
    res.redirect(`${lobby}?error=${encodeURIComponent(message)}`);
  }
});

marketplaceRouter.post("/activate", async (req, res) => {
  try {
    const { session_id, organization_name } = req.body as {
      session_id?: string;
      organization_name?: string;
    };
    const pending = db.pendingSessions.find((s) => s.id === session_id);
    if (!pending) {
      res.status(400).json({ error: "Marketplace session expired." });
      return;
    }
    if (!pending.matchedOid || pending.mismatch) {
      res.status(400).json({
        error: "Sign in with the Microsoft account that purchased this offer first.",
      });
      return;
    }
    const sub = db.marketplaceSubscriptions.find(
      (s) => s.id === pending.subscriptionId
    );
    if (!sub) {
      res.status(404).json({ error: "Subscription not found." });
      return;
    }
    const plan = getPlan(sub.planId);
    if (!plan) {
      res.status(400).json({
        error: `Unknown Marketplace planId "${sub.planId}". Activation was blocked.`,
      });
      return;
    }

    if (sub.organizationId) {
      const identity = {
        email: pending.matchedEmail || sub.purchaser.emailId,
        name: (pending.matchedEmail || sub.purchaser.emailId).split("@")[0],
        oid: pending.matchedOid,
        tid: pending.matchedTid as string,
      };
      const user = signPurchaserIntoOrg(sub, identity);
      const session = createSession(user.id);
      setSessionCookie(res, session.id, req);
      res.json({
        organization_id: sub.organizationId,
        subscription_id: sub.id,
        status: sub.status,
        entitlements: entitlementsFor(sub.planId),
        already_activated: true,
      });
      return;
    }

    const email = (pending.matchedEmail || sub.purchaser.emailId).toLowerCase();
    let user =
      db.users.find(
        (u) => u.msOid === pending.matchedOid && u.msTid === pending.matchedTid
      ) || findUserByEmail(email);
    if (!user) {
      user = createUser({
        email,
        name: email.split("@")[0],
        msOid: pending.matchedOid,
        msTid: pending.matchedTid,
      });
    } else {
      linkMicrosoft(user, pending.matchedOid, pending.matchedTid);
    }

    const org = createOrganization(
      organization_name?.trim() || `${plan.label} workspace`,
      "marketplace"
    );
    addMembership(user, org, "admin");

    await activateSubscription(sub.id, sub.planId, sub.quantity);
    sub.organizationId = org.id;
    sub.status = "Subscribed";
    sub.updatedAt = nowIso();
    pending.matchedUserId = user.id;
    save();

    const session = createSession(user.id);
    setSessionCookie(res, session.id, req);
    res.json({
      organization_id: org.id,
      subscription_id: sub.id,
      status: sub.status,
      entitlements: entitlementsFor(sub.planId),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Activate failed.",
    });
  }
});

marketplaceRouter.get("/subscription", requireAuth, (req, res) => {
  const user = (req as typeof req & { user: { currentOrganizationId: string | null } })
    .user;
  const org = orgForUser(user as never);
  if (!org) {
    res.json({ subscription: null });
    return;
  }
  const sub = subscriptionForOrg(org.id);
  res.json({
    organization: org,
    subscription: sub,
    entitlements: entitlementsFor(sub?.planId),
  });
});

const ACK_ACTIONS = new Set(["ChangePlan", "ChangeQuantity", "Reinstate"]);

marketplaceRouter.get("/webhook", (_req, res) => {
  res.json({
    ok: true,
    endpoint: "marketplace webhook",
    method: "POST",
    note: "Microsoft sends POST here. GET only confirms the URL is live.",
  });
});

marketplaceRouter.head("/webhook", (_req, res) => {
  res.status(200).end();
});

marketplaceRouter.post("/webhook", async (req, res) => {
  console.log(
    `[webhook] ${req.body?.action || "unknown"} sub=${req.body?.subscriptionId || "none"}`
  );
  const body = req.body as {
    id?: string;
    subscriptionId?: string;
    action?: string;
    planId?: string;
    quantity?: number | string;
    offerId?: string;
  };
  const operationId = body.id || newId();
  const subscriptionId = body.subscriptionId || "";
  const action = body.action || "Unknown";

  const event = {
    id: newId(),
    subscriptionId,
    operationId,
    action,
    payload: body,
    applied: false,
    createdAt: nowIso(),
  };
  db.webhookEvents.push(event);
  save();

  try {
    if (subscriptionId && operationId) {
      const op = await getOperation(subscriptionId, operationId);
      if (op) {
        const confirmedId =
          (op as { id?: string }).id ||
          (op as { operationId?: string }).operationId;
        if (confirmedId && confirmedId !== operationId) {
          res.status(200).json({ status: "ignored" });
          return;
        }
      }
    }

    const sub = db.marketplaceSubscriptions.find((s) => s.id === subscriptionId);
    if (sub) {
      applyWebhookAction(sub, action, body);
      event.applied = true;
      sub.lastOperationId = operationId;
      sub.updatedAt = nowIso();
      save();
    }

    if (ACK_ACTIONS.has(action) && subscriptionId) {
      await patchOperation(subscriptionId, operationId, "Success");
    }
    res.status(200).json({ status: "accepted" });
  } catch (err) {
    console.error("Webhook apply failed", err);
    if (ACK_ACTIONS.has(action) && subscriptionId) {
      await patchOperation(subscriptionId, operationId, "Failure").catch(() => undefined);
    }
    res.status(200).json({ status: "accepted", warning: "apply_failed" });
  }
});

function signPurchaserIntoOrg(
  sub: MarketplaceSubscription,
  identity: { email: string; name: string; oid: string; tid: string }
) {
  let user =
    db.users.find((u) => u.msOid === identity.oid && u.msTid === identity.tid) ||
    findUserByEmail(identity.email);
  if (!user) {
    user = createUser({
      email: identity.email || sub.purchaser.emailId,
      name: identity.name,
      msOid: identity.oid,
      msTid: identity.tid,
    });
  } else {
    linkMicrosoft(user, identity.oid, identity.tid);
  }
  const org = db.organizations.find((o) => o.id === sub.organizationId);
  if (org) addMembership(user, org, "admin");
  return user;
}

function applyWebhookAction(
  sub: MarketplaceSubscription,
  action: string,
  body: { planId?: string; quantity?: number | string }
) {
  switch (action) {
    case "ChangePlan":
      if (body.planId && getPlan(body.planId)) sub.planId = body.planId;
      break;
    case "ChangeQuantity":
      sub.quantity = Number(body.quantity ?? sub.quantity);
      break;
    case "Reinstate":
      sub.status = "Subscribed";
      break;
    case "Renew":
      sub.termStart = nowIso();
      sub.termEnd = addDays(30);
      break;
    case "Suspend":
      sub.status = "Suspended";
      break;
    case "Unsubscribe":
      sub.status = "Unsubscribed";
      break;
    case "Subscribe":
      break;
    default:
      break;
  }
}
