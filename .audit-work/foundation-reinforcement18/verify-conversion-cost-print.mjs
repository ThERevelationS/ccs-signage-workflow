import assert from "node:assert/strict";
import fs from "node:fs";
import { buildWorkOrderHelpers, environment } from "./coupled-work-order-fixture.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const frozenFile = DIR + "coupled-work-order-saved-page-frozen.json";
const frozenText = fs.readFileSync(frozenFile, "utf8");
const frozen = JSON.parse(frozenText);
environment(frozen.state);
const helpers = await buildWorkOrderHelpers();
const results = [];
const printOptions = { printedAt: "2026-11-07T12:00:00.000Z", company: { name: "Synthetic company" } };
const build = workOrder => helpers.buildWorkOrderPrintModel(workOrder, printOptions);
const section = (line, pricing = {}) => helpers.buildEstimateWorkOrderProducts({ line_items: [line] }, pricing, {
  now: "2026-11-07T12:00:00.000Z",
})[0];
const modelData = model => ({ ...model, fmt: undefined });
function capture(name, workOrder, model) {
  fs.writeFileSync(DIR + `cost-print-${name}.html`, helpers.renderOriginalHtml(model, { autoPrint: false }));
  fs.writeFileSync(DIR + `cost-print-${name}.json`, JSON.stringify({ workOrder, model: modelData(model) }, null, 2) + "\n");
}
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("saved Work Order with unknown Product costs never prints zero cost or 100 percent margin", () => {
  const model = build(frozen.workOrder);
  capture("historical-unknown", frozen.workOrder, model);
  assert.equal(model.totals.internal.materials_cost, 694);
  assert.equal(model.totals.internal.total_cost, null);
  assert.equal(model.totals.internal.total_margin, null); assert.equal(model.totals.internal.margin_pct, null);
  for (const row of model.rows) {
    assert.equal(row.internal.unit_cost, null); assert.equal(row.internal.ext_cost, null); assert.equal(row.internal.margin, null);
  }
  assert.equal(model.totals.contract_total, 1039);
  const html = helpers.renderOriginalHtml(model, { autoPrint: false });
  assert.ok(!html.includes("Internal Cost")); assert.ok(!html.includes("Internal Margin"));
});
check("new Product seeding retains accepted internal amounts rather than selling or live prices", () => {
  const source = frozen.state.AllInOneEstimate[0];
  const inputs = JSON.stringify(source);
  const products = helpers.buildEstimateWorkOrderProducts(source, {}, { now: "2026-11-07T12:00:00.000Z" });
  const foundation = products.find(row => row.module_key === "foundation");
  const painting = products.find(row => row.module_key === "painting");
  assert.equal(foundation.unit_cost, 694); assert.equal(foundation.ext_cost, 694);
  assert.equal(painting.unit_cost, 345); assert.equal(painting.ext_cost, 345);
  const wo = { ...structuredClone(frozen.workOrder), products };
  const model = build(wo);
  capture("new-accepted-costs", wo, model);
  assert.equal(model.totals.internal.total_cost, 1039);
  assert.equal(model.totals.internal.total_margin, 0); assert.equal(model.totals.internal.margin_pct, 0);
  assert.equal(model.totals.internal.materials_cost, 694, "Manifest costs stay separate and are not added twice");
  assert.equal(model.rows.find(row => row.product_id === foundation.id).internal.ext_cost, 694);
  assert.equal(JSON.stringify(source), inputs);
});
check("customer price changes and live cost hints cannot replace the frozen internal basis", () => {
  const line = { line_id: "line", total_snapshot: 20, customer_price_snapshot: 50,
    customer_quantity: 2, live_total_snapshot: 999, live_customer_price_snapshot: 9999 };
  const seeded = section(line);
  assert.equal(seeded.unit_cost, 20); assert.equal(seeded.ext_cost, 40);
  assert.equal(seeded.quoted_unit_price, 50); assert.equal(seeded.quoted_total, 100);
  const override = section(line, { sections: [{ line_id: "line", quantity: 3, unitRaw: 70, adjusted: 210 }] });
  assert.equal(override.quantity, 3); assert.equal(override.quoted_total, 210);
  assert.equal(override.ext_cost, 40, "A sell-side quantity override is not a new accepted cost basis");
  assert.equal(override.unit_cost, null, "Do not label the old per-unit cost using a different quantity basis");
});
check("explicit zero accepted cost and quantity remain recorded zeros", () => {
  const zeroCost = section({ total_snapshot: 0, customer_price_snapshot: 100, customer_quantity: 1 });
  assert.equal(zeroCost.unit_cost, 0); assert.equal(zeroCost.ext_cost, 0);
  const model = build({ products: [zeroCost] });
  assert.equal(model.totals.internal.total_cost, 0);
  assert.equal(model.totals.internal.total_margin, 100); assert.equal(model.totals.internal.margin_pct, 100);
  const zeroQuantity = section({ total_snapshot: 20, customer_price_snapshot: 50, customer_quantity: 0 });
  assert.equal(zeroQuantity.quantity, 0); assert.equal(zeroQuantity.unit_cost, 20); assert.equal(zeroQuantity.ext_cost, 0);
});
check("missing or malformed accepted cost never becomes an invented zero", () => {
  for (const value of [undefined, null, "", " ", false, true, [], {}, NaN, Infinity]) {
    const seeded = section({ total_snapshot: value, customer_quantity: 1, customer_price_snapshot: 50 });
    assert.equal(seeded.unit_cost, null, String(value)); assert.equal(seeded.ext_cost, null, String(value));
  }
  const numeric = section({ total_snapshot: "20.5", customer_quantity: "2", customer_price_snapshot: 50 });
  assert.equal(numeric.unit_cost, 20.5); assert.equal(numeric.ext_cost, 41);
});
check("null blank boolean array and object money remain unknown in historical print rows", () => {
  for (const value of [undefined, null, "", " ", false, true, [], {}, NaN, Infinity]) {
    const model = build({ products: [{ description: "Historical", quantity: 1,
      unit_cost: value, quoted_unit_price: 100, quoted_total: 100 }] });
    assert.equal(model.rows[0].internal.unit_cost, null, String(value));
    assert.equal(model.rows[0].internal.ext_cost, null, String(value));
    assert.equal(model.totals.internal.total_cost, null);
    assert.equal(model.totals.internal.total_margin, null);
  }
});
check("partially costed Products do not claim a complete cost or margin", () => {
  const wo = { products: [
    { description: "Known", quantity: 1, quoted_total: 100, unit_cost: 10, ext_cost: 10 },
    { description: "Unknown", quantity: 1, quoted_total: 50, unit_cost: null, ext_cost: null },
  ], materials: frozen.workOrder.materials };
  const model = build(wo);
  assert.equal(model.rows[0].internal.ext_cost, 10);
  assert.equal(model.rows[1].internal.ext_cost, null);
  assert.equal(model.totals.internal.total_cost, null);
  assert.equal(model.totals.internal.total_margin, null);
  assert.equal(model.totals.internal.margin_pct, null);
  assert.equal(model.totals.internal.materials_cost, 694);
});
check("known cost with unknown selling amounts has no invented margin", () => {
  const model = build({ products: [
    { description: "Known", quantity: 1, quoted_total: 100, ext_cost: 10 },
    { description: "Price not recorded", quantity: 1, ext_cost: 5 },
  ] });
  assert.equal(model.totals.internal.total_cost, 15);
  assert.equal(model.totals.internal.total_margin, null);
  assert.equal(model.totals.internal.margin_pct, null);
  assert.equal(model.rows[1].ext_price, null); assert.equal(model.rows[1].internal.margin, null);
});
check("a manifest-only print does not promote its partial cost into a whole-order total", () => {
  const model = build({ materials: frozen.workOrder.materials });
  assert.equal(model.totals.internal.materials_cost, 694);
  assert.equal(model.totals.internal.total_cost, null);
  assert.equal(model.totals.internal.total_margin, null); assert.equal(model.totals.internal.margin_pct, null);
});
check("fully recorded ordinary pricing retains its existing math and no source input is mutated", () => {
  const model = build({ products: [{ description: "Ordinary", quantity: 2, quoted_unit_price: 100, unit_cost: 20 }] });
  assert.equal(model.rows[0].internal.unit_cost, 20); assert.equal(model.rows[0].internal.ext_cost, 40);
  assert.equal(model.totals.internal.total_cost, 40); assert.equal(model.totals.internal.total_margin, 160);
  assert.equal(model.totals.internal.margin_pct, 80);
  assert.equal(fs.readFileSync(frozenFile, "utf8"), frozenText, "Never rewrite or recompute settled Work Order captures");
});
fs.writeFileSync(DIR + "conversion-cost-print-verification.json", JSON.stringify({
  results, frozenWorkOrderUnchanged: true, actualSourceHelpers: true, syntheticOnly: true,
  realStorageVerified: false, backendAuthorizationVerified: false, remoteActivated: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
