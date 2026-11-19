// Pure report-catalog engine for the CoreBridge-style report suite (WS-J).
// Zero imports, React-free — every helper is unit-testable under Node
// (scripts/test-report-engine.mjs). Data is ALWAYS injected by the caller so
// entity access stays decoupled: page/function wiring fetches rows, the
// engine shapes them.
//
// Definition shape (defineReport):
//   {
//     id: "sales_by_customer",                  // required, unique in catalog
//     name: "Sales by Customer",                // required
//     category: "sales",                        // REPORT_CATEGORIES member
//     description: "...",                       // optional
//     params: [                                 // resolved in order
//       { key: "date_basis", type: "date_basis", label: "Date Basis",
//         options: ["created","completed","built"], default: "created" },
//       { key: "date_range", type: "date_range", label: "Date Range",
//         default: "this_month" },              // preset | {preset,from,to}
//       { key: "salesperson", type: "text", default: "" },
//       { key: "include_voids", type: "boolean", default: false },
//       { key: "statuses", type: "multiselect",
//         options: [{value,label}|"v"...], default: [] },
//       { key: "min_total", type: "number", default: null },
//     ],
//     columns: [{ key, label, align?, format? }] // fmt accepted as alias
//       // format: text | money | date | datetime | percent | int | num1
//       // align:  left | right | center
//     run: (resolvedParams, data) =>            // required
//       { rows: [...] } | rows[]                // rows = objects OR arrays
//       // object rows keyed by column key; array rows zip to columns.
//       // run may also return { rows, columns } to override def.columns —
//       // that is how crosstab reports (month x year etc.) declare dynamic
//       // columns at run time.
//     summarize?: (rows, {params, data}) => summary
//       // common case: return { totals: {colKey: value, ...} } for a totals
//       // row; any returned value lands on result.summary verbatim.
//   }
//
// runReport result:
//   {
//     columns: [{ key, label, align, format }],
//     rows: [{ colKey: value, ... }],           // extras preserved (drilldown)
//     summary: { ... } | {},
//     meta: { reportId, name, category, paramEcho, generatedAt, rowCount,
//             warnings },
//   }
//
// Week convention: Monday-start weeks (same bucketing as ProductionSchedule,
// ResourceAllocationView and opsReportModel.weekKey).

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n) => Math.round(num(n) * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// "YYYY-MM-DD" parses as LOCAL midnight (not UTC) so boundary rows compare
// the way a shop expects; everything else defers to Date.
export function parseReportDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = clean(value);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayKey = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const humanize = (key) =>
  clean(key).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// --- constants ----------------------------------------------------------------

export const REPORT_CATEGORIES = [
  "customers",
  "sales",
  "production",
  "estimates",
  "financial",
  "activity",
];

export const PARAM_TYPES = [
  "date_range",
  "date_basis",
  "select",
  "multiselect",
  "boolean",
  "text",
  "number",
];

// date_basis enum is fixed by the item spec — created | completed | built.
export const DATE_BASIS_OPTIONS = ["created", "completed", "built"];

export const DATE_RANGE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "custom",
];

export const VOID_POLICIES = ["exclude", "include", "only"];

export const COLUMN_FORMATS = ["text", "money", "date", "datetime", "percent", "int", "num1"];
export const COLUMN_ALIGNS = ["left", "right", "center"];

const fail = (msg) => { throw new Error(`reportEngine: ${msg}`); };

// --- option / column / param normalization ------------------------------------

const normalizeOptions = (options, ctx) => {
  if (!Array.isArray(options) || !options.length) fail(`${ctx} requires a non-empty options array`);
  const seen = new Set();
  return options.map((o) => {
    const value = typeof o === "string" ? o : clean(o?.value);
    if (!value) fail(`${ctx} option is missing a value`);
    if (seen.has(value)) fail(`${ctx} duplicate option value "${value}"`);
    seen.add(value);
    return { value, label: typeof o === "string" ? humanize(o) : clean(o?.label) || humanize(value) };
  });
};

