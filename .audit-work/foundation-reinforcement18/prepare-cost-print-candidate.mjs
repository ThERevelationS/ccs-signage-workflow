import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement18/";
const saved = JSON.parse(fs.readFileSync(DIR + "cost-print-current-remote-source.json", "utf8"));
const sourceHead = saved.git.stdout.trim();
assert.equal(sourceHead, "e99a089ff3b1e0bf7bfdcd7259bddd354ad767b6", "Unexpected source/concurrency baseline");
const source = Object.fromEntries(saved.read.files.map(file => {
  assert.equal(typeof file.content, "string");
  return [file.path, file.content.replace(/\r\n/g, "\n")];
}));
const files = { ...source }, edits = {};
const hash = text => createHash("sha256").update(text).digest("hex");
const CONVERSION = "src/components/estimator/workOrderConversion.js";
const PRINT = "src/components/jobs/printTemplates/workOrderPrintModel.js";
const ORIGINAL = "src/components/jobs/printTemplates/templates/original.js";
function edit(file, old_text, new_text) {
  assert.equal(files[file].split(old_text).length - 1, 1, "Nonunique or missing anchor: " + file + " " + old_text.slice(0, 55));
  files[file] = files[file].replace(old_text, new_text);
  (edits[file] ||= []).push({ old_text, new_text });
}
edit(CONVERSION, 'import { acceptedCustomerUnitPrice } from "./customerPricing";',
  'import { acceptedCustomerUnitPrice, acceptedInternalEstimateCost } from "./customerPricing";');
const productName = '    const productName = line.client_product_name || line.project_name || getModuleLabel(line.module_key) || `Product ${index + 1}`;';
edit(CONVERSION, productName, productName + `

    // Accepted internal cost is independent of the selling price/quantity.
    const acceptedQuantity = Math.max(0, num(line.customer_quantity, 1));
    const costValue = line.total_snapshot;
    const acceptedUnitCost = (typeof costValue === "number" || (typeof costValue === "string" && costValue.trim() !== "")) && Number.isFinite(Number(costValue)) ? Number(costValue) : null;
    const acceptedExtendedCost = acceptedUnitCost === null ? null : acceptedInternalEstimateCost([line]);
    const acceptedCostRecorded = acceptedUnitCost !== null && Number.isFinite(acceptedExtendedCost);`);
edit(CONVERSION, "      quoted_total: adjustedTotal,", `      quoted_total: adjustedTotal,
      unit_cost: acceptedCostRecorded && quantity === acceptedQuantity ? acceptedUnitCost : null,
      ext_cost: acceptedCostRecorded ? acceptedExtendedCost : null,`);
edit(PRINT, "const firstText = (...vals) => {", `const moneyOrNull = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return num(value, null);
};

const firstText = (...vals) => {`);
edit(PRINT, "    const unitPrice = num(p?.quoted_unit_price);", "    const unitPrice = moneyOrNull(p?.quoted_unit_price);");
edit(PRINT, "    const extPrice = num(p?.quoted_total) ?? (", "    const extPrice = moneyOrNull(p?.quoted_total) ?? (");
edit(PRINT, "    const unitCost = num(p?.unit_cost);", "    const unitCost = moneyOrNull(p?.unit_cost);");
edit(PRINT, '    const extCost = unitCost != null && qty !== "" ? unitCost * qty : null;',
  `    const extCost = moneyOrNull(p?.ext_cost ?? p?.extended_cost) ?? (
      unitCost != null && qty !== "" ? unitCost * qty : null
    );`);
edit(PRINT, "    const unitCost = num(mat?.unit_cost);", "    const unitCost = moneyOrNull(mat?.unit_cost);");
edit(PRINT, '      ext_cost: num(mat?.extended_cost) ?? (unitCost != null && qty !== "" ? unitCost * qty : null),',
  '      ext_cost: moneyOrNull(mat?.ext_cost ?? mat?.extended_cost) ?? (unitCost != null && qty !== "" ? unitCost * qty : null),');
edit(PRINT, `  const hasCost = rows.some((row) => row.internal.ext_cost != null);
  const totalMargin = hasCost ? subtotal - totalCost : null;`,
`  const hasCompleteCost = rows.length > 0 && rows.every((row) => row.internal.ext_cost != null);
  const hasCompletePrice = rows.length > 0 && rows.every((row) => row.ext_price != null);
  const totalMargin = hasCompleteCost && hasCompletePrice ? subtotal - totalCost : null;`);
edit(PRINT, "  const estimateAmount = num(wo.estimate_amount);", "  const estimateAmount = moneyOrNull(wo.estimate_amount);");
edit(PRINT, "  const depositAmount = num(wo.deposit_amount);", "  const depositAmount = moneyOrNull(wo.deposit_amount);");
edit(PRINT, "        total_cost: hasCost ? totalCost : null,", "        total_cost: hasCompleteCost ? totalCost : null,");
edit(PRINT, "        actual_cost: num(wo.actual_cost),", "        actual_cost: moneyOrNull(wo.actual_cost),");
edit(PRINT, "        profit_margin: num(wo.profit_margin),", "        profit_margin: moneyOrNull(wo.profit_margin),");
edit(ORIGINAL, '  <table style="width:100%;margin-top:12px;border:1.5px solid #334155;">',
  '  <div class="wo-table-scroll" role="region" aria-label="Work Order products" tabindex="0">\n  <table style="width:100%;margin-top:12px;border:1.5px solid #334155;">');
edit(ORIGINAL, "    <tbody>${productRows}</tbody>\n  </table>", "    <tbody>${productRows}</tbody>\n  </table>\n  </div>");
edit(ORIGINAL, '        <table style="width:100%;margin-top:6px;">',
  '        <div class="wo-table-scroll" role="region" aria-label="Work Order materials" tabindex="0">\n        <table style="width:100%;margin-top:6px;">');
edit(ORIGINAL, "          <tbody>${materialRows}</tbody>\n        </table>",
  "          <tbody>${materialRows}</tbody>\n        </table>\n        </div>");
edit(ORIGINAL, "  .sheet { max-width: 8.5in; }", `  .sheet { max-width: 8.5in; }
  .wo-table-scroll { max-width: 100%; overflow-x: auto; }
  @media print { .wo-table-scroll { max-width: none; overflow: visible; } }`);
assert.deepEqual(Object.keys(edits).sort(), [CONVERSION, PRINT, ORIGINAL].sort());
for (const file of Object.keys(edits)) {
  assert.ok(!/foundationReinforcement|reinforcement_calculation_version|foundationCalc/.test(files[file]), "No reinforcement v2 activation/imports permitted");
  fs.writeFileSync(DIR + "independent-before-" + file.split("/").pop(), source[file]);
  fs.writeFileSync(DIR + "independent-candidate-" + file.split("/").pop(), files[file]);
}
const candidate = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead,
  source, files, edits, targets: Object.keys(edits),
  sourceHashes: Object.fromEntries(Object.entries(source).map(([file, text]) => [file, hash(text)])),
  apiCandidateHashes: Object.fromEntries(Object.keys(edits).map(file => [file, hash(files[file])])),
  reinforcementV2Activated: false, schemaChanged: false,
};
fs.writeFileSync(DIR + "cost-print-independent-candidate.json", JSON.stringify(candidate, null, 2) + "\n");
console.log("Prepared exact remote-derived candidate:", candidate.targets.map(file => ({ file, edits: edits[file].length })));
