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
  { field: "work_notes", label: "Notes", direction: "two_way", transform: "notes_process", suggestedNames: ["Notes"] },
  { field: "title", label: "Job Description", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
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
  { field: "designer", label: "Designer", direction: "two_way", transform: "text", suggestedNames: ["Designer"] },
  { field: "project_manager", label: "Project Manager", direction: "two_way", transform: "text", suggestedNames: ["Project Manager"] },
  { field: "estimator", label: "Estimator", direction: "two_way", transform: "text", suggestedNames: ["Estimator"] },
  { field: "date_order_created", label: "Date Order Created", direction: "two_way", transform: "date", suggestedNames: ["Date Order Created"] },
  { field: "project_install_date", label: "Project Install Date", direction: "two_way", transform: "date", suggestedNames: ["Projected Install Date"] },
  { field: "permit_receipt_confirmed_date", label: "Permit Receipt Confirmed", direction: "two_way", transform: "date", suggestedNames: ["Date Permit Receipt Confirmed"] },
  { field: "permit_approved_date", label: "Permit Approved", direction: "two_way", transform: "date", suggestedNames: ["Date Permit Approved / Received"] },
  { field: "permit_number", label: "Permit Number", direction: "two_way", transform: "text", suggestedNames: ["Permit Number"] },
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
  { field: "requestor_email", label: "Requestor Email", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
  { field: "date_needed", label: "Date Needed", direction: "two_way", transform: "date", suggestedNames: ["Date Needed", "Date Needed (Requester fills out this column)", "Needed By"] },
  { field: "date_ordered", label: "Date Ordered", direction: "two_way", transform: "date", suggestedNames: ["Date Ordered", "Ordered Date", "Ordered Date (Carl Fills out this column)"] },
  { field: "vendor", label: "Vendor", direction: "two_way", transform: "text", suggestedNames: ["Vendor", "Vendor (Anyone can fill out this column)"] },
  { field: "date_received", label: "Date Received", direction: "two_way", transform: "date", suggestedNames: ["Date Received", "Received Date", "Date Recieved (Anyone can fill out this column)"] },
  { field: "status", label: "Status", direction: "base44_only", transform: "internal_history", suggestedNames: [] },
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

const WRITABLE_DIRECTIONS = new Set([
  SMARTSHEET_MAPPING_DIRECTIONS.TWO_WAY,
  SMARTSHEET_MAPPING_DIRECTIONS.BASE44_TO_SMARTSHEET,
]);

const TEXT_COMPATIBLE_TYPES = new Set(["TEXT_NUMBER", "PICKLIST", "CONTACT_LIST"]);

function analyzeColumnCompatibility(field, column) {
  const type = String(column?.type || "").trim().toUpperCase();
  const systemType = String(column?.system_column_type || "").trim();

  if (!type) {
    return { compatible: false, reason: "Smartsheet did not return a column type." };
  }
  if (WRITABLE_DIRECTIONS.has(field?.direction) && systemType) {
    return {
      compatible: false,
      reason: `System-managed column ${systemType} is not safe for a future Base44 → Smartsheet write.`,
    };
  }

  if (field?.transform === SMARTSHEET_TRANSFORMS.DATE) {
    return type === "DATE"
      ? { compatible: true, reason: "" }
      : { compatible: false, reason: `Expected Smartsheet DATE; found ${type}.` };
  }
  if ([SMARTSHEET_TRANSFORMS.MONEY, SMARTSHEET_TRANSFORMS.PERCENT].includes(field?.transform)) {
    return type === "TEXT_NUMBER"
      ? { compatible: true, reason: "" }
      : { compatible: false, reason: `Expected Smartsheet TEXT_NUMBER for numeric values; found ${type}.` };
  }
  if ([
    SMARTSHEET_TRANSFORMS.TEXT,
    SMARTSHEET_TRANSFORMS.CUSTOMER_RESOLUTION,
    SMARTSHEET_TRANSFORMS.STATUS_TRANSLATION,
    SMARTSHEET_TRANSFORMS.NOTES_PROCESS,
  ].includes(field?.transform)) {
    return TEXT_COMPATIBLE_TYPES.has(type)
      ? { compatible: true, reason: "" }
      : { compatible: false, reason: `Expected a scalar text-compatible Smartsheet column; found ${type}.` };
  }

  return { compatible: true, reason: "" };
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
      const column = matches[0];
      mappedColumnIds.add(String(column.id));
      const compatibility = analyzeColumnCompatibility(row, column);
      if (!compatibility.compatible) {
        return { ...row, status: "incompatible", matches, compatibility };
      }
      return { ...row, status: "matched", matches, compatibility };
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
  }, { matched: 0, missing: 0, conflict: 0, incompatible: 0, protected: 0 });

  return { fields, unmappedColumns, counts };
}

export function buildVerifiedSmartsheetBinding(result) {
  if (result?.status !== "ready" || !result?.sheet?.id || !result?.analysis) {
    throw new Error("A completed live mapping analysis is required before binding Smartsheet IDs.");
  }

  const counts = result.analysis.counts || {};
  if (Number(counts.missing || 0) > 0 || Number(counts.conflict || 0) > 0 || Number(counts.incompatible || 0) > 0) {
    throw new Error("All non-protected fields must resolve uniquely to compatible Smartsheet columns before IDs can be bound.");
  }

  const columnBindings = {};
  for (const field of result.analysis.fields || []) {
    if (field?.status !== "matched" || !field?.field || field?.matches?.length !== 1) continue;
    const column = field.matches[0];
    columnBindings[field.field] = {
      column_id: String(column.id),
      column_title: String(column.title || ""),
      column_type: String(column.type || ""),
    };
  }

  return {
    smartsheet_sheet_id: String(result.sheet.id),
    smartsheet_sheet_name: String(result.sheet.name || ""),
    column_bindings: columnBindings,
  };
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