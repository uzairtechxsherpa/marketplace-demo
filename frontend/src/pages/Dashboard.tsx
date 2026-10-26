import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Plan, type User } from "../api";
import { Brand } from "../components/Shell";

type OrgPayload = {
  organization: {
    id: string;
    name: string;
    billingSource: "marketplace" | "direct";
  } | null;
  members: { email?: string; name?: string; role: string }[];
  subscription: {
    id: string;
    planId: string;
    status: string;
    quantity: number;
    purchaser: { emailId: string };
    termStart: string;
    termEnd: string;
  } | null;
  entitlements: {
    known: boolean;
    seats: number;
    dashboards: number;
    exports: boolean;
    sso: boolean;
    label: string;
  };
  product_open: boolean;
  lock_reason: string | null;
  catalog: Plan[];
  webhook_events: { action: string; createdAt: string; applied: boolean }[];
};

export default function Dashboard() {
  const nav = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<OrgPayload | null>(null);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((d) => {
        setUser(d.user);
        return api<OrgPayload>("/org");
      })
      .then(setOrg)
      .catch(() => nav("/signin"));
  }, [nav]);

  async function signOut() {
    await api("/auth/signout", { method: "POST" });
    nav("/");
  }

  if (!user || !org) {
    return (
      <div className="app-shell">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Brand />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="meta">{user.email}</span>
          <Link to="/simulator" className="btn ghost">
            Simulator
          </Link>
          <button className="btn ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      {!org.product_open ? (
        <div className="lock">
          <div className="badge sus">{org.subscription?.status}</div>
          <h1>Product closed</h1>
          <p className="meta">{org.lock_reason}</p>
          <p className="meta">You are still signed in. Reinstate or resubscribe on Marketplace.</p>
        </div>
      ) : (
        <>
          <div className="kicker">Workspace</div>
          <h1>{org.organization?.name || "No workspace"}</h1>
          <p className="meta">
            Billing source: {org.organization?.billingSource || "none"}
            {org.subscription ? (
              <>
                {" · "}
                <span
                  className={`badge ${
                    org.subscription.status === "Subscribed" ? "sub" : "sus"
                  }`}
                >
                  {org.subscription.status}
                </span>
              </>
            ) : (
              " · no Marketplace subscription on this org"
            )}
          </p>

          <div className="tiles">
            <div className="tile">
              <div className="kicker">Plan</div>
              <h3>{org.entitlements.label}</h3>
              <p className="meta">
                {org.entitlements.seats === 9999 ? "Unlimited" : org.entitlements.seats} seats
              </p>
            </div>
            <div className={`tile ${org.entitlements.dashboards ? "" : "locked"}`}>
              <div className="kicker">Dashboards</div>
              <h3>
                {org.entitlements.dashboards === 9999
                  ? "Unlimited"
                  : org.entitlements.dashboards}
              </h3>
              <p className="meta">Gated by Marketplace planId</p>
            </div>
            <div className={`tile ${org.entitlements.exports ? "" : "locked"}`}>
              <div className="kicker">Exports</div>
              <h3>{org.entitlements.exports ? "On" : "Locked"}</h3>
              <p className="meta">{org.entitlements.sso ? "SSO included" : "SSO off"}</p>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 18 }}>
            <div className="panel">
              <h3>People</h3>
              {org.members.map((m) => (
                <p key={m.email} className="meta">
                  {m.name} · {m.email} · {m.role}
                </p>
              ))}
              {org.subscription ? (
                <p className="meta">
                  Purchaser {org.subscription.purchaser.emailId}
                  <br />
                  Term {org.subscription.termStart.slice(0, 10)} →{" "}
                  {org.subscription.termEnd.slice(0, 10)} · qty {org.subscription.quantity}
                </p>
              ) : (
                <p className="meta">
                  Direct signup. Use the simulator to run a Marketplace purchase into a new org.
                </p>
              )}
            </div>
            <div className="panel">
              <h3>Webhook events</h3>
              {org.webhook_events.length === 0 ? (
                <p className="meta">None yet. Fire Suspend / ChangePlan from the simulator.</p>
              ) : (
                org.webhook_events.map((e) => (
                  <p key={e.createdAt + e.action} className="meta">
                    {e.action} · {new Date(e.createdAt).toLocaleString()}{" "}
                    {e.applied ? "applied" : "recorded"}
                  </p>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
