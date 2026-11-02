// Pure queue-counter helpers (C-04). React-free, entity-free: every function
// computes from rows/work orders the caller already loaded — the same feed
// payload that renders the queue drives the counters, so a tile never costs
// an extra entity read. `now` is injectable for deterministic tests.
//
// Row shape = flattenQueueRows() output (see productQueueModel.js): status,
// substatus, proof, proofVersion, proofApprovedVersion, rush, assignedTo,
// designer, responsibility, due/designDue/productDue/woDue, moduleKey.
// Every predicate is field-tolerant — a missing field reads as absent, never
// throws, and partial rows (e.g. order-level meta rows) count honestly.
import { flattenQueueRows, duePresetMatch } from "./productQueueModel";

const norm = (v) => String(v ?? "").trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// First non-blank normalized string / first non-zero number across a field's
// known spellings — camelCase row fields win, snake_case/raw fields cover
// rows that never passed through flattenQueueRows.
const pickStr = (...vals) => {
  for (const v of vals) { const s = norm(v); if (s) return s; }
  return "";
};
const pickNum = (...vals) => {
  for (const v of vals) { const n = num(v); if (n) return n; }
  return 0;
};

// The CoreBridge counter set this model produces, in canonical tile order.
export const QUEUE_COUNTER_KEYS = ["awaiting_proof", "past_due", "rush", "unassigned"];

// "Awaiting proof" = the product visibly waits on a proof approval: a proof
// out with the customer (sent / awaiting_approval), the operational state
// send_proof stamps, or a stale approval (a newer file version than the
// version the approval was given for — mirrors proofModel.isProofStale
// against the flattened row fields).
export function isAwaitingProofRow(row) {
  const r = row || {};
  const proof = pickStr(r.proof, r.proof_status) || "none";
  if (proof === "sent" || proof === "awaiting_approval") return true;
  if (pickStr(r.status, r.operational_status) === "awaiting_proof_approval") return true;
  const version = pickNum(r.proofVersion, r.proof_version);
  const approved = pickNum(r.proofApprovedVersion, r.proof_approved_version);
  if (!version || version === approved) return false;
  return approved > 0 || proof === "approved";
}

// "Past due" matches the queue's Past Due due-preset exactly — the lens
// date (`due`, picked by dueField at flatten time) with the WO install date
// (`woDue`) as the same fallback filterQueueRows uses — so a counter tile
// always equals the filtered row count it links to.
export function isPastDueRow(row, now = new Date()) {
  const r = row || {};
  return duePresetMatch(pickStr(r.due, r.woDue), "past_due", now);
}

// "Rush" rides the flattened row's rush flag (flattenQueueRows already folds
// order/product rush flags, priority labels, rush substatuses and quick tags
// into it); the extra field reads keep hand-built/meta rows honest too.
export function isRushRow(row) {
  const r = row || {};
  if (r.rush === true || r.is_rush === true) return true;
  if (pickStr(r.priority_label, r.priorityLabel, r.order_priority) === "rush") return true;
  if (pickStr(r.substatus, r.operational_substatus).includes("rush")) return true;
  const tags = Array.isArray(r.quick_tags) ? r.quick_tags : [];
  return tags.some((t) => norm(t).includes("rush"));
}

// "Unassigned" = nobody owns the row: no assigned-to and no designer.
// Responsibility is department/group routing, not an assignee, so it does
// not clear the counter on its own.
export function isUnassignedRow(row) {
  const r = row || {};
  return !pickStr(r.assignedTo, r.assigned_to, r.assignee) && !pickStr(r.designer);
}

const emptyCounter = () => ({
  total: 0,
  awaiting_proof: 0,
  past_due: 0,
  rush: 0,
  unassigned: 0,
});

// Fold a single flattened queue row into a counter bucket.
function countRow(bucket, row, now) {
  bucket.total += 1;
  if (isAwaitingProofRow(row)) bucket.awaiting_proof += 1;
  if (isPastDueRow(row, now)) bucket.past_due += 1;
  if (isRushRow(row)) bucket.rush += 1;
  if (isUnassignedRow(row)) bucket.unassigned += 1;
}

// CoreBridge home counters for a flattened queue row set. `by_status` buckets
// the same rows by operational status so status-keyed tiles need no second
// pass elsewhere.
export function queueCounters(rows = [], { now = new Date() } = {}) {
  const out = { ...emptyCounter(), by_status: {} };
  for (const row of rows || []) {
    if (!row) continue;
    countRow(out, row, now);
    const status = pickStr(row.status, row.operational_status) || "none";
    out.by_status[status] = (out.by_status[status] || 0) + 1;
  }
  return out;
}

// The module bucket a row belongs to. The product's own module_key wins
// (conversion stamps per-product provenance, so combined work orders split
// across module tiles honestly); order-level fields are the fallbacks for
// products without one — module_key → project_type → order_type → module →
// type. Blank when nothing resolves; those rows are skipped rather than
// inventing a phantom tile.
export function moduleKeyForRow(row, workOrder) {
  const wo = workOrder || {};
  return (
    pickStr(row?.moduleKey, row?.module_key) ||
    pickStr(wo.module_key, wo.project_type, wo.order_type, wo.module, wo.type)
  );
}

// Per-module home counters (the estimator tile set): work orders flatten to
// product rows through the same flattenQueueRows the queues use, each row
// lands in its module bucket, and every bucket gets the CB counter set.
// Result: { module_key: {total, awaiting_proof, past_due, rush, unassigned} }.
// Extra opts (dueField, includeFulfilled) pass through to flattenQueueRows.
export function moduleCounters(workOrders = [], { now = new Date(), ...flattenOpts } = {}) {
  const byKey = new Map();
  const orders = Array.isArray(workOrders) ? workOrders : [];
  const orderById = new Map(
    orders
      .filter((wo) => wo?.id)
      .map((wo) => [wo.id, wo]),
  );
  for (const row of flattenQueueRows(orders, flattenOpts)) {
    const key = moduleKeyForRow(row, orderById.get(row.workOrderId));
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, emptyCounter());
    countRow(byKey.get(key), row, now);
  }
  return Object.fromEntries(byKey);
}

// Stable tile ordering: the named CB counters lead in canonical order, every
// other key (total, by_status, future counters, module names) follows
// alphabetically — same input keys always render the same tile row.
export function tileOrder(counterKeys = []) {
  const keys = [...new Set((counterKeys || []).filter((k) => k != null))];
  const named = QUEUE_COUNTER_KEYS.filter((k) => keys.includes(k));
  const rest = keys
    .filter((k) => !QUEUE_COUNTER_KEYS.includes(k))
    .map(String)
    .sort((a, b) => a.localeCompare(b));
  return [...named, ...rest];
}
