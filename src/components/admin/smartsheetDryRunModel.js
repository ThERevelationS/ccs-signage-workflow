function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeStatus(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeComparable(value, transform) {
  if (value === undefined || value === null) return "";
  if (transform === "money" || transform === "percent") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : normalizeWhitespace(value);
  }
  if (transform === "date") return normalizeWhitespace(value).slice(0, 10);
  if (transform === "status_translation") return normalizeStatus(value);
  if (transform === "customer_resolution") return normalizeWhitespace(value).toLowerCase();
  return normalizeWhitespace(value);
}

function cellValue(cell) {
  if (cell?.display_value !== undefined && cell?.display_value !== null && cell.display_value !== "") {
    return cell.display_value;
  }
  return cell?.value ?? "";
}

export function smartsheetRowValues(row, columnBindings = {}) {
  const byColumnId = new Map();
  for (const [field, binding] of Object.entries(columnBindings || {})) {
    const columnId = String(binding?.column_id || "");
    if (columnId) byColumnId.set(columnId, field);
  }

  const values = {};
  for (const cell of row?.cells || []) {
    const field = byColumnId.get(String(cell?.column_id || ""));
    if (!field) continue;
    values[field] = cellValue(cell);
  }
  return values;
}

function candidateKey(values, fields) {
  const parts = fields.map((field) => normalizeWhitespace(values?.[field]).toLowerCase());
  return parts.every(Boolean) ? parts.join("\u0001") : "";
}

function compareMappedFields({ rowValues, record, blueprint, columnBindings }) {
  const differences = [];
  for (const field of blueprint || []) {
    if (field?.direction === "base44_only") continue;
    if (!columnBindings?.[field.field]) continue;
    const sheetValue = normalizeComparable(rowValues?.[field.field], field.transform);
    const base44Value = normalizeComparable(record?.[field.field], field.transform);
    if (sheetValue !== base44Value) {
      differences.push({
        field: field.field,
        label: field.label,
        smartsheet_value: rowValues?.[field.field] ?? "",
        base44_value: record?.[field.field] ?? "",
      });
    }
  }
  return differences;
}

export function buildSmartsheetDryRunPreview({
  sheetId,
  smartsheetRows = [],
  base44Rows = [],
  blueprint = [],
  columnBindings = {},
  dataset = "",
} = {}) {
  const safeSheetId = String(sheetId || "");
  const directByRowId = new Map();
  const legacyByRowId = new Map();
  const exactKeyFields = dataset === "sales"
    ? ["client_name", "title"]
    : ["customer_name", "description", "request_type"];
  const exactCandidates = new Map();

  for (const record of base44Rows || []) {
    if (record?.deleted === true) continue;

    const linkedSheet = String(record?.smartsheet_sheet_id || "");
    const linkedRow = String(record?.smartsheet_row_id || "");
    if (linkedSheet === safeSheetId && linkedRow) directByRowId.set(linkedRow, record);

    if (dataset === "sales") {
      const legacyRow = String(record?.sales_import_source_id || "");
      if (legacyRow) {
        const bucket = legacyByRowId.get(legacyRow) || [];
        bucket.push(record);
        legacyByRowId.set(legacyRow, bucket);
      }
    }

    const key = candidateKey(record, exactKeyFields);
    if (key) {
      const bucket = exactCandidates.get(key) || [];
      bucket.push(record);
      exactCandidates.set(key, bucket);
    }
  }

  const rows = (smartsheetRows || []).map((sheetRow) => {
    const rowId = String(sheetRow?.id || "");
    const rowValues = smartsheetRowValues(sheetRow, columnBindings);
    let matchMethod = "none";
    let matchedRecord = directByRowId.get(rowId) || null;
    let candidates = [];

    if (matchedRecord) {
      matchMethod = "stable_id";
    } else if (dataset === "sales" && legacyByRowId.has(rowId)) {
      candidates = legacyByRowId.get(rowId) || [];
      if (candidates.length === 1) {
        matchedRecord = candidates[0];
        matchMethod = "legacy_source_id";
      } else if (candidates.length > 1) {
        matchMethod = "ambiguous";
      }
    }

    if (!matchedRecord && matchMethod !== "ambiguous") {
      const key = candidateKey(rowValues, exactKeyFields);
      candidates = key ? (exactCandidates.get(key) || []) : [];
      if (candidates.length === 1) {
        matchedRecord = candidates[0];
        matchMethod = "exact_composite";
      } else if (candidates.length > 1) {
        matchMethod = "ambiguous";
      }
    }

    const differences = matchedRecord
      ? compareMappedFields({ rowValues, record: matchedRecord, blueprint, columnBindings })
      : [];

    const status = matchMethod === "stable_id"
      ? (differences.length ? "linked_different" : "linked_same")
      : matchMethod === "ambiguous"
        ? "ambiguous"
        : matchedRecord
          ? "candidate"
          : "unlinked";

    return {
      row_id: rowId,
      row_number: Number(sheetRow?.row_number || 0) || null,
      status,
      match_method: matchMethod,
      base44_id: matchedRecord?.id || "",
      base44_label: dataset === "sales"
        ? (matchedRecord?.client_name || matchedRecord?.title || "")
        : (matchedRecord?.customer_name || matchedRecord?.description || ""),
      candidate_count: matchMethod === "ambiguous" ? candidates.length : matchedRecord ? 1 : 0,
      differences,
      values: rowValues,
    };
  });

  const summary = rows.reduce((result, row) => {
    result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, {
    linked_same: 0,
    linked_different: 0,
    candidate: 0,
    ambiguous: 0,
    unlinked: 0,
  });

  return { rows, summary };
}
