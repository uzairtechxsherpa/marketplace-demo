import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = {
  ...process.env,
  PATH: `C:\\Windows\\System32;C:\\Windows;${process.env.PATH || ""}`,
};

function freePort(port) {
  try {
    const out = execSync(`netstat -ano`, { env, encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      if (!line.includes(`:${port} `) && !line.endsWith(`:${port}`)) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { env, stdio: "ignore" });
        console.log(`Freed port ${port} (PID ${pid})`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* netstat unavailable */
  }
}

freePort(4000);
freePort(5173);

function run(name, args, cwd) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const paint = (buf, stream) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line) stream.write(`[${name}] ${line}\n`);
    }
  };
  child.stdout.on("data", (buf) => paint(buf, process.stdout));
  child.stderr.on("data", (buf) => paint(buf, process.stderr));
  child.on("exit", (code) => {
    console.log(`[${name}] exited with ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

const api = run(
  "api",
  [path.join(root, "node_modules/tsx/dist/cli.mjs"), "watch", "src/index.ts"],
  path.join(root, "backend")
);
const web = run(
  "web",
  [path.join(root, "node_modules/vite/bin/vite.js")],
  path.join(root, "frontend")
);
const kids = [api, web];

if (process.argv.includes("--tunnel") || process.env.TUNNEL === "1") {
  kids.push(run("tunnel", [path.join(root, "scripts/tunnel.mjs")], root));
}

function stop() {
  for (const child of kids) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
