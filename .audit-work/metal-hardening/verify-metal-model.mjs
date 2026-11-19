// Metal pricing-availability — model verification suite.
// Sections:
//   A — valid-path byte parity: candidate computeMetalCalculations /
//       deriveMetalItemCosts vs the REMOTE formulas mechanically extracted
//       verbatim from remote/src/pages/MetalEstimator.jsx.
//   B — strict parsers + draft helpers.
//   C — settings scanner (seeded rows only; absent rows never flag).
//   D — item scanner (per-field malformed/missing/explicit-zero matrix +
//       inventory-link resolution).
//   E — held-calc semantics (null propagation, item vs project holds, raw-row
//       preservation, issue shape).
//   F — explicit-zero legitimacy decisions.
//   G — project-rate scanner.
//   H — UI helpers.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const E = ".audit-work/metal-hardening/";
const mod = await import("./candidates/src/components/estimator/metal/metalPricingAvailability.js");
const {
  metalStrictNumber, deriveMetalItemCosts, computeMetalCalculations,
  metalSettingIssues, metalRateIssues, metalItemIssues, calcMetalProject,
  hasMetalCostSnapshot, metalDraftValue, metalQuantityDraft,
  issuesForField, hasIssueFor,
} = mod;

let pass = 0;
const sections = {};
const T = (sec, name, fn) => {
  try { fn(); pass++; sections[sec] = (sections[sec] || 0) + 1; }
  catch (e) { console.error("FAIL", sec, name, "::", String(e.message || e).slice(0, 500)); process.exitCode = 1; }
};

// ---------- remote formula extraction (mechanical, verbatim) ----------
const remoteText = fs.readFileSync(E + "remote/src/pages/MetalEstimator.jsx", "utf8");
const cut = (startMarker, endMarker) => {
  const i = remoteText.indexOf(startMarker);
  assert.ok(i >= 0, "anchor: " + startMarker);
  assert.equal(remoteText.indexOf(startMarker, i + 1), -1, "unique anchor: " + startMarker);
  const j = remoteText.indexOf(endMarker, i);
  assert.ok(j > i, "end anchor: " + endMarker);
  return remoteText.slice(i + startMarker.length, j);
};
const calcBody = cut("const calculateTotals = useCallback(() => {", "\n  }, [project.items]);");
const projBody = cut("const getProjectCalculations = useCallback(() => {", "\n  }, [project.items, inventory, calculateTotals]);");
const deriveBody = cut("// --- Recalculate ---", "\n      newItems[index] = { ...item };");
const remoteCalc = new Function("project", "inventory",
  `const calculateTotals = () => {${calcBody}}; const getProjectCalculations = () => {${projBody}}; return getProjectCalculations();`);
const remoteDerive = new Function("item", "prev", "inventory", `${deriveBody}\nreturn item;`);

// ---------- fixtures ----------
const INV = (over = {}) => ({
  id: "inv-1", material_type: "Aluminum", product_type: "sheet",
  size: "0.125x48x96", cost_per_unit: 12.5, unit_type: "per_foot", ...over,
});
const ITEM = (over = {}) => ({
  builder_item_id: "bi-1", item_type: "fabricated_letters", description: "Bracket",
  inventory_item_id: "inv-1", material_length_ft: 10, supplies_cost: 5, quantity: 2,
  fabrication_hours: 1.5, welding_hours: 0.5, finishing_hours: 0.25,
  material_cost: 125, fabrication_cost: 97.5, welding_cost: 37.5, finishing_cost: 13.75,
  ...over,
});
const PROJ = (over = {}) => ({
  fabrication_rate: 65, welding_rate: 75, finishing_rate: 55, items: [ITEM()], ...over,
});
const SETTINGS = (over = {}) => ({
  metal_fabrication_rate: "65", metal_welding_rate: "75", metal_finishing_rate: "55", ...over,
});
const codes = (issues) => issues.map((i) => i.code);

