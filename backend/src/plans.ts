export type PlanId = "starter" | "pro" | "enterprise";

export type Plan = {
  id: PlanId;
  label: string;
  price: string;
  term: string;
  billingTier: string;
  seats: number;
  dashboards: number;
  exports: boolean;
  sso: boolean;
  summary: string;
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    label: "Starter",
    price: "$49",
    term: "per month",
    billingTier: "starter",
    seats: 5,
    dashboards: 3,
    exports: false,
    sso: false,
    summary: "Small teams getting started with hosted analytics.",
  },
  pro: {
    id: "pro",
    label: "Pro",
    price: "$199",
    term: "per month",
    billingTier: "pro",
    seats: 50,
    dashboards: 25,
    exports: true,
    sso: false,
    summary: "Growing orgs that need exports and more workspace.",
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    price: "Custom",
    term: "private offer",
    billingTier: "enterprise",
    seats: 9999,
    dashboards: 9999,
    exports: true,
    sso: true,
    summary: "Unlimited seats, SSO, and tenant-targeted private offers.",
  },
};

export function getPlan(planId: string | undefined | null): Plan | null {
  if (!planId) return null;
  const key = planId.toLowerCase() as PlanId;
  return PLANS[key] ?? null;
}

export function entitlementsFor(planId: string | undefined | null) {
  const plan = getPlan(planId);
  if (!plan) {
    return {
      known: false,
      seats: 0,
      dashboards: 0,
      exports: false,
      sso: false,
      label: planId || "unknown",
    };
  }
  return {
    known: true,
    seats: plan.seats,
    dashboards: plan.dashboards,
    exports: plan.exports,
    sso: plan.sso,
    label: plan.label,
  };
}
