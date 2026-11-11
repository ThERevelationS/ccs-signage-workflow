// W-011 (DASH-11) — estimator hooks/claims/task-states preservation fixture.
// Read-only: the session preserves the current hooks/claims and old task
// states — no always-running loops, no global-worker-policy changes merely
// to add module plans.
//
// Run: node .audit-work/test-estimator-hooks-preserved.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gov = readFileSync(resolve(root, ".devin", "estimator-governance.md"), "utf8");
const md = readFileSync(resolve(root, "ESTIMATOR_MASTERPLAN.md"), "utf8");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} — ${detail}`); }
};

// ---- the governance doc carries the preserve-hooks contract. ----
check("preserve-hooks contract documented", /preserve-hooks/i.test(gov));

// ---- the session-active gate file exists (the stop-hook's session gate —
// never an always-running loop). ----
check("session-active gate preserved", existsSync(resolve(root, ".devin", "MASTERPLAN_SESSION_ACTIVE")));

// ---- no always-running loop — the ledger/governance never instructs a
// perpetual poller (a loop that outlives the session). ----
const alwaysLoop = /while\s*\(\s*true\s*\)|setInterval|always[- ]running|perpetual|infinite\s+loop/i;
check("no always-running loop instructed", !alwaysLoop.test(gov),
  "an always-running/perpetual loop is instructed in the governance doc");

// ---- old task states preserved — the ledger's DONE/HELD/BLOCKED rows are
// never rewritten by a session edit (the status fixture's consistency check
// already guards the [x]/DONE pairing; the count stays nonzero). ----
const doneCount = (md.match(/\*\*\[DONE\]\*\*/g) || []).length;
check("old task states preserved (DONE rows nonzero)", doneCount > 0, `found ${doneCount}`);

console.log(`PASS estimator-hooks-preserved: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