// ================= A — valid-path byte parity =================
T("A", "clean single-item calc identical to remote", () => {
  assert.deepEqual(computeMetalCalculations(PROJ(), [INV()]), remoteCalc(PROJ(), [INV()]));
});
T("A", "multi-item + no-ref item calc identical", () => {
  const p = PROJ({ items: [ITEM(), ITEM({ builder_item_id: "bi-2", inventory_item_id: null, material_length_ft: 0, material_cost: 0, quantity: 1 })] });
  assert.deepEqual(computeMetalCalculations(p, [INV()]), remoteCalc(p, [INV()]));
});
T("A", "malformed numeric resolves identically to remote (NaN path)", () => {
  const p = PROJ({ items: [ITEM({ fabrication_hours: "abc", fabrication_cost: NaN })] });
  const r = remoteCalc(p, [INV()]), c = computeMetalCalculations(p, [INV()]);
  assert.equal(String(r.totalFabricationCost), String(c.totalFabricationCost));
  assert.equal(String(r.grandTotal), String(c.grandTotal));
});
T("A", "derive identical on clean input", () => {
  const item = ITEM({ material_length_ft: 8, fabrication_hours: 2 });
  assert.deepEqual(deriveMetalItemCosts(item, PROJ(), [INV()]), remoteDerive({ ...item }, PROJ(), [INV()]));
});
T("A", "derive identical when inventory row missing (stale cost preserved)", () => {
  const item = ITEM({ inventory_item_id: "gone", material_cost: 77 });
  const r = remoteDerive({ ...item }, PROJ(), [INV()]);
  const c = deriveMetalItemCosts(item, PROJ(), [INV()]);
  assert.deepEqual(c, r);
  assert.equal(c.material_cost, 77, "stale stored material_cost preserved by derive (flagged upstream instead)");
});

// ================= B — strict parsers + draft helpers =================
T("B", "metalStrictNumber accepts finite numbers + numeric strings", () => {
  for (const [v, want] of [[5, 5], [0, 0], [-3.25, -3.25], ["5.25", 5.25], [" 7 ", 7], ["-3", -3], ["1e3", 1000], [".5", 0.5], ["+4", 4]])
    assert.equal(metalStrictNumber(v), want, "accept " + JSON.stringify(v));
});
T("B", "metalStrictNumber rejects malformed", () => {
  for (const v of ["", "   ", "abc", "5x", "0x10", "1,5", NaN, Infinity, -Infinity, null, undefined, {}, [], "5..2", "--1", "e3"])
    assert.equal(metalStrictNumber(v), null, "reject " + JSON.stringify(v));
});
T("B", "metalDraftValue preserves blanks + raw junk", () => {
  assert.equal(metalDraftValue(""), "");
  assert.equal(metalDraftValue("3.5"), 3.5);
  assert.equal(metalDraftValue("abc"), "abc");
});
T("B", "metalQuantityDraft truncates like parseInt, preserves blank/junk", () => {
  assert.equal(metalQuantityDraft(""), "");
  assert.equal(metalQuantityDraft("2.7"), 2);
  assert.equal(metalQuantityDraft("4"), 4);
  assert.equal(metalQuantityDraft("abc"), "abc");
});

// ================= C — settings scanner =================
const SEEDS = ["metal_fabrication_rate", "metal_welding_rate", "metal_finishing_rate"];
for (const key of SEEDS) {
  T("C", `${key} absent → no issue`, () => {
    const s = SETTINGS(); delete s[key];
    assert.deepEqual(metalSettingIssues(s).filter(i => i.field === key), []);
  });
  T("C", `${key} valid → no issue`, () => {
    assert.deepEqual(metalSettingIssues(SETTINGS()).filter(i => i.field === key), []);
  });
  for (const bad of ["abc", "", "0", 0, "-5", NaN, Infinity]) {
    T("C", `${key}=${JSON.stringify(bad)} flagged`, () => {
      const list = metalSettingIssues(SETTINGS({ [key]: bad }));
      assert.equal(list.length, 1);
      assert.equal(list[0].code, "metal_setting_unavailable");
      assert.equal(list[0].kind, "metal_catalog");
      assert.equal(list[0].hold, "project");
      assert.equal(list[0].field, key);
      assert.match(list[0].message, /Metal Settings/);
    });
  }
}
T("C", "metal_* row shadows a malformed alias", () => {
  assert.deepEqual(metalSettingIssues({ metal_fabrication_rate: "65", fabrication_rate: "abc" }), []);
});
T("C", "malformed metal_* row flags even when alias valid", () => {
  const list = metalSettingIssues({ metal_fabrication_rate: "abc", fabrication_rate: "65" });
  assert.equal(list.length, 1);
  assert.equal(list[0].field, "metal_fabrication_rate");
});
T("C", "legacy alias consumed + malformed → flagged under alias field", () => {
  const list = metalSettingIssues({ fabrication_rate: "abc" });
  assert.equal(list.length, 1);
  assert.equal(list[0].field, "fabrication_rate");
});
T("C", "legacy alias valid → no issue", () => {
  assert.deepEqual(metalSettingIssues({ welding_rate: "80" }), []);
});
T("C", "blank metal_* row still shadows a valid alias (recorded value consumed)", () => {
  const list = metalSettingIssues({ metal_welding_rate: "", welding_rate: "75" });
  assert.equal(list.length, 1);
  assert.equal(list[0].field, "metal_welding_rate");
});

