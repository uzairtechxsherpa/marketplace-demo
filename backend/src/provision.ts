import { db, save, nowIso } from "./db.js";
import { hashPassword, newId } from "./security.js";
import type { Organization, User } from "./types.js";

export function findUserByEmail(email: string) {
  return db.users.find((u) => u.email === email.toLowerCase()) ?? null;
}

export function createUser(input: {
  email: string;
  name: string;
  password?: string;
  msOid?: string | null;
  msTid?: string | null;
}): User {
  const user: User = {
    id: newId(),
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash: input.password ? hashPassword(input.password) : null,
    msOid: input.msOid ?? null,
    msTid: input.msTid ?? null,
    currentOrganizationId: null,
    createdAt: nowIso(),
  };
  db.users.push(user);
  save();
  return user;
}

export function createOrganization(
  name: string,
  billingSource: Organization["billingSource"]
) {
  const org: Organization = {
    id: newId(),
    name,
    billingSource,
    createdAt: nowIso(),
  };
  db.organizations.push(org);
  save();
  return org;
}

export function addMembership(
  user: User,
  org: Organization,
  role: "admin" | "member"
) {
  const existing = db.memberships.find(
    (m) => m.userId === user.id && m.organizationId === org.id
  );
  if (!existing) {
    db.memberships.push({ userId: user.id, organizationId: org.id, role });
  }
  user.currentOrganizationId = org.id;
  save();
}

export function orgForUser(user: User) {
  const id = user.currentOrganizationId;
  if (!id) return null;
  return db.organizations.find((o) => o.id === id) ?? null;
}

export function subscriptionForOrg(orgId: string) {
  return (
    db.marketplaceSubscriptions.find((s) => s.organizationId === orgId) ?? null
  );
}

export function linkMicrosoft(user: User, oid: string, tid: string) {
  if (!user.msOid) user.msOid = oid;
  if (!user.msTid) user.msTid = tid;
  save();
}
