import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  UNVERIFIED_SALES_STAGE,
  isUnverifiedSmartsheetSalesStage,
  salesStageDisplayLabel,
  salesStageDisplayValue,
} from "../src/components/sales/salesStageTrust.mjs";

let checks = 0;
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks += 1; };
const check = (value, label) => { assert.ok(value, label); checks += 1; };

const importedDefaultLead = {
  in_pipeline: true,
  sales_status: "lead",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456789",
  sales_stage_changed_at: "",
};
same(isUnverifiedSmartsheetSalesStage(importedDefaultLead), true,
  "Smartsheet-linked open rows without a verified stage timestamp are unverified.");
same(salesStageDisplayValue(importedDefaultLead), UNVERIFIED_SALES_STAGE,
  "Defaulted imported Lead displays as Needs Stage.");
same(salesStageDisplayLabel(importedDefaultLead), "Needs Stage",
  "Unverified imported stage has an explicit user-facing label.");

same(salesStageDisplayValue({
  ...importedDefaultLead,
  sales_stage_changed_at: "2026-10-07T12:00:00Z",
}), "lead", "A verified imported Lead displays as Lead.");

same(salesStageDisplayValue({
  in_pipeline: true,
  sales_status: "lead",
  sales_stage_changed_at: "2026-10-07T12:00:00Z",
}), "lead", "Base44-created verified Leads remain Lead.");

same(salesStageDisplayValue({
  in_pipeline: true,
  sales_status: "quoted",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456789",
  sales_stage_changed_at: "",
}), "needs_stage", "Unverified imported rows are not trusted merely because a raw open status exists.");

same(salesStageDisplayValue({
  in_pipeline: true,
  sales_status: "won",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456789",
  sales_stage_changed_at: "",
}), "won", "Terminal Won outcome is never rewritten to Needs Stage.");

same(salesStageDisplayValue({
  in_pipeline: false,
  sales_status: "lead",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456789",
  sales_stage_changed_at: "",
}), "lead", "Non-pipeline legacy records keep their stored status.");

const spreadsheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
check(spreadsheet.includes('salesStageDisplayValue(viewWo) !== filterStatus'),
  "Information filter evaluates the trusted display stage.");
check(spreadsheet.includes('field === "sales_status" ? salesStageDisplayValue(wo)'),
  "Saved custom status filters evaluate the trusted display stage.");
check(spreadsheet.includes('sortConfig.key === "sales_status" ? salesStageDisplayValue(viewItem)'),
  "Header selected-value filters evaluate the trusted display stage.");
check(spreadsheet.includes('if (unverifiedStage && currentStatus === nextStatus)') &&
      spreadsheet.includes("sales_stage_changed_at: classificationStamp"),
  "Explicitly confirming the same raw Lead stamps the first verified stage baseline.");
check(spreadsheet.includes('const stageKey = salesStageDisplayValue(wo)') &&
      spreadsheet.includes('? "Needs Stage"'),
  "Insights stage breakdown separates unverified imports from Lead.");

const row = readFileSync("src/components/sales/SalesPipelineRow.jsx", "utf8");
check(row.includes('value={stageDisplayValue}') && row.includes('Needs Stage'),
  "Desktop table displays Needs Stage and allows real stage selection.");

const mobile = readFileSync("src/components/sales/SalesPipelineMobileCards.jsx", "utf8");
check(mobile.includes('value={stageDisplayValue}') && mobile.includes('Needs Stage'),
  "Mobile cards display Needs Stage and allow real stage selection.");

const board = readFileSync("src/components/sales/SalesPipelineKanban.jsx", "utf8");
check(board.includes('value: "needs_stage", label: "Needs Stage"') &&
      board.includes("salesStageDisplayValue(workOrder) === status.value"),
  "Board has a dedicated virtual Needs Stage column.");
check(board.includes("if (!isRegistered || status.virtual) return;"),
  "Users cannot drag records into the virtual Needs Stage column.");

const detail = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");
check(detail.includes("salesStageDisplayLabel(workOrder)") &&
      detail.includes("Choose the actual Sales stage to establish the first verified stage baseline."),
  "Opportunity detail explains how to classify unverified stages.");

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
check(page.includes('"needs_stage"') && page.includes('<SelectItem value="needs_stage">Needs Stage</SelectItem>'),
  "Top-level Information Filter exposes Needs Stage and can restore it per user.");

const filterDialog = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
check(filterDialog.includes('{ name: "Needs Stage", value: "needs_stage"') &&
      filterDialog.includes('options: ["needs_stage", "lead", "quoted"'),
  "Custom filter manager exposes Needs Stage without changing the WorkOrder enum.");

console.log("Sales stage trust / Needs Stage: " + checks + "/" + checks + " PASS.");
