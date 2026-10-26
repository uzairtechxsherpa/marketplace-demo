import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config({ path: path.resolve(here, "../.env") });

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(env("PORT", "4000")),
  frontendOrigin: env("FRONTEND_ORIGIN", "http://localhost:5173"),
  sessionSecret: env("SESSION_SECRET", "dev-secret-change-me"),
  productName: env("PRODUCT_NAME", "Aether"),
  offerId: env("MARKETPLACE_OFFER_ID", "aether-saas-dev"),
  mode: (env("MARKETPLACE_MODE", "mock") === "live" ? "live" : "mock") as
    | "live"
    | "mock",
  publisher: {
    tenantId: env("MARKETPLACE_TENANT_ID"),
    clientId: env("MARKETPLACE_CLIENT_ID"),
    clientSecret: env("MARKETPLACE_CLIENT_SECRET"),
    scope: "20e940b3-4c77-4b0b-9a53-9e16a1b010a7/.default",
  },
  buyer: {
    clientId: env("MARKETPLACE_LANDING_CLIENT_ID"),
    clientSecret: env("MARKETPLACE_LANDING_CLIENT_SECRET"),
    landingRedirectUri: env(
      "MARKETPLACE_LANDING_REDIRECT_URI",
      "http://localhost:4000/api/marketplace/auth/callback"
    ),
    signinRedirectUri: env(
      "AUTH_MICROSOFT_REDIRECT_URI",
      "http://localhost:4000/api/auth/microsoft/callback"
    ),
  },
  msaTenantId: "9188040d-6c67-4c5b-b112-36a304b66dad",
  fulfillmentBase: "https://marketplaceapi.microsoft.com/api/saas",
  apiVersion: "2018-08-31",
};

export function publisherConfigured() {
  return Boolean(
    config.publisher.tenantId &&
      config.publisher.clientId &&
      config.publisher.clientSecret
  );
}

export function buyerConfigured() {
  return Boolean(config.buyer.clientId && config.buyer.clientSecret);
}

export function liveMicrosoftEnabled() {
  return config.mode === "live" && publisherConfigured() && buyerConfigured();
}
