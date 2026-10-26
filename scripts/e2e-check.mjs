const jar = {};
function cookieHeader() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
function saveCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
  }
}
async function api(path, opts = {}) {
  const res = await fetch("http://localhost:4000" + path, {
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  saveCookies(res);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, location: res.headers.get("location"), body };
}

const health = await api("/api/health");
const cfg = await api("/api/config");
const home = await fetch("http://localhost:5173/");
const purchase = await api("/api/simulator/purchase", {
  method: "POST",
  body: JSON.stringify({
    planId: "starter",
    purchaserEmail: "buyer@contoso.test",
    accountType: "work",
  }),
});
const token = purchase.body.token;
const resolved = await api("/api/marketplace/resolve", {
  method: "POST",
  body: JSON.stringify({ token }),
});
const sessionId = resolved.body.session_id;
const start = await api("/api/marketplace/auth/start?session_id=" + sessionId);
const authorizeUrl = start.location;
const authPage = await fetch(authorizeUrl);
const html = await authPage.text();
const field = (name) => {
  const match = html.match(new RegExp(`name="${name}"[^>]*value="([^"]+)"`));
  if (!match) throw new Error(`Missing field ${name}`);
  return match[1];
};
const oid = resolved.body.purchaser.objectId;
const tid = resolved.body.purchaser.tenantId;
const state = field("state");
const redirectUri = field("redirect_uri");
const form = new URLSearchParams({
  state,
  redirect_uri: redirectUri,
  purpose: "marketplace",
  session_id: sessionId,
  email: "buyer@contoso.test",
  name: "Buyer",
  oid,
  tid,
  account: "work",
});
const complete = await fetch("http://localhost:4000/api/mock-entra/complete", {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: form,
});
const cb = complete.headers.get("location");
const afterMs = await fetch(cb, {
  redirect: "manual",
  headers: { cookie: cookieHeader() },
});
saveCookies(afterMs);
const lobby = afterMs.headers.get("location");
const sess = await api("/api/marketplace/session/" + sessionId);
const act = await api("/api/marketplace/activate", {
  method: "POST",
  body: JSON.stringify({
    session_id: sessionId,
    organization_name: "Contoso Analytics",
  }),
});
const me = await api("/api/auth/me");
const org = await api("/api/org");
await api("/api/simulator/webhook", {
  method: "POST",
  body: JSON.stringify({
    subscription_id: resolved.body.subscription_id,
    action: "Suspend",
  }),
});
const org2 = await api("/api/org");
const signup = await api("/api/auth/signup", {
  method: "POST",
  body: JSON.stringify({
    name: "Ada",
    email: "ada@example.test",
    password: "Demo12345",
    organization_name: "Ada Lab",
  }),
});
const signin = await api("/api/auth/signin", {
  method: "POST",
  body: JSON.stringify({ email: "ada@example.test", password: "Demo12345" }),
});

console.log(
  JSON.stringify(
    {
      health: health.body,
      mode: cfg.body.marketplaceMode,
      home: home.status,
      purchase: purchase.status,
      resolve: {
        status: resolved.status,
        plan: resolved.body.plan_id,
        purchaser: resolved.body.purchaser?.emailId,
      },
      startLoc: authorizeUrl,
      mockComplete: complete.status,
      afterMs: afterMs.status,
      lobby,
      ready: sess.body.ready_to_activate,
      activate: act.body,
      me: me.body.user?.email,
      org: {
        name: org.body.organization?.name,
        status: org.body.subscription?.status,
        open: org.body.product_open,
      },
      afterSuspend: {
        status: org2.body.subscription?.status,
        open: org2.body.product_open,
        lock: org2.body.lock_reason,
      },
      signup: signup.status,
      signin: signin.status,
    },
    null,
    2
  )
);
