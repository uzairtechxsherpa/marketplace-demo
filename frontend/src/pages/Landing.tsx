import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Plan } from "../api";
import { Brand, MsButton } from "../components/Shell";

type Session = {
  session_id: string;
  subscription_id: string;
  offer_id: string;
  plan_id: string;
  plan: Plan | null;
  quantity: number;
  status: string;
  purchaser: { emailId: string; objectId: string; tenantId: string };
  term: { termUnit: string };
  already_activated: boolean;
  is_return_visit: boolean;
  matched_email: string | null;
  mismatch: boolean;
  mismatch_signed_in_as: string | null;
  ready_to_activate: boolean;
};

export default function Landing() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const tokenFromUrl = params.get("token");
  const sessionFromUrl = params.get("session_id");
  const [error, setError] = useState(params.get("error") || "");
  const [guidance, setGuidance] = useState("");
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  const token = useMemo(() => {
    if (tokenFromUrl) {
      const decoded = decodeURIComponent(tokenFromUrl);
      sessionStorage.setItem("mp_token", decoded);
      return decoded;
    }
    return sessionStorage.getItem("mp_token");
  }, [tokenFromUrl]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (sessionFromUrl) {
          const data = await api<Session>(`/marketplace/session/${sessionFromUrl}`);
          if (!cancelled) {
            setSession(data);
            setOrgName(data.plan ? `${data.plan.label} workspace` : "Marketplace workspace");
          }
          return;
        }
        if (!token) {
          if (!cancelled) {
            setError("No purchase token was found on this page.");
            setGuidance(
              "Open this lobby from Microsoft Marketplace, or create a test purchase in the simulator."
            );
          }
          return;
        }
        const data = await api<Session>("/marketplace/resolve", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!cancelled) {
          setSession(data);
          setOrgName(data.plan ? `${data.plan.label} workspace` : "Marketplace workspace");
          sessionStorage.setItem("mp_session", data.session_id);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
          setGuidance(String(err.data.guidance || ""));
        } else {
          setError(err instanceof Error ? err.message : "Resolve failed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sessionFromUrl, token]);

  async function activate(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api("/marketplace/activate", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.session_id,
          organization_name: orgName,
        }),
      });
      sessionStorage.removeItem("mp_token");
      nav("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activate failed.");
    } finally {
      setBusy(false);
    }
  }

  const showActivate = Boolean(session?.ready_to_activate);

  return (
    <div className="lobby">
      <Brand />
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="kicker">Marketplace landing lobby</div>
        {loading ? (
          <>
            <div className="spinner" style={{ margin: "18px 0" }} />
            <h1>We’re confirming your Marketplace purchase…</h1>
            <p className="meta">Resolving the purchase token with the publisher app.</p>
          </>
        ) : null}

        {!loading && !session ? (
          <>
            <h1>We could not open this purchase</h1>
            {error ? <div className="alert">{error}</div> : null}
            {guidance ? <p className="meta">{guidance}</p> : null}
            <div className="cta-row">
              <Link to="/simulator" className="btn teal">
                Open simulator
              </Link>
              <Link to="/" className="btn ghost">
                Home
              </Link>
            </div>
          </>
        ) : null}

        {!loading && session ? (
          <>
            <h1>
              You purchased {session.plan?.label || session.plan_id} ({session.term.termUnit}).
            </h1>
            <p className="meta">
              Purchaser on the Microsoft order: <strong>{session.purchaser.emailId}</strong>
              <br />
              Offer {session.offer_id} · quantity {session.quantity} · status {session.status}
            </p>

            {error || session.mismatch ? (
              <div className="alert">
                {error ||
                  `You signed in as ${session.mismatch_signed_in_as}; this purchase belongs to ${session.purchaser.emailId}.`}
              </div>
            ) : null}

            {session.already_activated && !showActivate ? (
              <div className="alert ok">
                This subscription is already activated. Sign in with the purchaser Microsoft
                account to enter the workspace.
              </div>
            ) : null}

            {!showActivate ? (
              <>
                <p className="meta">
                  To activate, sign in with the same Microsoft account you used in Marketplace.
                  Work accounts from any company and personal Microsoft accounts are accepted.
                </p>
                <MsButton
                  href={`/api/marketplace/auth/start?session_id=${session.session_id}`}
                  label="Continue with Microsoft"
                />
              </>
            ) : (
              <form onSubmit={activate} style={{ marginTop: 18 }}>
                <div className="alert ok">
                  Microsoft account matched{session.matched_email ? `: ${session.matched_email}` : "."}{" "}
                  Billing does not start until you activate.
                </div>
                <label htmlFor="org">Workspace name</label>
                <input
                  id="org"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
                <button className="btn teal wide" style={{ marginTop: 16 }} disabled={busy}>
                  {busy ? "Activating…" : "Activate subscription"}
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
