// O-008 / CMP-A08 verification harness — runs the CANDIDATE boundary module and
// the real candidate calculators (bundled from testtree/) against the verbatim
// REMOTE parser implementations inlined below. No Base44 writes; pure Node.

import { build } from "esbuild";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "testtree", "src");
const OUT = path.join(HERE, ".bundle");
mkdirSync(OUT, { recursive: true });

// '@/x' → testtree/src/x (Base44 alias); everything else resolves normally.
const alias = {
  name: "base44-alias",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const base = path.join(SRC, args.path.slice(2));
      for (const ext of ["", ".js", ".jsx"]) {
        if (existsSync(base + ext)) return { path: base + ext };
      }
      return { path: base }; // let esbuild report the miss
    });
  },
};

const bundle = async (entry, name) => {
  const res = await build({
    entryPoints: [path.join(SRC, entry)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    plugins: [alias],
    logLevel: "silent",
  });
  const file = path.join(OUT, name);
  writeFileSync(file, res.outputFiles[0].text);
  return file;
};

const mod = async (entry, name) => import(pathToFileURL(await bundle(entry, name)).href);

const B = await mod("components/masterInventory/inventoryNormalization.js", "boundary.mjs");
const wallCalc = await mod("components/estimator/foundation/wallCalculator.js", "wall.mjs");
const poleCalc = await mod("components/estimator/foundation/poleCalculator.js", "pole.mjs");
const capCalc = await mod("components/estimator/foundation/wallCapCalculator.js", "cap.mjs");
const landscape = await mod("components/estimator/foundation/landscapeMaterials.js", "landscape.mjs");
const validation = await mod("components/estimator/foundation/foundationInputValidation.js", "validation.mjs");
const legacy = await mod("components/estimator/foundation/legacyFoundationCalc.js", "legacy.mjs");
const calc = await mod("components/estimator/foundation/foundationCalc.js", "calc.mjs");

let pass = 0, fail = 0;
const eq = (a, b) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => {
  if (eq(got, want)) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// ─── Verbatim REMOTE parsers (source of truth for parity) ───────────────────

const supplierPriceNumber = (value) => { // legacyFoundationCalc.js
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const inputNumber = (value) => { // foundationInputValidation.js / wallCapInputNumber
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const positiveWholeNumber = (value) => {
  const number = inputNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};
const wallDimensionNumber = (value) => { // = poleDimensionNumber = equipmentPositiveNumber
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const poleOffsetNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const catalogNumberInput = (value) => (String(value).trim() === "" ? null
  : Number.isFinite(Number(value)) ? Number(value) : value);
const equipmentInputValue = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;
const wallSettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;

// ─── Matrix: zero / blank / malformed / edge values ─────────────────────────

const MATRIX = [
  0, "0", "0.0", "0.", ".0", "-0", 5, "5", "5.5", ".5", "+4", "007",
  -3, "-3.5", "+.5", "-0.5",
  "12abc", "abc", "", " ", "  ", "e3", ".e3", "1,000", "0x10", "1_000", "N/A",
  "1e3", "1E3", "1e-3", "+1e3", "-1e3", "2e0", "1.5e2",
  NaN, Infinity, -Infinity, null, undefined, true, false, [], {}, () => 3,
  " 5 ", " 0 ", "\t3\n",
];

for (const v of MATRIX) {
  const tag = JSON.stringify(v) ?? String(v);
  check(`finiteNumber(${tag})`, B.inventoryFiniteNumber(v), inputNumber(v));
  check(`nonnegativeNumber(${tag})`, B.inventoryNonnegativeNumber(v), supplierPriceNumber(v));
  check(`positiveNumber(${tag})`, B.inventoryPositiveNumber(v), wallDimensionNumber(v));
  check(`nonnegativeMeasurement(${tag})`, B.inventoryNonnegativeMeasurement(v), poleOffsetNumber(v));
  check(`isPositiveWhole(${tag})`, B.inventoryIsPositiveWhole(v), positiveWholeNumber(v));
  check(`numberInput(${tag})`, B.inventoryNumberInput(v), catalogNumberInput(v));
  check(`draftInput(${tag})`, B.inventoryDraftInput(v), equipmentInputValue(v));
}
// wallCapInputNumber re-export == finite kernel (FoundationWallCapsPanel consumer)
for (const v of MATRIX) check(`wallCapInputNumber(${JSON.stringify(v)})`, capCalc.wallCapInputNumber(v), inputNumber(v));

// Settings picks: explicit 0 wins, falsy falls back, malformed → null after basis.
const SETTING_CASES = [[0, 5], ["0", 5], ["2.5", 5], [undefined, 5], [null, 5], ["", 5], ["abc", 5], ["12abc", 5], [false, 5], [-2, 5], ["-2", 5]];
for (const [v, fb] of SETTING_CASES) {
  check(`settingValue(${JSON.stringify(v)},${fb})`, B.inventorySettingValue(v, fb), wallSettingValue(v, fb));
  check(`settingNumber(${JSON.stringify(v)},${fb})`, B.inventorySettingNumber(v, fb), supplierPriceNumber(wallSettingValue(v, fb)));
  check(`positiveSettingNumber(${JSON.stringify(v)},${fb})`, B.inventoryPositiveSettingNumber(v, fb), wallDimensionNumber(wallSettingValue(v, fb)));
}
// The two must-keep semantics, pinned explicitly:
check("price keeps explicit 0", B.inventoryNonnegativeNumber(0), 0);
check("price keeps explicit '0'", B.inventoryNonnegativeNumber("0"), 0);
check("blank → null not 0", B.inventoryNonnegativeNumber(""), null);
check("malformed → null not 0", B.inventoryNonnegativeNumber("12abc"), null);
check("negative → null not 0", B.inventoryNonnegativeNumber(-3), null);
check("numberInput blank → null", B.inventoryNumberInput(""), null);
check("numberInput '12abc' verbatim", B.inventoryNumberInput("12abc"), "12abc");
check("numberInput '  ' → null (hardened vs minted 0)", B.inventoryNumberInput("  "), null);
check("draftInput blank stays ''", B.inventoryDraftInput(""), "");
check("draftInput 'x' verbatim", B.inventoryDraftInput("x"), "x");

// ─── Field-name / unit canonicalization ─────────────────────────────────────

const N = B.normalizeFoundationInventoryRow;

// Legacy brick_stone dims → canonical wall_unit_* (same authored fields kept).
{
  const r = N({ material_type: "brick_stone", brick_length_inches: 8, brick_width_inches: 4, brick_height_inches: 2.25 });
  check("brick→wall_unit L", r.wall_unit_length_inches, 8);
  check("brick→wall_unit W", r.wall_unit_width_inches, 4);
  check("brick→wall_unit H", r.wall_unit_height_inches, 2.25);
  check("brick authored kept", r.brick_length_inches, 8);
  check("brick type unchanged", r.material_type, "brick_stone");
}
// Explicit authored canonical value wins — even an authored null (cleared field).
check("canonical wins over legacy", N({ wall_unit_length_inches: 16, brick_length_inches: 8 }).wall_unit_length_inches, 16);
check("canonical null wins over legacy", N({ wall_unit_length_inches: null, brick_length_inches: 8 }).wall_unit_length_inches, null);
// Legacy material_type alias: forming → forming_material.
check("forming→forming_material", N({ material_type: "forming" }).material_type, "forming_material");
check("forming_material stays", N({ material_type: "forming_material" }).material_type, "forming_material");
// Unit conversion: legacy inch-denominated pole stock → canonical feet.
check("inches→ft 240→20", N({ pole_stock_length_inches: 240 }).pole_stock_length_ft, 20);
check("inches→ft '300'→25", N({ pole_stock_length_inches: "300" }).pole_stock_length_ft, 25);
check("ft canonical wins", N({ pole_stock_length_ft: 20, pole_stock_length_inches: 120 }).pole_stock_length_ft, 20);
check("malformed inches → no mint", N({ pole_stock_length_inches: "abc" }).pole_stock_length_ft, undefined);
check("0 inches → no mint (not positive)", N({ pole_stock_length_inches: 0 }).pole_stock_length_ft, undefined);
check("negative inches → no mint", N({ pole_stock_length_inches: -120 }).pole_stock_length_ft, undefined);
// Pass-through: non-rows and unrelated rows untouched.
check("null passthrough", N(null), null);
check("array passthrough", N([1, 2]), [1, 2]);
check("unrelated row untouched", N({ material_type: "rebar", rebar_size: "#4" }).pole_stock_length_ft, undefined);
// Input row never mutated.
{
  const src = { material_type: "brick_stone", brick_length_inches: 8 };
  N(src);
  check("authored row not mutated", Object.keys(src).includes("wall_unit_length_inches"), false);
}
// Array entry point + idempotency.
{
  const rows = [{ material_type: "forming" }, { brick_length_inches: 8 }, null];
  const once = B.normalizeFoundationInventoryRows(rows);
  check("rows array len", once.length, 3);
  check("rows[0] canonicalized", once[0].material_type, "forming_material");
  check("rows[1] field alias", once[1].wall_unit_length_inches, 8);
  const twice = B.normalizeFoundationInventoryRows(once);
  check("idempotent", twice, once);
  check("non-array passthrough", B.normalizeFoundationInventoryRows("x"), "x");
}

// ─── Concrete supplier cross-entity adaptation (verbatim contract) ──────────

{
  const s = B.normalizeConcreteSupplier({
    id: "sup1", service_name: "ACME Redi-Mix", description: "d", vendor_name: "ACME",
    default_rate: 150, minimum_order_yards: 1, below_minimum_cost_per_cy: 25, minimum_charge: 300,
    mix_3500_price: 0, mix_4000_price: 155, fuel_surcharge: 15,
  });
  check("supplier material_type", s.material_type, "concrete_service");
  check("supplier cost_per_unit", s.cost_per_unit, 150);
  check("supplier explicit-0 mix kept", s.mix_3500_price, 0);
  check("supplier missing mix → null", s.mix_5000_price, null);
  check("supplier fuel surcharge", s.fuel_surcharge, 15);
  check("supplier show default", s.show_in_foundation, true);
  // Re-export parity — each bundle inlines its own module copy, so compare
  // output, not identity.
  const row0 = { id: "sup1", service_name: "ACME Redi-Mix", description: "d", vendor_name: "ACME", default_rate: 150, minimum_order_yards: 1, below_minimum_cost_per_cy: 25, minimum_charge: 300, mix_3500_price: 0, mix_4000_price: 155, fuel_surcharge: 15 };
  check("supplier re-export parity", JSON.stringify(legacy.normalizeConcreteSupplier(row0)), JSON.stringify(B.normalizeConcreteSupplier(row0)));
  const s2 = B.normalizeConcreteSupplier({ id: "s2", service_name: "NoRate" });
  check("supplier missing rate → ported 0", s2.cost_per_unit, 0);
}

// ─── Real-surface consumer parity ───────────────────────────────────────────

// calcWalls: a legacy brick_stone row only becomes priceable after the boundary.
{
  const project = {
    walls: [{
      shape: { points: [{ x: 0, z: 0 }, { x: 120, z: 0 }], closed: false, segments: [{ length: 120 }] },
      materialId: "wall1", heightInches: 24, includeInternalWall: false,
    }],
  };
  const legacyRow = { id: "wall1", material_type: "brick_stone",
    brick_length_inches: 8, brick_width_inches: 4, brick_height_inches: 2.25,
    cost_per_unit: 0.75, material_name: "Old Brick" };
  const raw = wallCalc.calcWalls(project, [legacyRow], {});
  const norm = wallCalc.calcWalls(project, B.normalizeFoundationInventoryRows([legacyRow]), {});
  const rawIssue = JSON.stringify(raw.wallPricing?.[0]?.issues || raw);
  check("legacy brick held before boundary", /wall_unit_\w+_unavailable/.test(rawIssue), true);
  const nPriced = norm.walls?.[0]?.calculatedCosts;
  check("legacy brick priced after boundary", Number.isFinite(nPriced?.materialCost) && nPriced.materialCost > 0, true);
}

// calcPoles (stock_price mode): pieces = ceil(totalInches / stockLengthInches).
// A legacy inch-authored stock row converts to the canonical feet field.
{
  const projectPoles = [{ pole_id: "p1", height_inches: 240, y_offset_inches: 0, pole_shape: "square" }];
  const mkRow = (inches) => ({ id: "p1", material_type: "pole", pole_width_inches: 4,
    pole_stock_length_inches: inches, pole_stock_price: 50, pole_pricing_mode: "stock_price",
    material_name: "Steel Pole" });
  const rawP = poleCalc.calcPoles(projectPoles, [mkRow(240)], {});   // canonical absent → 20ft default → 1 pc → $50
  const normP = poleCalc.calcPoles(projectPoles, B.normalizeFoundationInventoryRows([mkRow(240)]), {}); // 240in→20ft → 1 pc → $50
  check("240in converts to 20ft parity", normP.poles?.[0]?.total_cost, rawP.poles?.[0]?.total_cost);
  check("240in parity value", normP.poles?.[0]?.total_cost, 50);
  const normP2 = poleCalc.calcPoles(projectPoles, B.normalizeFoundationInventoryRows([mkRow(120)]), {}); // 120in→10ft → 2 pc → $100
  check("120in converts to 10ft (2 pieces)", normP2.poles?.[0]?.total_cost, 100);
  check("120in ≠ 20ft default", normP2.poles?.[0]?.total_cost !== rawP.poles?.[0]?.total_cost, true);
}

// calcProject ingress: RAW legacy rows normalize inside — wall prices without
// the caller touching the boundary (the whole point of the ingress contract).
{
  const project = {
    items: [], poles: [], selected_equipment: [], wall_caps: [],
    walls: [{
      shape: { points: [{ x: 0, z: 0 }, { x: 120, z: 0 }], closed: false, segments: [{ length: 120 }] },
      materialId: "wall1", heightInches: 24, includeInternalWall: false,
    }],
  };
  const rawInv = [{ id: "wall1", material_type: "brick_stone",
    brick_length_inches: 8, brick_width_inches: 4, brick_height_inches: 2.25,
    cost_per_unit: 0.75 }];
  const res = calc.calcProject(project, rawInv, {}, { savedProject: null });
  const wallCost = res.walls?.[0]?.calculatedCosts?.materialCost;
  check("calcProject ingress: legacy brick priced", Number.isFinite(wallCost) && wallCost > 0, true);
  check("calcProject ingress: no brick_unavailable catalog issue",
    res.catalogIssues.filter(i => /wall_unit/i.test(i.field || "")).length, 0);
  check("calcProject totals finite", Number.isFinite(res.totals.total_wall_cost) || res.totals.total_wall_cost === null, true);
}

// calcItem parity spot-check: a well-formed item produces identical numbers
// whether inventory arrives raw (already canonical) or double-normalized.
{
  const item = {
    component_id: "it1", foundation_type: "spread_foot", quantity: 1,
    length_inches: 24, width_inches: 24, depth_inches: 12,
    selected_concrete_id: "conc1", concrete_type: "bagged", rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
  };
  const project = { items: [item], poles: [], walls: [], selected_equipment: [], wall_caps: [] };
  const inv = [{ id: "conc1", material_type: "bagged_concrete", cost_per_unit: 5, minimum_cost: 0, show_in_foundation: true },
               { id: "r1", material_type: "rebar", rebar_size: "#4", cost_per_unit: 0.5 }];
  const a = calc.calcProject(project, inv, {}, { savedProject: null });
  const b = calc.calcProject(project, B.normalizeFoundationInventoryRows(inv), {}, { savedProject: null });
  check("calcProject parity canonical rows", JSON.stringify(a.totals), JSON.stringify(b.totals));
}

// FoundationItemCard nullSet path — whitespace draft now clears to null
// (minted-0 hardening); parity matrix above already covers ' ' → null.

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} inventory-normalization — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
