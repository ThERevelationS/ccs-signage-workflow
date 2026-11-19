import assert from "node:assert/strict";
import fs from "node:fs";
import { costPrintCandidateModules } from "./cost-print-candidate-modules.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const capturedText = fs.readFileSync(DIR + "coupled-work-order-saved-page-frozen.json", "utf8");
const capture = JSON.parse(capturedText);
const baseline = await costPrintCandidateModules("baseline"), candidate = await costPrintCandidateModules();
const options = { now: "2026-11-07T12:00:00.000Z" };
const printOptions = { printedAt: options.now, company: { name: "Synthetic company" } };
const results = [];
const build = wo => candidate.buildWorkOrderPrintModel(wo, printOptions);
const section = (line, pricing = {}) => candidate.buildEstimateWorkOrderProducts({ line_items: [line] }, pricing, options)[0];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
function save(name, wo, model) {
  const output = { workOrder: wo, model: { ...model, fmt: undefined }, sourceHead: "e99a089ff3b1e0bf7bfdcd7259bddd354ad767b6" };
  fs.writeFileSync(DIR + `independent-cost-print-${name}.json`, JSON.stringify(output, null, 2) + "\n");
  fs.writeFileSync(DIR + `independent-cost-print-${name}.html`, candidate.renderOriginalHtml(model, { autoPrint: false }));
}
check("exact remote candidate preserves all existing Product fields while adding frozen cost694 and345", () => {
  const estimate = capture.state.AllInOneEstimate[0];
  const before = baseline.buildEstimateWorkOrderProducts(estimate, {}, options);
  const after = candidate.buildEstimateWorkOrderProducts(estimate, {}, options);
  assert.equal(after.length, 2);
  assert.deepEqual(after.map(({ unit_cost, ext_cost, ...rest }) => rest), before, "No dates, notes, selling prices or lifecycle fields may change");
  const foundation = after.find(row => row.module_key === "foundation"), painting = after.find(row => row.module_key === "painting");
  assert.equal(foundation.unit_cost, 694); assert.equal(foundation.ext_cost, 694);
  assert.equal(painting.unit_cost, 345); assert.equal(painting.ext_cost, 345);
  const wo = { ...structuredClone(capture.workOrder), products: after };
  const model = build(wo);
  assert.equal(model.totals.contract_total, 1039);
  assert.equal(model.totals.internal.total_cost, 1039); assert.equal(model.totals.internal.total_margin, 0);
  assert.equal(model.totals.internal.margin_pct, 0);
  assert.equal(model.materials.length, 10);
  assert.equal(Math.round(model.materials.reduce((sum, row) => sum + row.ext_cost, 0) * 100), 69400);
  assert.equal(model.rows[1].internal.ext_cost, 694);
  save("new-accepted-costs", wo, model);
});
check("unknown historical Product costs remain unknown, matching existing sandbox behavior", () => {
  const model = build(capture.workOrder), before = baseline.buildWorkOrderPrintModel(capture.workOrder, printOptions);
  assert.deepEqual({ ...model, fmt: undefined }, { ...before, fmt: undefined });
  assert.equal(model.totals.internal.total_cost, null); assert.equal(model.totals.internal.total_margin, null);
  assert.equal(model.totals.internal.margin_pct, null); assert.equal(model.totals.contract_total, 1039);
  assert.ok(model.rows.every(row => row.internal.unit_cost === null && row.internal.ext_cost === null));
  save("historical-unknown", capture.workOrder, model);
});
check("selling overrides and live hints never replace accepted costs or invent a unit basis", () => {
  const line = { line_id: "line", total_snapshot: 20, customer_price_snapshot: 50, customer_quantity: 2,
    live_total_snapshot: 999, live_customer_price_snapshot: 9999 };
  const normal = section(line);
  assert.equal(normal.unit_cost, 20); assert.equal(normal.ext_cost, 40); assert.equal(normal.quoted_total, 100);
  const override = section(line, { sections: [{ line_id: "line", quantity: 3, unitRaw: 70, adjusted: 210 }] });
  assert.equal(override.unit_cost, null); assert.equal(override.ext_cost, 40); assert.equal(override.quoted_total, 210);
  const printed = build({ products: [override] });
  assert.equal(printed.rows[0].internal.unit_cost, null); assert.equal(printed.rows[0].internal.ext_cost, 40);
  assert.equal(printed.totals.internal.total_cost, 40); assert.equal(printed.totals.internal.total_margin, 170);
});
check("explicit zero cost and zero quantity survive JSON without becoming unknown", () => {
  const zeroCost = JSON.parse(JSON.stringify(section({ total_snapshot: 0, customer_quantity: 1, customer_price_snapshot: 100 })));
  assert.equal(zeroCost.unit_cost, 0); assert.equal(zeroCost.ext_cost, 0);
  const zero = build({ products: [zeroCost] });
  assert.equal(zero.totals.internal.total_cost, 0); assert.equal(zero.totals.internal.total_margin, 100);
  assert.equal(zero.totals.internal.margin_pct, 100);
  const noUnits = section({ total_snapshot: 20, customer_quantity: 0, customer_price_snapshot: 50 });
  assert.equal(noUnits.quantity, 0); assert.equal(noUnits.unit_cost, 20); assert.equal(noUnits.ext_cost, 0);
});
check("missing malformed and nonfinite accepted costs cannot become zero", () => {
  for (const value of [undefined, null, "", " ", false, true, [], {}, NaN, Infinity]) {
    const product = section({ total_snapshot: value, customer_quantity: 1, customer_price_snapshot: 50 });
    assert.equal(product.unit_cost, null, String(value)); assert.equal(product.ext_cost, null, String(value));
  }
  const valid = section({ total_snapshot: "20.5", customer_quantity: "2", customer_price_snapshot: 50 });
  assert.equal(valid.unit_cost, 20.5); assert.equal(valid.ext_cost, 41);
});
check("partial Product costs block full cost and margin instead of claiming140 profit", () => {
  const wo = { products: [
    { description: "Known", quantity: 1, quoted_total: 100, unit_cost: 10 },
    { description: "Unknown", quantity: 1, quoted_total: 50 },
  ], materials: capture.workOrder.materials };
  const before = baseline.buildWorkOrderPrintModel(wo, printOptions), after = build(wo);
  assert.equal(before.totals.internal.total_cost, 10); assert.equal(before.totals.internal.total_margin, 140);
  assert.equal(after.rows[0].internal.ext_cost, 10); assert.equal(after.rows[1].internal.ext_cost, null);
  assert.equal(after.totals.internal.total_cost, null); assert.equal(after.totals.internal.total_margin, null);
  assert.equal(after.totals.internal.margin_pct, null);
});
check("known costs with partial selling amounts keep the cost but do not claim a margin", () => {
  const model = build({ products: [
    { description: "Known", quantity: 1, quoted_total: 100, unit_cost: 10 },
    { description: "Selling unknown", quantity: 1, unit_cost: 5 },
  ] });
  assert.equal(model.totals.internal.total_cost, 15);
  assert.equal(model.rows[1].ext_price, null);
  assert.equal(model.totals.internal.total_margin, null); assert.equal(model.totals.internal.margin_pct, null);
});
check("stored extended costs including zero remain authoritative and are not inferred hourly rates", () => {
  const model = build({ products: [
    { description: "Frozen override", quantity: 20, unit_cost: 2, ext_cost: 0, quoted_total: 100 },
    { description: "Legacy total only", quantity: 1.2, ext_cost: 72, quoted_total: 120 },
  ], materials: [
    { part_name: "Explicit zero", quantity: 20, unit_cost: 2, ext_cost: 0 },
    { part_name: "Legacy labor", quantity: null, unit_cost: null, extended_cost: 72 },
  ] });
  assert.equal(model.rows[0].internal.ext_cost, 0); assert.equal(model.rows[1].internal.ext_cost, 72);
  assert.equal(model.rows[1].internal.unit_cost, null); assert.equal(model.totals.internal.total_cost, 72);
  assert.equal(model.materials[0].ext_cost, 0); assert.equal(model.materials[1].ext_cost, 72);
  assert.equal(model.materials[1].unit_cost, null);
});
check("strict monetary parsing rejects booleans blank arrays and objects without changing valid zero", () => {
  for (const value of [undefined, null, "", " ", false, true, [], {}, NaN, Infinity]) {
    const model = build({ products: [{ description: "Legacy", quantity: 1, unit_cost: value, quoted_total: 100 }],
      materials: [{ part_name: "Legacy", quantity: 1, unit_cost: value }] });
    assert.equal(model.rows[0].internal.unit_cost, null); assert.equal(model.rows[0].internal.ext_cost, null);
    assert.equal(model.materials[0].unit_cost, null); assert.equal(model.materials[0].ext_cost, null);
    assert.equal(model.totals.internal.total_cost, null);
  }
  const zero = build({ products: [{ description: "Zero", quantity: 1, unit_cost: "0", quoted_total: 100 }] });
  assert.equal(zero.rows[0].internal.unit_cost, 0); assert.equal(zero.totals.internal.total_cost, 0);
});
check("fully recorded ordinary financials customer notes company and status match the fresh baseline exactly", () => {
  const wo = { id: "ordinary", title: "Ordinary", estimate_amount: 200, deposit_amount: 30,
    products: [{ description: "Ordinary", quantity: 2, quoted_unit_price: 100, unit_cost: 20,
      operational_status: "in_production", estimator_notes: "INTERNAL-SENTINEL",
      notes: [{ channel: "customer", text: "Customer note" }, { channel: "internal", text: "INTERNAL-NOTE" }] }],
    materials: [{ part_name: "Ordinary", quantity: 20, unit_cost: 2, extended_cost: 40 }] };
  const before = baseline.buildWorkOrderPrintModel(wo, printOptions), after = build(wo);
  assert.deepEqual({ ...after, fmt: undefined }, { ...before, fmt: undefined });
  assert.equal(after.totals.internal.total_cost, 40); assert.equal(after.totals.internal.total_margin, 160);
  assert.equal(after.totals.internal.margin_pct, 80); assert.equal(after.rows[0].status, "In Production");
  const html = candidate.renderOriginalHtml(after, { autoPrint: false });
  assert.ok(html.includes("Customer note") || after.rows[0].notes === "Customer note");
  assert.ok(!html.includes("INTERNAL-SENTINEL")); assert.ok(!html.includes("INTERNAL-NOTE"));
  assert.ok(html.includes('aria-label="Work Order products"')); assert.ok(html.includes('aria-label="Work Order materials"'));
});
check("frozen financial inputs remain exact and no SDK entity function or network operation executes", () => {
  assert.equal(fs.readFileSync(DIR + "coupled-work-order-saved-page-frozen.json", "utf8"), capturedText);
  assert.deepEqual(globalThis.__independentCostIO, []);
});
fs.writeFileSync(DIR + "independent-cost-print-verification.json", JSON.stringify({
  results, syntheticOnly: true, actualFiveSandboxSourceSnapshots: true,
  otherLocalDependencies: true, realStorageVerified: false, backendAuthorizationVerified: false,
  reinforcementV2Activated: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
