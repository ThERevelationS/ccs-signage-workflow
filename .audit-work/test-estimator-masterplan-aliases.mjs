// W-009 (DASH-09) — estimator masterplan ALIASES fixture.
// The alias contract:
//   * task-row aliases (`alias` **[STATUS]**) match a `<WS>-<NN>` shape and
//     never declare twice;
//   * §0.0 lane-table item ids are unique ACROSS tables (an item can't live
//     on two lanes);
//   * §3 dependency-map refs (`O-NNN` in the Lane 1-4 lists) resolve to the
//     O-module's item space (O-001..O-121) — a typo'd ref names no work;
//   * the Z-03 reserved slot stays OPEN or absent.

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
  rows.push({ alias: m[2], line: md.slice(0, m.index).split("\n").length });
}
check("status parser finds task rows", rows.length > 0, `found ${rows.length}`);

// Task-row alias shape.
const aliasShape = /^(O-\d{3}|W-\d{3}|P-\d{2}|CMP-[A-Z]+\d+|DASH-\d{2})$/;
const badAlias = rows.map((r) => r.alias).filter((a) => !aliasShape.test(a));
check("aliases match the <WS>-<NN> shape", badAlias.length === 0, badAlias.join(",") || "none");

// Task-row alias uniqueness.
const aliases = rows.map((r) => r.alias);
const dup = aliases.filter((a, i) => aliases.indexOf(a) !== i);
check("alias uniqueness", dup.length === 0, `dupes: ${dup.join(",") || "none"}`);

// §0.0 lane-table ids are unique across the lane tables (an item on two lanes
// is a double-claim on the same work).
const laneRe = /^\| (O-\d{3}|W-\d{3})\b/gm;
const laneIds = [];
let lm;
while ((lm = laneRe.exec(md))) laneIds.push(lm[1]);
const laneDup = laneIds.filter((a, i) => laneIds.indexOf(a) !== i);
check("lane-table ids are unique across lanes", laneDup.length === 0,
  `dupes: ${[...new Set(laneDup)].join(",") || "none"}`);

// §3 dependency-map refs resolve to the O-module item space — an `O-NNN`
// reference in the Lane 1-4 lists must be a zero-padded id in O-001..O-121
// (the spec's declared item range); a typo'd ref names no work.
const depSection = md.slice(md.indexOf("**Lane 1"), md.indexOf("## 3.") === -1 ? md.length : md.indexOf("---", md.indexOf("**Lane 1")));
const depRe = /`O-(\d{3})`/g;
const outOfRange = [];
let dm;
while ((dm = depRe.exec(depSection))) {
  const n = Number(dm[1]);
  if (n < 1 || n > 121) outOfRange.push(`O-${dm[1]}`);
}
check("dependency-map refs resolve inside the O-item space", outOfRange.length === 0,
  outOfRange.join(",") || "none");

// Zero-padded shape everywhere — `O-29` (unpadded) refs are alias typos.
const unpadRe = /`O-(\d{1,2})`/g;
const unpad = [];
let um;
while ((um = unpadRe.exec(md))) unpad.push(`O-${um[1]}`);
check("no unpadded O-refs (O-29-style typos)", unpad.length === 0, unpad.join(",") || "none");

// Z-03 reserved slot stays OPEN or absent.
const z3Line = lines.findIndex((l) => l.includes("Z-03"));
check("Z-03 reserved slot stays OPEN or absent",
  z3Line === -1 || !/\[x\].*Z-03|Z-03.*\[DONE\]/i.test(lines[z3Line] || ""));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} estimator-masterplan-aliases: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