// ================= D — item scanner =================
T("D", "clean item → zero issues", () => {
  assert.deepEqual(metalItemIssues(ITEM(), 0, [INV()]), []);
});
T("D", "absent optional numerics → no issue", () => {
  assert.deepEqual(metalItemIssues({ item_type: "pole_sign" }, 0, [INV()]), []);
});
for (const field of ["material_length_ft", "supplies_cost", "fabrication_hours", "welding_hours", "finishing_hours"]) {
  T("D", `${field}=0 explicit → legit`, () => {
    assert.deepEqual(metalItemIssues(ITEM({ [field]: 0 }), 0, [INV()]), []);
  });
  T("D", `${field} negative → flagged`, () => {
    const list = metalItemIssues(ITEM({ [field]: -1 }), 0, [INV()]);
    assert.equal(list.length, 1);
    assert.equal(list[0].hold, "item");
    assert.equal(list[0].itemIndex, 0);
    assert.equal(list[0].field, field);
  });
  T("D", `${field} malformed string → flagged`, () => {
    const list = metalItemIssues(ITEM({ [field]: "abc" }), 1, [INV()]);
    assert.equal(list.length, 1);
    assert.equal(list[0].itemIndex, 1);
  });
  T("D", `${field} null treated as absent → no issue`, () => {
    assert.deepEqual(metalItemIssues(ITEM({ [field]: null }), 0, [INV()]), []);
  });
}
T("D", "quantity 1..n fine; 0, <1, junk flagged", () => {
  assert.deepEqual(metalItemIssues(ITEM({ quantity: 1 }), 0, [INV()]), []);
  assert.deepEqual(metalItemIssues(ITEM({ quantity: 3 }), 0, [INV()]), []);
  for (const q of [0, 0.5, -2, "abc", ""]) {
    const list = metalItemIssues(ITEM({ quantity: q }), 0, [INV()]);
    assert.equal(list.length, 1, "qty " + JSON.stringify(q));
    assert.equal(list[0].code, "metal_quantity_unavailable");
  }
});
for (const field of ["material_cost", "fabrication_cost", "welding_cost", "finishing_cost"]) {
  T("D", `stored ${field}=0 legit; malformed/negative flagged`, () => {
    assert.deepEqual(metalItemIssues(ITEM({ [field]: 0 }), 0, [INV()]), []);
    assert.equal(metalItemIssues(ITEM({ [field]: -5 }), 0, [INV()])[0].code, "metal_derived_cost_unavailable");
    assert.equal(metalItemIssues(ITEM({ [field]: "NaN" }), 0, [INV()])[0].code, "metal_derived_cost_unavailable");
    assert.deepEqual(metalItemIssues(ITEM({ [field]: undefined }), 0, [INV()]), []);
  });
}
T("D", "inventory ref present + row exists + material draw → no issue", () => {
  assert.deepEqual(metalItemIssues(ITEM(), 0, [INV()]), []);
});
T("D", "inventory ref dangling + material draw → catalog flag", () => {
  const list = metalItemIssues(ITEM({ inventory_item_id: "gone" }), 0, [INV()]);
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "metal_inventory_item_unavailable");
  assert.equal(list[0].kind, "metal_catalog");
});
T("D", "no ref + positive draw → flag (silent $0 material)", () => {
  const list = metalItemIssues(ITEM({ inventory_item_id: null }), 0, [INV()]);
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "metal_inventory_item_unavailable");
  assert.equal(list[0].kind, "metal");
});
T("D", "no ref + zero draw + zero stored cost → legit", () => {
  assert.deepEqual(metalItemIssues(ITEM({ inventory_item_id: null, material_length_ft: 0, material_cost: 0 }), 0, [INV()]), []);
});
T("D", "no ref + stored material cost → flag (stale snapshot)", () => {
  const list = metalItemIssues(ITEM({ inventory_item_id: "", material_length_ft: 0, material_cost: 42 }), 0, [INV()]);
  assert.equal(list.length, 1);
});
T("D", "linked row missing cost_per_unit + draw → catalog flag", () => {
  const inv = INV({ cost_per_unit: "" });
  const list = metalItemIssues(ITEM(), 0, [inv]);
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "metal_inventory_cost_unavailable");
  assert.equal(list[0].kind, "metal_catalog");
});
T("D", "linked row cost_per_unit=0 + draw → honored (free material)", () => {
  assert.deepEqual(metalItemIssues(ITEM(), 0, [INV({ cost_per_unit: 0 })]), []);
});
T("D", "linked row bad cost but NO draw → no pricing issue", () => {
  assert.deepEqual(metalItemIssues(ITEM({ material_length_ft: 0 }), 0, [INV({ cost_per_unit: "abc" })]), []);
});

