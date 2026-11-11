// W-009 (DASH-09) — estimator masterplan status fixture.
// Verifies the ledger's OPEN/DONE counts, alias uniqueness, and
// malformed-event handling on the CURRENT ESTIMATOR_MASTERPLAN.md —
// a read-only fixture, never a competing completion database.
//
// Run: node .audit-work/test-estimator-masterplan-status.mjs

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

// ---- status-line parse (the dashboard's `- [ ] \`O-001\` **[OPEN]**` shape) ----
const taskRe = /^- \[([ xX])\] `(O-\d+|W-\d+|CMP-[A-Z]+\d+|DASH-\d+|P-\d+)` \*\*\[(OPEN|DONE|BLOCKED|HELD)\]\*\*/gm;
const rows = [];
let m;
while ((m = taskRe.exec(md))) {
  rows.push({ alias: m[2], checked: m[1], status: m[3], line: md.slice(0, m.index).split("\n").length });
}

check("status parser finds task rows", rows.length > 0, `found ${rows.length}`);

// ---- alias uniqueness ----
const aliases = rows.map((r) => r.alias);
const dup = aliases.filter((a, i) => aliases.indexOf(a) !== i);
check("alias uniqueness", dup.length === 0, `dupes: ${dup.join(",") || "none"}`);

// ---- OPEN vs DONE consistency: [x] must read DONE, [ ] must read OPEN ----
const mismatched = rows.filter((r) => (r.checked.toLowerCase() === "x") !== (r.status === "DONE"));
check("checkbox/status consistency", mismatched.length === 0,
  mismatched.map((r) => `${r.alias}@${r.line}`).join(",") || "none");

// ---- exact counts (the dashboard's display source) ----
const openCount = rows.filter((r) => r.status === "OPEN").length;
const doneCount = rows.filter((r) => r.status === "DONE").length;
const blockedCount = rows.filter((r) => r.status === "BLOCKED").length;
const heldCount = rows.filter((r) => r.status === "HELD").length;
console.log(`\nCounts: OPEN=${openCount} DONE=${doneCount} BLOCKED=${blockedCount} HELD=${heldCount} total=${rows.length}`);
check("counts nonzero", openCount + doneCount > 0);

// ---- malformed-event handling: a row with a missing status must not crash ----
const malformed = rows.filter((r) => !["OPEN", "DONE", "BLOCKED", "HELD"].includes(r.status));
check("malformed status rows", malformed.length === 0, malformed.map((r) => r.alias).join(",") || "none");

// ---- complete-but-unpublished: every DONE row should carry a checkpoint/commit marker ----
const doneNoEvidence = rows.filter((r) => r.status === "DONE" && !/checkpoint|commit|VERIFIED|LANDED/i.test(
  md.split("\n").slice(r.line - 1, r.line + 40).join("\n")
));
check("DONE rows carry evidence markers", doneNoEvidence.length === 0,
  doneNoEvidence.map((r) => r.alias).join(",") || "none");

// ---- W-004 (DASH-04): every row carries an explicit stage marker naming ----
// ---- the stage its remainder sits in (plan/audit/research/implementation/ ----
// ---- verification/standing) or "complete" for DONE rows. ----
const ALLOWED_STAGES = new Set(["plan", "audit", "research", "implementation", "verification", "standing", "complete"]);
const lines = md.split("\n");
const noStage = [], badStage = [];
for (const r of rows) {
  const rowText = lines[r.line - 1] || "";
  const m2 = rowText.match(/\*\*stage: ([a-z_]+)\*\*/);
  if (!m2) noStage.push(r.alias);
  else if (!ALLOWED_STAGES.has(m2[1])) badStage.push(`${r.alias}=${m2[1]}`);
}
check("every row carries a stage marker (W-004)", noStage.length === 0, noStage.join(",") || "none");
check("stage markers name a known stage", badStage.length === 0, badStage.join(",") || "none");
// DONE rows mark "complete"; OPEN/BLOCKED/HELD rows never do.
const wrongComplete = rows.filter((r) => {
  const rowText = lines[r.line - 1] || "";
  const m2 = rowText.match(/\*\*stage: ([a-z_]+)\*\*/);
  return m2 && (m2[1] === "complete") !== (r.status === "DONE");
});
check("stage 'complete' matches DONE status", wrongComplete.length === 0,
  wrongComplete.map((r) => r.alias).join(",") || "none");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} estimator-masterplan-status: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
