// Pure model for the CoreBridge CSV migration wizard. No imports on purpose --
// scripts/test-migration-ui.mjs bundles this file under Node the same way
// scripts/test-walk-in.mjs bundles walkInModel.js.
//
// Holds everything the wizard needs that is not React or network:
//   - step order + the 500-row chunking contract shared with the backend
//   - mapper grouping / target-field option building for the map table
//   - required-field coverage checks
//   - result tallying, live-count merging, error-row extraction
//   - the sequential chunked import loop (runImportPlan) with an injected
//     sendChunk callback so tests can drive it without the network
//   - error-CSV building for the report download
//   - the typed-confirm gate for unimport (canUnimport)

// Mirrors MAX_ROWS_PER_CALL in base44/shared/migrationMappers.ts -- the backend
// truncates import_rows to this many rows per call, so the wizard chunks its
// uploads at the same size and never relies on server truncation.
export const IMPORT_CHUNK_SIZE = 500;
export const SAMPLE_ROW_LIMIT = 10; // mirrors MAX_SAMPLE_ROWS
export const DRY_RUN_ROW_LIMIT = 500;
export const SOURCE_ID_FIELD = "__source_id__";
export const REPORT_ERROR_LIMIT = 200;

export const MIGRATION_FUNCTION = "manageMigration";
export const MIGRATION_ACTIONS = [
  "list_mappers",
  "list_batches",
  "start_batch",
  "preview_mapping",
  "import_rows",
  "get_batch",
  "report",
  "unimport_batch",
];

// Wizard stepper order. The test asserts this order so a reorder here is a
// deliberate contract change, not an accident.
export const WIZARD_STEPS = [
  { key: "upload", label: "Upload CSV" },
  { key: "map", label: "Map columns" },
  { key: "dryrun", label: "Dry run" },
  { key: "import", label: "Import" },
  { key: "report", label: "Report" },
];

export function wizardStepIndex(key) {
  return WIZARD_STEPS.findIndex((s) => s.key === key);
}

// ---------------------------------------------------------------------------
// Mapper registry shaping (list_mappers response)

export function groupMappers(mappers) {
  const list = Array.isArray(mappers) ? mappers : [];
  const sortByKey = (a, b) => String(a?.key || "").localeCompare(String(b?.key || ""));
  return {
    real: list.filter((m) => m?.kind !== "stub").sort(sortByKey),
    stub: list.filter((m) => m?.kind === "stub").sort(sortByKey),
  };
}

export function findMapper(mappers, key) {
  return (Array.isArray(mappers) ? mappers : []).find((m) => m?.key === key) || null;
}

// Target-field options for one mapping-table row: every field the mapper can
// write (required + proposed targets + default suggestions + parent link
// fields), plus the __source_id__ pseudo-field, sorted with __source_id__ and
// required fields pinned to the top for scanability.
export function targetFieldOptions({ preview, mapper, currentMapping } = {}) {
  const fields = new Set();
  const required = Array.isArray(preview?.required_fields) ? preview.required_fields : (mapper?.required || []);
  for (const f of required) fields.add(f);
  for (const f of Object.keys(preview?.default_suggestions || {})) {
    if (f && !String(f).startsWith("<")) fields.add(f);
  }
  for (const f of Object.values(preview?.proposed_mapping || {})) {
    if (f && f !== SOURCE_ID_FIELD) fields.add(f);
  }
  for (const p of mapper?.parents || []) {
    if (p?.field) fields.add(p.field);
  }
  for (const f of Object.values(currentMapping || {})) {
    if (f && f !== SOURCE_ID_FIELD) fields.add(f);
  }
  const reqRank = (f) => (required.includes(f) ? 0 : 1);
  const sorted = [...fields].sort((a, b) => reqRank(a) - reqRank(b) || a.localeCompare(b));
  return [SOURCE_ID_FIELD, ...sorted];
}

// Drop empty / "skip this column" entries so the payload only carries real
// column -> field assignments.
export function cleanMapping(mapping) {
  const out = {};
  for (const [col, field] of Object.entries(mapping || {})) {
    const f = String(field ?? "").trim();
    if (f) out[col] = f;
  }
  return out;
}

export function mappingHasSourceId(mapping) {
  return Object.values(cleanMapping(mapping)).includes(SOURCE_ID_FIELD);
}

