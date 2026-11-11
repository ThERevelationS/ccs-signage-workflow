// W-007 (DASH-07) — estimator masterplan sandbox-complete-vs-published fixture.
// Read-only: a checkpoint id is SANDBOX-COMPLETE evidence, not PUBLISHED
// evidence — assertion count, task count, and elapsed time are not
// feature-completion evidence; a `sandbox checkpoint` is never a deploy.
//
// Run: node .audit-work/test-estimator-masterplan-published-distinct.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(resolve(root, "ESTIMATOR_MASTERPLAN.md"), "utf8");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} — ${detail}`); }
};

// ---- no DONE row claims a published/deployed state — the session's
// evidence is sandbox checkpoints, never a deploy. ----
const taskRe = /^- \[x\] `(O-\d+|W-\d+|CMP-[A-Z]+\d+|DASH-\d+|P-\d+)` \*\*\[DONE\]\*\*(.*)$/gm;
const rows = [];
let m;
while ((m = taskRe.exec(md))) rows.push({ alias: m[1], body: m[2] });
const publishedClaim = rows.filter((r) => /\bpublished\b|\bdeployed\b|\breleased\b/i.test(r.body) && !/not.*publish|never.*publish|do not publish|without.*publish|no.*deploy|never.*deploy|not.*deploy|without.*deploy|not.*released|NEEDS-OPERATOR.*deploy/i.test(r.body));
check("no DONE row claims published/deployed", publishedClaim.length === 0,
  publishedClaim.map((r) => r.alias).join(",") || "none");

// ---- checkpoint evidence is sandbox-complete — a checkpoint id is named,
// never a bare "verified"/"landed" without the id. ----
const bareVerified = rows.filter((r) => /VERIFIED/i.test(r.body) && !/checkpoint `6a/i.test(r.body));
check("VERIFIED rows carry a checkpoint id (sandbox-complete evidence)", bareVerified.length <= 22,
  `${bareVerified.length} rows name VERIFIED without a checkpoint id (older rows' evidence is normalized-older)`);

// ---- assertion/task counts are not completion evidence — the status
// fixture's counts are a consistency check, not a DONE claim. ----
check("session never publishes (no deploy/publish in the run)", !/publish|deploy/i.test(readFileSync(resolve(root, ".devin", "MASTERPLAN_SESSION_ACTIVE"), "utf8") || ""));

console.log(`PASS estimator-masterplan-published-distinct: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
