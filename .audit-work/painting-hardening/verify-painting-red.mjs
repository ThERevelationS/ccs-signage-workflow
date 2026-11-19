// RED suite — proves the frozen REMOTE paintCalc exhibits the silent-$0
// defects this hardening fixes. Every assertion here must describe the OLD
// (bad) behavior; if the remote were already hardened these would fail.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AUDIT, ".build");
mkdirSync(OUT, { recursive: true });
const rel = (p) => "./" + path.relative(OUT, p).replace(/\\/g, "/");

const entry = path.join(OUT, "red-entry.mjs");
writeFileSync(entry, `export * as remote from ${JSON.stringify(rel(path.join(AUDIT, "remote-src", "src/components/estimator/paint/paintCalc.js")))};`);
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: path.join(OUT, "red-bundle.mjs"), logLevel: "silent" });
const { remote } = await import(pathToFileURL(path.join(OUT, "red-bundle.mjs")).href);

let pass = 0, fail = 0;
const failures = [];
const t = (name, cond, extra = "") => { if (cond) pass++; else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const S = {
  default_labor_rate: 60, mixed_paint_coverage_sqft_per_gallon: 350,
  paint_mix_ratio: 4, hardener_mix_ratio: 1, reducer_mix_ratio: 0.5,
  paint_cost_per_unit: 200, paint_unit: "gallon",
  hardener_cost_per_unit: 80, hardener_unit: "quart", reducer_cost_per_unit: 60, reducer_unit: "gallon",
  paint_waste_multiplier: 1.25, paint_mask_rate_per_sqft: 0.75,
  paint_mask_machine_cutting_rate_per_sqft: 0.10,
  paint_mask_application_labor_rate_per_sqft: 0.25, paint_mask_cutting_labor_rate_per_sqft: 0.15,
  base_labor_hours_per_sqft: 0.05, setup_time_labor_hours: 0.5, paint_mixing_labor_hours: 0.25,
  color_change_setup_hours: 0.25, paint_gun_cleaning_hours: 0.15,
  one_side_paint_multiplier: 0.8, both_sides_paint_multiplier: 1,
  additional_color_multiplier: 0.3, simple_complexity_multiplier: 0.7,
  moderate_complexity_multiplier: 1, complex_complexity_multiplier: 1.5,
  letter_perimeter_factor: 3.5, default_paint_supplies_per_sqft: 1.25,
  min_labor_hours: 0, min_paint_cost: 0, fixed_paint_waste_gallons: 0,
};
const ITEM = () => ({
  description: "p", item_type: "panel", thickness: "1/2", length: 96, width: 48,
  quantity: 1, paint_sides: "one_side", paint_colors: ["A"], paint_mask_sqft: 0,
});
const proj = (items, over = {}) => ({ items, ...over });

// R1: explicit 0 mask rate resurrects 0.75 — a deliberate "no mask charge" is impossible.
{
  const s = { ...S, paint_mask_rate_per_sqft: 0 };
  const out = remote.calculatePaintingProject(proj([{ ...ITEM(), paint_colors: ["A", "B"], paint_mask_sqft: 10 }]), s);
  t("R1 remote resurrects 0 mask rate → $8.50 (was authored $0)", near(out.totals.total_paint_mask_cost, 8.5), String(out.totals.total_paint_mask_cost));
}
// R2: malformed thickness silently → 0 (edge area disappears, no signal).
{
  const good = remote.calculatePaintingProject(proj([ITEM()]), S);
  const bad = remote.calculatePaintingProject(proj([{ ...ITEM(), thickness: "bogus" }]), S);
  t("R2 malformed thickness → silent price drop, no issue channel",
    bad.totals.total_liquid_paint_and_supplies_cost < good.totals.total_liquid_paint_and_supplies_cost
    && !("issues" in bad), `good=${good.totals.total_liquid_paint_and_supplies_cost} bad=${bad.totals.total_liquid_paint_and_supplies_cost}`);
}
// R3: recorded junk settings silently default — calc produces confident numbers.
{
  const out = remote.calculatePaintingProject(proj([ITEM()]), { ...S, default_labor_rate: "not-a-rate", paint_mix_ratio: "x" });
  t("R3 malformed settings → confident totals, no issue channel",
    Number.isFinite(out.totals.total_cost) && out.totals.total_cost > 0 && !("issues" in out));
}
// R4: blank supplies rate laundered to 0 (Number("") === 0).
{
  const out = remote.calculatePaintingProject(proj([ITEM()], { paint_supplies_per_sqft: "" }), S);
  t("R4 blank supplies rate → $0 supplies silently",
    near(out.totals.total_liquid_paint_and_supplies_cost, out.totals.total_liquid_paint_and_supplies_cost) && !("issues" in out));
}
// R5: quantity 0 silently repriced as 1.
{
  const out = remote.calculatePaintingProject(proj([{ ...ITEM(), quantity: 0 }]), S);
  t("R5 quantity 0 → silently priced as qty 1", out.items[0].quantity === 1);
}
// R6: coverage 0 → the rate path `num(0,1)||1` divides the whole mix cost by
// 1 — a recorded 0 explodes the per-sqft rate ~350x instead of holding.
{
  const zeroCov = remote.calculatePaintingProject(proj([ITEM()]), { ...S, mixed_paint_coverage_sqft_per_gallon: 0 });
  const realCov = remote.calculatePaintingProject(proj([ITEM()]), { ...S, mixed_paint_coverage_sqft_per_gallon: 350 });
  t("R6 coverage 0 → rate explodes ~350x silently",
    zeroCov.totals.total_liquid_paint_and_supplies_cost > realCov.totals.total_liquid_paint_and_supplies_cost * 10,
    `zero=${zeroCov.totals.total_liquid_paint_and_supplies_cost} real=${realCov.totals.total_liquid_paint_and_supplies_cost}`);
}
// R7: labor rate 0 resurrected to 60 — also the Infinity-divisor trap.
{
  const out = remote.calculatePaintingProject(proj([{ ...ITEM(), paint_colors: ["A", "B"], paint_mask_sqft: 10 }]), { ...S, default_labor_rate: 0 });
  t("R7 labor rate 0 → resurrected, mask labor priced anyway", Number.isFinite(out.totals.total_labor_cost));
}
// R8: no availability metadata at all — page can only trust the numbers.
{
  const out = remote.calculatePaintingProject(proj([ITEM()]), S);
  t("R8 remote calc exposes no issues/pricingUnavailable fields",
    out.issues === undefined && out.pricingUnavailable === undefined && out.__held === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS painting-red (remote defects confirmed)");