// Required-field coverage: a required field counts as covered when some source
// column maps to it OR the importer fills it itself (default suggestion /
// auto-filled sentinel like "<auto: cb:...>").
export function requiredCoverage({ requiredFields, mapping, defaults } = {}) {
  const required = Array.isArray(requiredFields) ? requiredFields : [];
  const mappedTargets = new Set(Object.values(cleanMapping(mapping)));
  const covered = [];
  const autoFilled = [];
  const missing = [];
  for (const field of required) {
    if (mappedTargets.has(field)) covered.push(field);
    else if (defaults && Object.prototype.hasOwnProperty.call(defaults, field)) autoFilled.push(field);
    else missing.push(field);
  }
  return { required, covered, autoFilled, missing, ok: missing.length === 0 };
}

// ---------------------------------------------------------------------------
// Chunking + tallies

export function chunkRows(rows, size = IMPORT_CHUNK_SIZE) {
  const list = Array.isArray(rows) ? rows : [];
  const step = Math.max(1, Math.floor(size) || IMPORT_CHUNK_SIZE);
  const chunks = [];
  for (let i = 0; i < list.length; i += step) chunks.push(list.slice(i, i + step));
  return chunks;
}

export function buildChunkPlan(rowCount, size = IMPORT_CHUNK_SIZE) {
  const total = Math.max(0, Math.floor(Number(rowCount) || 0));
  const step = Math.max(1, Math.floor(size) || IMPORT_CHUNK_SIZE);
  const plan = [];
  for (let start = 0; start < total; start += step) {
    plan.push({ index: plan.length, start, end: Math.min(start + step, total), count: Math.min(step, total - start) });
  }
  return plan;
}

export function emptyCounts() {
  return { created: 0, updated: 0, skipped: 0, errors: 0 };
}

export function mergeCounts(acc, add) {
  const out = { ...emptyCounts(), ...(acc || {}) };
  for (const key of Object.keys(emptyCounts())) {
    out[key] = (Number(acc?.[key]) || 0) + (Number(add?.[key]) || 0);
  }
  return out;
}

// Per-row results -> counts. Backend statuses: created | updated |
// skipped_dup | error.
export function tallyResults(results) {
  const counts = emptyCounts();
  for (const r of results || []) {
    if (r?.status === "created") counts.created += 1;
    else if (r?.status === "updated") counts.updated += 1;
    else if (r?.status === "skipped_dup") counts.skipped += 1;
    else counts.errors += 1;
  }
  return counts;
}

// Pull the error rows out of an import_rows result list, carrying the CSV line
// (row.__line from csvParse) when the caller passes the source rows alongside.
export function resultsToErrorRows(results, { rowOffset = 0, sourceRows } = {}) {
  const rows = Array.isArray(sourceRows) ? sourceRows : null;
  const out = [];
  (Array.isArray(results) ? results : []).forEach((r, i) => {
    if (r?.status !== "error" && !r?.error) return;
    out.push({
      row: rowOffset + i + 1,
      csv_line: rows?.[rowOffset + i]?.__line ?? null,
      source_id: String(r?.source_id ?? ""),
      error: String(r?.error ?? "row import failed"),
    });
  });
  return out;
}

