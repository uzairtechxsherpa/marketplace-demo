import { useState } from "react";
import type { AppConfig } from "../api";

export default function OfferUrls({ config }: { config: AppConfig }) {
  const [copied, setCopied] = useState("");

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  const rows = [
    ["Landing page", config.landingUrl],
    ["Webhook", config.webhookUrl],
    ["Landing redirect", config.landingRedirectUri],
    ["Sign-in redirect", config.signinRedirectUri],
  ];

  return (
    <div className="panel url-card">
      <div className="kicker">Partner Center · Technical configuration</div>
      <h3 style={{ margin: "8px 0 6px" }}>
        {config.httpsReady ? "Public HTTPS URLs" : "Local URLs (start the tunnel for Microsoft)"}
      </h3>
      <p className="meta">
        {config.httpsReady
          ? config.publicOrigin?.includes("onrender.com")
            ? "These Render URLs stay the same. Paste them into Partner Center once."
            : config.publicOrigin?.includes("trycloudflare.com")
              ? "This tunnel URL is temporary. For Partner Center, deploy to Render so the hostname does not change."
              : "These public HTTPS URLs can go in Partner Center."
          : "Local still works at localhost:5173. Deploy to Render for a stable Partner Center hostname."}
      </p>
      {rows.map(([label, value]) => (
        <div className="url-row" key={label}>
          <span>{label}</span>
          <code>{value}</code>
          <button className="btn ghost" type="button" onClick={() => copy(label, value)}>
            {copied === label ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
    </div>
  );
}