export function normalizeColumns(columns, ctx = "columns") {
  if (!Array.isArray(columns) || !columns.length) fail(`${ctx} requires at least one column`);
  const seen = new Set();
  return columns.map((c, i) => {
    const key = clean(c?.key);
    if (!key) fail(`${ctx}[${i}] is missing a key`);
    if (seen.has(key)) fail(`${ctx} duplicate column key "${key}"`);
    seen.add(key);
    const align = c?.align == null || c.align === "" ? "left" : norm(c.align);
    if (!COLUMN_ALIGNS.includes(align)) fail(`${ctx}[${key}] invalid align "${c.align}"`);
    const format = c?.format ?? c?.fmt ?? "text"; // fmt accepted as alias
    const formatN = norm(format) || "text";
    if (!COLUMN_FORMATS.includes(formatN)) fail(`${ctx}[${key}] invalid format "${format}"`);
    return { key, label: clean(c?.label) || humanize(key), align, format: formatN };
  });
}

const normalizeParam = (p, i) => {
  const ctx = `params[${i}]`;
  const key = clean(p?.key);
  if (!key) fail(`${ctx} is missing a key`);
  const type = norm(p?.type);
  if (!PARAM_TYPES.includes(type)) fail(`${ctx} "${key}" invalid type "${p?.type}"`);
  const out = { key, type, label: clean(p?.label) || humanize(key) };
  if (type === "select" || type === "multiselect") {
    out.options = normalizeOptions(p.options, `${ctx} "${key}"`);
    out.default = type === "select"
      ? (p.default != null ? clean(p.default) : out.options[0].value)
      : (Array.isArray(p.default) ? p.default.map(clean).filter(Boolean) : []);
  } else if (type === "date_basis") {
    const opts = p.options ? normalizeOptions(p.options, `${ctx} "${key}"`) : DATE_BASIS_OPTIONS.map((v) => ({ value: v, label: humanize(v) }));
    for (const o of opts) {
      if (!DATE_BASIS_OPTIONS.includes(o.value)) fail(`${ctx} "${key}" option "${o.value}" is not a valid date basis`);
    }
    out.options = opts;
    out.default = DATE_BASIS_OPTIONS.includes(norm(p.default)) ? norm(p.default) : "created";
  } else if (type === "date_range") {
    out.default = p.default ?? "this_month";
  } else if (type === "boolean") {
    out.default = p.default == null ? false : Boolean(p.default);
  } else if (type === "number") {
    out.default = Number.isFinite(Number(p.default)) ? Number(p.default) : null;
  } else { // text
    out.default = p.default == null ? "" : String(p.default);
  }
  return out;
};

// --- defineReport --------------------------------------------------------------

// Validates a report spec and returns a normalized, frozen definition.
export function defineReport(spec = {}) {
  const id = clean(spec.id);
  if (!id) fail("definition requires an id");
  const name = clean(spec.name);
  if (!name) fail(`"${id}" requires a name`);
  const category = norm(spec.category);
  if (!REPORT_CATEGORIES.includes(category)) {
    fail(`"${id}" invalid category "${spec.category}" — expected one of ${REPORT_CATEGORIES.join(", ")}`);
  }
  if (typeof spec.run !== "function") fail(`"${id}" requires a run(params, data) function`);
  if (spec.summarize != null && typeof spec.summarize !== "function") {
    fail(`"${id}" summarize must be a function`);
  }
  const params = Array.isArray(spec.params) ? spec.params : [];
  const paramKeys = new Set();
  const normParams = params.map((p, i) => {
    const np = normalizeParam(p, i);
    if (paramKeys.has(np.key)) fail(`"${id}" duplicate param key "${np.key}"`);
    paramKeys.add(np.key);
    return np;
  });
  const def = {
    id,
    name,
    category,
    description: clean(spec.description),
    params: normParams,
    columns: normalizeColumns(spec.columns, `"${id}" columns`),
    defaults: Object.fromEntries(normParams.map((p) => [p.key, p.default])),
    run: spec.run,
  };
  if (spec.summarize) def.summarize = spec.summarize;
  return Object.freeze(def);
}

