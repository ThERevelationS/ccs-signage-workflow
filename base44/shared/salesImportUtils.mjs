const STATUS_ALIASES = new Map([
  ["lead", "lead"],
  ["quoted", "quoted"],
  ["quote", "quoted"],
  ["follow up", "follow_up"],
  ["follow-up", "follow_up"],
  ["followup", "follow_up"],
  ["follow_up", "follow_up"],
  ["on hold", "on_hold"],
  ["on-hold", "on_hold"],
  ["onhold", "on_hold"],
  ["on_hold", "on_hold"],
  ["won", "won"],
  ["lost", "lost"],
]);

const FIELD_DEFINITIONS = [
  { field: "client_name", aliases: ["Customer", "Client", "Client Name", "client_name"], type: "text" },
  { field: "sales_status", aliases: ["Sales Status", "Status", "sales_status"], type: "status" },
  { field: "lead_source", aliases: ["Source", "Lead Source", "lead_source"], type: "text" },
  { field: "current_task_deadline", aliases: ["Current Task Deadline", "Task Deadline", "current_task_deadline"], type: "date" },
  { field: "current_task_assigned_to", aliases: ["Current Task Assigned to", "Task Assigned To", "Task Owner", "current_task_assigned_to"], type: "text" },
  { field: "designer", aliases: ["Designer", "designer"], type: "text" },
  { field: "project_manager", aliases: ["Project Manager", "project_manager"], type: "text" },
  { field: "estimator", aliases: ["Estimator", "estimator"], type: "text" },
  { field: "est_inv_at", aliases: ["Est/Inv @", "Est/Inv", "Estimate/Invoice", "est_inv_at"], type: "identifier" },
  { field: "estimate_amount", aliases: ["Estimate Amount", "Estimate", "estimate_amount"], type: "number" },
  { field: "quoted_amount", aliases: ["Quoted Amount", "Quote Amount", "quoted_amount"], type: "number" },
  { field: "current_task_description", aliases: ["Current Task Description", "Next Action", "Task Description", "current_task_description"], type: "text" },
  { field: "date_initial_contact", aliases: ["Date Est. Requested/Initial Contact", "Initial Contact", "Date Initial Contact", "date_initial_contact"], type: "date" },
  { field: "site_survey_date", aliases: ["Site Survey", "Site Survey Date", "site_survey_date"], type: "date" },
  { field: "date_estimate_sent", aliases: ["Date Estimate Sent to Customer", "Estimate Sent", "Quote Sent Date", "date_estimate_sent"], type: "date", noFuture: true },
  { field: "date_order_created", aliases: ["Date Order Created", "Order Created", "date_order_created"], type: "date" },
  { field: "project_install_date", aliases: ["Project Install Date", "Install Date", "project_install_date"], type: "date" },
  { field: "permit_submitted_date", aliases: ["Permit Submitted", "Permit Submitted Date", "permit_submitted_date"], type: "date" },
  { field: "title", aliases: ["Notes", "Job Notes", "Title", "title"], type: "text" },
  { field: "permit_receipt_confirmed_date", aliases: ["Date Permit Receipt Confirmed", "Permit Receipt Confirmed", "permit_receipt_confirmed_date"], type: "date" },
  { field: "permit_number", aliases: ["Permit Number", "permit_number"], type: "text" },
  { field: "permit_approved_date", aliases: ["Date Permit Approved/Received", "Permit Approved", "permit_approved_date"], type: "date" },
  { field: "quote_date", aliases: ["Quote Date", "quote_date"], type: "date", noFuture: true },
  { field: "follow_up_date", aliases: ["Follow Up Date", "Follow-up Date", "follow_up_date"], type: "date" },
  { field: "expected_close_date", aliases: ["Expected Close Date", "Expected Close", "expected_close_date"], type: "date" },
  { field: "close_date", aliases: ["Close Date", "close_date"], type: "date", noFuture: true },
  { field: "lost_reason", aliases: ["Lost Reason", "lost_reason"], type: "text" },
  { field: "probability", aliases: ["Probability", "Probability %", "probability"], type: "probability" },
  { field: "project_type", aliases: ["Project Type", "project_type"], type: "text" },
  { field: "sales_rep", aliases: ["Sales Rep", "Salesperson", "Owner", "sales_rep"], type: "text" },
  { field: "sales_import_source_id", aliases: ["Smartsheet Row ID", "Smartsheet Row Id", "Source Row ID", "Row ID", "sales_import_source_id"], type: "identifier" },
];

