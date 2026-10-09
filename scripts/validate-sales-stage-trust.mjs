import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getStageAgingState } from "../src/components/sales/salesStageAging.js";
import {
  hasRetiredSalesStageCondition,
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
same(salesStageDisplayValue(importedDefaultLead), "lead",
  "An imported Lead displays the persisted Lead classification, not a virtual stage.");
same(salesStageDisplayLabel(importedDefaultLead), "Lead",
  "The displayed stage remains Lead even when stage timing is missing.");
same(getStageAgingState({ ...importedDefaultLead, created_date: "2024-01-01", updated_date: "2026-10-08" }).tracked, false,
  "Missing stage timing is never backfilled from created_date or updated_date.");
same(salesStageDisplayValue({ ...importedDefaultLead, current_task_description: "Completed Sale" }), "lead",
  "Reading a legacy terminal task must not infer a modern Won outcome.");

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
}), "quoted", "Imported Quoted rows keep their stored stage without inventing verified timing.");

same(salesStageDisplayValue({
  in_pipeline: true,
  sales_status: "won",
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "123456789",
  sales_stage_changed_at: "",
}), "won", "Explicit modern Won outcomes remain Won.");

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
      !spreadsheet.includes('? "Needs Stage"') &&
      spreadsheet.includes("stageRow.trackedCount += 1;"),
  "Insights group stored statuses and only count verified stage-age evidence.");

const row = readFileSync("src/components/sales/SalesPipelineRow.jsx", "utf8");
check(row.includes("salesStageDisplayLabel(wo)") && row.includes("{stageDisplayLabel}") &&
      row.includes("Stage Timing Missing") &&
      !row.slice(row.indexOf('case "sales_status": return ('), row.indexOf('case "stage_age": return (')).includes("<Select"),
  "Desktop table shows the stage trust label without an independent status selector.");

const mobile = readFileSync("src/components/sales/SalesPipelineMobileCards.jsx", "utf8");
check(mobile.includes("salesStageDisplayLabel(wo)") && mobile.includes('aria-label={`Sales Status: ${stageDisplayLabel}`}') &&
      !mobile.includes("onRequestStatusChange") && !mobile.includes("<Select value={stageDisplayValue}"),
  "Mobile shows a readable stage badge without independent status selection.");

const board = readFileSync("src/components/sales/SalesPipelineKanban.jsx", "utf8");
check(!board.includes('value: "needs_stage"') &&
      board.includes("salesStageDisplayValue(workOrder) === status.value") &&
      board.includes('value: "closed_neutral"'),
  "Board uses the real Sales stages plus distinct neutral closure, never a virtual Needs Stage column.");
check(!board.includes("draggable=") && !board.includes("onDrop=") &&
      !board.includes("onDragOver=") && !board.includes("requestStatusChange"),
  "Kanban stage changes via drag-and-drop or independent actions are disabled.");
check(board.includes("salesStageDisplayLabel(workOrder)") && board.includes('aria-label={`Sales Status: ${stageDisplayLabel}`}'),
  "Kanban retains read-only stage badges and direct Opportunity Detail access.");

const detail = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");
check(detail.includes("salesStageDisplayLabel(workOrder)") &&
      detail.includes("Stage timing is unverified. Select the appropriate Task Description; no timestamp will be invented."),
  "Opportunity detail directs stage updates through Task Description without fabricating history.");
check(detail.includes('aria-label={`Read-only Sales Status: ${statusLabel}') &&
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
check(!page.includes('<SelectItem value="needs_stage">') &&
      page.includes('savedInformation === "needs_stage"') && page.includes("retiredInformationPreference"),
  "Information Filter removes the retired option and repairs an old selection safely.");

const filterDialog = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
check(!filterDialog.includes('{ name: "Needs Stage", value: "needs_stage"') &&
      filterDialog.includes('options: ["lead", "quoted"') &&
      filterDialog.includes("hasRetiredSalesStageCondition(filterConditions)"),
  "Custom filter manager offers only real stages and rejects retired conditions on save.");
check(hasRetiredSalesStageCondition([{ field:"sales_status", operator:"equals", value:"needs_stage" }]),
  "Legacy saved stage equality filters are detected without editing stored definitions.");
check(hasRetiredSalesStageCondition([{ field:"sales_status", operator:"is_one_of", value:"lead,needs_stage" }]),
  "Legacy selected-stage lists containing the retired option are detected.");
check(!hasRetiredSalesStageCondition([{ field:"sales_status", operator:"equals", value:"lead" }]) &&
      !hasRetiredSalesStageCondition([{ field:"sales_status", operator:"not_empty", value:"needs_stage" }]),
  "Valid modern status filters and value-free operators are preserved.");
check(page.includes("availableSelected = selected.filter") && page.includes("hasRetiredSalesStageCondition(f.conditions)"),
  "Invalid saved filters are excluded from active selections but retained for editing.");
check(spreadsheet.includes('selected.includes("needs_stage")') && spreadsheet.includes("handleCustomSort"),
  "Retired header filter values are removed without discarding other selected statuses.");

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