// Shared param specs for the catalog (J-03..J-11 compose these). Pass `picks`
// to keep a subset, e.g. standardReportParams(["date_range","void_policy"]).
export function standardReportParams(picks) {
  const all = [
    { key: "date_basis", type: "date_basis", label: "Date Basis", default: "created" },
    { key: "date_range", type: "date_range", label: "Date Range", default: "this_month" },
    { key: "salesperson", type: "text", label: "Salesperson", default: "" },
    { key: "location", type: "text", label: "Location", default: "" },
    {
      key: "void_policy", type: "select", label: "Void Handling",
      options: VOID_POLICIES, default: "exclude",
    },
  ];
  const wanted = Array.isArray(picks) && picks.length ? new Set(picks.map(clean)) : null;
  return all.filter((p) => !wanted || wanted.has(p.key));
}

// --- date ranges ----------------------------------------------------------------

// Monday-start weeks (ProductionSchedule / opsReportModel.weekKey convention).
const weekStartMonday = (d) => addDays(startOfDay(d), -((startOfDay(d).getDay() + 6) % 7));

// Resolves a range argument (preset string | {preset,from,to} | {from,to})
// into {preset, from, to}. from/to are Dates at day boundaries or null when
// that side is unbounded. Unknown preset strings throw.
export function resolveDateRange(range, now = new Date()) {
  const base = startOfDay(now instanceof Date ? now : parseReportDate(now) || new Date());
  let preset = null;
  let from = null;
  let to = null;
  if (typeof range === "string") {
    preset = norm(range);
  } else if (range && typeof range === "object") {
    preset = range.preset != null ? norm(range.preset) : null;
    from = parseReportDate(range.from);
    to = parseReportDate(range.to);
    if (!preset) preset = "custom";
  } else if (range == null) {
    return { preset: null, from: null, to: null }; // unbounded
  } else {
    fail(`unrecognized date range ${JSON.stringify(range)}`);
  }
  if (!DATE_RANGE_PRESETS.includes(preset)) {
    fail(`unknown date range preset "${preset}" — expected one of ${DATE_RANGE_PRESETS.join(", ")}`);
  }
  switch (preset) {
    case "today":
      from = base; to = base; break;
    case "yesterday":
      from = addDays(base, -1); to = from; break;
    case "this_week": {
      const mon = weekStartMonday(base);
      from = mon; to = addDays(mon, 6); break;
    }
    case "last_week": {
      const mon = addDays(weekStartMonday(base), -7);
      from = mon; to = addDays(mon, 6); break;
    }
    case "this_month":
      from = new Date(base.getFullYear(), base.getMonth(), 1);
      to = new Date(base.getFullYear(), base.getMonth() + 1, 0); break;
    case "last_month":
      from = new Date(base.getFullYear(), base.getMonth() - 1, 1);
      to = new Date(base.getFullYear(), base.getMonth(), 0); break;
    case "this_quarter": {
      const qm = Math.floor(base.getMonth() / 3) * 3;
      from = new Date(base.getFullYear(), qm, 1);
      to = new Date(base.getFullYear(), qm + 3, 0); break;
    }
    case "this_year":
      from = new Date(base.getFullYear(), 0, 1);
      to = new Date(base.getFullYear(), 11, 31); break;
    case "custom":
    default:
      break; // caller-supplied from/to already parsed; null = unbounded side
  }
  return { preset, from: from ? startOfDay(from) : null, to: to ? endOfDay(to) : null };
}

