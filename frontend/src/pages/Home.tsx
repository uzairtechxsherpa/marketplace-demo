import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AppConfig } from "../api";
import { Footer, TopNav } from "../components/Shell";
import OfferUrls from "../components/OfferUrls";

export default function Home() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    api<AppConfig>("/config").then(setConfig).catch(() => undefined);
  }, []);

  const plans = config?.plans ?? [];

  return (
    <>
      <TopNav
        right={
          <>
            <Link to="/signin">Sign in</Link>
            <Link to="/signup" className="btn primary">
              Create account
            </Link>
          </>
        }
      />
      <section className="hero">
        <div>
          <div className="kicker">Transactable SaaS · Sell through Microsoft</div>
          <h1>Hosted product. Marketplace purchase. Same workspace.</h1>
          <p className="lede">
            Aether is a standalone demo used to prove Microsoft Marketplace
            integration: landing lobby, Resolve, buyer Microsoft sign-in,
            Activate, and subscription webhooks. It is not the Fydelitics app.
          </p>
          <div className="cta-row">
            <Link to="/simulator" className="btn teal">
              Run a test purchase
            </Link>
            <Link to="/signup" className="btn ghost">
              Sign up with email
            </Link>
          </div>
        </div>
        <aside className="panel">
          <div className="kicker">Purchase path</div>
          <div className="flow">
            {[
              ["Marketplace", "Buyer picks a plan. Subscription is PendingFulfillmentStart."],
              ["Landing lobby", "Microsoft opens /marketplace/landing?token=…"],
              ["Resolve", "API exchanges the purchase token for plan and purchaser."],
              ["Microsoft sign-in", "Same work or personal account that bought the offer."],
              ["Activate", "Org is created, billing starts, session cookie is set."],
            ].map(([title, body], i) => (
              <div className="flow-step" key={title}>
                <div className="num">{i + 1}</div>
                <div>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
      {config ? (
        <section className="section">
          <OfferUrls config={config} />
        </section>
      ) : null}
      <section className="section" id="plans">
        <h2>Plans mapped from Marketplace planId</h2>
        <p className="sub">
          Unknown planIds are refused at Activate. Auto-activation stays off.
        </p>
        <div className="plans">
          {plans.map((plan) => (
            <article
              className={`plan ${plan.id === "pro" ? "featured" : ""}`}
              key={plan.id}
            >
              <div className="kicker">{plan.id}</div>
              <h3>{plan.label}</h3>
              <div className="price">{plan.price}</div>
              <div className="sub" style={{ marginBottom: 8 }}>
                {plan.term}
              </div>
              <p>{plan.summary}</p>
              <ul>
                <li>{plan.seats === 9999 ? "Unlimited" : plan.seats} seats</li>
                <li>
                  {plan.dashboards === 9999 ? "Unlimited" : plan.dashboards} dashboards
                </li>
                <li>{plan.exports ? "Exports on" : "Exports off"}</li>
                <li>{plan.sso ? "Org SSO" : "No extra SSO"}</li>
              </ul>
            </article>
          ))}
        </div>
      </section>
      <Footer />
    </>
  );
}
