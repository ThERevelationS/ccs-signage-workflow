// Brick & Stone hardening — model suite.
// Asserts (a) valid-path parity: candidate calcBrickStoneAvailability output is
// byte-identical to remote calcBrickStoneProject on clean inputs, and
// (b) strict-availability semantics: malformed inputs hold every derived
// number to null, keep raw rows untouched, and emit structured brick_*
// issues — never a silent $0.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AUDIT, ".build");
mkdirSync(OUT, { recursive: true });
const rel = (p) => "./" + path.relative(OUT, p).replace(/\\/g, "/");

const entry = path.join(OUT, "model-entry.mjs");
writeFileSync(entry, `
export * as remote from ${JSON.stringify(rel(path.join(AUDIT, "remote-src", "src/components/estimator/brick/brickCalc.js")))};
export * as avail from ${JSON.stringify(rel(path.join(AUDIT, "frozen-src", "components/estimator/brick/brickPricingAvailability.js")))};
`);

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: path.join(OUT, "model-bundle.mjs"),
  logLevel: "silent",
});

const { remote, avail } = await import(pathToFileURL(path.join(OUT, "model-bundle.mjs")).href);

let pass = 0, fail = 0;
const failures = [];
const t = (name, cond, extra = "") => {
  if (cond) { pass++; }
  else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- shared fixtures ----------
const MATERIAL = () => ({
  id: "mat-1", material_name: "Standard Brick",
  length: 7.625, width: 3.625, height: 2.25, cost_per_unit: 0.55,
});
const PROJECT = () => ({
  id: "brick-1", updated_date: "v1", project_name: "Garden Wall", client_name: "C",
  selected_material_id: "mat-1", material_name: "Standard Brick",
  bricks_along_length: 6, bricks_along_width: 9, courses_high: 5, layers: 1,
  mortar_gap: 0.375, waste_factor: 1.1, mortar_bag_cost: 12,
  bricks_per_hour: 40, labor_rate_per_hour: 55, markup_percent: 15,
  notes: "", status: "draft",
});
const stripMeta = (o) => JSON.parse(JSON.stringify(o, (k, v) => ["__held", "pricingUnavailable", "issues"].includes(k) ? undefined : v));

// ---------- A. valid-path byte-parity + no mutation ----------
{
  const proj = PROJECT(); const mat = MATERIAL();
  const projBefore = JSON.stringify(proj); const matBefore = JSON.stringify(mat);
  const remoteOut = remote.calcBrickStoneProject(JSON.parse(JSON.stringify(proj)), JSON.parse(JSON.stringify(mat)));
  const { calc, issues, held } = avail.calcBrickStoneAvailability(proj, mat);
  t("A1 clean → no issues", issues.length === 0, JSON.stringify(issues));
  t("A2 clean → not held", held === false);
  t("A3 clean → byte-identical to remote", JSON.stringify(stripMeta(calc)) === JSON.stringify(remoteOut),
    `\ncand=${JSON.stringify(stripMeta(calc))}\nremote=${JSON.stringify(remoteOut)}`);
  t("A4 project not mutated", JSON.stringify(proj) === projBefore);
  t("A5 material not mutated", JSON.stringify(mat) === matBefore);
  t("A6 meta flags on clean calc", calc.__held === false && calc.pricingUnavailable === false && Array.isArray(calc.issues));
  t("A7 sane bricks count", calc.calculated_bricks === Math.ceil((6 + 9) * 2 * 5 * 1 * 1.1), String(calc.calculated_bricks));
  t("A8 sane total", Number.isFinite(calc.total_cost) && calc.total_cost > 0);
}

// ---------- B. strict parsers ----------
{
  const N = avail.brickNumber;
  t("B1 accepts number", N(5) === 5 && N(-2.5) === -2.5);
  t("B2 accepts numeric string", N(" 5 ") === 5 && N("2.5") === 2.5);
  t("B3 accepts 0", N(0) === 0 && N("0") === 0);
  t("B4 rejects blank", N("") === null && N("   ") === null);
  t("B5 rejects nullish", N(null) === null && N(undefined) === null);
  t("B6 rejects malformed", N("abc") === null && N("1/2") === null && N({}) === null && N([]) === null);
  t("B7 rejects NaN/Infinity", N(NaN) === null && N(Infinity) === null && N(-Infinity) === null);
  t("B8 rejects hex/octal", N("0x10") === null && N("0o17") === null);
  t("B9 accepts exponent + decimal", N("1e3") === 1000 && N(".5") === 0.5 && N("+3") === 3);

  const NN = avail.brickNonNegativeNumber;
  t("B10 nonnegative accepts 0+", NN(0) === 0 && NN(5) === 5);
  t("B11 nonnegative rejects neg/junk", NN(-0.01) === null && NN("x") === null && NN(null) === null);
  const NP = avail.brickPositiveNumber;
  t("B12 positive accepts >0", NP(0.5) === 0.5 && NP(40) === 40);
  t("B13 positive rejects 0/neg/junk", NP(0) === null && NP(-1) === null && NP("") === null);

  const R = avail.brickRecorded;
  t("B14 recorded: value present", R(0) === true && R("") === true && R("x") === true && R(false) === true);
  t("B15 recorded: absent", R(undefined) === false && R(null) === false);
}

// ---------- C. material (catalog) scanner ----------
{
  const M = avail.brickMaterialIssues;
  t("C1 clean → none", M(PROJECT(), MATERIAL()).length === 0);
  {
    const iss = M({ ...PROJECT(), selected_material_id: undefined }, MATERIAL());
    t("C2 no material selected → brick_material_unavailable",
      iss.length === 1 && iss[0].kind === "brick_catalog" && iss[0].field === "selected_material_id"
        && iss[0].code === "brick_material_unavailable" && iss[0].hold === "project", JSON.stringify(iss));
  }
  {
    const iss = M({ ...PROJECT(), selected_material_id: "" }, MATERIAL());
    t("C3 blank selected id → same issue", iss.length === 1 && iss[0].field === "selected_material_id");
  }
  {
    const iss = M({ ...PROJECT(), selected_material_id: "mat-gone" }, null);
    t("C4 dangling id → unavailable + inventoryId",
      iss.length === 1 && iss[0].code === "brick_material_unavailable" && iss[0].inventoryId === "mat-gone", JSON.stringify(iss));
  }
  for (const [field, val] of [["length", undefined], ["length", 0], ["length", -1], ["length", "abc"], ["width", ""], ["width", null], ["height", "big"]]) {
    const iss = M(PROJECT(), { ...MATERIAL(), [field]: val });
    t(`C5 material ${field}=${JSON.stringify(val)} → dimension issue`,
      iss.some(i => i.field === field && i.code === "brick_material_dimension_unavailable" && i.kind === "brick_catalog" && i.inventoryId === "mat-1"),
      JSON.stringify(iss));
  }
  {
    const iss = M(PROJECT(), { ...MATERIAL(), cost_per_unit: undefined });
    t("C6 missing cost_per_unit → price issue", iss.some(i => i.field === "cost_per_unit" && i.code === "brick_material_price_unavailable"));
    t("C7 explicit-0 cost_per_unit → ok", M(PROJECT(), { ...MATERIAL(), cost_per_unit: 0 }).length === 0);
    t("C8 negative cost_per_unit → flagged", M(PROJECT(), { ...MATERIAL(), cost_per_unit: -5 }).some(i => i.field === "cost_per_unit"));
    t("C9 junk cost_per_unit → flagged", M(PROJECT(), { ...MATERIAL(), cost_per_unit: "free" }).some(i => i.field === "cost_per_unit"));
  }
}

// ---------- D. project-field scanner ----------
{
  const P = avail.brickProjectInputIssues;
  t("D1 clean → none", P(PROJECT()).length === 0, JSON.stringify(P(PROJECT())));

  // Required geometry — absent is the display-hint divergence defect.
  for (const field of ["bricks_along_length", "bricks_along_width"]) {
    const iss = P({ ...PROJECT(), [field]: undefined });
    t(`D2 absent ${field} → dimension issue`, iss.some(i => i.field === field && i.code === "brick_dimension_unavailable" && i.hold === "project"), JSON.stringify(iss));
    t(`D3 zero ${field} → allowed (flat side)`, !P({ ...PROJECT(), [field]: 0 }).some(i => i.field === field), JSON.stringify(P({ ...PROJECT(), [field]: 0 })));
    t(`D4 malformed ${field} → flagged`, P({ ...PROJECT(), [field]: "abc" }).some(i => i.field === field));
    t(`D5 negative ${field} → flagged`, P({ ...PROJECT(), [field]: -1 }).some(i => i.field === field));
    t(`D6 blank ${field} → flagged`, P({ ...PROJECT(), [field]: "" }).some(i => i.field === field));
    t(`D7 null ${field} → flagged`, P({ ...PROJECT(), [field]: null }).some(i => i.field === field));
  }
  {
    const iss = P({ ...PROJECT(), bricks_along_length: 0, bricks_along_width: 0 });
    t("D8 0x0 extent → wall extent issue", iss.some(i => i.code === "brick_wall_extent_unavailable" && i.field === "bricks_along_length"), JSON.stringify(iss));
    t("D9 flat side alone → no extent issue", !P({ ...PROJECT(), bricks_along_length: 0 }).some(i => i.code === "brick_wall_extent_unavailable"));
  }

  // courses_high — absent (hint divergence) or non-positive.
  t("D10 absent courses → issue", P({ ...PROJECT(), courses_high: undefined }).some(i => i.field === "courses_high" && i.code === "brick_courses_unavailable"));
  t("D11 zero courses → issue", P({ ...PROJECT(), courses_high: 0 }).some(i => i.field === "courses_high"));
  t("D12 junk courses → issue", P({ ...PROJECT(), courses_high: "five" }).some(i => i.field === "courses_high"));
  t("D13 negative courses → issue", P({ ...PROJECT(), courses_high: -2 }).some(i => i.field === "courses_high"));

  // layers — absent ok (default 1), <1 or malformed flagged.
  t("D14 absent layers → ok", P({ ...PROJECT(), layers: undefined }).length === 0);
  t("D15 zero layers → issue", P({ ...PROJECT(), layers: 0 }).some(i => i.field === "layers" && i.code === "brick_layers_unavailable"));
  t("D16 sub-1 layers → issue", P({ ...PROJECT(), layers: 0.5 }).some(i => i.field === "layers"));
  t("D17 junk layers → issue", P({ ...PROJECT(), layers: "x" }).some(i => i.field === "layers"));
  t("D18 layers 2 → ok", P({ ...PROJECT(), layers: 2 }).length === 0);
  t("D19 layers 1.5 → ok (authored)", P({ ...PROJECT(), layers: 1.5 }).length === 0);

  // mortar_gap — absent ok, malformed/negative flagged, 0 allowed.
  t("D20 absent mortar_gap → ok", P({ ...PROJECT(), mortar_gap: undefined }).length === 0);
  t("D21 junk mortar_gap → issue", P({ ...PROJECT(), mortar_gap: "abc" }).some(i => i.field === "mortar_gap" && i.code === "brick_mortar_gap_unavailable"));
  t("D22 negative mortar_gap → issue", P({ ...PROJECT(), mortar_gap: -0.1 }).some(i => i.field === "mortar_gap"));
  t("D23 zero mortar_gap → ok", P({ ...PROJECT(), mortar_gap: 0 }).length === 0);
  t("D24 blank mortar_gap → issue", P({ ...PROJECT(), mortar_gap: "" }).some(i => i.field === "mortar_gap"));

  // waste_factor — absent ok, <=0 or malformed flagged (the silent-$0 class).
  t("D25 absent waste_factor → ok", P({ ...PROJECT(), waste_factor: undefined }).length === 0);
  t("D26 zero waste_factor → issue", P({ ...PROJECT(), waste_factor: 0 }).some(i => i.field === "waste_factor" && i.code === "brick_waste_factor_unavailable"));
  t("D27 negative waste_factor → issue", P({ ...PROJECT(), waste_factor: -1 }).some(i => i.field === "waste_factor"));
  t("D28 junk waste_factor → issue", P({ ...PROJECT(), waste_factor: "lots" }).some(i => i.field === "waste_factor"));
  t("D29 waste_factor 1 → ok", P({ ...PROJECT(), waste_factor: 1 }).length === 0);

  // mortar_bag_cost — absent ok, malformed flagged, 0 allowed.
  t("D30 absent bag cost → ok", P({ ...PROJECT(), mortar_bag_cost: undefined }).length === 0);
  t("D31 junk bag cost → issue", P({ ...PROJECT(), mortar_bag_cost: "free" }).some(i => i.field === "mortar_bag_cost" && i.code === "brick_mortar_cost_unavailable"));
  t("D32 zero bag cost → ok", P({ ...PROJECT(), mortar_bag_cost: 0 }).length === 0);
  t("D33 negative bag cost → issue", P({ ...PROJECT(), mortar_bag_cost: -3 }).some(i => i.field === "mortar_bag_cost"));

  // bricks_per_hour — absent ok, <1 or malformed flagged (clamp explosion).
  t("D34 absent bph → ok", P({ ...PROJECT(), bricks_per_hour: undefined }).length === 0);
  t("D35 zero bph → issue", P({ ...PROJECT(), bricks_per_hour: 0 }).some(i => i.field === "bricks_per_hour" && i.code === "brick_lay_rate_unavailable"));
  t("D36 fractional bph <1 → issue", P({ ...PROJECT(), bricks_per_hour: 0.5 }).some(i => i.field === "bricks_per_hour"));
  t("D37 junk bph → issue", P({ ...PROJECT(), bricks_per_hour: "fast" }).some(i => i.field === "bricks_per_hour"));
  t("D38 bph 40 → ok", P({ ...PROJECT(), bricks_per_hour: 40 }).length === 0);

  // labor_rate_per_hour — absent ok, malformed/negative flagged, 0 allowed.
  t("D39 absent labor rate → ok", P({ ...PROJECT(), labor_rate_per_hour: undefined }).length === 0);
  t("D40 junk labor rate → issue", P({ ...PROJECT(), labor_rate_per_hour: "free" }).some(i => i.field === "labor_rate_per_hour" && i.code === "brick_labor_rate_unavailable"));
  t("D41 zero labor rate → ok", P({ ...PROJECT(), labor_rate_per_hour: 0 }).length === 0);
  t("D42 negative labor rate → issue", P({ ...PROJECT(), labor_rate_per_hour: -55 }).some(i => i.field === "labor_rate_per_hour"));

  // markup_percent — absent ok, malformed/negative flagged, 0 allowed.
  t("D43 absent markup → ok", P({ ...PROJECT(), markup_percent: undefined }).length === 0);
  t("D44 junk markup → issue", P({ ...PROJECT(), markup_percent: "abc" }).some(i => i.field === "markup_percent" && i.code === "brick_markup_unavailable"));
  t("D45 negative markup → issue", P({ ...PROJECT(), markup_percent: -10 }).some(i => i.field === "markup_percent"));
  t("D46 zero markup → ok", P({ ...PROJECT(), markup_percent: 0 }).length === 0);
}

// ---------- E. held semantics ----------
const DERIVED = ["calculated_bricks", "bricks_per_course", "derived_length", "derived_width",
  "derived_height", "calculated_surface_area", "mortar_bags_needed", "material_cost",
  "mortar_cost", "labor_hours", "labor_cost", "subtotal", "markup_amount", "total_cost"];
{
  const proj = { ...PROJECT(), mortar_bag_cost: "free" };
  const before = JSON.stringify(proj);
  const { calc, issues, held } = avail.calcBrickStoneAvailability(proj, MATERIAL());
  t("E1 held=true", held === true);
  t("E2 pricingUnavailable+__held", calc.pricingUnavailable === true && calc.__held === true);
  t("E3 issues recorded on calc", calc.issues.length === issues.length && issues.length > 0);
  t("E4 all derived null", DERIVED.every(f => calc[f] === null), JSON.stringify(calc));
  t("E5 raw project untouched", JSON.stringify(proj) === before);
  t("E6 issue kind brick (authored)", issues.every(i => i.kind === "brick" && i.hold === "project"));
}
{
  const { calc, issues, held } = avail.calcBrickStoneAvailability(PROJECT(), { ...MATERIAL(), cost_per_unit: undefined });
  t("E7 catalog hold → held", held === true && calc.pricingUnavailable === true);
  t("E8 catalog issue kind", issues.every(i => i.kind === "brick_catalog"));
  t("E9 catalog hold → all derived null", DERIVED.every(f => calc[f] === null));
}
{
  const { calc, issues } = avail.calcBrickStoneAvailability({ ...PROJECT(), selected_material_id: undefined }, null);
  t("E10 no material → held + select-material issue", issues.some(i => i.field === "selected_material_id") && DERIVED.every(f => calc[f] === null));
}

// ---------- F. explicit-zero legitimacy + byte-parity ----------
// Remote num() already honors 0 — these must be byte-identical AND unheld.
for (const [name, mutate] of [
  ["markup_percent 0", (p) => { p.markup_percent = 0; }],
  ["mortar_bag_cost 0", (p) => { p.mortar_bag_cost = 0; }],
  ["labor_rate_per_hour 0", (p) => { p.labor_rate_per_hour = 0; }],
  ["mortar_gap 0", (p) => { p.mortar_gap = 0; }],
  ["bricks_along_width 0 (flat wall)", (p) => { p.bricks_along_width = 0; }],
  ["material cost_per_unit 0", (p, m) => { m.cost_per_unit = 0; }],
]) {
  const proj = PROJECT(); const mat = MATERIAL();
  mutate(proj, mat);
  const remoteOut = remote.calcBrickStoneProject(JSON.parse(JSON.stringify(proj)), JSON.parse(JSON.stringify(mat)));
  const { calc, issues, held } = avail.calcBrickStoneAvailability(proj, mat);
  t(`F honored-0 ${name} → no issues`, issues.length === 0, JSON.stringify(issues));
  t(`F honored-0 ${name} → byte-identical to remote`, JSON.stringify(stripMeta(calc)) === JSON.stringify(remoteOut),
    `cand=${JSON.stringify(stripMeta(calc)).slice(0, 300)} remote=${JSON.stringify(remoteOut).slice(0, 300)}`);
}

// F-parity on a record relying on absent defaults (legacy-converted draft
// shape with only the required geometry recorded).
{
  const proj = { selected_material_id: "mat-1", bricks_along_length: 4, bricks_along_width: 0, courses_high: 3 };
  const remoteOut = remote.calcBrickStoneProject(JSON.parse(JSON.stringify(proj)), JSON.parse(JSON.stringify(MATERIAL())));
  const { calc, issues, held } = avail.calcBrickStoneAvailability(proj, MATERIAL());
  t("F7 sparse draft → no issues", issues.length === 0, JSON.stringify(issues));
  t("F8 sparse draft → byte-identical", JSON.stringify(stripMeta(calc)) === JSON.stringify(remoteOut));
}

// ---------- G. UI helpers ----------
{
  const H = avail.hasBrickCostSnapshot;
  t("G1 snapshot finite", H(5) === true && H(0) === true && H(-2.5) === true);
  t("G2 snapshot rejects non-numbers", H("5") === false && H(null) === false && H(undefined) === false && H(NaN) === false);
  const D = avail.brickDraftValue;
  t("G3 draft preserves blank", D("") === "");
  t("G4 draft parses numeric", D("5") === 5 && D(" 2.5 ") === 2.5 && D("-1") === -1);
  t("G5 draft keeps junk raw", D("abc") === "abc" && D("1/2") === "1/2");
  const iss = avail.brickProjectInputIssues({ ...PROJECT(), waste_factor: 0, markup_percent: "x" });
  t("G6 issuesForField", avail.issuesForField(iss, "waste_factor").length === 1 && avail.issuesForField(iss, "nope").length === 0);
  t("G7 hasIssueFor", avail.hasIssueFor(iss, "markup_percent") === true && avail.hasIssueFor(iss, "mortar_gap") === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS brick-model");