const IMPORTED_SALES_ACTIVITY_FIELDS = new Set([
  "sales_status",
  "lead_source",
  "estimate_amount",
  "quoted_amount",
  "probability",
  "quote_date",
  "date_estimate_sent",
  "follow_up_date",
  "expected_close_date",
  "close_date",
  "lost_reason",
  "current_task_description",
  "current_task_deadline",
  "current_task_assigned_to",
  "sales_rep",
]);

const normalizeHeader = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const normalizeIdentifier = (value) => normalizeText(value);
export const normalizeIdentity = (value) => normalizeText(value).toLowerCase();

const sameValue = (a, b) => {
  const left = a ?? "";
  const right = b ?? "";
  if (left !== "" && right !== "" && Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
    return Math.abs(Number(left) - Number(right)) <= 0.000001;
  }
  return JSON.stringify(left) === JSON.stringify(right);
};

const isoDate = (year, month, day) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export function normalizeImportDate(value) {
  if (value === null || value === undefined || value === "") return { value: "" };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { value: "", error: "Invalid date" };
    return { value: isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate()) };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const wholeDays = Math.floor(value);
    if (wholeDays < 1 || wholeDays > 2958465) return { value: "", error: "Invalid Excel date" };
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + wholeDays * 86400000);
    return { value: isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) };
  }

  const text = normalizeText(value);
  if (!text) return { value: "" };
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    const result = isoDate(match[1], match[2], match[3]);
    return result ? { value: result } : { value: "", error: `Invalid date "${text}"` };
  }
  match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const result = isoDate(year, match[1], match[2]);
    return result ? { value: result } : { value: "", error: `Invalid date "${text}"` };
  }
  return { value: "", error: `Unrecognized date "${text}"` };
}

export function normalizeImportNumber(value) {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value === "number") return Number.isFinite(value) ? { value } : { value: null, error: "Invalid number" };
  let text = normalizeText(value);
  if (!text) return { value: null };
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[,$%\s]/g, "").replace(/[()]/g, "");
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return { value: null, error: `Invalid number "${value}"` };
  return { value: negative ? -parsed : parsed };
}

export function normalizeSalesStatus(value) {
  const text = normalizeIdentity(value).replace(/\s+/g, " ");
  if (!text) return { value: "" };
  const normalized = STATUS_ALIASES.get(text);
  return normalized ? { value: normalized } : { value: "", error: `Unrecognized Sales Status "${value}"` };
}

function buildHeaderLookup(row) {
  const lookup = new Map();
  for (const key of Object.keys(row || {})) {
    const normalized = normalizeHeader(key);
    if (normalized && !lookup.has(normalized)) lookup.set(normalized, key);
  }
  return lookup;
}

function readAliasedValue(row, lookup, aliases) {
  for (const alias of aliases) {
    const actual = lookup.get(normalizeHeader(alias));
    if (actual !== undefined) return { found: true, value: row[actual], header: actual };
  }
  return { found: false, value: undefined, header: "" };
}

function parseField(definition, rawValue) {
  if (definition.type === "date") return normalizeImportDate(rawValue);
  if (definition.type === "number") return normalizeImportNumber(rawValue);
  if (definition.type === "probability") {
    const parsed = normalizeImportNumber(rawValue);
    if (parsed.error || parsed.value === null) return parsed;
    if (parsed.value < 0 || parsed.value > 100) return { value: null, error: "Probability must be between 0 and 100" };
    return parsed;
  }
  if (definition.type === "status") return normalizeSalesStatus(rawValue);
  if (definition.type === "identifier") return { value: normalizeIdentifier(rawValue) };
  return { value: normalizeText(rawValue) };
}

