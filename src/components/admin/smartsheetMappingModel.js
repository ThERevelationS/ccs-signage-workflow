export const SMARTSHEET_MAPPING_DIRECTIONS = Object.freeze({
  TWO_WAY: "two_way",
  BASE44_TO_SMARTSHEET: "base44_to_smartsheet",
  SMARTSHEET_TO_BASE44: "smartsheet_to_base44",
  BASE44_ONLY: "base44_only",
});

export const SMARTSHEET_TRANSFORMS = Object.freeze({
  TEXT: "text",
  CUSTOMER_RESOLUTION: "customer_resolution",
  STATUS_TRANSLATION: "status_translation",
  MONEY: "money",
  PERCENT: "percent",
  DATE: "date",
  NOTES_PROCESS: "notes_process",
  INTERNAL_ID: "internal_id",
  INTERNAL_HISTORY: "internal_history",
});

const sales = [
  { field: "client_name", label: "Customer", direction: "two_way", transform: "customer_resolution", suggestedNames: ["Customer", "Client", "Client Name"] },
  { field: "title", label: "Job Description", direction: "two_way", transform: "text", suggestedNames: ["Notes", "Job Description", "Description"] },
  { field: "sales_status", label: "Sales Status", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "lead_source", label: "Lead Source", direction: "two_way", transform: "text", suggestedNames: ["Source", "Lead Source"] },
  { field: "sales_rep", label: "Sales Rep", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "est_inv_at", label: "Est/Inv", direction: "two_way", transform: "text", suggestedNames: ["Est/Inv @", "Est/Inv", "Est / Inv #", "Estimate/Invoice"] },
  { field: "estimate_amount", label: "Estimate Amount", direction: "two_way", transform: "money", suggestedNames: ["Estimate Amount"] },
  { field: "current_task_description", label: "Next Action", direction: "two_way", transform: "text", suggestedNames: ["Current Task Description", "Next Action"] },
  { field: "current_task_deadline", label: "Next Action Due", direction: "two_way", transform: "date", suggestedNames: ["Current Task Deadline"] },
  { field: "current_task_assigned_to", label: "Next Action Owner", direction: "two_way", transform: "text", suggestedNames: ["Current Task Assigned to", "Task Owner"] },
  { field: "date_initial_contact", label: "Initial Contact", direction: "two_way", transform: "date", suggestedNames: ["Date Est. Requested/Initial Contact", "Date Est. Requested/ Initial Contact", "Initial Contact"] },
  { field: "site_survey_date", label: "Site Survey", direction: "two_way", transform: "date", suggestedNames: ["Site Survey"] },
  { field: "date_estimate_sent", label: "Estimate Sent", direction: "two_way", transform: "date", suggestedNames: ["Date Estimate Sent to Customer", "Quote Sent Date"] },
  { field: "follow_up_date", label: "Follow Up Date", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "expected_close_date", label: "Expected Close", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "close_date", label: "Close Date", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "lost_reason", label: "Lost Reason", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "customer_id", label: "Base44 Customer ID", direction: "base44_only", transform: "internal_id", suggestedNames: [] },
  { field: "sales_stage_changed_at", label: "Stage Changed At", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "sales_last_activity_at", label: "Sales Last Activity", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "sales_last_follow_up_completed_at", label: "Last Follow Up Completed", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "sales_last_follow_up_outcome", label: "Last Follow Up Outcome", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
];

const orders = [
  { field: "customer_name", label: "Customer", direction: "two_way", transform: "customer_resolution", suggestedNames: ["Customer", "Client", "Customer Name"] },
  { field: "request_type", label: "Request Type", direction: "two_way", transform: "status_translation", suggestedNames: ["Request Type", "Type"] },
  { field: "description", label: "Description", direction: "two_way", transform: "text", suggestedNames: ["Description", "Order Description"] },
  { field: "quantity", label: "Quantity", direction: "two_way", transform: "text", suggestedNames: ["Quantity", "How Much", "How much?"] },
  { field: "requestor_name", label: "Requestor", direction: "two_way", transform: "text", suggestedNames: ["Requestor", "Requested By"] },
  { field: "requestor_email", label: "Requestor Email", direction: "two_way", transform: "text", suggestedNames: ["Requestor Email", "Email"] },
  { field: "date_needed", label: "Date Needed", direction: "two_way", transform: "date", suggestedNames: ["Date Needed", "Date Needed (Requester fills out this column)", "Needed By"] },
  { field: "date_ordered", label: "Date Ordered", direction: "two_way", transform: "date", suggestedNames: ["Date Ordered", "Ordered Date", "Ordered Date (Carl Fills out this column)"] },
  { field: "vendor", label: "Vendor", direction: "two_way", transform: "text", suggestedNames: ["Vendor", "Vendor (Anyone can fill out this column)"] },
  { field: "date_received", label: "Date Received", direction: "two_way", transform: "date", suggestedNames: ["Date Received", "Received Date", "Date Recieved (Anyone can fill out this column)"] },
  { field: "status", label: "Status", direction: "two_way", transform: "status_translation", suggestedNames: ["Status"] },
  { field: "customer_id", label: "Base44 Customer ID", direction: "base44_only", transform: "internal_id", suggestedNames: [] },
  { field: "work_order_id", label: "Base44 WorkOrder ID", direction: "base44_only", transform: "internal_id", suggestedNames: [] },
  { field: "row_number", label: "Base44 Display Order", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "deleted", label: "Base44 Deleted State", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
];

export const SMARTSHEET_MAPPING_BLUEPRINTS = Object.freeze({
  sales: Object.freeze(sales.map((item) => Object.freeze({ ...item }))),
  orders: Object.freeze(orders.map((item) => Object.freeze({ ...item }))),
});

function normalizeColumnTitle(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function analyzeSmartsheetColumns(rows = [], columns = []) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const byNormalizedTitle = new Map();

  for (const column of safeColumns) {
    const key = normalizeColumnTitle(column?.title);
    if (!key) continue;
    const bucket = byNormalizedTitle.get(key) || [];
    bucket.push(column);
    byNormalizedTitle.set(key, bucket);
  }

  const mappedColumnIds = new Set();
  const fields = (Array.isArray(rows) ? rows : []).map((row) => {
    if (row?.direction === SMARTSHEET_MAPPING_DIRECTIONS.BASE44_ONLY) {
      return { ...row, status: "protected", matches: [] };
    }

    const names = [...new Set([row?.label, ...(row?.suggestedNames || [])].map(normalizeColumnTitle).filter(Boolean))];
    const matches = [];
    const seenIds = new Set();

    for (const name of names) {
      for (const column of byNormalizedTitle.get(name) || []) {
        const id = String(column?.id || "");
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        matches.push(column);
      }
    }

    if (matches.length === 1) {
      mappedColumnIds.add(String(matches[0].id));
      return { ...row, status: "matched", matches };
    }
    if (matches.length > 1) {
      return { ...row, status: "conflict", matches };
    }
    return { ...row, status: "missing", matches: [] };
  });

  const unmappedColumns = safeColumns.filter((column) => !mappedColumnIds.has(String(column?.id || "")));
  const counts = fields.reduce((result, field) => {
    result[field.status] = (result[field.status] || 0) + 1;
    return result;
  }, { matched: 0, missing: 0, conflict: 0, protected: 0 });

  return { fields, unmappedColumns, counts };
}

export function mappingDirectionLabel(direction) {
  if (direction === "two_way") return "Two-way";
  if (direction === "base44_to_smartsheet") return "Base44 → Smartsheet";
  if (direction === "smartsheet_to_base44") return "Smartsheet → Base44";
  if (direction === "base44_only") return "Base44 only";
  return "Unknown";
}

export function mappingTransformLabel(transform) {
  if (transform === "customer_resolution") return "Client resolution";
  if (transform === "status_translation") return "Translation";
  if (transform === "money") return "Currency";
  if (transform === "percent") return "Percent";
  if (transform === "date") return "Date";
  if (transform === "notes_process") return "Notes process";
  if (transform === "internal_id") return "Internal ID";
  if (transform === "internal_history") return "Internal / history";
  return "Text";
}
