import { TopNav, Footer } from "../components/Shell";

export function LegalPage({
  title,
  lead,
  body,
}: {
  title: string;
  lead: string;
  body: string[];
}) {
  return (
    <>
      <TopNav />
      <section className="lobby">
        <div className="panel">
          <div className="kicker">Public HTTPS page</div>
          <h1>{title}</h1>
          <p className="meta">{lead}</p>
          {body.map((p) => (
            <p key={p} className="meta">
              {p}
            </p>
          ))}
        </div>
      </section>
      <Footer />
    </>
  );
}
