import { config, publisherConfigured } from "./config.js";
import { db, save, nowIso, addDays } from "./db.js";
import { newId, newToken } from "./security.js";
import type { MarketplaceSubscription, MockOperation } from "./types.js";

type ResolveResult = {
  id: string;
  subscriptionName: string;
  offerId: string;
  planId: string;
  quantity: number;
  subscription: {
    id: string;
    offerId: string;
    name: string;
    saasSubscriptionStatus: string;
    beneficiary: {
      emailId: string;
      objectId: string;
      tenantId: string;
    };
    purchaser: {
      emailId: string;
      objectId: string;
      tenantId: string;
    };
    planId: string;
    quantity: number;
    term: { startDate: string; endDate: string; termUnit: string };
    isTest: boolean;
  };
};

function isMockSubscription(subscriptionId: string) {
  return db.mockTokens.some((t) => t.subscriptionId === subscriptionId);
}

async function publisherToken() {
  if (!publisherConfigured()) {
    return "mock-publisher-token";
  }
  const cached = db.publisherToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }
  const body = new URLSearchParams({
    client_id: config.publisher.clientId,
    client_secret: config.publisher.clientSecret,
    grant_type: "client_credentials",
    scope: config.publisher.scope,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${config.publisher.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Publisher token request failed"
    );
  }
  db.publisherToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  save();
  return data.access_token;
}

function toResolveShape(sub: MarketplaceSubscription): ResolveResult {
  return {
    id: sub.id,
    subscriptionName: sub.name,
    offerId: sub.offerId,
    planId: sub.planId,
    quantity: sub.quantity,
    subscription: {
      id: sub.id,
      offerId: sub.offerId,
      name: sub.name,
      saasSubscriptionStatus: sub.status,
      beneficiary: sub.beneficiary,
      purchaser: sub.purchaser,
      planId: sub.planId,
      quantity: sub.quantity,
      term: {
        startDate: sub.termStart,
        endDate: sub.termEnd,
        termUnit: sub.termUnit,
      },
      isTest: sub.isTest,
    },
  };
}

export async function resolvePurchaseToken(token: string): Promise<ResolveResult> {
  const decoded = decodeURIComponent(token);
  const mockRow = db.mockTokens.find(
    (t) => t.token === decoded && new Date(t.expiresAt).getTime() > Date.now()
  );
  if (mockRow) {
    const sub = db.marketplaceSubscriptions.find((s) => s.id === mockRow.subscriptionId);
    if (!sub) {
      const err = new Error("Subscription for this token was not found.");
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    return toResolveShape(sub);
  }

  if (!publisherConfigured()) {
    const err = new Error("Purchase token is invalid or expired.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const access = await publisherToken();
  const res = await fetch(
    `${config.fulfillmentBase}/subscriptions/resolve?api-version=${config.apiVersion}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        "x-ms-marketplace-token": decoded,
      },
    }
  );
  const data = (await res.json()) as ResolveResult & {
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    const err = new Error(
      data.error?.message || data.message || "Marketplace Resolve failed."
    );
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return data;
}

export async function activateSubscription(
  subscriptionId: string,
  planId: string,
  quantity: number
) {
  if (!publisherConfigured() || isMockSubscription(subscriptionId)) {
    const sub = db.marketplaceSubscriptions.find((s) => s.id === subscriptionId);
    if (!sub) throw new Error("Subscription not found.");
    sub.status = "Subscribed";
    sub.updatedAt = nowIso();
    save();
    return { status: "Subscribed" };
  }
  const access = await publisherToken();
  const res = await fetch(
    `${config.fulfillmentBase}/subscriptions/${subscriptionId}/activate?api-version=${config.apiVersion}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId, quantity: String(quantity) }),
    }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: { message?: string };
    };
    throw new Error(data.error?.message || data.message || "Activate failed.");
  }
  return { status: "Subscribed" };
}

