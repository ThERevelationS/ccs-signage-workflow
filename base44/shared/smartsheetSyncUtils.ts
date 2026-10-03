// Utility functions extracted from smartsheetSyncAction to keep the entry
// file under the platform line limit. Shared between pull and push paths.

export function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function normalizeSheets(body: any) {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((sheet: any) => ({
    id: String(sheet?.id ?? ''),
    name: cleanText(sheet?.name, 300),
    access_level: cleanText(sheet?.accessLevel, 80),
    owner: cleanText(sheet?.owner, 320),
    modified_at: cleanText(sheet?.modifiedAt, 80),
  })).filter((sheet: any) => sheet.id && sheet.name);
}

export function normalizeColumns(body: any) {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return rows.map((column: any) => ({
    id: String(column?.id ?? ''),
    title: cleanText(column?.title, 300),
    type: cleanText(column?.type, 80),
    primary: column?.primary === true,
    system_column_type: cleanText(column?.systemColumnType, 80),
    validation: column?.validation === true,
    options: Array.isArray(column?.options)
      ? column.options.map((option: unknown) => cleanText(option, 300)).filter(Boolean).slice(0, 500)
      : [],
  })).filter((column: any) => column.id && column.title);
}

export function normalizeCellPayload(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return cleanText(value, 4000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  try { return cleanText(JSON.stringify(value), 4000); } catch { return cleanText(value, 4000); }
}

export function normalizeSheetRows(body: any) {
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  return rows.map((row: any) => ({
    id: String(row?.id ?? ''),
    row_number: Number(row?.rowNumber || 0) || null,
    parent_id: row?.parentId ? String(row.parentId) : '',
    modified_at: cleanText(row?.modifiedAt, 80),
    cells: (Array.isArray(row?.cells) ? row.cells : []).map((cell: any) => ({
      column_id: String(cell?.columnId ?? ''),
      value: normalizeCellPayload(cell?.value),
      display_value: cleanText(cell?.displayValue, 4000),
    })).filter((cell: any) => cell.column_id),
  })).filter((row: any) => row.id);
}

export function numericIdList(value: unknown, maxItems = 100) {
  const source = Array.isArray(value) ? value : [];
  const ids = [...new Set(source.map((item) => cleanText(item, 40)).filter((item) => /^\d+$/.test(item)))];
  return ids.slice(0, maxItems);
}

export function normalizePullValue(fieldKey: string, value: any): any {
  if (value === null || value === undefined || value === "") return undefined;
  if (fieldKey === "work_notes" && Array.isArray(value)) return value;
  const str = String(value).trim();
  if (!str) return undefined;
  const lower = str.toLowerCase();
  if (fieldKey === "sales_status") {
    if (["lead", "new", "open"].includes(lower)) return "lead";
    if (["quoted", "quote sent", "proposal sent", "estimate sent"].includes(lower)) return "quoted";
    if (["follow_up", "follow up", "following up", "follow-up", "followup"].includes(lower)) return "follow_up";
    if (["won", "closed won", "deal won", "yes", "win"].includes(lower)) return "won";
    if (["lost", "closed lost", "deal lost", "no"].includes(lower)) return "lost";
    if (["on_hold", "on hold", "hold", "paused", "pending"].includes(lower)) return "on_hold";
    return undefined;
  }
  if (fieldKey === "status") {
    if (["pending", "not started", "new", "requested", "todo"].includes(lower)) return "pending";
    if (["ordered", "submitted", "placed", "in progress"].includes(lower)) return "ordered";
    if (["received", "complete", "done", "fulfilled", "delivered"].includes(lower)) return "received";
    if (["cancelled", "canceled", "void", "closed"].includes(lower)) return "cancelled";
    return undefined;
  }
  if (fieldKey === "request_type") {
    if (lower.includes("substrate")) return "Substrate";
    if (lower.includes("vinyl")) return "Vinyl";
    if (lower.includes("suppl")) return "Supplies";
    return "Other";
  }
  if (fieldKey === "permitting") {
    if (["yes", "y", "required", "true"].includes(lower)) return "yes";
    if (["no", "n", "not required", "false"].includes(lower)) return "no";
    if (["maybe", "perhaps", "uncertain", "tbd", "unsure"].includes(lower)) return "maybe";
    return "na";
  }
  return str;
}