export function validateSalesImportHeaders(headers = []) {
  const normalized = new Set(headers.map(normalizeHeader).filter(Boolean));
  const customerDef = FIELD_DEFINITIONS.find((definition) => definition.field === "client_name");
  const identityDefs = FIELD_DEFINITIONS.filter((definition) => ["sales_import_source_id", "est_inv_at"].includes(definition.field));
  const hasAlias = (definition) => definition.aliases.some((alias) => normalized.has(normalizeHeader(alias)));
  const errors = [];
  const warnings = [];
  if (!customerDef || !hasAlias(customerDef)) {
    errors.push(`Missing Customer column. Accepted headers: ${(customerDef?.aliases || []).join(", ")}.`);
  }
  if (!identityDefs.some(hasAlias)) {
    warnings.push("No Smartsheet Row ID or Est/Inv identity column was found. Matching will fall back to Customer + Notes and ambiguous customers will be skipped.");
  }
  return { errors, warnings };
}

export function parseSalesImportRows(rows = [], { todayStamp = "", rowNumberBase = 2 } = {}) {
  const parsedRows = [];
  const invalidRows = [];
  const seenHeaders = new Set();
  const safeRowNumberBase = Number.isInteger(Number(rowNumberBase)) && Number(rowNumberBase) >= 1 ? Number(rowNumberBase) : 2;

  rows.forEach((rawRow, index) => {
    const rowNumber = index + safeRowNumberBase;
    const lookup = buildHeaderLookup(rawRow);
    for (const key of Object.keys(rawRow || {})) seenHeaders.add(normalizeHeader(key));

    const incoming = {};
    const suppliedFields = new Set();
    const errors = [];
    const warnings = [];

    for (const definition of FIELD_DEFINITIONS) {
      const source = readAliasedValue(rawRow, lookup, definition.aliases);
      if (!source.found) continue;
      suppliedFields.add(definition.field);
      const isBlank = source.value === null || source.value === undefined || normalizeText(source.value) === "";
      if (isBlank) continue; // Existing values are preserved; blank spreadsheet cells do not clear production data.
      const parsed = parseField(definition, source.value);
      if (parsed.error) {
        errors.push(`${source.header}: ${parsed.error}`);
        continue;
      }
      if (definition.noFuture && parsed.value && todayStamp && parsed.value > todayStamp) {
        errors.push(`${source.header}: future dates are not allowed`);
        continue;
      }
      if (parsed.value !== "" && parsed.value !== null && parsed.value !== undefined) incoming[definition.field] = parsed.value;
    }

    const clientName = normalizeText(incoming.client_name);
    if (!clientName) errors.push("Customer is required");
    const salesStatus = incoming.sales_status || "";
    const sourceId = normalizeIdentifier(incoming.sales_import_source_id);
    const estInvAt = normalizeIdentifier(incoming.est_inv_at);
    const rawTitle = normalizeText(incoming.title);
    const effectiveTitle = rawTitle || clientName;
    const identity = {
      sourceIdKey: normalizeIdentity(sourceId),
      estInvKey: normalizeIdentity(estInvAt),
      clientKey: normalizeIdentity(clientName),
      titleKey: normalizeIdentity(effectiveTitle),
    };

    if (!identity.sourceIdKey && !identity.estInvKey) {
      warnings.push("No stable source-row or Est/Inv identity; matching will use Customer + Notes and ambiguous customers will be skipped.");
    }

    const parsedRow = {
      rowNumber,
      incoming,
      suppliedFields: Array.from(suppliedFields),
      clientName,
      effectiveTitle,
      salesStatus,
      sourceId,
      estInvAt,
      identity,
      errors,
      warnings,
    };
    if (errors.length) invalidRows.push(parsedRow);
    else parsedRows.push(parsedRow);
  });

  const duplicateRowNumbers = new Set();
  const strongIdentityRows = new Map();
  const weakIdentityRows = new Map();
  for (const row of parsedRows) {
    const strongKey = row.identity.sourceIdKey
      ? `source:${row.identity.sourceIdKey}`
      : row.identity.estInvKey
        ? `est:${row.identity.estInvKey}`
        : "";
    const weakKey = !strongKey && row.identity.clientKey
      ? `client-title:${row.identity.clientKey}|${row.identity.titleKey}`
      : "";
    const key = strongKey || weakKey;
    const map = strongKey ? strongIdentityRows : weakIdentityRows;
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const map of [strongIdentityRows, weakIdentityRows]) {
    for (const duplicateRows of map.values()) {
      if (duplicateRows.length <= 1) continue;
      duplicateRows.forEach((row) => duplicateRowNumbers.add(row.rowNumber));
    }
  }

  const validRows = [];
  for (const row of parsedRows) {
    if (!duplicateRowNumbers.has(row.rowNumber)) {
      validRows.push(row);
      continue;
    }
    invalidRows.push({
      ...row,
      errors: [...row.errors, "Duplicate import identity appears more than once in this spreadsheet."],
    });
  }

  return {
    validRows,
    invalidRows,
    headers: Array.from(seenHeaders).filter(Boolean),
  };
}

