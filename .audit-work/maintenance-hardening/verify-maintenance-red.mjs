// RED suite — proves the frozen REMOTE maintenance calculators exhibit the
// silent-$0 / fabricated-default defects this hardening fixes. Every assertion
// describes the OLD (bad) behavior; if remote were already hardened these fail.
import { build } from "esbuild";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AUDIT, ".build");
mkdirSync(OUT, { recursive: true });
const rel = (p) => "./" + path.relative(OUT, p).replace(/\\/g, "/");

const SM = "/app/src/components/signMaintenance/";
const remoteFile = (p) => readFileSync(path.join(AUDIT, "remote", p), "utf8");
const sources = new Map();
for (const f of ["constants.jsx", "defaults.jsx", "repaintCalculator.jsx", "repaintDefaults.jsx",
  "dimLetterPaintCalculator.jsx", "maintenanceCalculator.jsx"])
  sources.set(SM + f, remoteFile("src/components/signMaintenance/" + f));
sources.set("/app/red-entry.mjs", `
  export { calcServiceItem, calcProjectTotals } from "${SM}maintenanceCalculator.jsx";
  export { computeMonumentRepaint } from "${SM}repaintCalculator.jsx";
  export { computeDimLetterPaint } from "${SM}dimLetterPaintCalculator.jsx";
`);
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx", base + ".mjs"].find((p) => sources.has(p));
    if (!resolved) throw Error("missing frozen source: " + a.path);
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => ({
    contents: sources.get(a.path), loader: a.path.endsWith(".jsx") ? "jsx" : "js",
  }));
}};
await build({
  entryPoints: ["/app/red-entry.mjs"], bundle: true, format: "esm", platform: "node",
  outfile: path.join(OUT, "maintenance-red-bundle.mjs"), plugins: [plug], logLevel: "silent",
});
const remote = await import(pathToFileURL(path.join(OUT, "maintenance-red-bundle.mjs")).href);

