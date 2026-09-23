// Shared Smartsheet sync field vocabulary used by both the backend sync engine
// and the frontend column-bindings editor. Keeps the two sides in sync so a
// binding configured in the UI maps to the exact field the backend writes.

export interface MappableField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "notes";
}

export const SALES_MAPPABLE_FIELDS: MappableField[] = [
  { key: "title", label: "Project Title", type: "text" },
  { key: "client_name", label: "Client Name", type: "text" },
  { key: "sales_status", label: "Sales Status", type: "text" },
  { key: "lead_source", label: "Lead Source", type: "text" },
  { key: "estimate_amount", label: "Estimate Amount", type: "number" },
  { key: "contact_name", label: "Contact Name", type: "text" },
  { key: "contact_email", label: "Contact Email", type: "text" },
  { key: "contact_phone", label: "Contact Phone", type: "text" },
  { key: "sales_rep", label: "Sales Rep", type: "text" },
  { key: "project_type", label: "Project Type", type: "text" },
  { key: "install_location", label: "Install Location", type: "text" },
  { key: "township_city", label: "Township/City", type: "text" },
  { key: "county", label: "County", type: "text" },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "close_date", label: "Close Date", type: "date" },
  { key: "expected_close_date", label: "Expected Close Date", type: "date" },
  { key: "date_initial_contact", label: "Date Initial Contact", type: "date" },
  { key: "date_estimate_sent", label: "Date Estimate Sent", type: "date" },
  { key: "date_order_created", label: "Date Order Created", type: "date" },
  { key: "project_install_date", label: "Project Install Date", type: "date" },
  { key: "permit_submitted_date", label: "Permit Submitted", type: "date" },
  { key: "permit_approved_date", label: "Permit Approved", type: "date" },
  { key: "permit_number", label: "Permit Number", type: "text" },
  { key: "permitting", label: "Permitting", type: "text" },
  { key: "estimator", label: "Estimator", type: "text" },
  { key: "designer", label: "Designer", type: "text" },
  { key: "surveyor", label: "Surveyor", type: "text" },
  { key: "project_manager", label: "Project Manager", type: "text" },
  { key: "current_task_description", label: "Current Task", type: "text" },
  { key: "current_task_assigned_to", label: "Current Task Assigned To", type: "text" },
  { key: "current_task_deadline", label: "Current Task Deadline", type: "date" },
  { key: "lost_reason", label: "Lost Reason", type: "text" },
  { key: "notes_serialized", label: "Work Notes (serialized)", type: "notes" },
];

export const ORDER_MAPPABLE_FIELDS: MappableField[] = [
  { key: "customer_name", label: "Customer Name", type: "text" },
  { key: "request_type", label: "Request Type", type: "text" },
  { key: "description", label: "Description", type: "text" },
  { key: "quantity", label: "Quantity", type: "text" },
  { key: "date_needed", label: "Date Needed", type: "date" },
  { key: "date_ordered", label: "Date Ordered", type: "date" },
  { key: "vendor", label: "Vendor", type: "text" },
  { key: "date_received", label: "Date Received", type: "date" },
  { key: "status", label: "Status", type: "text" },
  { key: "requestor_name", label: "Requestor Name", type: "text" },
  { key: "requestor_email", label: "Requestor Email", type: "text" },
];

export function getMappableFields(dataset: "sales" | "orders"): MappableField[] {
  return dataset === "orders" ? ORDER_MAPPABLE_FIELDS : SALES_MAPPABLE_FIELDS;
}

function cleanText(value: unknown, maxLength = 4000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function dateStamp(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  admin: "Administrative Work",
  fabrication: "Sign Shop Fabrication",
  vinyl: "Vinyl Production",
  permitting: "Permitting Steps",
  design: "Design Work",
  installation: "Installation",
  client: "Client Communication",
  other: "Other",
};

// Serialize WorkOrder.work_notes into the canonical text block stored in the
// Smartsheet notes column. Mirrors the frontend translation model so a pull
// round-trip preserves structure.
export function serializeWorkNotes(workNotes: any[] = []): string {
  if (!Array.isArray(workNotes) || workNotes.length === 0) return "";
  return workNotes.map((note: any) => {
    const date = dateStamp(note?.timestamp) || "undated";
    const type = NOTE_TYPE_LABELS[String(note?.type || "other")] || NOTE_TYPE_LABELS.other;
    const author = String(note?.created_by ?? "").trim() || "Unknown";
    const body = String(note?.text ?? "").replace(/\r\n?/g, "\n").trim();
    const lines = [`[${date} | ${type} | ${author}] ${body}`.trimEnd()];
    for (const subTask of Array.isArray(note?.sub_tasks) ? note.sub_tasks : []) {
      const subText = String(subTask?.text ?? "").trim();
      if (!subText) continue;
      lines.push(`  - [${subTask?.completed ? "x" : " "}] ${subText}`);
    }
    return lines.join("\n");
  }).filter(Boolean).join("\n\n");
}

// Extract a single field value from a Base44 record, ready for a Smartsheet cell.
export function extractFieldValue(record: any, field: MappableField): string | number | null {
  if (!record) return null;
  if (field.type === "notes") {
    if (field.key === "notes_serialized") {
      return serializeWorkNotes(Array.isArray(record?.work_notes) ? record.work_notes : []);
    }
    return null;
  }
  const raw = record?.[field.key];
  if (raw === null || raw === undefined || raw === "") return null;
  if (field.type === "number") {
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  if (field.type === "date") {
    return dateStamp(raw) || null;
  }
  return cleanText(raw);
}

// Build the Smartsheet cell payload array from a record + column bindings.
// bindings: { [base44FieldKey]: smartsheetColumnId }
export function buildCells(record: any, bindings: Record<string, string>, dataset: "sales" | "orders") {
  const fields = getMappableFields(dataset);
  const cells: { columnId: string; value: string | number | null }[] = [];
  for (const field of fields) {
    const columnId = String(bindings?.[field.key] ?? "").trim();
    if (!columnId || !/^\d+$/.test(columnId)) continue;
    const value = extractFieldValue(record, field);
    cells.push({ columnId, value });
  }
  return cells;
}

// Snapshot of the values we just wrote, stored on the record for three-way
// conflict detection on the next sync.
export function buildSnapshot(record: any, bindings: Record<string, string>, dataset: "sales" | "orders") {
  const fields = getMappableFields(dataset);
  const snapshot: Record<string, string | number | null> = {};
  for (const field of fields) {
    const columnId = String(bindings?.[field.key] ?? "").trim();
    if (!columnId || !/^\d+$/.test(columnId)) continue;
    snapshot[columnId] = extractFieldValue(record, field);
  }
  return snapshot;
}