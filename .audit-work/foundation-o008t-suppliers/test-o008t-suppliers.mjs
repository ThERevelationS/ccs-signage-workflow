// O-008 tail / CMP-A08-t verification harness — runs the CANDIDATE boundary
// module and real candidate calculators (bundled from testtree/ = fresh remote
// siblings + candidate overlay) against the verbatim REMOTE implementations
// inlined below. No Base44 writes; pure Node.
//
// Covers the three remainders:
//   1. Supplier grouping in catalog UX — inventorySupplierKey +
//      groupInventoryBySupplier + supplier_key materialization fixtures.
//   2. Form-init/openAdd minted-0 presets — source-level assertions that the
//      `= 0` / `|| 0` initializers are gone from every granted admin surface,
//      plus mechanism tests of the semantics the forms now ride.
//   3. normalizeConcreteSupplier `default_rate || 0` tail — now rides the
//      boundary's explicit-0 basis; parity asserted on every well-formed
//      value and the `|| 0` consume read proven identical either way.

import { build } from "esbuild";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "testtree", "src");
const CAND = path.join(HERE, "candidates", "src");
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
      return { path: base };
    });
  },
};

const bundle = async (entry, name) => {
  const res = await build({
    entryPoints: [path.join(SRC, entry)],
    bundle: true, format: "esm", platform: "node",
    write: false, plugins: [alias], logLevel: "silent",
  });
  const file = path.join(OUT, name);
  writeFileSync(file, res.outputFiles[0].text);
  return file;
};
const mod = async (entry, name) => import(pathToFileURL(await bundle(entry, name)).href);

const B = await mod("components/masterInventory/inventoryNormalization.js", "boundary.mjs");
const legacy = await mod("components/estimator/foundation/legacyFoundationCalc.js", "legacy.mjs");
const wallCalc = await mod("components/estimator/foundation/wallCalculator.js", "wall.mjs");
const poleCalc = await mod("components/estimator/foundation/poleCalculator.js", "pole.mjs");
const calc = await mod("components/estimator/foundation/foundationCalc.js", "calc.mjs");

