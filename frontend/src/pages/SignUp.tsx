import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Brand, MsButton } from "../components/Shell";

export default function SignUp() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          organization_name: organization,
        }),
      });
      nav("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Brand />
        <h1>Create account</h1>
        <p>Direct signup without Marketplace. Billing source stays “direct”.</p>
        {error ? <div className="alert">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="org">Workspace name</label>
          <input
            id="org"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Acme Analytics"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn primary wide" style={{ marginTop: 18 }} disabled={busy}>
            {busy ? "Creating…" : "Sign up"}
          </button>
        </form>
        <div className="or">or</div>
        <MsButton href="/api/auth/microsoft/start" label="Sign up with Microsoft" />
        <p style={{ marginTop: 18 }}>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
