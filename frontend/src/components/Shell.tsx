import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="mark" aria-hidden />
      Aether
    </Link>
  );
}

export function TopNav({ right }: { right?: ReactNode }) {
  return (
    <header className="nav">
      <Brand />
      <nav className="nav-links">
        <Link to="/#plans">Plans</Link>
        <Link to="/simulator">Simulator</Link>
        <Link to="/support">Support</Link>
        {right}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>Aether demo · Microsoft Marketplace SaaS fulfillment</span>
      <span>
        <Link to="/privacy">Privacy</Link>
        {" · "}
        <Link to="/terms">Terms</Link>
        {" · "}
        <Link to="/support">Support</Link>
      </span>
    </footer>
  );
}

export function MsButton({ href, label }: { href: string; label: string }) {
  return (
    <a className="ms-btn" href={href}>
      <svg width="21" height="21" viewBox="0 0 21 21" aria-hidden>
        <rect fill="#f25022" x="1" y="1" width="9" height="9" />
        <rect fill="#00a4ef" x="11" y="1" width="9" height="9" />
        <rect fill="#7fba00" x="1" y="11" width="9" height="9" />
        <rect fill="#ffb900" x="11" y="11" width="9" height="9" />
      </svg>
      {label}
    </a>
  );
}