export function buildExistingImportIndexes(existingOrders = []) {
  const sourceIds = new Map();
  const estInv = new Map();
  const clients = new Map();
  const add = (map, key, row) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).some((item) => item.id === row.id)) map.get(key).push(row);
  };

  for (const row of existingOrders) {
    add(sourceIds, normalizeIdentity(row?.sales_import_source_id), row);
    add(estInv, normalizeIdentity(row?.est_inv_at), row);
    add(estInv, normalizeIdentity(row?.corbridge_invoice_number), row);
    add(clients, normalizeIdentity(row?.client_name), row);
  }
  return { sourceIds, estInv, clients };
}

function uniqueRows(rows = []) {
  const byId = new Map();
  rows.forEach((row) => {
    if (row?.id) byId.set(String(row.id), row);
  });
  return Array.from(byId.values());
}

export function resolveSalesImportMatch(importRow, indexes) {
  const candidates = [];
  const sourceMatches = importRow.identity.sourceIdKey ? uniqueRows(indexes.sourceIds.get(importRow.identity.sourceIdKey) || []) : [];
  const estMatches = importRow.identity.estInvKey ? uniqueRows(indexes.estInv.get(importRow.identity.estInvKey) || []) : [];

  if (sourceMatches.length > 1) return { kind: "ambiguous", reason: "Multiple WorkOrders share the same Smartsheet/source row ID.", matches: sourceMatches };
  if (estMatches.length > 1) return { kind: "ambiguous", reason: "Multiple WorkOrders share the same Est/Inv identity.", matches: estMatches };
  if (sourceMatches.length === 1) candidates.push(sourceMatches[0]);
  if (estMatches.length === 1) candidates.push(estMatches[0]);

  const strongMatches = uniqueRows(candidates);
  if (strongMatches.length > 1) {
    return { kind: "ambiguous", reason: "Source Row ID and Est/Inv point to different WorkOrders.", matches: strongMatches };
  }
  if (strongMatches.length === 1) return { kind: "matched", matchType: sourceMatches.length ? "source_id" : "est_inv", record: strongMatches[0] };

  const clientRows = uniqueRows(indexes.clients.get(importRow.identity.clientKey) || []);
  if (clientRows.length === 0) return { kind: "new" };

  const exactTitle = clientRows.filter((row) => {
    const rowTitle = normalizeIdentity(row?.title || row?.client_name);
    return rowTitle === importRow.identity.titleKey;
  });
  if (exactTitle.length === 1) return { kind: "matched", matchType: "client_title", record: exactTitle[0] };
  if (exactTitle.length > 1) return { kind: "ambiguous", reason: "Multiple WorkOrders share the same Customer + Notes identity.", matches: exactTitle };

  return {
    kind: "ambiguous",
    reason: clientRows.length > 1
      ? "Customer already has multiple WorkOrders and this row has no stable matching identity."
      : "Customer already has a WorkOrder but the Notes/title changed and no stable source identity is available.",
    matches: clientRows,
  };
}

function snapshotValues(record, fields) {
  const out = {};
  for (const field of fields) out[field] = record?.[field] ?? "";
  return out;
}

