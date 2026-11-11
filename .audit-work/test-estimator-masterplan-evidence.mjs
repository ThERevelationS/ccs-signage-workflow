// Lane F -- estimator masterplan evidence fixture.
// Verifies every DONE row in ESTIMATOR_MASTERPLAN.md carries a checkpoint-id
// (`checkpoint \`<24-hex>\``) + an esbuild evidence marker (`esbuild`/`Remote
// esbuild`) — a read-only fixture, never a competing completion database.
//
// Run: node .audit-work/test-estimator-masterplan-evidence.mjs

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

const doneRows = rows.filter((r) => r.status === "DONE");
check("DONE rows exist", doneRows.length > 0, `found ${doneRows.length}`);

// ---- every DONE row's section carries a checkpoint-id + esbuild marker ----
// The DONE row's evidence lives in the same table row (the `|` cell carrying
// the VERIFIED-at-checkpoint text). A DONE row's section carries the row's
// text up to the next task row or table end.
const sections = {};
rows.forEach((r, i) => {
  const start = md.indexOf(`\`${r.alias}\` **[${r.status}]**`);
  const end = i + 1 < rows.length ? md.indexOf(`\`${rows[i + 1].alias}\` **[${rows[i + 1].status}]**`, start) : md.length;
  sections[r.alias] = md.slice(start, end > start ? end : md.length);
});

const missingCheckpoint = doneRows.filter((r) => !/checkpoint `[0-9a-f]{24}`/.test(sections[r.alias]));
const missingEsbuild = doneRows.filter((r) => !/esbuild/i.test(sections[r.alias]));
const missingVerified = doneRows.filter((r) => !/VERIFIED|VERIFIED at checkpoint/i.test(sections[r.alias]));

check("every DONE row carries a checkpoint-id", missingCheckpoint.length === 0,
  `missing: ${missingCheckpoint.map((r) => r.alias).join(",") || "none"}`);
check("every DONE row carries an esbuild marker", missingEsbuild.length === 0,
  `missing: ${missingEsbuild.map((r) => r.alias).join(",") || "none"}`);
check("every DONE row carries a VERIFIED marker", missingVerified.length === 0,
  `missing: ${missingVerified.map((r) => r.alias).join(",") || "none"}`);

console.log(`\n${pass} passed, ${fail} failed — ${doneRows.length} DONE rows checked`);
process.exit(fail ? 1 : 0);
