import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { db, save } from "./db.js";
import { config } from "./config.js";
import { newToken } from "./security.js";

function page(inner: string, title = "Sign in") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Mock Microsoft</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet" />
  <style>
    :root { --ink:#1c1917; --muted:#6b645c; --line:#e7e0d6; --paper:#f6f3ee; --card:#fff; --teal:#0f6e56; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--paper); color:var(--ink);
      font-family: Figtree, system-ui, sans-serif; }
    .card { width:min(440px, calc(100vw - 32px)); background:var(--card); border:1px solid var(--line); border-radius:20px;
      padding:28px; box-shadow: 0 24px 60px rgba(28,25,23,.08); }
    .flag { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#9a4b12; font-weight:600; }
    h1 { font-family: Fraunces, Georgia, serif; font-size:28px; margin:8px 0 6px; }
    p { color:var(--muted); line-height:1.5; margin:0 0 18px; }
    label { display:block; font-size:13px; font-weight:600; margin:12px 0 6px; }
    input, select { width:100%; padding:11px 12px; border:1px solid var(--line); border-radius:10px; font:inherit; background:#fff; }
    .row { display:flex; gap:10px; }
    .row > * { flex:1; }
    button { margin-top:18px; width:100%; border:0; background:var(--ink); color:#fff; padding:12px 14px; border-radius:12px;
      font:inherit; font-weight:600; cursor:pointer; }
    .hint { font-size:12px; color:var(--muted); margin-top:14px; }
  </style>
</head>
<body>${inner}</body>
</html>`;
}

export function mockEntraRouter(): Router {
  const router = createRouter();

  router.get("/authorize", (req: Request, res: Response) => {
    const sessionId = String(req.query.session_id || "");
    const pending = db.pendingSessions.find((s) => s.id === sessionId);
    const sub = pending
      ? db.marketplaceSubscriptions.find((s) => s.id === pending.subscriptionId)
      : null;
    const email = sub?.purchaser.emailId || "";
    const oid = sub?.purchaser.objectId || crypto.randomUUID();
    const tid = sub?.purchaser.tenantId || crypto.randomUUID();
    const isMsa = tid === config.msaTenantId;

    res.type("html").send(
      page(
        `<div class="card">
          <div class="flag">Local mock · not login.microsoftonline.com</div>
          <h1>Continue with Microsoft</h1>
          <p>This stand-in lets you test purchaser match and mismatch without Entra apps.</p>
          <form method="post" action="/api/mock-entra/complete">
            <input type="hidden" name="state" value="${String(req.query.state || "")}" />
            <input type="hidden" name="redirect_uri" value="${String(req.query.redirect_uri || "")}" />
            <input type="hidden" name="purpose" value="${String(req.query.purpose || "signin")}" />
            <input type="hidden" name="session_id" value="${sessionId}" />
            <label>Email</label>
            <input name="email" value="${email}" required />
            <label>Display name</label>
            <input name="name" value="${email ? email.split("@")[0] : "Marketplace Buyer"}" required />
            <div class="row">
              <div>
                <label>Object ID (oid)</label>
                <input name="oid" value="${oid}" required />
              </div>
              <div>
                <label>Tenant ID (tid)</label>
                <input name="tid" id="tid" value="${tid}" required />
              </div>
            </div>
            <label>Account type</label>
            <select name="account" onchange="document.getElementById('tid').value = this.value === 'msa' ? '${config.msaTenantId}' : '${tid === config.msaTenantId ? crypto.randomUUID() : tid}'">
              <option value="work" ${isMsa ? "" : "selected"}>Work account</option>
              <option value="msa" ${isMsa ? "selected" : ""}>Personal Microsoft account</option>
            </select>
            <button type="submit">Sign in</button>
            <p class="hint">Leave values as-is to match the Marketplace purchaser. Change email or oid/tid to test a mismatch.</p>
          </form>
        </div>`
      )
    );
  });

  router.post("/complete", (req: Request, res: Response) => {
    const {
      state,
      redirect_uri,
      purpose,
      session_id,
      email,
      name,
      oid,
      tid,
    } = req.body as Record<string, string>;
    if (!state || !redirect_uri) {
      res.status(400).send("Missing state or redirect_uri");
      return;
    }
    const code = newToken(24);
    db.mockAuthCodes.push({
      code,
      email: String(email || "").toLowerCase(),
      name: name || "Microsoft user",
      oid,
      tid,
      purpose: purpose === "marketplace" ? "marketplace" : "signin",
      sessionId: session_id || null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    save();
    const target = new URL(redirect_uri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    res.redirect(target.toString());
  });

  return router;
}
