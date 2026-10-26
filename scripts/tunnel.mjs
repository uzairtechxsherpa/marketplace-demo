import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asOrigin, hostOnly, loadEnv } from "./load-env.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv(root);

const originFile = path.join(root, "backend/data/public-origin.txt");
const stableFile = path.join(root, "backend/data/tunnel-domain.txt");
const binDir = path.join(root, "scripts/bin");
const cloudflaredBin = path.join(binDir, "cloudflared.exe");
const env = {
  ...process.env,
  PATH: `C:\\Windows\\System32;C:\\Windows;${process.env.PATH || ""}`,
};

let announced = "";

function readStableOrigin() {
  const fromEnv = asOrigin(process.env.PUBLIC_BASE_URL || process.env.TUNNEL_DOMAIN);
  if (fromEnv) return fromEnv;
  try {
    return asOrigin(fs.readFileSync(stableFile, "utf8"));
  } catch {
    return "";
  }
}

function writeOrigin(url, { stable = false } = {}) {
  const origin = asOrigin(url);
  if (!origin) return;
  if (announced === origin) return;
  announced = origin;
  fs.mkdirSync(path.dirname(originFile), { recursive: true });
  fs.writeFileSync(originFile, origin);
  if (stable) {
    fs.writeFileSync(stableFile, origin);
  }
  console.log("");
  if (stable) {
    console.log("Stable HTTPS hostname (same URL every time you run npm run tunnel):");
  } else {
    console.log("TEMPORARY hostname — it will change on the next restart.");
    console.log("Do not paste this into Partner Center. Set TUNNEL_DOMAIN in .env first.");
  }
  console.log(`  Landing page:  ${origin}/marketplace/landing`);
  console.log(`  Webhook:       ${origin}/api/marketplace/webhook`);
  console.log("");
  console.log("Buyer Entra redirect URIs:");
  console.log(`  ${origin}/api/marketplace/auth/callback`);
  console.log(`  ${origin}/api/auth/microsoft/callback`);
  console.log("");
  console.log("Local UI still works at http://localhost:5173");
  console.log("");
}

async function waitForApi() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4000/api/health");
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("API is not running on port 4000. Start it with npm run dev first.");
}

function startProcess(command, args) {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], shell: false });
  child.stdout.on("data", (buf) => process.stderr.write(buf.toString()));
  child.stderr.on("data", (buf) => process.stderr.write(buf.toString()));
  child.on("exit", (code) => {
    console.log(`Tunnel process exited (${code ?? "no code"}).`);
    process.exit(code ?? 1);
  });
  return child;
}

async function waitForNgrokUrl(expectedHost) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      const data = await res.json();
      const httpsTunnel = (data.tunnels || []).find((t) =>
        String(t.public_url || "").startsWith("https://")
      );
      if (!httpsTunnel) continue;
      const origin = asOrigin(httpsTunnel.public_url);
      if (expectedHost && hostOnly(origin) !== expectedHost) continue;
      return origin;
    } catch {
      /* ngrok API not ready */
    }
  }
  return "";
}

async function startNgrok(origin) {
  const host = hostOnly(origin);
  const args = ["http", "4000", "--log=stdout"];
  if (host) args.splice(2, 0, `--url=https://${host}`);
  startProcess("ngrok", args);
  const live = await waitForNgrokUrl(host);
  if (!live) {
    throw new Error(
      host
        ? `ngrok did not bring up https://${host}. Reserve that domain in the ngrok dashboard and put TUNNEL_DOMAIN=${host} in .env.`
        : "ngrok did not publish an HTTPS URL."
    );
  }
  writeOrigin(live, { stable: Boolean(host) });
}

async function downloadCloudflared() {
  if (fs.existsSync(cloudflaredBin)) return cloudflaredBin;
  fs.mkdirSync(binDir, { recursive: true });
  console.log("Downloading cloudflared...");
  const url =
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0x4d || buf[1] !== 0x5a) {
    throw new Error("Downloaded file was not a Windows executable.");
  }
  fs.writeFileSync(cloudflaredBin, buf);
  return cloudflaredBin;
}

async function startEphemeralCloudflare() {
  const bin = await downloadCloudflared();
  const child = startProcess(bin, [
    "tunnel",
    "--no-autoupdate",
    "--url",
    "http://127.0.0.1:4000",
  ]);
  child.stderr.on("data", (buf) => {
    const match = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) writeOrigin(match[0], { stable: false });
  });
}

function printLockHelp() {
  console.log("");
  console.log("To keep the same Partner Center URLs after every restart:");
  console.log("  1. Create one free static domain at https://dashboard.ngrok.com/domains");
  console.log("  2. Put it in .env once:");
  console.log("       TUNNEL_DOMAIN=your-name.ngrok-free.app");
  console.log("       PUBLIC_BASE_URL=https://your-name.ngrok-free.app");
  console.log("  3. Run npm run tunnel again. Landing + webhook never change after that.");
  console.log("");
}

await waitForApi();
const stable = readStableOrigin();
if (stable) {
  console.log(`Reusing locked hostname ${hostOnly(stable)}`);
  try {
    await startNgrok(stable);
  } catch (err) {
    console.error(err.message);
    printLockHelp();
    process.exit(1);
  }
} else {
  printLockHelp();
  console.log("Starting a temporary Cloudflare URL for this session only...");
  await startEphemeralCloudflare();
}