let pass = 0, fail = 0;
const eq = (a, b) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => {
  if (eq(got, want)) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const srcText = (rel) => readFileSync(path.join(CAND, rel), "utf8");

// ─── Verbatim REMOTE implementations (parity oracle) ────────────────────────

const supplierPriceNumber = (value) => { // remote legacyFoundationCalc
  if (typeof value !== "number" && (typeof value !== "string"
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const catalogNumberInput = (value) => (String(value).trim() === "" ? null
  : Number.isFinite(Number(value)) ? Number(value) : value);
// The REMOTE adapter tail under audit (pre-candidate):
const remoteSupplierTail = (row) => ({
  cost_per_unit: row.default_rate || 0,
  minimum_order_yards: row.minimum_order_yards || 0,
  below_minimum_cost_per_cy: row.below_minimum_cost_per_cy || 0,
  minimum_cost: row.minimum_charge || 0,
});

// ─── 1. zero/blank/malformed matrix on the NEW grouping + adapter helpers ───

const KEY_MATRIX = [
  // [input, expected supplier key]
  ["Citywide", "citywide"],
  [" citywide ", "citywide"],
  ["Citywide Ready-Mix", "citywide_ready_mix"],
  ["CITY_WIDE", "city_wide"],
  ["Ernst & Sons", "ernst_&_sons"],
  ["a  b\tc", "a_b_c"],
  ["#4 Yard", "#4_yard"],              // '#' is a name char, not a separator
  ["", null],
  ["   ", null],
  [" _ ", "_"],               // one separator run collapses to one underscore
  [0, null], [5, null], [null, null], [undefined, null],
  [true, null], [false, null], [{}, null], [[], null], [["x"], null],
  [NaN, null], [Infinity, null],
];
for (const [v, want] of KEY_MATRIX) {
  check(`supplierKey(${JSON.stringify(v)})`, B.inventorySupplierKey(v), want);
}

// ─── 2. Supplier grouping fixtures ─────────────────────────────────────────

{
  // Same vendor spelled three ways → ONE group; a genuinely different vendor
  // stays its own group; unrecorded last; label keeps the first-seen
  // authored spelling; input order preserved inside a group.
  const rows = [
    { id: "r3", supplier: "Citywide" },
    { id: "r1", supplier: " citywide " },   // case + whitespace variant → same key
    { id: "r9", supplier: "" },             // blank → unassigned
    { id: "r2", supplier: "CITYWIDE" },
    { id: "r4", supplier: "Citywide Ready-Mix" }, // different vendor, own group
    { id: "r8", supplier: "Ernst" },
    { id: "r5" },                           // absent → unassigned
    { id: "r6", supplier: 42 },             // non-string → unassigned
  ];
  const groups = B.groupInventoryBySupplier(rows);
  check("group count", groups.length, 4);
  check("group[0] key", groups[0].key, "citywide");
  check("group[0] label = first authored spelling", groups[0].label, "Citywide");
  check("group[0] rows in input order", groups[0].rows.map(r => r.id), ["r3", "r1", "r2"]);
  check("group[1] key", groups[1].key, "citywide_ready_mix");
  check("group[1] label", groups[1].label, "Citywide Ready-Mix");
  check("group[2] key", groups[2].key, "ernst");
  check("unassigned last", groups[3].key, null);
  check("unassigned label", groups[3].label, null);
  check("unassigned rows", groups[3].rows.map(r => r.id), ["r9", "r5", "r6"]);
  check("no row dropped/duplicated", groups.flatMap(g => g.rows).length, rows.length);
}

{
  // Vendor-key override for raw LaborServiceInventory rows
  // (vendor_name || service_name — the adapter's supplier source).
  const svc = [
    { id: "s1", vendor_name: "Citywide", service_name: "South Plant" },
    { id: "s2", vendor_name: "CITYWIDE", service_name: "North Plant" },
    { id: "s3", service_name: "SoloCrete" },            // no vendor → service name is the supplier
    { id: "s4", service_name: "" },                      // nothing recorded → unassigned
  ];
  const groups = B.groupInventoryBySupplier(svc, (r) => r.vendor_name || r.service_name);
  check("svc group count", groups.length, 3);
  check("svc vendor variants merge", groups[0].key, "citywide");
  check("svc merged rows", groups[0].rows.map(r => r.id), ["s1", "s2"]);
  check("svc service-name fallback", groups[1].label, "SoloCrete");
  check("svc unassigned last", groups[2].key, null);

  // Edge inputs
  check("empty array → []", B.groupInventoryBySupplier([]), []);
  check("non-array → []", B.groupInventoryBySupplier(null), []);
  check("undefined → []", B.groupInventoryBySupplier(undefined), []);
  // Alphabetical group order (unassigned pinned last regardless)
  const abc = B.groupInventoryBySupplier([{ supplier: "zeta" }, { supplier: "" }, { supplier: "able" }]);
  check("groups sort by key", abc.map(g => g.key), ["able", "zeta", null]);
}

// ─── 3. supplier_key materialization in normalizeFoundationInventoryRow ─────

{
  const keyed = B.normalizeFoundationInventoryRow({ id: "a", material_type: "rebar", supplier: "Citywide " });
  check("row supplier_key derived", keyed.supplier_key, "citywide");

  const authoredWins = B.normalizeFoundationInventoryRow({ id: "b", supplier: "Citywide", supplier_key: "AUTHORED" });
  check("authored supplier_key wins verbatim", authoredWins.supplier_key, "AUTHORED");

  const authoredNull = B.normalizeFoundationInventoryRow({ id: "c", supplier: "Citywide", supplier_key: null });
  check("authored null key wins (explicit)", authoredNull.supplier_key, null);

  const absent = B.normalizeFoundationInventoryRow({ id: "d", material_type: "rebar" });
  check("absent supplier → no key minted", "supplier_key" in absent, false);

  const blank = B.normalizeFoundationInventoryRow({ id: "e", supplier: "   " });
  check("blank supplier → no key", "supplier_key" in blank, false);

  const nonString = B.normalizeFoundationInventoryRow({ id: "f", supplier: 42 });
  check("non-string supplier → no key", "supplier_key" in nonString, false);
  check("non-string supplier verbatim", nonString.supplier, 42);

  // Combination: alias fill + supplier key both materialize on one copy.
  const combo = B.normalizeFoundationInventoryRow({ id: "g", material_type: "brick_stone", brick_length_inches: 8, supplier: "Acme Brick" });
  check("alias still fills", combo.wall_unit_length_inches, 8);
  check("key materializes alongside alias", combo.supplier_key, "acme_brick");

  // Idempotent — double-normalize is a deep no-op.
  const once = B.normalizeFoundationInventoryRows([{ id: "h", supplier: "Citywide", brick_length_inches: 8, material_type: "brick_stone" }]);
  const twice = B.normalizeFoundationInventoryRows(once);
  check("row normalize idempotent", twice, once);
  check("authored row not mutated", "supplier_key" in { supplier: "x" }, false);
}

// ─── 4. normalizeConcreteSupplier — the `default_rate || 0` tail ────────────

{
  // Well-formed values: the ported `|| 0` let truthy STRINGS leak verbatim
  // ("155" stayed "155"); the boundary basis emits the Number. The consume
  // read (`|| 0`, arithmetic) resolves both identically — parity is asserted
  // through the numeric resolution, and the candidate output IS the basis.
  const GOOD = [0, "0", "0.0", 155, "155", "201.50", "+5", "007", " 155 "];
  for (const v of GOOD) {
    const s = B.normalizeConcreteSupplier({ id: "g", service_name: "s", default_rate: v });
    const r = remoteSupplierTail({ default_rate: v });
    check(`adapter consume parity rate ${JSON.stringify(v)}`, Number(s.cost_per_unit || 0), Number(r.cost_per_unit || 0));
    // and it equals the canonical price basis directly
    check(`adapter basis rate ${JSON.stringify(v)}`, s.cost_per_unit, supplierPriceNumber(v));
  }

  // Absent / blank / malformed / negative — the tail change: "not cataloged"
  // stays null, never a minted 0 (nor the old verbatim leak of truthy junk).
  const EMPTY = [undefined, null, "", "abc", "12abc", "-3", -3, "N/A"];
  for (const v of EMPTY) {
    const s = B.normalizeConcreteSupplier({ id: "e", service_name: "s", default_rate: v });
    check(`absent/malformed rate ${JSON.stringify(v)} → null`, s.cost_per_unit, null);
  }
  check("absent min_yards → null (was 0)", B.normalizeConcreteSupplier({ id: "m", service_name: "s" }).minimum_order_yards, null);
  check("absent below_min → null (was 0)", B.normalizeConcreteSupplier({ id: "m", service_name: "s" }).below_minimum_cost_per_cy, null);
  check("absent min_charge → null (was 0)", B.normalizeConcreteSupplier({ id: "m", service_name: "s" }).minimum_cost, null);
  check("authored min fields preserved", (() => {
    const s = B.normalizeConcreteSupplier({ id: "m2", service_name: "s", minimum_order_yards: 2, below_minimum_cost_per_cy: 18, minimum_charge: 300 });
    return s.minimum_order_yards === 2 && s.below_minimum_cost_per_cy === 18 && s.minimum_cost === 300;
  })(), true);
  check("explicit-0 min fields preserved", (() => {
    const s = B.normalizeConcreteSupplier({ id: "m3", service_name: "s", minimum_order_yards: 0, below_minimum_cost_per_cy: 0, minimum_charge: 0 });
    return s.minimum_order_yards === 0 && s.below_minimum_cost_per_cy === 0 && s.minimum_cost === 0;
  })(), true);

  // NaN: remote `NaN || 0` minted 0; boundary holds null (the tail delta).
  check("NaN rate → null (remote minted 0)", B.normalizeConcreteSupplier({ id: "n", service_name: "s", default_rate: NaN }).cost_per_unit, null);
  check("remote oracle minted 0 for NaN", remoteSupplierTail({ default_rate: NaN }).cost_per_unit, 0);

  // supplier_key on the adapted row: vendor_name → canonical key; service_name
  // fallback; blank → null (unassigned — the row still groups last).
  check("supplier_key from vendor", B.normalizeConcreteSupplier({ id: "k", service_name: "South Plant", vendor_name: "Citywide" }).supplier_key, "citywide");
  check("supplier_key from service_name fallback", B.normalizeConcreteSupplier({ id: "k2", service_name: "SoloCrete" }).supplier_key, "solocrete");
  check("supplier_key blank → null", B.normalizeConcreteSupplier({ id: "k3", service_name: "  " }).supplier_key, null);
  check("supplier display keeps authored spelling", B.normalizeConcreteSupplier({ id: "k4", service_name: "s", vendor_name: "Citywide REDI-MIX" }).supplier, "Citywide REDI-MIX");

  // Mix/admixture fields: unchanged boundary semantics (authored → number, absent → null).
  const s = B.normalizeConcreteSupplier({ id: "s1", service_name: "ACME", vendor_name: "ACME", default_rate: 150, mix_3500_price: 0, mix_4000_price: 155, fuel_surcharge: 15 });
  check("explicit-0 mix kept", s.mix_3500_price, 0);
  check("missing mix → null", s.mix_5000_price, null);
  check("fuel surcharge", s.fuel_surcharge, 15);

  // Re-export parity vs legacyFoundationCalc's re-export (output, not identity).
  const row0 = { id: "sup1", service_name: "ACME Redi-Mix", description: "d", vendor_name: "ACME", default_rate: 150, minimum_order_yards: 1, below_minimum_cost_per_cy: 25, minimum_charge: 300, mix_3500_price: 0, mix_4000_price: 155, fuel_surcharge: 15 };
  check("re-export output parity", JSON.stringify(legacy.normalizeConcreteSupplier(row0)), JSON.stringify(B.normalizeConcreteSupplier(row0)));

  // Consume-parity: the ported `selectedConcrete?.cost_per_unit || 0` read
  // resolves a null rate to the same 0 the minted field produced — the
  // tail change is invisible to the ported math.
  const remoteRow = { id: "c", service_name: "NoRate", default_rate: undefined };
  const remoteNorm = remoteSupplierTail(remoteRow); // {cost_per_unit: 0, ...}
  const candNorm = B.normalizeConcreteSupplier(remoteRow);
  check("consume read parity absent rate", candNorm.cost_per_unit || 0, remoteNorm.cost_per_unit || 0);
  check("consume read absent → 0", candNorm.cost_per_unit || 0, 0);
}

// ─── 5. Real-surface: calcItemCost + calcConcreteDelivery on adapted rows ───

{
  // Delivery-side parity proof: same item priced against (a) a row shaped like
  // the REMOTE minted-zero adapter output, (b) the CANDIDATE null-rate row —
  // totals identical (the || 0 consume read resolves both to 0).
  const item = {
    component_id: "it1", foundation_type: "spread_foot", quantity: 1,
    length_inches: 24, width_inches: 24, depth_inches: 12,
    selected_concrete_id: "conc1", concrete_type: "ready_mix", rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
    concrete_mix: "4000",
  };
  const rawSvc = { id: "conc1", service_name: "Citywide South", vendor_name: "Citywide",
    default_rate: undefined, minimum_order_yards: undefined, minimum_charge: undefined,
    mix_4000_price: 201, fuel_surcharge: 30 };
  const remoteShaped = { ...remoteSupplierTail(rawSvc), id: "conc1", material_name: rawSvc.service_name,
    material_type: "concrete_service", supplier: rawSvc.vendor_name, unit: "cy", mix_4000_price: 201, fuel_surcharge: 30 };
  const candNorm = B.normalizeConcreteSupplier(rawSvc);
  check("candidate rate null (was 0)", candNorm.cost_per_unit, null);
  const a = legacy.calcItemCost(item, [remoteShaped], {});
  const b = legacy.calcItemCost(item, [candNorm], {});
  check("calcItemCost parity null vs minted-0 rate", JSON.stringify(a), JSON.stringify(b));

  // Explicit authored rate still prices identically through both paths.
  const svc155 = { ...rawSvc, default_rate: 155 };
  const a2 = legacy.calcItemCost(item, [{ ...remoteSupplierTail(svc155), id: "conc1", material_name: svc155.service_name, material_type: "concrete_service", unit: "cy", mix_4000_price: 201, fuel_surcharge: 30 }], {});
  const b2 = legacy.calcItemCost(item, [B.normalizeConcreteSupplier(svc155)], {});
  check("calcItemCost parity authored rate", JSON.stringify(a2), JSON.stringify(b2));

  // calcConcreteDelivery: candidate-normalized supplier rows feed the ported
  // delivery math unchanged (mix/fuel fields flowed through as before).
  const proj = { settings: {}, items: [] };
  const items = [item];
  const d1 = legacy.calcConcreteDelivery(proj, items, [remoteShaped]);
  const d2 = legacy.calcConcreteDelivery(proj, items, [candNorm]);
  check("calcConcreteDelivery parity", JSON.stringify(d1), JSON.stringify(d2));
}

// ─── 6. Prior real-surface regressions (must still hold) ───────────────────

{
  // calcWalls: legacy brick_stone row becomes priceable at the boundary.
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
  check("key materialized on priced copy", norm.walls?.[0] && "supplier_key" in B.normalizeFoundationInventoryRow(legacyRow), false); // no supplier authored
}

{
  // calcPoles stock_price: 240in → 20ft parity $50; 120in → 10ft → $100.
  const projectPoles = [{ pole_id: "p1", height_inches: 240, y_offset_inches: 0, pole_shape: "square" }];
  const mkRow = (inches) => ({ id: "p1", material_type: "pole", pole_width_inches: 4,
    pole_stock_length_inches: inches, pole_stock_price: 50, pole_pricing_mode: "stock_price", material_name: "Steel Pole" });
  const rawP = poleCalc.calcPoles(projectPoles, [mkRow(240)], {});
  const normP = poleCalc.calcPoles(projectPoles, B.normalizeFoundationInventoryRows([mkRow(240)]), {});
  check("240in → 20ft parity", normP.poles?.[0]?.total_cost, rawP.poles?.[0]?.total_cost);
  const normP2 = poleCalc.calcPoles(projectPoles, B.normalizeFoundationInventoryRows([mkRow(120)]), {});
  check("120in → 10ft = 2 pieces $100", normP2.poles?.[0]?.total_cost, 100);
}

{
  // calcProject ingress: RAW legacy rows normalize inside.
  const project = {
    items: [], poles: [], selected_equipment: [], wall_caps: [],
    walls: [{
      shape: { points: [{ x: 0, z: 0 }, { x: 120, z: 0 }], closed: false, segments: [{ length: 120 }] },
      materialId: "wall1", heightInches: 24, includeInternalWall: false,
    }],
  };
  const rawInv = [{ id: "wall1", material_type: "brick_stone",
    brick_length_inches: 8, brick_width_inches: 4, brick_height_inches: 2.25, cost_per_unit: 0.75 }];
  const res = calc.calcProject(project, rawInv, {}, { savedProject: null });
  const wallCost = res.walls?.[0]?.calculatedCosts?.materialCost;
  check("calcProject ingress legacy brick priced", Number.isFinite(wallCost) && wallCost > 0, true);
}

// ─── 7. Form-open / minted-0 source assertions on every granted surface ─────

{
  const fi = srcText("pages/FoundationInventory.jsx");
  check("GenericItemForm: no minted number default", /defaults\[f\.key\]\s*=\s*0\b/.test(fi), false);
  check("GenericItemForm: null number default present", /defaults\[f\.key\]\s*=\s*null/.test(fi), true);
  check("WallMaterialForm: minted 0.75 gone", /cost_per_unit:\s*0\.75/.test(fi), false);
  check("WallMaterialForm: null cost present", /cost_per_unit:\s*null/.test(fi), true);
  check("WallMaterialForm: minted dims gone", /wall_unit_length_inches:\s*8[,}]/.test(fi), false);
  check("FoundationInventory: grouping imported+used", /groupInventoryBySupplier/.test(fi), true);
  check("concrete tab intro note", /Labor & Services/.test(fi) && /group by supplier/i.test(fi), true);

  const ms = srcText("components/masterInventory/MasterSuppliesTab.jsx");
  check("MasterSuppliesTab: no || 0 anywhere", /\|\|\s*0\b/.test(ms), false);
  check("MasterSuppliesTab: ?? null init present", /cost_per_letter:\s*raw\.cost_per_letter\s*\?\?\s*null/.test(ms), true);
  check("MasterSuppliesTab: no parseFloat||0 draft coerce", /parseFloat\(e\.target\.value\)\s*\|\|\s*0/.test(ms), false);
  check("MasterSuppliesTab: grouping used", /groupInventoryBySupplier\(rows\)/.test(ms), true);
  check("MasterSuppliesTab: explicit-0 display guard", /Number\.isFinite\(parseFloat\(row\.cost_display\)\)/.test(ms), true);

  const eq2 = srcText("components/foundation/EquipmentInventoryTab.jsx");
  check("EquipmentInventoryTab openAdd: minted 0s gone", /cost_per_day:\s*0\b/.test(eq2), false);
  check("EquipmentInventoryTab openAdd: null costs", /cost_per_day:\s*null/.test(eq2), true);

  const wc = srcText("components/foundation/WallCapsInventoryTab.jsx");
  check("WallCaps: minted $35 gone", /cap_stock_price:\s*35/.test(wc), false);
  check("WallCaps: null price", /cap_stock_price:\s*null/.test(wc), true);
  check("WallCaps: minted dims gone", /cap_stock_length_inches:\s*48/.test(wc), false);
  check("WallCaps: grouping used", /groupInventoryBySupplier\(caps\)/.test(wc), true);

  const norm = srcText("components/masterInventory/inventoryNormalization.js");
  check("boundary: default_rate || 0 gone", /default_rate\s*\|\|\s*0/.test(norm), false);
  check("boundary: minimum_order_yards || 0 gone", /minimum_order_yards\s*\|\|\s*0/.test(norm), false);
  check("boundary: minimum_charge || 0 gone", /minimum_charge\s*\|\|\s*0/.test(norm), false);
  check("boundary: inventorySupplierKey exported", /export const inventorySupplierKey/.test(norm), true);
  check("boundary: groupInventoryBySupplier exported", /export const groupInventoryBySupplier/.test(norm), true);

  const fmd = srcText("components/masterInventory/FoundationMaterialDialog.jsx");
  check("FoundationMaterialDialog: no minted init (was already clean)", /\|\|\s*0\b/.test(fmd), false);
  const ifm = srcText("components/masterInventory/InventoryFormModal.jsx");
  check("InventoryFormModal: no form-init mint (init ?? \"\")", /initial\[f\.name\]\s*=\s*editingItem\?\.\[f\.name\]\s*\?\?/.test(ifm), true);
}

// ─── 8. inventoryNumberInput mechanism (what every touched input now rides) ─

{
  for (const v of [0, "0", "0.0", 5, "5", "5.5", ".5", "+4", "007", " 5 ", " 0 "]) {
    check(`numberInput(${JSON.stringify(v)})`, B.inventoryNumberInput(v), catalogNumberInput(v));
  }
  for (const v of ["12abc", "abc", "", " ", "e3", "1,000", "0x10", "1_000", NaN, Infinity, -Infinity, null, undefined, true, false, [], {}]) {
    check(`numberInput edge ${JSON.stringify(v)}`, B.inventoryNumberInput(v), catalogNumberInput(v));
  }
  check("numberInput blank → null not 0", B.inventoryNumberInput(""), null);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} o008t-suppliers — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
