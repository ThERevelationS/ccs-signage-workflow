import { buildSharedOrderContactCell, readSharedOrderRequestor, sharedOrderRequestorColumnId } from './smartsheetOrderContact.mjs';
import { orderDateOptionField, translateOrderDateCell } from './smartsheetOrderDateTranslation.mjs';
import { smartsheetSalesAssigneeLabel } from './smartsheetSalesAssigneeTranslation.mjs';

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
  { key: "est_inv_at", label: "Est / Inv #", type: "text" },
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
  if (field.key === "current_task_assigned_to") {
    return smartsheetSalesAssigneeLabel(raw) || null;
  }
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
  const cells: { columnId: string; value: string | number | null; displayValue?: string }[] = [];
  const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';
  for (const field of fields) {
    if (sharedContactId && (field.key === 'requestor_name' || field.key === 'requestor_email')) continue;
    const columnId = String(bindings?.[field.key] ?? "").trim();
    if (!columnId || !/^\d+$/.test(columnId)) continue;
    const value = extractFieldValue(record, field);
    cells.push({ columnId, value });
  }
  // A shared CONTACT_LIST column is one cell, not separate name/email writes.
  // With no valid email, leave Smartsheet's existing contact untouched.
  if (sharedContactId) {
    const contactCell = buildSharedOrderContactCell(record, sharedContactId);
    if (contactCell) cells.push(contactCell);
  }
  return cells;
}

// Reverse mapping: extract Base44 field values from a Smartsheet row's cells.
// bindings: { [base44FieldKey]: smartsheetColumnId }
export function parseRowToFields(
  row: { id: string; cells: { column_id: string; value: any; display_value?: string }[] },
  bindings: Record<string, string>,
  dataset: "sales" | "orders",
): Record<string, any> {
  const fields = getMappableFields(dataset);
  // Multiple Base44 fields can map to the same Smartsheet column (e.g.
  // requestor_name and requestor_email both bound to a CONTACT column).
  // Keep a list of fields per column so all of them get populated.
  const columnToFields: Record<string, MappableField[]> = {};
  for (const field of fields) {
    const columnId = String(bindings?.[field.key] ?? "").trim();
    if (columnId && /^\d+$/.test(columnId)) {
      if (!columnToFields[columnId]) columnToFields[columnId] = [];
      columnToFields[columnId].push(field);
    }
  }
  const out: Record<string, any> = {};
  for (const cell of row?.cells || []) {
    const colId = String(cell.column_id || cell.columnId || "");
    const fieldList = columnToFields[colId];
    if (!fieldList || fieldList.length === 0) continue;
    const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';
    if (sharedContactId && sharedContactId === colId) {
      const contact = readSharedOrderRequestor(cell);
      if (contact.name) out.requestor_name = contact.name;
      if (contact.email) out.requestor_email = contact.email;
    }
    for (const field of fieldList) {
      if (sharedContactId && sharedContactId === colId &&
          (field.key === 'requestor_name' || field.key === 'requestor_email')) continue;
      // For date and number fields, prefer the raw `value` (ISO date / number).
      // For text fields, prefer `display_value` — Smartsheet CONTACT columns store
      // an object in `value` and the readable name in `display_value`.
      const preferValue = field.type === 'date' || field.type === 'number';
      const display = cell.display_value != null ? cell.display_value : cell.displayValue;
      // Sales Est / Inv # is an identifier displayed as a five-digit number
      // in Smartsheet. Its raw value can be numeric while displayValue is
      // omitted. Preserve that raw value as text instead of dropping it.
      const salesEstInv = dataset === 'sales' && field.key === 'est_inv_at';
      const raw = salesEstInv
        ? (cell.value != null && cell.value !== '' ? cell.value : display)
        : preferValue
          ? (cell.value != null ? cell.value : (display != null ? display : null))
          : (dataset === 'orders' && (display === '' || display == null)
            ? cell.value // Smartsheet sometimes omits displayValue even for populated text cells.
            : (display != null ? display : cell.value));
      if (raw === null || raw === undefined || raw === "") continue;
      if (field.type === "number") {
        const num = Number(raw);
        if (Number.isFinite(num)) out[field.key] = num;
      } else if (field.type === "date") {
        if (dataset === 'orders') {
          const translated = translateOrderDateCell(cell, field.key);
          const optionField = orderDateOptionField(field.key);
          if (translated.kind === 'date') {
            out[field.key] = translated.value;
            if (optionField) out[optionField] = '';
          } else if (translated.kind === 'text' && optionField) {
            // The legacy Smartsheet date columns intentionally contain text
            // choices/notes. Preserve them separately and clear only the paired
            // date after full-sheet validation and permanent-row matching.
            out[field.key] = '';
            out[optionField] = translated.value;
          }
          // Invalid date-shaped values are rejected by the Order-only pull preflight.
        } else {
          const stamp = dateStamp(raw);
          if (stamp) out[field.key] = stamp;
        }
      } else if (field.type === "notes") {
        // Skip notes on pull — would need complex deserialization
      } else {
        out[field.key] = cleanText(raw);
      }
    }
  }
  return out;
}

