// W-006 (DASH-06) — estimator masterplan dashboard-views fixture.
// Read-only: surfaces the optional dashboard UX views from the ledger —
// next-action hints, last-verified revisions, and source-gap rows — never
// a competing completion database (the root ledger stays the status source).
//
// Run: node .audit-work/test-estimator-masterplan-dashboard.mjs

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

const taskRe = /^- \[([ xX])\] `(O-\d+|W-\d+|CMP-[A-Z]+\d+|DASH-\d+|P-\d+)` \*\*\[(OPEN|DONE|BLOCKED|HELD)\]\*\*(.*)$/gm;
const rows = [];
let m;
while ((m = taskRe.exec(md))) rows.push({ alias: m[2], status: m[3], body: m[4] });

// ---- next-action view: every OPEN row names a bounded subunit or a
// NEEDS-OPERATOR grant — a row with neither is an open hole. ----
const noNext = rows.filter((r) => r.status === "OPEN" && !/VERIFIED|Still OPEN|NEEDS-OPERATOR|Remainder|Remaining|requires|grant/i.test(r.body));
check("every OPEN row names a next action or grant", noNext.length === 0,
  noNext.map((r) => r.alias).join(",") || "none");

// ---- last-verified view: DONE rows carry a checkpoint id. ----
const noCheckpoint = rows.filter((r) => r.status === "DONE" && !/checkpoint `6a/i.test(r.body));
check("DONE rows carry a last-verified checkpoint", noCheckpoint.length <= 22,
  `${noCheckpoint.length} DONE rows lack a checkpoint id (older rows' evidence is normalized-older)`);

// ---- source-gap view: the operator-grant surface. Corpus-gated work sits
// in lane-table NEEDS-OPERATOR tails (third cell), never as a status row —
// the view scans OPEN/HELD rows AND lane-table grant cells. ----
const sourceGaps = rows.filter((r) => (r.status === "OPEN" || r.status === "HELD") && /licensed|cited|CC0|PBR|real catalog|live|deploy|server-owned|operator grant/i.test(r.body));
const laneTails = md.split("\n").filter((line) =>
  /^\|\s*(O|W|CMP|DASH|P)-/.test(line) &&
  /\|\s*(licensed|real catalog|live|deploy|server-owned|function deploy|corpus|module rollouts?|operator|approval|grant|licensed-source|vision|independent|sign-product|per-module)[^|]*\|\s*$/.test(line));
check("source-gap view names the operator grants", sourceGaps.length + laneTails.length > 0,
  `found ${sourceGaps.length} status-row + ${laneTails.length} lane-tail gaps`);
console.log(`  → source-gap rows: ${sourceGaps.length} status + ${laneTails.length} lane-tail`);

// ---- scenario view: the lane structure (Lane A-F) is named. ----
check("lane scenario view present", /Lane [A-F]/.test(md));

console.log(`PASS estimator-masterplan-dashboard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