// ================= E — held-calc semantics =================
T("E", "clean project → held=false, totals finite, issues empty", () => {
  const { calc, issues, held } = calcMetalProject(PROJ(), { inventory: [INV()], settings: SETTINGS(), seeded: true });
  assert.equal(held, false);
  assert.deepEqual(issues, []);
  assert.equal(calc.pricingUnavailable, false);
  assert.equal(calc.__held, false);
  assert.equal(calc.grandTotal, 557.5);
});
T("E", "one malformed item → that item nulled, totals null, sibling intact", () => {
  const p = PROJ({ items: [ITEM(), ITEM({ builder_item_id: "bi-2", fabrication_hours: "abc" })] });
  const { calc, held } = calcMetalProject(p, { inventory: [INV()] });
  assert.equal(held, true);
  assert.equal(calc.pricingUnavailable, true);
  assert.equal(calc.grandTotal, null);
  assert.equal(calc.totalMaterialsCost, null);
  assert.equal(calc.enrichedItems[0].materials_cost, 250, "clean sibling intact");
  assert.equal(calc.enrichedItems[1].material_cost, null, "held item nulled");
  assert.equal(calc.enrichedItems[1].labor_cost, null);
  assert.equal(calc.enrichedItems[1].labor_hours, null);
  assert.equal(calc.enrichedItems[1].description, "Bracket", "raw fields preserved");
});
T("E", "project-level hold (bad stored rate) nulls every item + totals", () => {
  const { calc } = calcMetalProject(PROJ({ welding_rate: "NaN" }), { inventory: [INV()] });
  assert.equal(calc.grandTotal, null);
  assert.equal(calc.enrichedItems[0].material_cost, null);
  assert.equal(calc.enrichedItems[0].labor_hours, null);
});
T("E", "settings row flags only while seeded", () => {
  const s = SETTINGS({ metal_welding_rate: "abc" });
  assert.equal(calcMetalProject(PROJ(), { inventory: [INV()], settings: s, seeded: true }).held, true);
  assert.equal(calcMetalProject(PROJ(), { inventory: [INV()], settings: s, seeded: false }).held, false);
});
T("E", "issue records carry kind/index/itemIndex/field/code/message/hold", () => {
  const { issues } = calcMetalProject(PROJ({ items: [ITEM({ quantity: 0 })] }), { inventory: [INV()] });
  assert.equal(issues.length, 1);
  const [i] = issues;
  assert.equal(i.kind, "metal");
  assert.equal(i.itemIndex, 0);
  assert.equal(i.index, 0);
  assert.equal(i.field, "quantity");
  assert.equal(i.code, "metal_quantity_unavailable");
  assert.equal(i.hold, "item");
  assert.ok(i.message.includes("Item 1"));
});
T("E", "raw item rows untouched by calc", () => {
  const p = PROJ({ items: [ITEM({ quantity: 0 })] });
  const before = JSON.stringify(p.items);
  calcMetalProject(p);
  assert.equal(JSON.stringify(p.items), before);
});
T("E", "non-array items flagged + calc survives", () => {
  const { calc, held, issues } = calcMetalProject({ fabrication_rate: 65, welding_rate: 75, finishing_rate: 55, items: "junk" });
  assert.equal(held, true);
  assert.equal(codes(issues)[0], "metal_items_unavailable");
  assert.equal(calc.grandTotal, null);
  assert.deepEqual(calc.enrichedItems, []);
});
T("E", "calc.issues attached only when held", () => {
  assert.deepEqual(calcMetalProject(PROJ(), { inventory: [INV()] }).calc.issues, []);
  assert.ok(calcMetalProject(PROJ({ items: [ITEM({ quantity: 0 })] }), { inventory: [INV()] }).calc.issues.length > 0);
});

