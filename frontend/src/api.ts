export type Plan = {
  id: string;
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

export type AppConfig = {
  productName: string;
  offerId: string;
  marketplaceMode: "mock" | "live";
  liveMicrosoft: boolean;
  publisherConfigured: boolean;
  buyerConfigured: boolean;
  plans: Plan[];
  publicOrigin: string | null;
  landingUrl: string;
  webhookUrl: string;
  landingRedirectUri: string;
  signinRedirectUri: string;
  httpsReady: boolean;
};

export type User = {
  id: string;
  email: string;
  name: string;
  hasMicrosoft: boolean;
  currentOrganizationId: string | null;
};

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...opts,
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      String(data.error || data.message || "Request failed"),
      res.status,
      data
    );
  }
  return data as T;
}