export async function getSubscription(subscriptionId: string) {
  const local = db.marketplaceSubscriptions.find((s) => s.id === subscriptionId);
  if (local && (!publisherConfigured() || isMockSubscription(subscriptionId))) {
    return toResolveShape(local).subscription;
  }
  if (!publisherConfigured()) return local ? toResolveShape(local).subscription : null;
  const access = await publisherToken();
  const res = await fetch(
    `${config.fulfillmentBase}/subscriptions/${subscriptionId}?api-version=${config.apiVersion}`,
    { headers: { Authorization: `Bearer ${access}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function getOperation(subscriptionId: string, operationId: string) {
  const mock = db.mockOperations.find(
    (o) => o.id === operationId && o.subscriptionId === subscriptionId
  );
  if (mock || !publisherConfigured()) {
    return mock ?? null;
  }
  const access = await publisherToken();
  const res = await fetch(
    `${config.fulfillmentBase}/subscriptions/${subscriptionId}/operations/${operationId}?api-version=${config.apiVersion}`,
    { headers: { Authorization: `Bearer ${access}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function patchOperation(
  subscriptionId: string,
  operationId: string,
  status: "Success" | "Failure"
) {
  const mockOp = db.mockOperations.find(
    (o) => o.id === operationId && o.subscriptionId === subscriptionId
  );
  if (mockOp || !publisherConfigured()) {
    if (mockOp) {
      mockOp.status = status === "Success" ? "Succeeded" : "Failed";
      save();
    }
    return;
  }
  const access = await publisherToken();
  await fetch(
    `${config.fulfillmentBase}/subscriptions/${subscriptionId}/operations/${operationId}?api-version=${config.apiVersion}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    }
  );
}

export function createMockPurchase(input: {
  planId: string;
  quantity: number;
  purchaserEmail: string;
  purchaserOid: string;
  purchaserTid: string;
  beneficiaryEmail?: string;
  beneficiaryOid?: string;
  beneficiaryTid?: string;
}) {
  const id = crypto.randomUUID();
  const token = newToken(40);
  const party = {
    emailId: input.purchaserEmail,
    objectId: input.purchaserOid,
    tenantId: input.purchaserTid,
  };
  const sub: MarketplaceSubscription = {
    id,
    organizationId: null,
    offerId: config.offerId,
    planId: input.planId,
    quantity: input.quantity,
    status: "PendingFulfillmentStart",
    name: `${config.productName} ${input.planId}`,
    purchaser: party,
    beneficiary: {
      emailId: input.beneficiaryEmail || input.purchaserEmail,
      objectId: input.beneficiaryOid || input.purchaserOid,
      tenantId: input.beneficiaryTid || input.purchaserTid,
    },
    termUnit: "P1M",
    termStart: nowIso(),
    termEnd: addDays(30),
    lastOperationId: null,
    isTest: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.marketplaceSubscriptions.push(sub);
  db.mockTokens.push({
    token,
    subscriptionId: id,
    expiresAt: addDays(1),
  });
  save();
  return { token, subscription: sub };
}

export function reissueMockToken(subscriptionId: string) {
  const sub = db.marketplaceSubscriptions.find((s) => s.id === subscriptionId);
  if (!sub) return null;
  const token = newToken(40);
  db.mockTokens.push({
    token,
    subscriptionId,
    expiresAt: addDays(1),
  });
  save();
  return { token, subscription: sub };
}

export function createMockOperation(input: {
  subscriptionId: string;
  action: string;
  planId: string;
  quantity: number;
}): MockOperation {
  const op: MockOperation = {
    id: newId(),
    subscriptionId: input.subscriptionId,
    action: input.action,
    planId: input.planId,
    quantity: input.quantity,
    status: "InProgress",
    createdAt: nowIso(),
  };
  db.mockOperations.push(op);
  save();
  return op;
}

export function upsertResolvedSubscription(resolved: ResolveResult) {
  const sub = resolved.subscription;
  let row = db.marketplaceSubscriptions.find((s) => s.id === sub.id);
  if (!row) {
    row = {
      id: sub.id,
      organizationId: null,
      offerId: sub.offerId || resolved.offerId,
      planId: sub.planId || resolved.planId,
      quantity: Number(sub.quantity ?? resolved.quantity ?? 1),
      status: (sub.saasSubscriptionStatus as MarketplaceSubscription["status"]) ||
        "PendingFulfillmentStart",
      name: sub.name || resolved.subscriptionName,
      purchaser: sub.purchaser,
      beneficiary: sub.beneficiary,
      termUnit: sub.term?.termUnit || "P1M",
      termStart: sub.term?.startDate || nowIso(),
      termEnd: sub.term?.endDate || addDays(30),
      lastOperationId: null,
      isTest: Boolean(sub.isTest),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.marketplaceSubscriptions.push(row);
  } else {
    row.planId = sub.planId || row.planId;
    row.quantity = Number(sub.quantity ?? row.quantity);
    row.status =
      (sub.saasSubscriptionStatus as MarketplaceSubscription["status"]) ||
      row.status;
    row.purchaser = sub.purchaser || row.purchaser;
    row.beneficiary = sub.beneficiary || row.beneficiary;
    row.updatedAt = nowIso();
  }
  save();
  return row;
}