// ================= F — explicit-zero legitimacy =================
T("F", "stored welding_rate 0 → honored, welding total $0, no flag", () => {
  const { calc, issues } = calcMetalProject(PROJ({ welding_rate: 0 }), { inventory: [INV()] });
  assert.deepEqual(issues, []);
  assert.equal(calc.totalWeldingCost, 75, "0 rate honored: stored welding_cost was derived at 75");
});
T("F", "all-zero hours → $0 labor, not flagged", () => {
  const it = ITEM({ fabrication_hours: 0, welding_hours: 0, finishing_hours: 0, fabrication_cost: 0, welding_cost: 0, finishing_cost: 0 });
  const { calc, issues } = calcMetalProject(PROJ({ items: [it] }), { inventory: [INV()] });
  assert.deepEqual(issues, []);
  assert.equal(calc.totalLaborCost, 0);
});
T("F", "zero supplies + zero length item → no flag", () => {
  const it = ITEM({ material_length_ft: 0, supplies_cost: 0, material_cost: 0 });
  assert.deepEqual(calcMetalProject(PROJ({ items: [it] }), { inventory: [INV()] }).issues, []);
});
T("F", "saved snapshot recognition — explicit 0 counts, non-finite doesn't", () => {
  assert.equal(hasMetalCostSnapshot(0), true);
  assert.equal(hasMetalCostSnapshot(42.5), true);
  assert.equal(hasMetalCostSnapshot("42.5"), false);
  assert.equal(hasMetalCostSnapshot(NaN), false);
  assert.equal(hasMetalCostSnapshot(Infinity), false);
  assert.equal(hasMetalCostSnapshot(null), false);
  assert.equal(hasMetalCostSnapshot(undefined), false);
});

// ================= G — project-rate scanner =================
T("G", "missing stored rate → project hold", () => {
  const list = metalRateIssues({ welding_rate: 75, finishing_rate: 55 });
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "metal_rate_unavailable");
  assert.equal(list[0].hold, "project");
  assert.equal(list[0].field, "fabrication_rate");
});
T("G", "null rate → project hold", () => {
  const list = metalRateIssues({ fabrication_rate: null, welding_rate: 75, finishing_rate: 55 });
  assert.equal(list.length, 1);
});
T("G", "malformed/negative stored rates flagged; 0 + positive fine", () => {
  assert.equal(metalRateIssues({ fabrication_rate: "abc", welding_rate: 75, finishing_rate: 55 }).length, 1);
  assert.equal(metalRateIssues({ fabrication_rate: 65, welding_rate: -1, finishing_rate: 55 }).length, 1);
  assert.deepEqual(metalRateIssues({ fabrication_rate: 0, welding_rate: 75, finishing_rate: "55" }), []);
});
T("G", "items non-array flagged once", () => {
  assert.equal(metalRateIssues({ fabrication_rate: 65, welding_rate: 75, finishing_rate: 55, items: {} }).length, 1);
  assert.deepEqual(metalRateIssues({ fabrication_rate: 65, welding_rate: 75, finishing_rate: 55, items: [] }), []);
});

// ================= H — UI helpers =================
T("H", "issuesForField/hasIssueFor scope correctly", () => {
  const issues = [
    { field: "quantity", itemIndex: 0, code: "x" },
    { field: "quantity", itemIndex: 2, code: "x" },
    { field: "welding_rate", itemIndex: null, code: "y" },
  ];
  assert.equal(issuesForField(issues, "quantity").length, 2);
  assert.equal(issuesForField(issues, "quantity", 2).length, 1);
  assert.equal(hasIssueFor(issues, "quantity", 0), true);
  assert.equal(hasIssueFor(issues, "quantity", 1), false);
  assert.equal(hasIssueFor(issues, "welding_rate"), true);
  assert.equal(hasIssueFor(issues, "missing"), false);
});

// ---------- summary ----------
const total = Object.values(sections).reduce((s, n) => s + n, 0);
const out = { suite: "metal-model", passed: pass, failed: total - pass, result: process.exitCode ? "FAIL" : "PASS", sections };
fs.writeFileSync(E + "metal-model-verification.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
if (process.exitCode) process.exit(1);
console.log("PASS metal-model");
