import { Router } from "express";
import { db } from "../db.js";
import { entitlementsFor, PLANS } from "../plans.js";
import { requireAuth } from "../security.js";
import { orgForUser, subscriptionForOrg } from "../provision.js";
import type { User } from "../types.js";

export const orgRouter = Router();

orgRouter.get("/", requireAuth, (req, res) => {
  const user = (req as typeof req & { user: User }).user;
  const org = orgForUser(user);
  if (!org) {
    res.json({ organization: null, members: [], subscription: null });
    return;
  }
  const members = db.memberships
    .filter((m) => m.organizationId === org.id)
    .map((m) => {
      const u = db.users.find((x) => x.id === m.userId);
      return {
        userId: m.userId,
        role: m.role,
        email: u?.email,
        name: u?.name,
      };
    });
  const sub = subscriptionForOrg(org.id);
  const entitlements = entitlementsFor(sub?.planId);
  const productOpen =
    !sub || sub.status === "Subscribed" || org.billingSource === "direct";
  const gated =
    org.billingSource === "marketplace" &&
    sub &&
    (sub.status === "Suspended" || sub.status === "Unsubscribed");

  res.json({
    organization: org,
    members,
    subscription: sub,
    entitlements,
    product_open: productOpen && !gated,
    lock_reason: gated
      ? sub?.status === "Suspended"
        ? "Your Marketplace subscription is suspended."
        : "Your Marketplace subscription was cancelled."
      : null,
    catalog: Object.values(PLANS),
    webhook_events: db.webhookEvents
      .filter((e) => e.subscriptionId === sub?.id)
      .slice(-10)
      .reverse(),
  });
});