let pass = 0, fail = 0;
const failures = [];
const t = (name, cond, extra = "") => { if (cond) pass++; else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const SETTINGS = { maintenance_tech_rate: "65" };
const RATE = (over = {}) => ({
  id: "r1", sign_type: "flush_channel", action: "clean", is_enabled: true,
  base_minutes_m: 30, base_minutes_flat: 30, ...over,
});
const ITEM = (over = {}) => ({
  description: "Front channel letters", sign_type: "flush_channel", size: "medium",
  qty: 10, actions: ["clean"], materials: [], ...over,
});
const REPAINT_SETTINGS = {
  maintenance_tech_rate: "65",
  maintenance_repaint_coverage_sqft_per_gallon: "350",
  maintenance_repaint_paint_cost_per_gallon: "55",
  maintenance_repaint_primer_coats: "1",
  maintenance_repaint_finish_coats: "2",
  maintenance_repaint_sqft_per_hour: "60",
  maintenance_repaint_condition_step_pct: "8",
};
const REPAINT_ITEM = () => ({
  sign_type: "monument_sign", size: "cab_medium", qty: 1, actions: ["repaint"],
  repaint_config: { length_ft: 8, height_ft: 4, return_depth_in: 6, paint_mode: "entire_panel",
    features: [], retainer_width_in: 2, paint_condition: 3, paint_both_sides: true },
  materials: [],
});

// R1: missing MaintenanceActionRate row → 0 minutes → $0 labor, no signal.
{
  const out = remote.calcServiceItem(ITEM(), SETTINGS, [], []);
  t("R1 missing rate row → silent $0 labor",
    out.labor_cost === 0 && out.labor_hours === 0 && !("issues" in out), `labor=${out.labor_cost}`);
}
// R2: malformed minutes cell → parseFloat||0 → $0 labor.
{
  const out = remote.calcServiceItem(ITEM(), SETTINGS, [RATE({ base_minutes_m: "abc" })], []);
  t("R2 malformed minutes → silent $0 labor", out.labor_cost === 0);
}
// R3: disabled rate row → 0 minutes silently.
{
  const out = remote.calcServiceItem(ITEM(), SETTINGS, [RATE({ is_enabled: false })], []);
  t("R3 disabled rate → silent $0 labor", out.labor_cost === 0);
}
// R4: malformed tech rate → fabricated $65/hr (default launder).
{
  const bad = remote.calcServiceItem(ITEM(), { maintenance_tech_rate: "bogus" }, [RATE()], []);
  const good = remote.calcServiceItem(ITEM(), SETTINGS, [RATE()], []);
  t("R4 malformed tech rate → fabricated $65 default",
    near(bad.labor_cost, good.labor_cost) && bad.labor_cost === 30 / 60 * 10 * 65, `got ${bad.labor_cost}`);
}
// R5: blank qty → parseFloat||0 → 0 → $0 labor + $0 per-letter materials.
{
  const out = remote.calcServiceItem(ITEM({ qty: "" }), SETTINGS, [RATE()], []);
  t("R5 blank qty → silent $0", out.labor_cost === 0 && out.item_total_cost === 0);
}
// R6: detached material on a missing rule → stored snapshot reused silently.
{
  const inv = [{ id: "rule-x", item_name: "Vinyl", is_active: true, pricing_mode: "per_sqft", cost_per_sqft: "4" }];
  const withRule = remote.calcServiceItem(ITEM({ face_sqft: 10, materials: [{ maintenance_rule_id: "rule-x" }] }), SETTINGS, [RATE()], inv);
  const noRule = remote.calcServiceItem(ITEM({ face_sqft: 10, materials: [{ maintenance_rule_id: "gone", unit_cost: 4, quantity: 10 }] }), SETTINGS, [RATE()], inv);
  t("R6 missing rule → stored snapshot priced silently",
    near(noRule.materials_cost - withRule.materials_cost, 0, 0.01) || near(noRule.materials[0].total_cost, 40),
    `noRule.materials[0]=${JSON.stringify(noRule.materials[0]?.total_cost)}`);
}
// R7: repaint coverage recorded 0 → ||350 launders back to 350.
{
  const out = remote.computeMonumentRepaint(REPAINT_ITEM(), { ...REPAINT_SETTINGS, maintenance_repaint_coverage_sqft_per_gallon: 0 });
  t("R7 repaint coverage 0 → resurrected to 350", out.coverage === 350, `got ${out.coverage}`);
}
// R8: malformed repaint setting → SETTING_FALLBACKS fabricate pricing.
{
  const out = remote.computeMonumentRepaint(REPAINT_ITEM(), { ...REPAINT_SETTINGS, maintenance_repaint_paint_cost_per_gallon: "bogus" });
  t("R8 malformed paint cost → fabricated $55/gal", near(out.pricePerGal, 55), `got ${out.pricePerGal}`);
}
// R9: sqft_per_hour 0 → ||60 resurrected (division never blows up, just lies).
{
  const out = remote.computeMonumentRepaint(REPAINT_ITEM(), { ...REPAINT_SETTINGS, maintenance_repaint_sqft_per_hour: 0 });
  t("R9 sqft/hr 0 → resurrected 60", near(out.labor_hours, remote.computeMonumentRepaint(REPAINT_ITEM(), REPAINT_SETTINGS).labor_hours));
}
// R10: dim-letter qty blank → whole feature silently skipped (not even $0 —
// it vanishes from the estimate).
{
  const dlOn = remote.computeDimLetterPaint({ dim_letter_paint: { enabled: true, qty: 6, avg_height_in: 12, thickness_in: 1, second_color_mask: "none" } },
    { letter_perimeter_factor: "3.5", paint_waste_multiplier: "1.25", mixed_paint_coverage_sqft_per_gallon: "350",
      paint_mix_ratio: "4", hardener_mix_ratio: "1", reducer_mix_ratio: "0.5",
      paint_cost_per_unit: "200", paint_unit: "gallon", base_labor_hours_per_sqft: "0.05", lettering_normal_prep_multiplier: "1" });
  const dlBlank = remote.computeDimLetterPaint({ dim_letter_paint: { enabled: true, qty: "", avg_height_in: 12, thickness_in: 1, second_color_mask: "none" } },
    { letter_perimeter_factor: "3.5" });
  t("R10 dim qty blank → feature silently dropped",
    dlOn !== null && dlOn.letters_total_added_cost > 0 && dlBlank === null, `dlOn=${dlOn?.letters_total_added_cost} dlBlank=${dlBlank}`);
}
// R11: dim-letter mask rates absent → num() → $0 mask priced silently.
{
  const out = remote.computeDimLetterPaint({ dim_letter_paint: { enabled: true, qty: 6, avg_height_in: 12, thickness_in: 1, second_color_mask: "paint_mask" } },
    { letter_perimeter_factor: "3.5", paint_waste_multiplier: "1.25", mixed_paint_coverage_sqft_per_gallon: "350",
      paint_mix_ratio: "4", hardener_mix_ratio: "1", reducer_mix_ratio: "0.5",
      paint_cost_per_unit: "200", paint_unit: "gallon", base_labor_hours_per_sqft: "0.05",
      lettering_normal_prep_multiplier: "1", default_labor_rate: "60" });
  t("R11 absent mask rates → $0 mask silently", out !== null && out.mask_total_cost === 0, `mask=${out?.mask_total_cost}`);
}
// R12: malformed supplies % → isNaN→10 fabricated default; markup "x" → 0.
{
  const proj = { items: [{ labor_cost: 100, labor_hours: 1, materials_cost: 50 }], selected_equipment: [], personnel: [] };
  const bad = remote.calcProjectTotals({ ...proj, supplies_percent_of_materials: "abc", markup_percent: "x" });
  t("R12 malformed supplies% → 10 fabricated; malformed markup → 0",
    near(bad.total_supplies_cost, 5) && bad.markup_amount === 0, `supplies=${bad.total_supplies_cost} markup=${bad.markup_amount}`);
}
// R13: personnel row with no total_cost → silently $0 in rollup.
{
  const proj = { items: [], selected_equipment: [], personnel: [{ role: "Crew Lead" }] };
  const out = remote.calcProjectTotals(proj);
  t("R13 missing personnel cost → $0 silently", out.total_personnel_cost === 0);
}
// R14: no availability channel at all.
{
  const out = remote.calcServiceItem(ITEM(), SETTINGS, [RATE()], []);
  t("R14 remote exposes no issues/pricingUnavailable",
    out.issues === undefined && out.pricingUnavailable === undefined && out.__held === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS maintenance-red (remote defects confirmed)");
