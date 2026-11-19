// W-009 (DASH-09) — estimator masterplan EVIDENCE fixture.
// Stricter than test-estimator-masterplan-status.mjs's evidence-marker check:
// every DONE row's evidence trail must name a real artifact — a checkpoint id
// (hex `6af…`), a git commit (40-hex), or a verify score (`NN/NN`, `N passed`).
// An OPEN/HELD row must not carry those markers (a held row that names a
// checkpoint looks complete to a reader — the honest tail keeps its gate).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(resolve(root, "ESTIMATOR_MASTERPLAN.md"), "utf8");
const lines = md.split("\n");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} — ${detail}`); }
};

const taskRe = /^- \[([ xX])\] `(O-\d+|W-\d+|CMP-[A-Z]+\d+|DASH-\d+|P-\d+)` \*\*\[(OPEN|DONE|BLOCKED|HELD)\]\*\*/gm;
const rows = [];
let m;
while ((m = taskRe.exec(md))) {
  rows.push({ alias: m[2], status: m[3], line: md.slice(0, m.index).split("\n").length });
}
check("status parser finds task rows", rows.length > 0, `found ${rows.length}`);

// Evidence window: a row's evidence lives in its own line + the following
// block (sub-lines until the next task row or a `##`/`####` header).
const windowFor = (r) => {
  let end = lines.length;
  for (let i = r.line; i < lines.length; i += 1) {
    if (i + 1 > r.line && (lines[i].match(/^- \[[ xX]\] `/) || lines[i].match(/^#{2,4} /))) { end = i; break; }
  }
  return lines.slice(r.line - 1, end).join("\n");
};

const EVIDENCE = [
  // checkpoint ids are hex object-ids cited full (24) or short (`6af41e87`);
  // both are real artifact references in this ledger.
  { name: "checkpoint id", re: /\b6a[0-9a-f]{6,22}\b/i },
  { name: "git commit", re: /\b[0-9a-f]{40}\b/i },
  { name: "verify score", re: /\b\d+\s*\/\s*\d+\b|\b\d+ passed\b|\bVERIFIED\b|\bLANDED\b|\btest PASS\b/i },
];

// Every DONE row names at least one real artifact.
const doneThin = rows.filter((r) => r.status === "DONE" && !EVIDENCE.some((e) => e.re.test(windowFor(r))));
check("DONE rows name a real artifact (checkpoint/commit/verify)", doneThin.length === 0,
  doneThin.map((r) => r.alias).join(",") || "none");

// A checkpoint citation is never a degenerate fragment — `6a`+under-7-hex is
// too short to name a real artifact.
const shortCp = [];
for (const r of rows) {
  const w = windowFor(r);
  const m2 = w.match(/\b6a[0-9a-f]{1,5}\b(?![0-9a-f])/i);
  if (m2) shortCp.push(`${r.alias}:${m2[0]}`);
}
check("checkpoint citations are never degenerate fragments", shortCp.length === 0, shortCp.join(",") || "none");

// OPEN/HELD rows never carry a checkpoint/commit artifact — their tail stays
// a named gate, never a fake completion.
const openFake = rows.filter((r) => (r.status === "OPEN" || r.status === "HELD")
  && (EVIDENCE[0].re.test(lines[r.line - 1] || "") || EVIDENCE[1].re.test(lines[r.line - 1] || "")));
check("OPEN/HELD rows carry no completion artifact", openFake.length === 0,
  openFake.map((r) => r.alias).join(",") || "none");

// Every DONE row's stage is "complete" (cross-check the status fixture's rule).
const doneNotComplete = rows.filter((r) => r.status === "DONE" && !(lines[r.line - 1] || "").includes("**stage: complete**"));
check("DONE rows mark stage: complete", doneNotComplete.length === 0,
  doneNotComplete.map((r) => r.alias).join(",") || "none");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} estimator-masterplan-evidence: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
