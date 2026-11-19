import assert from "node:assert/strict";
import fs from "node:fs";
import { costPrintCandidateModules } from "./cost-print-candidate-modules.mjs";

const DIR = ".audit-work/foundation-reinforcement18/";
const candidate = await costPrintCandidateModules("print-only");
const before = await costPrintCandidateModules("baseline");
const result = [];
const now = "2026-11-07T12:00:00.000Z";
const options = { printedAt: now, company: { name: "Synthetic company" } };
const captured = JSON.parse(fs.readFileSync(DIR + "coupled-work-order-saved-page-frozen.json", "utf8"));
const build = wo => candidate.buildWorkOrderPrintModel(wo, options);
const data = ({ fmt, ...model }) => model;
function check(name, fn) {
  try { fn(); result.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { result.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("deployment selection leaves every conversion and persisted Product field unchanged", () => {
  const estimate = captured.state.AllInOneEstimate[0];
  const old = before.buildEstimateWorkOrderProducts(estimate, {}, { now });
  const selected = candidate.buildEstimateWorkOrderProducts(estimate, {}, { now });
  assert.deepEqual(selected, old);
  assert.ok(selected.every(row => !Object.hasOwn(row, "unit_cost") && !Object.hasOwn(row, "ext_cost")));
});
for (const name of ["historical-unknown", "new-accepted-costs"]) {
  check(name + " model and HTML exactly match the already-reviewed frozen browser documents", () => {
    const file = DIR + `independent-cost-print-${name}.json`, original = fs.readFileSync(file, "utf8");
    const frozen = JSON.parse(original), model = build(frozen.workOrder);
    assert.deepEqual(data(model), frozen.model);
    assert.equal(candidate.renderOriginalHtml(model, { autoPrint: false }),
      fs.readFileSync(DIR + `independent-cost-print-${name}.html`, "utf8"));
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.equal(model.totals.contract_total, 1039);
    assert.equal(Math.round(model.materials.reduce((sum, row) => sum + row.ext_cost, 0) * 100), 69400);
    assert.equal(model.totals.internal.total_cost, name === "historical-unknown" ? null : 1039);
    assert.equal(model.totals.internal.total_margin, name === "historical-unknown" ? null : 0);
  });
}
check("partially known cost and partially known prices cannot claim complete profit", () => {
  const partial = build({ products: [
    { description: "Known", quantity: 1, quoted_total: 100, unit_cost: 10 },
    { description: "Unknown cost", quantity: 1, quoted_total: 50 },
  ] });
  assert.equal(partial.totals.internal.total_cost, null); assert.equal(partial.totals.internal.total_margin, null);
  const partialPrice = build({ products: [
    { description: "Known", quantity: 1, quoted_total: 100, unit_cost: 10 },
    { description: "Unknown sell", quantity: 1, unit_cost: 5 },
  ] });
  assert.equal(partialPrice.totals.internal.total_cost, 15); assert.equal(partialPrice.totals.internal.total_margin, null);
});
check("explicit supplied extended zero and historical total-only72 stay authoritative", () => {
  const model = build({ products: [
    { description: "Zero", quantity: 20, unit_cost: 2, ext_cost: 0, quoted_total: 100 },
    { description: "Total only", quantity: 1.2, unit_cost: null, ext_cost: 72, quoted_total: 120 },
  ] });
  assert.equal(model.rows[0].internal.ext_cost, 0); assert.equal(model.rows[1].internal.unit_cost, null);
  assert.equal(model.rows[1].internal.ext_cost, 72); assert.equal(model.totals.internal.total_cost, 72);
});
check("strict missing-money handling and recorded zero remain distinct without any SDK calls", () => {
  for (const value of [undefined, null, "", " ", false, true, [], {}, NaN, Infinity]) {
    const model = build({ products: [{ description: "Unknown", quantity: 1, unit_cost: value, quoted_total: 100 }] });
    assert.equal(model.rows[0].internal.ext_cost, null); assert.equal(model.totals.internal.total_margin, null);
  }
  const zero = build({ products: [{ description: "Zero", quantity: 1, unit_cost: 0, quoted_total: 100 }] });
  assert.equal(zero.totals.internal.total_cost, 0); assert.equal(zero.totals.internal.margin_pct, 100);
  assert.deepEqual(globalThis.__independentCostIO, []);
});
fs.writeFileSync(DIR + "print-only-candidate-verification.json", JSON.stringify({
  result, deploymentTargets: ["src/components/jobs/printTemplates/workOrderPrintModel.js",
    "src/components/jobs/printTemplates/templates/original.js"],
  sourceHead: "e99a089ff3b1e0bf7bfdcd7259bddd354ad767b6",
  conversionUnchanged: true, costCaptureHeld: true, schemaChanged: false,
  realStorageVerified: false, backendAuthorizationVerified: false, reinforcementV2Activated: false,
}, null, 2) + "\n");
if (result.some(row => !row.ok)) process.exitCode = 1;
