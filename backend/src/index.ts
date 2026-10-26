import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { buyerConfigured, config, liveMicrosoftEnabled, publisherConfigured } from "./config.js";
import { pruneExpired } from "./db.js";
import { PLANS } from "./plans.js";
import { marketplaceUrls } from "./origin.js";
import { authRouter } from "./routes/auth.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { simulatorRouter } from "./routes/simulator.js";
import { orgRouter } from "./routes/org.js";
import { mockEntraRouter } from "./mockEntra.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "../../frontend/dist");

const app = express();
app.set("trust proxy", true);

app.use(
  cors({
    origin(origin, callback) {
      callback(null, origin || true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, product: config.productName, mode: config.mode });
});

app.get("/api/config", (req, res) => {
  const urls = marketplaceUrls(req);
  res.json({
    productName: config.productName,
    offerId: config.offerId,
    marketplaceMode: config.mode,
    liveMicrosoft: liveMicrosoftEnabled(),
    publisherConfigured: publisherConfigured(),
    buyerConfigured: buyerConfigured(),
    plans: Object.values(PLANS),
    ...urls,
  });
});

app.get("/api/plans", (_req, res) => {
  res.json({ plans: Object.values(PLANS) });
});

app.use("/api/auth", authRouter);
app.use("/api/marketplace", marketplaceRouter);
app.use("/api/simulator", simulatorRouter);
app.use("/api/org", orgRouter);
app.use("/api/mock-entra", mockEntraRouter());

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Unknown API route." });
});

const hasFrontend = fs.existsSync(path.join(distDir, "index.html"));

if (hasFrontend) {
  app.use(express.static(distDir));
}

function proxyToVite(req: express.Request, res: express.Response) {
  const p = http.request(
    {
      hostname: "127.0.0.1",
      port: 5173,
      path: req.originalUrl,
      method: req.method,
      headers: { ...req.headers, host: "localhost:5173" },
    },
    (pres) => {
      res.writeHead(pres.statusCode ?? 502, pres.headers);
      pres.pipe(res);
    }
  );
  p.on("error", () => {
    const index = path.join(distDir, "index.html");
    if (fs.existsSync(index) && req.method === "GET") {
      res.sendFile(index);
      return;
    }
    res
      .status(502)
      .type("html")
      .send(
        "<p>Frontend is not running. Start the app with <code>npm run dev</code>.</p>"
      );
  });
  req.pipe(p);
}

app.use((req, res) => {
  if (hasFrontend && req.method === "GET") {
    res.sendFile(path.join(distDir, "index.html"));
    return;
  }
  proxyToVite(req, res);
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Unexpected error." });
});

pruneExpired();
setInterval(pruneExpired, 15 * 60 * 1000).unref();

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(
    `${config.productName} API on http://0.0.0.0:${config.port} (${config.mode} mode)`
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Stop the other Aether process and run npm run dev again.`
    );
    process.exit(1);
  }
  throw err;
});
