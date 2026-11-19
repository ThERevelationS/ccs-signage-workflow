// Quiet-window watcher for Base44 remote sandbox strikes.
// Polls `git rev-parse HEAD` + `git status --porcelain` every POLL_MS.
// Exit 0 once the same HEAD has been observed continuously for STABLE_MS
// with a clean worktree on every poll. Exit 2 on timeout / CLI failure.
// Usage: node .audit-work/quiet-window.mjs [stableMinutes] [timeoutMinutes]
import { spawnSync } from "node:child_process";
import path from "node:path";
const APP = "68dfcc5e57bbbc35387da97c";
const STABLE_MS = (Number(process.argv[2]) || 8) * 60 * 1000;
const TIMEOUT_MS = (Number(process.argv[3]) || 45) * 60 * 1000;
const POLL_MS = 90 * 1000;
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const started = Date.now();
let firstSeenHead = null, firstSeenAt = 0, polls = 0;
while (Date.now() - started < TIMEOUT_MS) {
  polls += 1;
  const res = spawnSync(process.execPath, [cli, "base44@latest", "sandbox", "run",
    "git rev-parse HEAD && git status --porcelain | wc -l",
    "--app-id", APP, "--branch", "main", "--json", "--timeout-ms", "30000"],
    { encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  let head = null, dirtyLines = null, note = "";
  try {
    const out = JSON.parse(res.stdout);
    if (res.status === 0 && out.exitCode === 0) {
      const lines = String(out.stdout).trim().split("\n");
      head = lines[0].trim(); dirtyLines = Number(lines[1]);
    } else note = "remote exit " + (out.exitCode ?? "?") + " " + String(out.stderr || "").slice(0, 120);
  } catch (e) { note = "cli parse/status " + res.status + " " + String(e.message).slice(0, 100); }
  const t = new Date().toISOString().slice(11, 19);
  if (head && dirtyLines === 0) {
    if (head !== firstSeenHead) { firstSeenHead = head; firstSeenAt = Date.now(); }
    const stableFor = Math.round((Date.now() - firstSeenAt) / 1000);
    console.log(`${t} poll#${polls} HEAD ${head.slice(0, 10)} clean stable=${stableFor}s need>=${STABLE_MS / 1000}s`);
    if (Date.now() - firstSeenAt >= STABLE_MS) {
      console.log(`QUIET-WINDOW head=${firstSeenHead} stableFor=${stableFor}s`);
      process.exit(0);
    }
  } else {
    if (head && dirtyLines !== 0) { note = `dirty tree (${dirtyLines} entries)`; }
    console.log(`${t} poll#${polls} HEAD ${head ? head.slice(0, 10) : "???"} ${note} — stability clock reset`);
    firstSeenHead = null; firstSeenAt = 0;
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log("TIMEOUT waiting for quiet window");
process.exit(2);
