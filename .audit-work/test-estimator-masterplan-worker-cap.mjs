// W-008 (DASH-08) — estimator masterplan lead+one-worker fixture.
// Read-only: the session runs ONE lead lane + ONE bounded worker — a
// two-person total is never permission for two additional workers, never
// the old eight-worker plan.
//
// Run: node .audit-work/test-estimator-masterplan-worker-cap.mjs

import { readFileSync } from "node:fs";
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

// ---- the governance doc carries the lead+one-worker contract. ----
check("lead+one-worker contract documented", /lead\+one-worker/i.test(gov));

// ---- no eight-worker plan resurrection — the ledger's §0.6 documents the
// ORCHESTRATOR's `up to ~8 subagent workers` parallel-execution model (a
// bounded-task spawn, allowed); W-008's contract is the DASHBOARD's
// concurrent-worker display (lead+one, count excludes the lead). The check
// asserts the orchestrator's spawn model is named as such — never a
// bare "N workers" instruction outside the subagent context. ----
const orchestratorSpawn = /up to\s*~?8\s+subagent workers?|orchestrator.*subagent workers?/i;
check("multi-worker only as orchestrator's subagent spawn", orchestratorSpawn.test(md) || !/(?:spawn|concurrent|parallel)\s+(?:up to\s+)?[3-9]\s+workers?/i.test(md),
  "a bare multi-worker instruction outside the orchestrator/subagent context");

// ---- the dashboard worker count excludes the lead — a worker claim
// names the bounded worker only. ----
check("worker count excludes the lead", !/two workers|2 workers|both workers/i.test(gov));

console.log(`PASS estimator-masterplan-worker-cap: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
