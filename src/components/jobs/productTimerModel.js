// Product-scoped job time tracking model (B-09 — CoreBridge parity): timers
// live on WorkOrder.products[] rows, NOT in the TimeClock payroll module.
// One WorkOrderTimeEntry row per labor session; empty stopped_at means the
// timer is running; stopped rows carry duration_seconds; corrections set
// status=voided rather than editing history.
//
// No React, no IO — the model is esbuild-bundled and unit-tested under plain
// Node (scripts/test-product-timer.mjs). Entry rows match the
// WorkOrderTimeEntry entity contract (base44/entities/WorkOrderTimeEntry.jsonc):
//   work_order_id · product_id · user_email · department · started_at ·
//   stopped_at · duration_seconds · source · note · status ·
//   creation_request_key · schema_version

export const TIME_ENTRY_DEPARTMENTS = ["design", "production", "fabrication", "installation"];
export const TIME_ENTRY_SOURCES = ["timer", "manual"];
export const TIME_ENTRY_STATUSES = ["active", "voided"];
export const DEFAULT_DEPARTMENT = "production";

// Department bucket → the products[] accumulator field it feeds (A-17):
// design labor rolls into design_time_seconds; every shop-floor bucket
// (production / fabrication / installation) rolls into
// production_time_seconds — WorkOrder.products[] declares only those two.
export const DEPARTMENT_TIME_FIELD = {
  design: "design_time_seconds",
  production: "production_time_seconds",
  fabrication: "production_time_seconds",
  installation: "production_time_seconds",
};

export const PRODUCT_TIME_FIELDS = ["design_time_seconds", "production_time_seconds"];

const clean = (v) => String(v ?? "").trim();
const lower = (v) => clean(v).toLowerCase();
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const entryList = (entries) =>
  (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === "object");

// `user` can be an email string or a session user object ({email, ...}).
const userEmailOf = (user) =>
  lower(typeof user === "string" ? user : user?.email ?? user?.user_email);