// Filters injected rows by a date field. `field` is a row key or an accessor
// fn. Returns { rows, from, to } with the resolved bounds so callers can echo
// the actual window on the report. Undated rows are dropped whenever a bound
// exists; a fully unbounded range keeps everything.
export function filterByDateRange(rows = [], { field, range, now } = {}) {
  const get = typeof field === "function" ? field : (r) => r?.[field];
  const { from, to } = resolveDateRange(range, now);
  if (!from && !to) return { rows: Array.isArray(rows) ? rows.slice() : [], from, to };
  const out = [];
  for (const row of rows || []) {
    const d = parseReportDate(get(row));
    if (!d) continue;
    if (from && d < from) continue;
    if (to && d > to) continue;
    out.push(row);
  }
  return { rows: out, from, to };
}

// --- void policy ------------------------------------------------------------------

// A row counts as void when it carries an explicit void/deleted flag or its
// status is literally "void". voided/is_void accepted as flag aliases —
// entity field names vary across the app.
export function isVoidRow(row) {
  if (!row || typeof row !== "object") return false;
  if (row.void === true || row.voided === true || row.is_void === true || row.deleted === true) return true;
  return norm(row.status) === "void";
}

// policy: "exclude" (default — drop void rows) | "include" (keep all) |
// "only" (keep void rows only). Unknown policies throw.
export function voidPolicyFilter(rows = [], policy = "exclude") {
  const p = norm(policy) || "exclude";
  if (!VOID_POLICIES.includes(p)) fail(`unknown void policy "${policy}"`);
  const list = Array.isArray(rows) ? rows : [];
  if (p === "include") return list.slice();
  if (p === "only") return list.filter(isVoidRow);
  return list.filter((r) => !isVoidRow(r));
}

// --- param resolution --------------------------------------------------------------

function resolveParamValue(spec, raw, now, warnings) {
  const missing = raw === undefined;
  const value = missing ? spec.default : raw;
  switch (spec.type) {
    case "date_range": {
      const r = resolveDateRange(value ?? spec.default ?? "this_month", now);
      return r;
    }
    case "date_basis": {
      const v = norm(value);
      if (DATE_BASIS_OPTIONS.includes(v)) return v;
      if (!missing) warnings.push(`param "${spec.key}": invalid date basis "${value}" — using default`);
      return spec.default || "created";
    }
    case "select": {
      const v = clean(value);
      const valid = spec.options.map((o) => o.value);
      if (valid.includes(v)) return v;
      if (v && !missing) warnings.push(`param "${spec.key}": "${v}" is not an option — using default`);
      return valid.includes(spec.default) ? spec.default : valid[0];
    }
    case "multiselect": {
      const valid = new Set(spec.options.map((o) => o.value));
      const arr = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
      return arr.map(clean).filter((v) => v && valid.has(v));
    }
    case "boolean":
      return value === true || value === "true" || value === 1 || value === "1";
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : spec.default;
    }
    default: // text
      return clean(value);
  }
}

export function resolveReportParams(def, params = {}, now = new Date()) {
  const specs = Array.isArray(def?.params) ? def.params : [];
  const warnings = [];
  const out = {};
  for (const spec of specs) out[spec.key] = resolveParamValue(spec, params?.[spec.key], now, warnings);
  return { params: out, warnings };
}

// --- row normalization ---------------------------------------------------------------

// Rows may be objects keyed by column key or arrays zipped to the column
// order. Output rows are objects: every column key present (missing → null),
// extra keys preserved so reports can carry drilldown ids/links.
function normalizeRows(rawRows, columns) {
  const keys = columns.map((c) => c.key);
  const out = [];
  for (const row of rawRows || []) {
    if (Array.isArray(row)) {
      const r = {};
      keys.forEach((k, i) => { r[k] = i < row.length ? row[i] : null; });
      out.push(r);
    } else if (row && typeof row === "object") {
      const r = { ...row };
      for (const k of keys) if (!(k in r)) r[k] = null;
      out.push(r);
    } else {
      fail(`run() returned a row that is neither an object nor an array (${typeof row})`);
    }
  }
  return out;
}

