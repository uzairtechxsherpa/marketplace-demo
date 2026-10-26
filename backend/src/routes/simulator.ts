import { Router } from "express";
import { config, liveMicrosoftEnabled } from "../config.js";
import { configuredPublicOrigin } from "../origin.js";
import { db } from "../db.js";
import { getPlan } from "../plans.js";
import { newId } from "../security.js";
import {
  createMockOperation,
  createMockPurchase,
  reissueMockToken,
} from "../fulfillment.js";

export const simulatorRouter = Router();

simulatorRouter.get("/status", (_req, res) => {
  res.json({
    mode: config.mode,
    live: liveMicrosoftEnabled(),
    offerId: config.offerId,
    productName: config.productName,
  });
});

simulatorRouter.post("/purchase", (req, res) => {
  if (liveMicrosoftEnabled()) {
    res.status(400).json({
      error: "Simulator purchases are disabled in live Marketplace mode.",
    });
    return;
  }
  const {
    planId = "starter",
    quantity = 1,
    purchaserEmail = "buyer@contoso.test",
    purchaserOid,
    purchaserTid,
    accountType,
  } = req.body as {
    planId?: string;
    quantity?: number;
    purchaserEmail?: string;
    purchaserOid?: string;
    purchaserTid?: string;
    accountType?: "work" | "msa";
  };
  if (!getPlan(planId)) {
    res.status(400).json({ error: `Unknown planId "${planId}".` });
    return;
  }
  const tid =
    purchaserTid ||
    (accountType === "msa" ? config.msaTenantId : crypto.randomUUID());
  const created = createMockPurchase({
    planId,
    quantity: Number(quantity) || 1,
    purchaserEmail,
    purchaserOid: purchaserOid || crypto.randomUUID(),
    purchaserTid: tid,
  });
  const site = configuredPublicOrigin() || config.frontendOrigin;
  const landing = `${site}/marketplace/landing?token=${encodeURIComponent(created.token)}`;
  res.json({
    token: created.token,
    landing_url: landing,
    subscription: created.subscription,
  });
});

simulatorRouter.post("/reconfigure", (req, res) => {
  if (liveMicrosoftEnabled()) {
    res.status(400).json({ error: "Disabled in live mode." });
    return;
  }
  const { subscription_id } = req.body as { subscription_id?: string };
  if (!subscription_id) {
    res.status(400).json({ error: "subscription_id is required." });
    return;
  }
  const issued = reissueMockToken(subscription_id);
  if (!issued) {
    res.status(404).json({ error: "Subscription not found." });
    return;
  }
  res.json({
    token: issued.token,
    landing_url: `${configuredPublicOrigin() || config.frontendOrigin}/marketplace/landing?token=${encodeURIComponent(issued.token)}`,
    subscription: issued.subscription,
  });
});

simulatorRouter.get("/subscriptions", (_req, res) => {
  res.json({
    subscriptions: db.marketplaceSubscriptions,
    webhook_events: db.webhookEvents.slice(-25).reverse(),
  });
});

simulatorRouter.post("/webhook", async (req, res) => {
  if (liveMicrosoftEnabled()) {
    res.status(400).json({ error: "Disabled in live mode." });
    return;
  }
  const { subscription_id, action, planId, quantity } = req.body as {
    subscription_id?: string;
    action?: string;
    planId?: string;
    quantity?: number;
  };
  const sub = db.marketplaceSubscriptions.find((s) => s.id === subscription_id);
  if (!sub) {
    res.status(404).json({ error: "Subscription not found." });
    return;
  }
  const op = createMockOperation({
    subscriptionId: sub.id,
    action: action || "Suspend",
    planId: planId || sub.planId,
    quantity: Number(quantity ?? sub.quantity),
  });
  const payload = {
    id: op.id,
    activityId: newId(),
    subscriptionId: sub.id,
    offerId: sub.offerId,
    publisherId: "aether-demo",
    planId: op.planId,
    quantity: op.quantity,
    timeStamp: new Date().toISOString(),
    action: op.action,
    status: "InProgress",
  };
  const origin = `http://localhost:${config.port}`;
  const hook = await fetch(`${origin}/api/marketplace/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await hook.json().catch(() => ({}));
  res.json({ operation: op, webhook_response: data, payload });
});
