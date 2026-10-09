import { isExplicitNeutralSalesClosure } from "./salesRecordScopes.js";

const text = (value) => String(value ?? "").trim();
const numericId = (value) => /^\d+$/.test(text(value));

export function isUnverifiedSmartsheetSalesStage(workOrder = {}) {
  const status = text(workOrder?.sales_status).toLowerCase();
  if (workOrder?.in_pipeline !== true || ["won", "lost"].includes(status)) return false;
  if (!numericId(workOrder?.smartsheet_sheet_id) || !numericId(workOrder?.smartsheet_row_id)) return false;
  return !text(workOrder?.sales_stage_changed_at);
}

// A missing stage timestamp is an evidence gap, not a seventh Sales stage.
// Show the stored classification without interpreting legacy Smartsheet tasks or
// inventing stage history. Timing stays independently untracked until a real change.
export function salesStageDisplayValue(workOrder = {}) {
  if (isExplicitNeutralSalesClosure(workOrder)) return "closed_neutral";
  return text(workOrder?.sales_status) || "lead";
}

export function salesStageDisplayLabel(workOrder = {}) {
  if (isExplicitNeutralSalesClosure(workOrder)) return "Closed (Neutral)";
  const value = salesStageDisplayValue(workOrder);
  return ({
    lead: "Lead",
    quoted: "Quoted",
    follow_up: "Follow Up",
    on_hold: "On Hold",
    won: "Won",
    lost: "Lost",
  })[value] || value;
}
