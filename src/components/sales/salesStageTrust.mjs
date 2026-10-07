export const UNVERIFIED_SALES_STAGE = "needs_stage";

const text = (value) => String(value ?? "").trim();
const numericId = (value) => /^\d+$/.test(text(value));

export function isUnverifiedSmartsheetSalesStage(workOrder = {}) {
  const status = text(workOrder?.sales_status).toLowerCase();
  if (workOrder?.in_pipeline !== true || ["won", "lost"].includes(status)) return false;
  if (!numericId(workOrder?.smartsheet_sheet_id) || !numericId(workOrder?.smartsheet_row_id)) return false;
  return !text(workOrder?.sales_stage_changed_at);
}

export function salesStageDisplayValue(workOrder = {}) {
  if (isUnverifiedSmartsheetSalesStage(workOrder)) return UNVERIFIED_SALES_STAGE;
  return text(workOrder?.sales_status) || "lead";
}

export function salesStageDisplayLabel(workOrder = {}) {
  if (isUnverifiedSmartsheetSalesStage(workOrder)) return "Needs Stage";
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
