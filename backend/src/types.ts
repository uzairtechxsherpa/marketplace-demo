export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  msOid: string | null;
  msTid: string | null;
  currentOrganizationId: string | null;
  createdAt: string;
};

export type Organization = {
  id: string;
  name: string;
  billingSource: "marketplace" | "direct";
  createdAt: string;
};

export type Membership = {
  userId: string;
  organizationId: string;
  role: "admin" | "member";
};

export type MarketplaceParty = {
  emailId: string;
  objectId: string;
  tenantId: string;
};

export type MarketplaceSubscription = {
  id: string;
  organizationId: string | null;
  offerId: string;
  planId: string;
  quantity: number;
  status:
    | "PendingFulfillmentStart"
    | "Subscribed"
    | "Suspended"
    | "Unsubscribed";
  name: string;
  purchaser: MarketplaceParty;
  beneficiary: MarketplaceParty;
  termUnit: string;
  termStart: string;
  termEnd: string;
  lastOperationId: string | null;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PendingSession = {
  id: string;
  purchaseToken: string;
  subscriptionId: string;
  matchedUserId: string | null;
  matchedEmail: string | null;
  matchedOid: string | null;
  matchedTid: string | null;
  mismatch: boolean;
  mismatchSignedInAs: string | null;
  createdAt: string;
  expiresAt: string;
};

export type OauthState = {
  state: string;
  sessionId: string | null;
  purpose: "marketplace" | "signin";
  live: boolean;
  createdAt: string;
  expiresAt: string;
};

export type AppSession = {
  id: string;
  userId: string;
  expiresAt: string;
};

export type WebhookEvent = {
  id: string;
  subscriptionId: string;
  operationId: string;
  action: string;
  payload: unknown;
  applied: boolean;
  createdAt: string;
};

export type MockAuthCode = {
  code: string;
  email: string;
  name: string;
  oid: string;
  tid: string;
  purpose: "marketplace" | "signin";
  sessionId: string | null;
  expiresAt: string;
};

export type MockOperation = {
  id: string;
  subscriptionId: string;
  action: string;
  planId: string;
  quantity: number;
  status: "InProgress" | "Succeeded" | "Failed";
  createdAt: string;
};

export type MockToken = {
  token: string;
  subscriptionId: string;
  expiresAt: string;
};

export type DB = {
  users: User[];
  organizations: Organization[];
  memberships: Membership[];
  marketplaceSubscriptions: MarketplaceSubscription[];
  pendingSessions: PendingSession[];
  oauthStates: OauthState[];
  sessions: AppSession[];
  webhookEvents: WebhookEvent[];
  mockAuthCodes: MockAuthCode[];
  mockOperations: MockOperation[];
  mockTokens: MockToken[];
  publisherToken: { accessToken: string; expiresAt: number } | null;
};
