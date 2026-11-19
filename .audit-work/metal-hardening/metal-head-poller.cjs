// Metal transport quiet-window poller — READ-ONLY remote git ops.
// Polls HEAD every ~75s; logs every observation. Flags sibling-transport
// commits (signMaintenance/, estimator/cnc/, MaintenanceEstimator.jsx,
// CNCEstimator.jsx) and any HEAD drift that would force baseline recapture.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const APP = "68dfcc5e57bbbc35387da97c";
const LOG = ".audit-work/metal-hardening/metal-head-poller.log";
const SIBLING = /src\/components\/signMaintenance\/|src\/components\/estimator\/cnc\/|src\/pages\/MaintenanceEstimator\.jsx|src\/pages\/CNCEstimator\.jsx/;
const MY_TARGETS = /src\/pages\/MetalEstimator\.jsx|src\/components\/estimator\/metal\//;
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
const snap = () => {
  const res = run(["sandbox", "run", "git rev-parse HEAD && git log -1 --name-only --format= && git status --porcelain | head -3", "--timeout-ms", "60000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) return { err: (res.stderr || res.stdout || "").slice(0, 200) };
  try {
    const out = JSON.parse(res.stdout);
    const lines = String(out.stdout || "").split("\n");
    const head = (lines[0] || "").trim();
    const files = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    return { head, files, exitCode: out.exitCode };
  } catch (e) { return { err: "parse:" + String(e).slice(0, 120), raw: (res.stdout || "").slice(0, 200) }; }
};
const log = (s) => { const line = new Date().toISOString().replace("T", " ").slice(0, 19) + " " + s; console.log(line); fs.appendFileSync(LOG, line + "\n"); };
let lastHead = null, lastChange = Date.now();
log("poller start — baseline head 5f25691b");
const tick = async () => {
  const s = snap();
  if (s.err) { log("POLL-ERR " + s.err); return; }
  if (s.head !== lastHead) {
    const sib = s.files.filter((f) => SIBLING.test(f));
    const mine = s.files.filter((f) => MY_TARGETS.test(f));
    log("HEAD " + (lastHead ? lastHead.slice(0, 9) : "(init)") + " -> " + s.head.slice(0, 9) + " files=[" + s.files.join(", ") + "]" + (sib.length ? " SIBLING-COMMIT" : "") + (mine.length ? " **MY-TARGET-TOUCHED**" : ""));
    lastHead = s.head; lastChange = Date.now();
  } else {
    const quietMin = ((Date.now() - lastChange) / 60000).toFixed(1);
    log("head=" + s.head.slice(0, 9) + " quiet=" + quietMin + "min" + (s.files.length ? " dirty-ish:" + s.files.join(",") : ""));
  }
};
(async () => { await tick(); setInterval(tick, 75000); })();
