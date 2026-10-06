import { isSmartsheetSalesImportShell } from "@/shared/smartsheetSalesImportEligibility.mjs";

export function salesOpportunityDisplayName(workOrder, fallback = "Unnamed opportunity") {
  const clientName = String(workOrder?.client_name || "").trim();
  if (isSmartsheetSalesImportShell(workOrder)) {
    const rowId = String(workOrder?.smartsheet_row_id || "").trim();
    return rowId ? `Smartsheet row ${rowId} · customer missing` : "Smartsheet row · customer missing";
  }
  return clientName || fallback;
}
