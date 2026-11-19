// Poll remote HEAD every POLL_MS until the same HEAD holds for >= QUIET_MS.
// Prints one line per poll; exits 0 with "QUIET <head>" when stable.
import { spawnSync } from "node:child_process";
import path from "node:path";

const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const APP = "68dfcc5e57bbbc35387da97c";
const POLL_MS = 4 * 60 * 1000;
const QUIET_MS = 8 * 60 * 1000;
const MAX_MS = 45 * 60 * 1000;
const start = Date.now();

function head() {
  const r = spawnSync(process.execPath, [cli, "base44@latest", "sandbox", "run",
    "git rev-parse HEAD && git status --porcelain | head -5",
    "--app-id", APP, "--branch", "main", "--timeout-ms", "60000", "--json"],
    { encoding: "utf8", timeout: 120000 });
  try {
    const j = JSON.parse(r.stdout);
    const lines = (j.stdout || "").split("\n");
    return { head: lines[0].trim(), dirty: lines.slice(1).join("\n").trim(), ok: r.status === 0 && j.exitCode === 0 };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 120), raw: (r.stdout || "").slice(0, 200) };
  }
}

let lastHead = null, lastChange = Date.now();
for (;;) {
  const h = head();
  const now = Date.now();
  const t = new Date(now).toISOString();
  if (!h.ok) {
    console.log(`${t} POLL-ERROR ${h.err || ""} ${h.raw || ""}`);
  } else {
    if (h.head !== lastHead) { lastHead = h.head; lastChange = now; }
    const quietFor = Math.round((now - lastChange) / 1000);
    console.log(`${t} HEAD=${h.head.slice(0, 12)} quietFor=${quietFor}s dirty=${h.dirty ? JSON.stringify(h.dirty.slice(0, 120)) : "clean"}`);
    if (quietFor * 1000 >= QUIET_MS && !h.dirty) { console.log(`QUIET ${h.head}`); process.exit(0); }
  }
  if (now - start > MAX_MS) { console.log("TIMEOUT no quiet window"); process.exit(3); }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
