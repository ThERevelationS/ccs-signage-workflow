import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { salesOpportunityDisplayName } from "../src/components/sales/salesOpportunityIdentity.mjs";
import { isCurrentPipelineOpportunity } from "../src/components/sales/salesRecordScopes.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const same = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const shell = {
  id: "shell-live-shape",
  client_name: "Unknown",
  title: "Smartsheet row 6941289557262212",
  smartsheet_row_id: "6941289557262212",
  smartsheet_sheet_id: "8702703019812740",
  in_pipeline: true,
  sales_status: "lead",
};

same(salesOpportunityDisplayName(shell), "Smartsheet row 6941289557262212 · customer missing",
  "Synthetic Smartsheet shells have an explicit inspection label instead of Unknown.");
check(!isCurrentPipelineOpportunity(shell),
  "Synthetic Smartsheet shell remains excluded from Current Pipeline.");
same(salesOpportunityDisplayName({ ...shell, title: "Unknown customer follow-up" }), "Unknown",
  "A non-shell WorkOrder genuinely named Unknown remains visible as its stored customer name.");
same(salesOpportunityDisplayName({ client_name: "" }), "Unnamed opportunity",
  "Blank non-shell customer identity retains the normal unnamed fallback.");
same(salesOpportunityDisplayName({ client_name: "" }, "Unnamed customer"), "Unnamed customer",
  "Callers can retain surface-specific unnamed wording.");

const row = readFileSync("src/components/sales/SalesPipelineRow.jsx", "utf8");
const mobile = readFileSync("src/components/sales/SalesPipelineMobileCards.jsx", "utf8");
const kanban = readFileSync("src/components/sales/SalesPipelineKanban.jsx", "utf8");
const dialog = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");

for (const [name, source] of [
  ["desktop table", row],
  ["mobile cards", mobile],
  ["Board", kanban],
  ["Opportunity Detail", dialog],
]) {
  check(source.includes("salesOpportunityDisplayName"),
    name + " uses the shared Sales opportunity display identity.");
}

check(row.includes(">{opportunityDisplayName}</span>"),
  "Desktop Customer cell renders the clarified identity.");
check(row.includes("sales row ${index + 1}: ${opportunityDisplayName}"),
  "Desktop row focus accessibility label uses the clarified identity.");
check(mobile.includes(">{opportunityDisplayName}</p>") &&
  mobile.includes("Open sales details for ${opportunityDisplayName}"),
  "Mobile cards render and announce the clarified identity.");
check(kanban.includes(">{opportunityDisplayName}</div>") &&
  kanban.includes("Open sales details for ${opportunityDisplayName}"),
  "Board cards render and announce the clarified identity.");
check(dialog.includes(">{opportunityDisplayName}</DialogTitle>"),
  "Opportunity Detail title renders the clarified identity.");
check(dialog.includes("context={opportunityDisplayName}"),
  "Opportunity Detail task-owner context uses the clarified identity.");

console.log("Sales Unknown Smartsheet shell display clarity: " + checks + "/" + checks + " PASS.");
