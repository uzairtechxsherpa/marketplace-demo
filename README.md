# Aether — Microsoft Marketplace SaaS demo

Standalone app for testing **transactable SaaS** fulfillment. It is a new product, not Fydelitics.

You can run the full purchase path locally with the simulator (no Partner Center). When Entra apps exist, set `MARKETPLACE_MODE=live` and point a DEV offer at this app.

## What is included

- Marketing landing, signup, sign-in, **Sign in with Microsoft**
- Marketplace lobby at `/marketplace/landing?token=...`
- Resolve → Microsoft purchaser sign-in → confirm → **Activate**
- Webhook lifecycle: ChangePlan, ChangeQuantity, Reinstate, Renew, Suspend, Unsubscribe
- Privacy, terms, and support pages for Partner Center listing URLs
- Local **simulator** that issues purchase tokens and fires webhooks

## Run it

```bash
copy .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Optional API smoke check: `npm run check`.

## Stable HTTPS URLs for Partner Center (Render)

Do not put localhost or a tunnel in Partner Center. Host the app on Render so the hostname stays the same after restarts.

1. Sign in once: `render login`
2. Create a GitHub repo for this folder (or connect the existing one) and apply `render.yaml`, or create a Node web service that builds with `npm install && npm run build` and starts with `npm start`.
3. After the first deploy, the URL is permanent, for example `https://aether-marketplace.onrender.com`.

Partner Center technical configuration:

- Landing page: `https://<your-service>.onrender.com/marketplace/landing`
- Webhook: `https://<your-service>.onrender.com/api/marketplace/webhook`

Buyer Entra redirect URIs:

- `https://<your-service>.onrender.com/api/marketplace/auth/callback`
- `https://<your-service>.onrender.com/api/auth/microsoft/callback`

Local work is unchanged: `npm run dev` at http://localhost:5173.

Free Render services sleep when idle. The first Marketplace request after a nap can take ~30s; keep the service open while you test a purchase.

A real Marketplace purchase uses Microsoft’s purchase token, so Resolve/Activate need the publisher Entra app in `.env`. Local simulator purchases keep working without that.

### Test the Marketplace path (mock mode)

1. Open **Simulator**.
2. Create a test purchase (Starter / Pro / Enterprise).
3. Open the landing lobby. Resolve should show the plan and purchaser email.
4. **Continue with Microsoft** — the mock sign-in is prefilled with the purchaser. Leave it to match, or change oid/tid to test mismatch.
5. Confirm the workspace name and **Activate subscription**.
6. You land in the org dashboard. Use simulator **Suspend** / **Change to Pro** / **Cancel** to see entitlements and the product-closed gate.
7. **Configure account** issues a new token for a return visit (no second org, no second Activate).

Day-to-day login after that is `/signin` (password or Microsoft). Invited-style members would not use the landing page.

## API map

| Method | Path | Role |
|--------|------|------|
| POST | `/api/auth/signup` | Email signup + direct org |
| POST | `/api/auth/signin` | Email/password |
| POST | `/api/auth/signout` | Clear session |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/microsoft/start` | Day-to-day Microsoft SSO |
| GET | `/api/auth/microsoft/callback` | Buyer-app OIDC callback |
| POST | `/api/marketplace/resolve` | Purchase token → subscription + `session_id` |
| GET | `/api/marketplace/session/:id` | Lobby state after Resolve / SSO |
| GET | `/api/marketplace/auth/start` | Landing-page Microsoft SSO |
| GET | `/api/marketplace/auth/callback` | Match oid+tid to purchaser |
| POST | `/api/marketplace/activate` | Create org, call Activate, set session |
| POST | `/api/marketplace/webhook` | Fulfillment webhook |
| GET | `/api/org` | Workspace, entitlements, lock state |
| POST | `/api/simulator/purchase` | Mock Marketplace purchase |
| POST | `/api/simulator/reconfigure` | New `?token=` for an existing sub |
| POST | `/api/simulator/webhook` | Inject lifecycle events |

## Live Microsoft (after P3 Entra apps)

Two apps in the **same publisher tenant**. They never share a request.

1. Publisher app (single tenant) → `MARKETPLACE_TENANT_ID`, `MARKETPLACE_CLIENT_ID`, `MARKETPLACE_CLIENT_SECRET`
2. Buyer app (any org + personal accounts) → `MARKETPLACE_LANDING_CLIENT_ID`, `MARKETPLACE_LANDING_CLIENT_SECRET`
3. Redirect URIs: landing callback and day-to-day callback from `.env.example`
4. `az ad sp create --id 20e940b3-4c77-4b0b-9a53-9e16a1b010a7`
5. `MARKETPLACE_MODE=live`

Partner Center technical configuration uses the **publisher** tenant ID and application ID, plus the HTTPS landing and webhook URLs from `npm run tunnel`.

Leave auto-activation **off** so billing starts only after this app calls Activate.