// --- runReport ----------------------------------------------------------------------

export function runReport(def, { params = {}, data, now } = {}) {
  if (!def || typeof def.run !== "function") fail("runReport requires a definition with run()");
  const columnsFallback = normalizeColumns(def.columns, `"${def.id || "report"}" columns`);
  const at = now instanceof Date ? now : parseReportDate(now) || new Date();
  const { params: resolved, warnings } = resolveReportParams(def, params, at);
  const result = def.run(resolved, data);
  const rawRows = Array.isArray(result) ? result : (result?.rows ?? []);
  if (!Array.isArray(rawRows)) fail(`"${def.id}" run() must return rows[] or {rows: []}`);
  const columns = !Array.isArray(result) && result?.columns
    ? normalizeColumns(result.columns, `"${def.id}" run() columns`)
    : columnsFallback;
  const rows = normalizeRows(rawRows, columns);
  let summary = {};
  if (typeof def.summarize === "function") {
    const s = def.summarize(rows, { params: resolved, data });
    summary = Array.isArray(s) ? { totals: s } : (s && typeof s === "object" ? s : {});
  } else if (!Array.isArray(result) && result?.summary && typeof result.summary === "object") {
    summary = result.summary;
  }
  return {
    columns,
    rows,
    summary,
    meta: {
      reportId: clean(def.id),
      name: clean(def.name),
      category: norm(def.category),
      paramEcho: resolved,
      generatedAt: at.toISOString(),
      rowCount: rows.length,
      warnings,
    },
  };
}

// --- formatting ------------------------------------------------------------------------

// Display formatting for views (rowsToCsv writes RAW values instead).
export function formatCellValue(value, column = {}) {
  const format = norm(column.format ?? column.fmt) || "text";
  if (value == null || value === "") return "";
  switch (format) {
    case "money":
      return num(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
    case "percent":
      return `${(num(value) * 100).toFixed(1)}%`;
    case "int":
      return Math.round(num(value)).toLocaleString("en-US");
    case "num1":
      return num(value).toFixed(1);
    case "date": {
      const d = parseReportDate(value);
      return d ? dayKey(d) : clean(value);
    }
    case "datetime": {
      const d = parseReportDate(value);
      return d ? d.toLocaleString("en-US") : clean(value);
    }
    default:
      return clean(value);
  }
}

// --- CSV --------------------------------------------------------------------------------

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Raw value written for CSV — money/percent stay numeric (no "$"/"%"
// decoration), dates become ISO day keys, blanks stay blank.
function csvRawValue(value, column) {
  const format = norm(column?.format ?? column?.fmt) || "text";
  if (value == null || value === "") return "";
  switch (format) {
    case "money": return String(money(value));
    case "percent": return String(num(value));
    case "int": return String(Math.round(num(value)));
    case "num1": return String(Math.round(num(value) * 10) / 10);
    case "date": {
      const d = parseReportDate(value);
      return d ? dayKey(d) : clean(value);
    }
    case "datetime": {
      const d = parseReportDate(value);
      return d ? d.toISOString() : clean(value);
    }
    default: return value;
  }
}

// columns: [{key,label,format?}]; rows: objects (keyed) or arrays (zipped).
// Emits a header row of labels then one line per row, CRLF-free ("\n"),
// standard quoting (" doubled; quoted when containing " , \n \r).
export function rowsToCsv(columns, rows) {
  const cols = normalizeColumns(columns, "csv columns");
  const keys = cols.map((c) => c.key);
  const lines = [cols.map((c) => csvCell(c.label)).join(",")];
  for (const row of rows || []) {
    const get = Array.isArray(row)
      ? (k) => row[keys.indexOf(k)]
      : (k) => row?.[k];
    lines.push(cols.map((c) => csvCell(csvRawValue(get(c.key), c))).join(","));
  }
  return `${lines.join("\n")}\n`;
}
