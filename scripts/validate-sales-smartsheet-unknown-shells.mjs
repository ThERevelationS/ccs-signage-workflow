import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasMeaningfulSmartsheetSalesCustomer,
  isSmartsheetSalesImportShell,
} from "../base44/shared/smartsheetSalesImportEligibility.mjs";
import { shouldCreateSmartsheetSalesRecordInPipeline } from "../base44/shared/smartsheetSalesSafety.mjs";
import {
  isCurrentPipelineOpportunity,
  getSalesRecordClassification,
} from "../src/components/sales/salesRecordScopes.js";

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };

check(hasMeaningfulSmartsheetSalesCustomer({ client_name: "Acme Signs" }),
  "Real customer names are meaningful");
check(!hasMeaningfulSmartsheetSalesCustomer({ client_name: "" }) &&
      !hasMeaningfulSmartsheetSalesCustomer({ client_name: "   " }) &&
      !hasMeaningfulSmartsheetSalesCustomer({ client_name: "Unknown" }) &&
      !hasMeaningfulSmartsheetSalesCustomer({ client_name: " unknown " }),
  "Blank and Unknown customer labels are not meaningful");

const shell = {
  id: "shell-1",
  client_name: "Unknown",
  title: "Smartsheet row 6941289557262212",
  smartsheet_row_id: "6941289557262212",
  smartsheet_sheet_id: "8702703019812740",
  in_pipeline: true,
  completed: false,
  sales_status: "lead",
};
check(isSmartsheetSalesImportShell(shell),
  "Exact September-23-style Smartsheet Unknown shell must be recognized");
check(!isSmartsheetSalesImportShell({ ...shell, client_name: "Acme Signs" }),
  "A real customer immediately stops matching the shell rule");
check(!isSmartsheetSalesImportShell({ ...shell, title: "Unknown customer follow-up" }),
  "An arbitrary WorkOrder named Unknown is not hidden unless it has the exact synthetic title");
check(!isSmartsheetSalesImportShell({ ...shell, smartsheet_row_id: "" }),
  "Non-linked records cannot be classified as Smartsheet import shells");

check(!isCurrentPipelineOpportunity(shell),
  "Synthetic Unknown shell must be excluded from Current Pipeline");
same(getSalesRecordClassification(shell), "other",
  "Preserved shell belongs outside Current Pipeline rather than being deleted/history/outcome");

const recovered = { ...shell, client_name: "Recovered Customer" };
check(isCurrentPipelineOpportunity(recovered),
  "If Smartsheet later supplies a real customer, the preserved linked row becomes eligible automatically");

check(!shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "", current_task_description: "Prospect Initiation" }),
  "Future blank-customer Smartsheet rows must not create pipeline records");
check(!shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "Unknown", current_task_description: "Prospect Initiation" }),
  "Future Unknown-customer Smartsheet rows must not create pipeline records");
check(shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "Acme Signs", current_task_description: "Prospect Initiation" }),
  "Valid active Smartsheet rows still create pipeline opportunities");
check(!shouldCreateSmartsheetSalesRecordInPipeline({ client_name: "Acme Signs", current_task_description: "Completed Sale" }),
  "Legacy terminal task text still blocks modern pipeline creation");

const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
const createBlock = backend.split("} else if (profile?.create_base44_from_smartsheet) {")[1]?.split("toCreate.push(newRecord);")[0] ?? "";
check(createBlock.includes("if (!hasMeaningfulSmartsheetSalesCustomer(newRecord))") &&
      createBlock.includes("salesMissingCustomerRowsSkipped++") &&
      createBlock.includes("continue;"),
  "Backend must skip creating a Sales WorkOrder when Smartsheet has no meaningful customer");
check(!createBlock.includes("newRecord.client_name = 'Unknown'"),
  "Sales creation path must no longer fabricate Unknown customer WorkOrders");
check(backend.includes("missing_customer_rows_skipped: salesMissingCustomerRowsSkipped"),
  "Sync result must report how many blank-customer Sales rows were skipped");

const scopes = readFileSync("src/components/sales/salesRecordScopes.js", "utf8");
check(scopes.includes("!isSmartsheetSalesImportShell(workOrder)"),
  "Current Pipeline classification must exclude only the shared synthetic shell rule");

console.log("Sales Smartsheet Unknown-shell safety: " + checks + "/" + checks + " PASS.");