// Created/updated rows -> linkable refs for the "created records" list.
export function resultsToRecordRefs(results, { rowOffset = 0, sourceRows } = {}) {
  const rows = Array.isArray(sourceRows) ? sourceRows : null;
  const out = [];
  (Array.isArray(results) ? results : []).forEach((r, i) => {
    const targetId = String(r?.target_id ?? "").trim();
    if (!targetId || (r?.status !== "created" && r?.status !== "updated")) return;
    out.push({
      row: rowOffset + i + 1,
      csv_line: rows?.[rowOffset + i]?.__line ?? null,
      source_id: String(r?.source_id ?? ""),
      target_id: targetId,
      status: r.status,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The sequential chunked import. sendChunk(chunk, chunkIndex) must resolve to
// the import_rows response ({ results, counts, truncated, ... }). Anything it
// rejects aborts the loop and surfaces on `error` -- later chunks never run, so
// the wizard can offer a clean re-run instead of a half-sent mystery.
export async function runImportPlan({
  rows,
  chunkSize = IMPORT_CHUNK_SIZE,
  sendChunk,
  onProgress,
  shouldStop,
} = {}) {
  const chunks = chunkRows(rows, chunkSize);
  const total = (Array.isArray(rows) ? rows : []).length;
  const state = {
    running: true,
    stopped: false,
    done: 0,
    total,
    chunks: chunks.length,
    chunkIndex: -1,
    counts: emptyCounts(),
    results: [],
    errorRows: [],
    recordRefs: [],
    truncatedChunks: 0,
    error: "",
  };
  const emit = () => {
    try { onProgress?.({ ...state, counts: { ...state.counts } }); } catch { /* listener is advisory */ }
  };
  emit();
  for (let i = 0; i < chunks.length; i += 1) {
    if (typeof shouldStop === "function" && shouldStop()) {
      state.stopped = true;
      break;
    }
    state.chunkIndex = i;
    let res;
    try {
      // eslint-disable-next-line no-await-in-loop -- deliberate: chunks must run
      // one at a time so progress and dedupe stay deterministic.
      res = await sendChunk(chunks[i], i);
    } catch (err) {
      state.error = String(err?.message || err || "Chunk import failed.");
      state.running = false;
      emit();
      return state;
    }
    const results = Array.isArray(res?.results) ? res.results : [];
    const rowOffset = i * Math.max(1, Math.floor(chunkSize) || IMPORT_CHUNK_SIZE);
    state.results.push(...results);
    state.counts = mergeCounts(state.counts, res?.counts || tallyResults(results));
    state.errorRows.push(...resultsToErrorRows(results, { rowOffset, sourceRows: rows }));
    state.recordRefs.push(...resultsToRecordRefs(results, { rowOffset, sourceRows: rows }));
    if (res?.truncated) state.truncatedChunks += 1;
    state.done += chunks[i].length;
    emit();
  }
  state.running = false;
  emit();
  return state;
}

// ---------------------------------------------------------------------------
// Report helpers

export const RECORD_KIND_BY_ENTITY = {
  Customer: "customer",
  CustomerContact: "customer",
  CustomerLocation: "customer",
  AllInOneEstimate: "estimate",
  WorkOrder: "workorder",
  Invoice: "invoice",
  PurchaseOrder: "po",
  Opportunity: "opportunity",
  ChangeOrder: "changeorder",
};

// target_entity -> RecordLink kind, or "" when the entity has no record page
// (RecordLink itself also degrades to plain text on unknown kinds).
export function entityRecordKind(targetEntity) {
  return RECORD_KIND_BY_ENTITY[String(targetEntity || "").trim()] || "";
}

// One CSV cell: quote when it contains a delimiter, quote, or line break;
// inner quotes double up per RFC 4180.
export function csvEscapeCell(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsvLine(cells) {
  return (cells || []).map(csvEscapeCell).join(",");
}

// errors: [{source_entity?, source_id, error, row?}] -> downloadable CSV text.
export function buildErrorCsv(errors) {
  const lines = [toCsvLine(["row", "csv_line", "source_entity", "source_id", "error"])];
  for (const e of errors || []) {
    lines.push(toCsvLine([e?.row ?? "", e?.csv_line ?? "", e?.source_entity ?? "", e?.source_id ?? "", e?.error ?? ""]));
  }
  return `${lines.join("\r\n")}\r\n`;
}

// Unimport is a two-step confirm: the operator must type the exact batch tag.
// Exact, case-sensitive match -- these tags are generated slugs, not prose.
export function canUnimport(typedValue, batchId) {
  const want = String(batchId || "").trim();
  return !!want && String(typedValue ?? "").trim() === want;
}

export function unimportConfirmHint(batchId) {
  return `Type ${String(batchId || "").trim() || "the batch tag"} to enable rollback.`;
}

// Small display helpers shared by the panels.
export function fmtDateTime(value) {
  const t = Date.parse(String(value || ""));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "\u2014";
}

export function fmtInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

export function countsText(counts) {
  const c = { ...emptyCounts(), ...(counts || {}) };
  return `${fmtInt(c.created)} created \u00B7 ${fmtInt(c.updated)} updated \u00B7 ${fmtInt(c.skipped)} skipped \u00B7 ${fmtInt(c.errors)} errors`;
}

// Batches-tab row shaping: the list_batches meta blob -> one flat row.
export function batchRow(batch) {
  const b = batch || {};
  const counts = { ...emptyCounts(), ...(b.counts || {}) };
  const rows = Object.values(b.entities_seen || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return {
    batch_id: String(b.batch_id || ""),
    source_label: String(b.source_label || ""),
    entity: String(b.entity || ""),
    entities_seen: b.entities_seen || {},
    status: String(b.status || "running"),
    started_by: String(b.started_by || ""),
    started_at: b.started_at || "",
    updated_at: b.updated_at || "",
    unimported_at: b.unimported_at || null,
    counts,
    rows,
    per_entity_counts: b.per_entity_counts || {},
  };
}

// The attachments scaffold is deliberately manual -- this table entry just
// tracks what the operator typed and what UploadFile returned.
export function newAttachmentRow() {
  return {
    key: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    file_name: "",
    record_kind: "customer",
    record_ref: "",
    uploaded_url: "",
    uploading: false,
    error: "",
  };
}