const toDate = (v) => {
  if (v instanceof Date) return v;
  const d = new Date(v ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};
const isoOf = (v) => toDate(v).toISOString();
const pad2 = (n) => String(n).padStart(2, "0");

// Normalize a department value to the entity enum; unknown/blank buckets
// fall to DEFAULT_DEPARTMENT so rollups never leak stray keys.
export const normalizeDepartment = (v) =>
  TIME_ENTRY_DEPARTMENTS.includes(lower(v)) ? lower(v) : DEFAULT_DEPARTMENT;

// --- Timer state -----------------------------------------------------------

// A row is running while it is active (not voided), has a start, and has no
// stop yet. status missing counts as active (pre-enum rows).
export function isRunning(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (lower(entry.status || "active") === "voided") return false;
  return Boolean(clean(entry.started_at)) && !clean(entry.stopped_at);
}

const isVoided = (entry) => lower(entry?.status) === "voided";

// The one running entry for this user on this product, or null. Email match
// is case-insensitive; stopped and voided rows never qualify.
export function openEntryFor(user, productId, entries) {
  const email = userEmailOf(user);
  const pid = clean(productId);
  if (!email || !pid) return null;
  return (
    entryList(entries).find(
      (e) => clean(e.product_id) === pid && lower(e.user_email) === email && isRunning(e),
    ) || null
  );
}

// Every running entry this user owns, on any product — the panel uses it to
// block a second concurrent timer ("already running on <product>").
export function openEntriesForUser(user, entries) {
  const email = userEmailOf(user);
  if (!email) return [];
  return entryList(entries).filter((e) => lower(e.user_email) === email && isRunning(e));
}

// --- Start / stop payloads --------------------------------------------------

// Idempotency bucket: `${wo}:${prod}:${user}:${yyyymmddhhmm}` — the spec's
// 12-UTC-digit stamp (minute precision). Two start attempts inside the same
// minute share one creation_request_key, so a double-click or a retry of a
// lost create response dedupes onto a single row; a deliberate re-start
// after stopping lands in a later bucket and creates fresh.
export function startRequestKey({ workOrderId, productId, userEmail, now } = {}) {
  const d = toDate(now);
  const bucket =
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`;
  return `${clean(workOrderId)}:${clean(productId)}:${lower(userEmail)}:${bucket}`;
}

// Create fields for one timer session. `now` accepts Date | ISO | epoch ms;
// department/source are enum-normalized so the stored row always validates.
export function startPayload({
  workOrderId,
  productId,
  userEmail,
  department,
  now,
  source = "timer",
  note = "",
} = {}) {
  const fields = {
    schema_version: 1,
    creation_request_key: startRequestKey({ workOrderId, productId, userEmail, now }),
    work_order_id: clean(workOrderId),
    product_id: clean(productId),
    user_email: lower(userEmail),
    department: normalizeDepartment(department),
    started_at: isoOf(now),
    stopped_at: "",
    duration_seconds: 0,
    source: TIME_ENTRY_SOURCES.includes(lower(source)) ? lower(source) : "timer",
    note: clean(note),
    status: "active",
  };
  return fields;
}

// Patch applied to the running row when the timer stops: stamps stopped_at
// and computes duration_seconds = stopped_at − started_at, clamped ≥ 0.
// A row without a parseable start stops cleanly with duration 0.
export function stopPayload(entry, now) {
  const stopped = isoOf(now);
  const start = entry ? new Date(entry.started_at) : null;
  const elapsed =
    start && !Number.isNaN(start.getTime())
      ? Math.max(0, Math.round((new Date(stopped).getTime() - start.getTime()) / 1000))
      : 0;
  return { stopped_at: stopped, duration_seconds: elapsed };
}

// Seconds an entry contributes right now:
//  - stopped row → stored duration_seconds (recomputed start→stop when absent)
//  - running row → elapsed since started_at when `now` is given, else the
//    stored value (usually 0 — callers that want live time must pass now)
//  - voided rows still report their own seconds here; summarize* skips them.
export function elapsedSeconds(entry, now) {
  if (!entry || typeof entry !== "object") return 0;
  const stored = num(entry.duration_seconds, NaN);
  if (!isRunning(entry)) {
    if (Number.isFinite(stored)) return Math.max(0, Math.round(stored));
    const start = new Date(entry.started_at);
    const stop = new Date(entry.stopped_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(stop.getTime())) return 0;
    return Math.max(0, Math.round((stop.getTime() - start.getTime()) / 1000));
  }
  if (now == null) return Number.isFinite(stored) ? Math.max(0, Math.round(stored)) : 0;
  const start = new Date(entry.started_at);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((toDate(now).getTime() - start.getTime()) / 1000));
}

// --- Rollups -----------------------------------------------------------------

// Per-product / per-user / per-department second totals across an entry set
// (typically one work order's rows). Voided rows contribute nothing. Pass
// { now } to fold still-running timers' live elapsed into the totals —
// without it they count only their stored duration (normally 0).
//
// Returns:
//   { total_seconds, running_seconds, entry_count, running_count,
//     by_product: {pid: secs}, by_user: {email: secs},
//     by_department: {design|production|fabrication|installation: secs} }
export function summarizeProductTime(entries, opts = {}) {
  const now = "now" in opts ? opts.now : undefined;
  const summary = {
    total_seconds: 0,
    running_seconds: 0,
    entry_count: 0,
    running_count: 0,
    by_product: {},
    by_user: {},
    by_department: Object.fromEntries(TIME_ENTRY_DEPARTMENTS.map((d) => [d, 0])),
  };
  for (const e of entryList(entries)) {
    if (isVoided(e)) continue;
    const secs = elapsedSeconds(e, now);
    const pid = clean(e.product_id) || "unknown";
    const email = lower(e.user_email) || "unknown";
    const dept = normalizeDepartment(e.department);
    summary.total_seconds += secs;
    summary.entry_count += 1;
    if (isRunning(e)) {
      summary.running_count += 1;
      summary.running_seconds += secs;
    }
    summary.by_product[pid] = (summary.by_product[pid] || 0) + secs;
    summary.by_user[email] = (summary.by_user[email] || 0) + secs;
    summary.by_department[dept] += secs;
  }
  return summary;
}

// The A-17 accumulator patch for one products[] row: this product's entry
// seconds folded through DEPARTMENT_TIME_FIELD into the two stored fields.
// `product` may be the product object (uses .id) or a bare product id.
// Always returns both keys — the values REPLACE the stored accumulators
// (entries are the source of truth, never added on top).
export function syncProductTimeFields(product, entries, opts = {}) {
  const pid = clean(typeof product === "string" ? product : product?.id ?? product?.product_id);
  const patch = { design_time_seconds: 0, production_time_seconds: 0 };
  if (!pid) return patch;
  const now = "now" in opts ? opts.now : undefined;
  for (const e of entryList(entries)) {
    if (isVoided(e) || clean(e.product_id) !== pid) continue;
    const field = DEPARTMENT_TIME_FIELD[normalizeDepartment(e.department)];
    patch[field] += elapsedSeconds(e, now);
  }
  return patch;
}

// --- Display helpers ---------------------------------------------------------

// H:MM:SS — hours unpadded so a 27-hour job reads "27:00:00".
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(num(seconds, 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

// Best display name for a products[] row — description chain falls back to
// the id so history stays readable on sparse rows.
export function labelForProduct(product) {
  if (!product || typeof product !== "object") return clean(product) || "product";
  return (
    clean(product.customer_description) ||
    clean(product.description) ||
    clean(product.client_product_name) ||
    clean(product.product_type) ||
    clean(product.name) ||
    clean(product.id) ||
    "product"
  );
}

// Department a timer on this product should default to: an explicit
// product.department wins, then the responsibility/queue bucket when it is
// one of the enum values, else DEFAULT_DEPARTMENT.
export function departmentForProduct(product, fallback = DEFAULT_DEPARTMENT) {
  if (!product || typeof product !== "object") return fallback;
  for (const v of [product.department, product.time_department, product.responsibility]) {
    const d = lower(v);
    if (TIME_ENTRY_DEPARTMENTS.includes(d)) return d;
  }
  return TIME_ENTRY_DEPARTMENTS.includes(lower(fallback)) ? lower(fallback) : DEFAULT_DEPARTMENT;
}