// Sales pull safety sometimes needs the exact remote row as a baseline
// without first applying it to Base44 (for example when a local edit is still
// waiting to push). Preserve every currently bound remote cell, including blank
// cells that Smartsheet omits from the row payload.
export function buildSalesPullSnapshot(
  row: { cells?: { column_id?: string; columnId?: string; value?: any; display_value?: any; displayValue?: any }[] },
  bindings: Record<string, string>,
) {
  const fieldsByColumn = new Map<string, MappableField>();
  for (const field of SALES_MAPPABLE_FIELDS) {
    const columnId = String(bindings?.[field.key] ?? '').trim();
    if (/^\d+$/.test(columnId) && !fieldsByColumn.has(columnId)) fieldsByColumn.set(columnId, field);
  }
  const boundIds = new Set(fieldsByColumn.keys());
  const snapshot: Record<string, string | number | null> = {};
  for (const cell of row?.cells || []) {
    const columnId = String(cell?.column_id ?? cell?.columnId ?? '').trim();
    const field = fieldsByColumn.get(columnId);
    if (!field) continue;
    const display = cell?.display_value != null ? cell.display_value : cell?.displayValue;
    const preferRaw = field.type === 'number' || field.type === 'date' || field.key === 'est_inv_at';
    const raw = preferRaw
      ? (cell?.value != null && cell.value !== '' ? cell.value : display)
      : (display != null ? display : cell?.value);

    if (raw == null || raw === '') {
      snapshot[columnId] = '';
    } else if (field.key === 'current_task_assigned_to') {
      snapshot[columnId] = smartsheetSalesAssigneeLabel(raw);
    } else if (field.type === 'number') {
      const number = Number(raw);
      snapshot[columnId] = Number.isFinite(number) ? number : String(raw).trim();
    } else if (field.type === 'date') {
      snapshot[columnId] = dateStamp(raw) || String(raw).trim();
    } else {
      snapshot[columnId] = String(raw).trim();
    }
  }
  for (const columnId of boundIds) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, columnId)) snapshot[columnId] = '';
  }
  return snapshot;
}

// Order pull snapshots must represent the actual remote row, not a merged
// Base44 record. This lets a blank Smartsheet cell remain non-destructive while
// still recording that the remote cell is truly blank for later reconciliation.
export function buildOrderPullSnapshot(
  row: { cells?: { column_id?: string; columnId?: string; value?: any; display_value?: any; displayValue?: any }[] },
  bindings: Record<string, string>,
) {
  const boundIds = new Set(
    Object.values(bindings || {}).map((id) => String(id ?? '').trim()).filter((id) => /^\d+$/.test(id)),
  );
  const snapshot: Record<string, string | number | null> = {};
  const sharedContactId = sharedOrderRequestorColumnId(bindings);
  for (const cell of row?.cells || []) {
    const columnId = String(cell?.column_id ?? cell?.columnId ?? '').trim();
    if (!boundIds.has(columnId)) continue;
    if (sharedContactId && columnId === sharedContactId) {
      const contact = readSharedOrderRequestor(cell);
      snapshot[columnId] = contact.email || contact.name || '';
      continue;
    }
    const display = cell?.display_value != null ? cell.display_value : cell?.displayValue;
    const value = display != null ? display : cell?.value;
    snapshot[columnId] = value == null ? '' : (typeof value === 'number' ? value : String(value).trim());
  }
  // Smartsheet can omit empty cells from a row payload. Bound-but-absent means
  // blank remotely and must be represented as such rather than inherited locally.
  for (const columnId of boundIds) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, columnId)) snapshot[columnId] = '';
  }
  return snapshot;
}

// Snapshot of the values we just wrote, stored on the record for three-way
// conflict detection on the next sync.
export function buildSnapshot(record: any, bindings: Record<string, string>, dataset: "sales" | "orders") {
  const fields = getMappableFields(dataset);
  const snapshot: Record<string, string | number | null> = {};
  const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';
  for (const field of fields) {
    if (sharedContactId && (field.key === 'requestor_name' || field.key === 'requestor_email')) continue;
    const columnId = String(bindings?.[field.key] ?? "").trim();
    if (!columnId || !/^\d+$/.test(columnId)) continue;
    const optionField = dataset === 'orders' ? orderDateOptionField(field.key) : '';
    const optionValue = optionField ? cleanText(record?.[optionField], 120) : '';
    snapshot[columnId] = optionValue || extractFieldValue(record, field);
  }
  if (sharedContactId) {
    const contactCell = buildSharedOrderContactCell(record, sharedContactId);
    if (contactCell) snapshot[sharedContactId] = contactCell.value;
  }
  return snapshot;
}