export function buildSalesImportPlan(importRow, match, { nowIso = new Date().toISOString(), allowLegacyAdoption = false } = {}) {
  if (match.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      rowNumber: importRow.rowNumber,
      clientName: importRow.clientName,
      estInvAt: importRow.estInvAt,
      reason: match.reason,
      matchIds: (match.matches || []).map((row) => row.id),
    };
  }

  const incoming = { ...importRow.incoming };
  delete incoming.client_name;
  const suppliedFields = new Set(importRow.suppliedFields || []);
  const importedFields = Object.keys(incoming);

  if (match.kind === "new") {
    const status = incoming.sales_status || "lead";
    const record = {
      client_name: importRow.clientName,
      title: incoming.title || importRow.effectiveTitle || importRow.clientName,
      current_stage: "sales",
      sales_status: status,
      in_pipeline: true,
      ...incoming,
      client_name: importRow.clientName,
      title: incoming.title || importRow.effectiveTitle || importRow.clientName,
      sales_status: status,
      current_stage: "sales",
      in_pipeline: true,
      sales_last_activity_at: nowIso,
      sales_stage_changed_at: nowIso,
      sales_import_last_synced_at: nowIso,
    };
    if (status === "lost" && !normalizeText(record.lost_reason)) {
      return { kind: "invalid", rowNumber: importRow.rowNumber, clientName: importRow.clientName, reason: "Lost rows require Lost Reason." };
    }
    if (["won", "lost"].includes(status) && !normalizeText(record.close_date)) {
      return { kind: "invalid", rowNumber: importRow.rowNumber, clientName: importRow.clientName, reason: "Won/Lost rows require Close Date." };
    }
    if (!["won", "lost"].includes(status)) {
      delete record.close_date;
      delete record.lost_reason;
    } else {
      record.follow_up_date = "";
    }
    const snapshotFields = new Set([...importedFields, "client_name", "title", "sales_status"]);
    record.sales_import_snapshot = snapshotValues(record, snapshotFields);
    return { kind: "create", rowNumber: importRow.rowNumber, clientName: importRow.clientName, estInvAt: importRow.estInvAt, nextFields: record, snapshotFields: Array.from(snapshotFields) };
  }

  const current = match.record;
  const requiresLegacyAdoption = current.in_pipeline !== true;
  const previousSnapshot = current.sales_import_snapshot && typeof current.sales_import_snapshot === "object" && !Array.isArray(current.sales_import_snapshot)
    ? current.sales_import_snapshot
    : {};
  const firstSync = Object.keys(previousSnapshot).length === 0;
  const localConflicts = [];

  const proposed = {};
  if (!sameValue(current.client_name, importRow.clientName)) {
    if (
      Object.prototype.hasOwnProperty.call(previousSnapshot, "client_name")
      && !sameValue(current.client_name, previousSnapshot.client_name)
      && !sameValue(importRow.clientName, current.client_name)
    ) {
      localConflicts.push("client_name");
    } else {
      proposed.client_name = importRow.clientName;
    }
  }

  for (const field of importedFields) {
    const desired = incoming[field];
    if (sameValue(current[field], desired)) continue;
    if (
      Object.prototype.hasOwnProperty.call(previousSnapshot, field)
      && !sameValue(current[field], previousSnapshot[field])
      && !sameValue(desired, current[field])
    ) {
      localConflicts.push(field);
      continue;
    }
    proposed[field] = desired;
  }

  if (localConflicts.length) {
    return {
      kind: "conflict",
      rowNumber: importRow.rowNumber,
      clientName: importRow.clientName,
      estInvAt: importRow.estInvAt,
      recordId: current.id,
      reason: `Base44 changed since the last import: ${localConflicts.join(", ")}. No stale spreadsheet values were applied.`,
      fields: localConflicts,
    };
  }

  const currentStatus = current.sales_status || "lead";
  const resultingStatus = proposed.sales_status || currentStatus;
  const statusChanged = resultingStatus !== currentStatus;

  if (!["won", "lost"].includes(resultingStatus)) {
    if (proposed.close_date) return { kind: "invalid", rowNumber: importRow.rowNumber, clientName: importRow.clientName, reason: "Open opportunities cannot import a Close Date." };
    if (proposed.lost_reason) return { kind: "invalid", rowNumber: importRow.rowNumber, clientName: importRow.clientName, reason: "Open opportunities cannot import a Lost Reason." };
    if (["won", "lost"].includes(currentStatus) && statusChanged) {
      proposed.close_date = "";
      proposed.lost_reason = "";
    }
  } else {
    if (["won", "lost"].includes(currentStatus) && !statusChanged) {
      for (const protectedField of ["close_date", "lost_reason", "follow_up_date", "expected_close_date", "current_task_description", "current_task_deadline", "current_task_assigned_to", "quote_date", "date_estimate_sent"]) {
        if (Object.prototype.hasOwnProperty.call(proposed, protectedField)) {
          return { kind: "conflict", rowNumber: importRow.rowNumber, clientName: importRow.clientName, recordId: current.id, reason: `Closed outcome historical field changed in spreadsheet: ${protectedField}. Reopen/change the outcome in Sales Pipeline before correcting it.`, fields: [protectedField] };
        }
      }
    }
    const resultingCloseDate = proposed.close_date ?? current.close_date;
    const resultingLostReason = proposed.lost_reason ?? current.lost_reason;
    if (!normalizeText(resultingCloseDate)) return { kind: "invalid", rowNumber: importRow.rowNumber, clientName: importRow.clientName, reason: "Won/Lost rows require Close Date." };
    if (resultingStatus === "lost" && !normalizeText(resultingLostReason)) return { kind: "invalid", rowNumber: importRow.rowNumber, clientName: importRow.clientName, reason: "Lost rows require Lost Reason." };
    if (statusChanged) proposed.follow_up_date = "";
    if (resultingStatus === "won") proposed.lost_reason = "";
  }

  if (statusChanged) {
    proposed.sales_stage_changed_at = nowIso;
  }
  if (requiresLegacyAdoption && allowLegacyAdoption) {
    proposed.in_pipeline = true;
  }

  const activityChanged = Object.keys(proposed).some((field) => IMPORTED_SALES_ACTIVITY_FIELDS.has(field));
  if (activityChanged) proposed.sales_last_activity_at = nowIso;

  const snapshotFields = new Set(Object.keys(previousSnapshot));
  importedFields.forEach((field) => snapshotFields.add(field));
  snapshotFields.add("client_name");
  snapshotFields.add("title");
  if (suppliedFields.has("sales_status")) snapshotFields.add("sales_status");

  const resultingRecord = { ...current, ...proposed };
  const nextSnapshot = snapshotValues(resultingRecord, snapshotFields);
  if (!sameValue(previousSnapshot, nextSnapshot)) proposed.sales_import_snapshot = nextSnapshot;
  proposed.sales_import_last_synced_at = nowIso;
  if (importRow.sourceId && !sameValue(current.sales_import_source_id, importRow.sourceId)) proposed.sales_import_source_id = importRow.sourceId;

  const changedFields = Object.keys(proposed).filter((field) => !sameValue(current[field], proposed[field]));
  if (requiresLegacyAdoption && !allowLegacyAdoption) {
    const adoptionFields = { ...Object.fromEntries(changedFields.map((field) => [field, proposed[field]])), in_pipeline: true };
    return {
      kind: "adoption",
      rowNumber: importRow.rowNumber,
      clientName: importRow.clientName,
      estInvAt: importRow.estInvAt,
      recordId: current.id,
      current,
      nextFields: adoptionFields,
      matchType: match.matchType,
      firstSync,
      reason: "Existing WorkOrder is not a modern Sales record. Explicit adoption is required before setting in_pipeline:true.",
    };
  }
  if (changedFields.length === 0 || (changedFields.length === 1 && changedFields[0] === "sales_import_last_synced_at")) {
    return { kind: "unchanged", rowNumber: importRow.rowNumber, clientName: importRow.clientName, recordId: current.id, matchType: match.matchType, firstSync };
  }

  return {
    kind: "update",
    rowNumber: importRow.rowNumber,
    clientName: importRow.clientName,
    estInvAt: importRow.estInvAt,
    recordId: current.id,
    current,
    nextFields: Object.fromEntries(changedFields.map((field) => [field, proposed[field]])),
    matchType: match.matchType,
    firstSync,
  };
}

export function summarizeSalesImportPlans(plans = [], invalidRows = []) {
  const summary = {
    total: plans.length + invalidRows.length,
    create: 0,
    update: 0,
    unchanged: 0,
    conflict: 0,
    ambiguous: 0,
    invalid: invalidRows.length,
    adoption: 0,
    baseline: 0,
  };
  plans.forEach((plan) => {
    if (Object.prototype.hasOwnProperty.call(summary, plan.kind)) summary[plan.kind] += 1;
    if (plan.firstSync === true) summary.baseline += 1;
  });
  return summary;
}

export function stableImportFingerprintPayload(validRows = [], invalidRows = []) {
  const clean = validRows.map((row) => ({
    rowNumber: row.rowNumber,
    incoming: Object.keys(row.incoming || {}).sort().reduce((out, key) => {
      out[key] = row.incoming[key];
      return out;
    }, {}),
  }));
  return JSON.stringify({ valid: clean, invalid: invalidRows.map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })) });
}
