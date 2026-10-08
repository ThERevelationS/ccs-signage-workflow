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
check(!spreadsheet.includes("requestSalesStatusChange") &&
      !spreadsheet.includes("sales_stage_changed_at: classificationStamp"),
  "No independent status confirmation can fabricate a stage timestamp; unresolved legacy timing remains visible.");
check(spreadsheet.includes('const stageKey = salesStageDisplayValue(wo)') &&
      spreadsheet.includes('? "Needs Stage"'),
  "Insights stage breakdown separates unverified imports from Lead.");

const row = readFileSync("src/components/sales/SalesPipelineRow.jsx", "utf8");
check(row.includes("salesStageDisplayLabel(wo)") && row.includes("{stageDisplayLabel}") &&
      row.includes("bg-violet-50 text-violet-800") &&
      !row.slice(row.indexOf('case "sales_status": return ('), row.indexOf('case "stage_age": return (')).includes("<Select"),
  "Desktop table shows the stage trust label without an independent status selector.");

const mobile = readFileSync("src/components/sales/SalesPipelineMobileCards.jsx", "utf8");
check(mobile.includes("salesStageDisplayLabel(wo)") && mobile.includes('aria-label={`Sales Status: ${stageDisplayLabel}`}') &&
      !mobile.includes("onRequestStatusChange") && !mobile.includes("<Select value={stageDisplayValue}"),
  "Mobile shows a readable stage badge without independent status selection.");

const board = readFileSync("src/components/sales/SalesPipelineKanban.jsx", "utf8");
check(board.includes('value: "needs_stage", label: "Needs Stage"') &&
      board.includes("salesStageDisplayValue(workOrder) === status.value"),
  "Board has a dedicated virtual Needs Stage column.");
check(!board.includes("draggable=") && !board.includes("onDrop=") &&
      !board.includes("onDragOver=") && !board.includes("requestStatusChange"),
  "Kanban stage changes via drag-and-drop or independent actions are disabled.");
check(board.includes("salesStageDisplayLabel(workOrder)") && board.includes('aria-label={`Sales Status: ${stageDisplayLabel}`}'),
  "Kanban retains read-only stage badges and direct Opportunity Detail access.");

const detail = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");
check(detail.includes("salesStageDisplayLabel(workOrder)") &&
      detail.includes("Stage timing is unverified. Select the appropriate Task Description; no timestamp will be invented."),
  "Opportunity detail directs stage updates through Task Description without fabricating history.");
check(detail.includes('aria-label={`Read-only Sales Status: ${statusLabel}`}') &&
      !detail.includes("onRequestStatusChange") && !detail.includes("<Select value={stageDisplayValue}"),
  "Opportunity Detail Status is informational only.");
check(detail.includes('aria-label="Task Description (controls Sales Status)"') &&
      detail.includes('onValueChange={(task) => update({ current_task_description: task })}') &&
      detail.includes('["current", "outcome"].includes(recordClassification)'),
  "Opportunity Detail offers the mapped task catalog for current and modern terminal opportunities.");
check(spreadsheet.includes("taskDescriptions={taskDescriptions}") &&
      !spreadsheet.includes("requestSalesStatusChange") && !spreadsheet.includes("onRequestStatusChange"),
  "All Sales views share the catalog and have no independent stage-change callback.");

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
check(page.includes('"needs_stage"') && page.includes('<SelectItem value="needs_stage">Needs Stage</SelectItem>'),
  "Top-level Information Filter exposes Needs Stage and can restore it per user.");

const filterDialog = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
check(filterDialog.includes('{ name: "Needs Stage", value: "needs_stage"') &&
      filterDialog.includes('options: ["needs_stage", "lead", "quoted"'),
  "Custom filter manager exposes Needs Stage without changing the WorkOrder enum.");

// Phase 4A: The desktop Status column is purely informational. History, stage
// colors, sorting and filters remain; Task Description is the edit surface.
const statusCell = row.slice(row.indexOf('case "sales_status": return ('), row.indexOf('case "stage_age": return ('));
check(statusCell.includes("stageDisplayLabel") && statusCell.includes("aria-label=") &&
      statusCell.includes("Change Task Description to move the Sales stage."),
  "Desktop status renders the shared stage label and directs editing through Task Description.");
check(!statusCell.includes("<Select") && !statusCell.includes("onValueChange") &&
      !statusCell.includes("onRequestStatusChange"),
  "Desktop status cell has no dropdown or independent mutation callback.");
check(statusCell.includes("SALES_STATUSES.find") && statusCell.includes("closed_neutral") &&
      statusCell.includes("unverifiedStage"),
  "All active, terminal, neutral and unverified stage states retain their visual treatments.");
check(statusCell.includes('handleContextMenu(e, wo, "sales_status", "Sales Status"'),
  "Desktop status keeps its field-history context menu.");
check(spreadsheet.includes("if (fieldName === \"sales_status\") return;"),
  "The generic Clear Cell route cannot independently clear Sales Status.");
const salesDialogs = readFileSync("src/components/sales/SalesPipelineDialogs.jsx", "utf8");
check(salesDialogs.includes('contextMenu.fieldName !== "sales_status"'),
  "Sales Status context menu hides the Clear action for all authenticated roles.");
const body = readFileSync("src/components/sales/SalesPipelineTableBody.jsx", "utf8");
check(!body.includes("onRequestStatusChange") &&
      !row.includes("onRequestStatusChange") &&
      !spreadsheet.match(/<SalesPipelineTableBody[^>]*onRequestStatusChange/),
  "Desktop row plumbing no longer accepts independent stage updates.");
check(spreadsheet.includes("onClick={() => handleSort('sales_status')}") &&
      spreadsheet.includes("handleHeaderContextMenu(e, 'sales_status', 'Sales Status')"),
  "Status header sorting and context filters remain operable.");
check(row.includes('updateWorkOrder(wo.id, "current_task_description", val)') &&
      row.includes('(!isOpen && wo.in_pipeline !== true)'),
  "Desktop Task Description is editable for modern Won/Lost reopening while legacy and neutral closures remain protected.");
same(salesStageDisplayLabel({ in_pipeline:true, sales_status:"follow_up" }), "Follow Up",
  "Desktop stage display helper provides the friendly Follow Up label.");
same(salesStageDisplayLabel({ in_pipeline:true, sales_status:"won" }), "Won",
  "Verified modern outcomes still show Won rather than a task-derived guess.");

console.log("Sales stage trust and desktop read-only Status: " + checks + "/" + checks + " PASS.");
