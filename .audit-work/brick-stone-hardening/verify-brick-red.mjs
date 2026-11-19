// RED suite — proves the frozen REMOTE brickCalc exhibits the silent-$0 /
// silent-reprice defects this hardening fixes. Every assertion describes the
// OLD (bad) behavior; if the remote were already hardened these would fail.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AUDIT, ".build");
mkdirSync(OUT, { recursive: true });
const rel = (p) => "./" + path.relative(OUT, p).replace(/\\/g, "/");

const entry = path.join(OUT, "red-entry.mjs");
writeFileSync(entry, `export * as remote from ${JSON.stringify(rel(path.join(AUDIT, "remote-src", "src/components/estimator/brick/brickCalc.js")))};`);
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: path.join(OUT, "red-bundle.mjs"), logLevel: "silent" });
const { remote } = await import(pathToFileURL(path.join(OUT, "red-bundle.mjs")).href);

let pass = 0, fail = 0;
const failures = [];
const t = (name, cond, extra = "") => { if (cond) pass++; else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const MATERIAL = () => ({ id: "mat-1", material_name: "Standard Brick", length: 7.625, width: 3.625, height: 2.25, cost_per_unit: 0.55 });
const PROJECT = () => ({
  selected_material_id: "mat-1", bricks_along_length: 6, bricks_along_width: 9,
  courses_high: 5, layers: 1, mortar_gap: 0.375, waste_factor: 1.1,
  mortar_bag_cost: 12, bricks_per_hour: 40, labor_rate_per_hour: 55, markup_percent: 15,
});

// R1: recorded waste_factor 0 → bricks, material and labor silently become $0
// (mortar still bills off the pre-waste count) while the surface area stays
// positive — the remote save gate passes and a near-$0 wall is saved.
{
  const out = remote.calcBrickStoneProject({ ...PROJECT(), waste_factor: 0 }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R1 waste 0 → bricks/material/labor $0, positive area, saveable",
    out.calculated_bricks === 0 && out.material_cost === 0 && out.labor_cost === 0
      && out.calculated_surface_area > 0 && out.total_cost < clean.total_cost,
    `total=${out.total_cost} clean=${clean.total_cost} area=${out.calculated_surface_area}`);
}
// R2: bricks_per_hour 0 → Math.max(1,0) silently divides by 1 → labor_hours =
// brick count, an order-of-magnitude explosion.
{
  const out = remote.calcBrickStoneProject({ ...PROJECT(), bricks_per_hour: 0 }, MATERIAL());
  t("R2 bph 0 → labor explodes to brick count", near(out.labor_hours, out.calculated_bricks) && out.labor_hours > 0,
    `labor_hours=${out.labor_hours} bricks=${out.calculated_bricks}`);
}
// R3: mortar_bag_cost "abc" → silently resolved the $12 default.
{
  const junk = remote.calcBrickStoneProject({ ...PROJECT(), mortar_bag_cost: "abc" }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R3 junk bag cost → silent $12 default", near(junk.mortar_cost, clean.mortar_cost) && clean.mortar_cost > 0,
    `junk=${junk.mortar_cost} clean=${clean.mortar_cost}`);
}
// R4: markup_percent "abc" → silently priced as 0% markup.
{
  const junk = remote.calcBrickStoneProject({ ...PROJECT(), markup_percent: "abc" }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R4 junk markup → silent 0%", junk.markup_amount === 0 && clean.markup_amount > 0,
    `junk=${junk.markup_amount} clean=${clean.markup_amount}`);
}
// R5: missing material cost_per_unit → $0 material silently.
{
  const out = remote.calcBrickStoneProject(PROJECT(), { ...MATERIAL(), cost_per_unit: undefined });
  t("R5 missing material cost → $0 material", out.material_cost === 0 && out.calculated_bricks > 0);
}
// R6: blank mortar_gap "" → num("") laundered to 0 — NOT the 0.375 default —
// different geometry silently.
{
  const blank = remote.calcBrickStoneProject({ ...PROJECT(), mortar_gap: "" }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  const zero = remote.calcBrickStoneProject({ ...PROJECT(), mortar_gap: 0 }, MATERIAL());
  t("R6 blank mortar_gap → silent 0 (not the default)",
    near(blank.derived_length, zero.derived_length) && !near(blank.derived_length, clean.derived_length),
    `blank=${blank.derived_length} zero=${zero.derived_length} clean=${clean.derived_length}`);
}
// R7: recorded layers 0 → silently repriced as 1 layer.
{
  const out = remote.calcBrickStoneProject({ ...PROJECT(), layers: 0 }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R7 layers 0 → silent 1 layer", near(out.calculated_bricks, clean.calculated_bricks) && clean.calculated_bricks > 0);
}
// R8: hex string "0x10" waste_factor → num() parses 16 → bricks x16 explosion.
{
  const out = remote.calcBrickStoneProject({ ...PROJECT(), waste_factor: "0x10" }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R8 hex waste → 16x bricks", out.calculated_bricks > clean.calculated_bricks * 10,
    `hex=${out.calculated_bricks} clean=${clean.calculated_bricks}`);
}
// R9: malformed dimension "abc" → silently 0 — a degenerate wall still prices
// positive surface area (saveable under the old gate).
{
  const out = remote.calcBrickStoneProject({ ...PROJECT(), bricks_along_length: "abc" }, MATERIAL());
  t("R9 junk dimension → silent 0, still saveable area",
    out.derived_length === 0 && out.calculated_surface_area > 0,
    `len=${out.derived_length} area=${out.calculated_surface_area}`);
}
// R10: null mortar_bag_cost → num(null) laundered to 0 — free mortar, NOT the
// $12 default.
{
  const out = remote.calcBrickStoneProject({ ...PROJECT(), mortar_bag_cost: null }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R10 null bag cost → silent $0 (not the default)",
    out.mortar_cost === 0 && clean.mortar_cost > 0, `null=${out.mortar_cost} clean=${clean.mortar_cost}`);
}
// R11: malformed labor rate "free" → silently resolved $55.
{
  const junk = remote.calcBrickStoneProject({ ...PROJECT(), labor_rate_per_hour: "free" }, MATERIAL());
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R11 junk labor rate → silent $55", near(junk.labor_cost, clean.labor_cost) && clean.labor_cost > 0);
}
// R12: missing material dimension → derived geometry silently 0-ish.
{
  const out = remote.calcBrickStoneProject(PROJECT(), { ...MATERIAL(), length: undefined });
  const clean = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R12 missing material length → silent geometry drop",
    out.derived_length < clean.derived_length && Number.isFinite(out.derived_length),
    `missing=${out.derived_length} clean=${clean.derived_length}`);
}
// R13: no availability metadata at all — the page can only trust the numbers.
{
  const out = remote.calcBrickStoneProject(PROJECT(), MATERIAL());
  t("R13 no issues/pricingUnavailable/__held channel",
    out.issues === undefined && out.pricingUnavailable === undefined && out.__held === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS brick-red (remote defects confirmed)");
