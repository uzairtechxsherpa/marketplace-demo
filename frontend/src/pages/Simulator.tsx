import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AppConfig } from "../api";
import { Footer, TopNav } from "../components/Shell";
import OfferUrls from "../components/OfferUrls";

type Sub = {
  id: string;
  planId: string;
  status: string;
  quantity: number;
  purchaser: { emailId: string };
  organizationId: string | null;
};

type SimList = {
  subscriptions: Sub[];
  webhook_events: { action: string; subscriptionId: string; createdAt: string }[];
};

export default function Simulator() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [list, setList] = useState<SimList | null>(null);
  const [planId, setPlanId] = useState("starter");
  const [email, setEmail] = useState("buyer@contoso.test");
  const [accountType, setAccountType] = useState<"work" | "msa">("work");
  const [landing, setLanding] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function refresh() {
    const [cfg, subs] = await Promise.all([
      api<AppConfig>("/config"),
      api<SimList>("/simulator/subscriptions"),
    ]);
    setConfig(cfg);
    setList(subs);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function purchase(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api<{ landing_url: string }>("/simulator/purchase", {
        method: "POST",
        body: JSON.stringify({ planId, purchaserEmail: email, accountType, quantity: 1 }),
      });
      setLanding(data.landing_url);
      setNote("Purchase created in PendingFulfillmentStart. Open the landing lobby.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
    }
  }

  async function reconfigure(id: string) {
    const data = await api<{ landing_url: string }>("/simulator/reconfigure", {
      method: "POST",
      body: JSON.stringify({ subscription_id: id }),
    });
    setLanding(data.landing_url);
    setNote("New Configure account token issued (24h).");
  }

  async function fire(id: string, action: string, extra: Record<string, unknown> = {}) {
    await api("/simulator/webhook", {
      method: "POST",
      body: JSON.stringify({ subscription_id: id, action, ...extra }),
    });
    setNote(`Webhook ${action} accepted.`);
    await refresh();
  }

  const live = config?.liveMicrosoft;

  return (
    <>
      <TopNav />
      <section className="section">
        <div className="kicker">Local testing</div>
        <h2>Marketplace simulator</h2>
        <p className="sub">
          Pretends to be Microsoft Marketplace so you can exercise Resolve, landing SSO,
          Activate, and webhooks without Partner Center. Mode:{" "}
          <strong>{config?.marketplaceMode}</strong>
        </p>
        {config ? <OfferUrls config={config} /> : null}
        {live ? (
          <div className="alert">
            Live mode is on. Simulator purchases are disabled. Point Partner Center at this
            app’s landing and webhook URLs instead.
          </div>
        ) : null}
        {error ? <div className="alert">{error}</div> : null}
        {note ? <div className="alert ok">{note}</div> : null}

        <div className="grid-2">
          <form className="panel" onSubmit={purchase}>
            <h3>Create a test purchase</h3>
            <label>Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {(config?.plans || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <label>Purchaser email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label>Account type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as "work" | "msa")}
            >
              <option value="work">Work account</option>
              <option value="msa">Personal Microsoft account</option>
            </select>
            <button className="btn teal" style={{ marginTop: 16 }} disabled={live}>
              Issue landing token
            </button>
            {landing ? (
              <p className="meta" style={{ marginTop: 14 }}>
                <Link to={new URL(landing).pathname + new URL(landing).search}>
                  Open landing lobby
                </Link>
              </p>
            ) : null}
          </form>
          <div className="panel">
            <h3>What this proves</h3>
            <p className="meta">
              1. Token lands on <code>/marketplace/landing</code>
              <br />
              2. Resolve stores a marketplace_subscriptions row
              <br />
              3. Continue with Microsoft matches oid + tid
              <br />
              4. Activate creates a new org (never silently attaches)
              <br />
              5. Webhooks change entitlements without a second Activate
            </p>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Subscriptions</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Status</th>
                <th>Purchaser</th>
                <th>Org</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(list?.subscriptions || []).map((s) => (
                <tr key={s.id}>
                  <td>{s.planId}</td>
                  <td>{s.status}</td>
                  <td>{s.purchaser.emailId}</td>
                  <td>{s.organizationId ? "linked" : "pending"}</td>
                  <td>
                    <button className="btn ghost" onClick={() => reconfigure(s.id)}>
                      Configure account
                    </button>{" "}
                    <button className="btn ghost" onClick={() => fire(s.id, "ChangePlan", { planId: "pro" })}>
                      Change to Pro
                    </button>{" "}
                    <button className="btn ghost" onClick={() => fire(s.id, "Suspend")}>
                      Suspend
                    </button>{" "}
                    <button className="btn ghost" onClick={() => fire(s.id, "Reinstate")}>
                      Reinstate
                    </button>{" "}
                    <button className="btn ghost" onClick={() => fire(s.id, "Unsubscribe")}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Footer />
    </>
  );
}
