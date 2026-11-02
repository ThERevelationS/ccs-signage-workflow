// Pure helpers for the I-04 reconciliation UI surfaces — BatchList,
// BatchDetail, CloseBatchDialog. No React, no I/O: safe to esbuild-bundle
// under Node for scripts/test-reconciliation-ui.mjs.
//
// Money mirrors base44/shared/reconciliationModel.ts — integer cents via the
// same sign-aware toCents so the dialogs' previews tie penny-for-penny with
// the backend's stored totals. Storage/display converts once via fromCents.

import { TENDER_BUCKETS, BUCKET_LABELS, bucketFor } from "./reconciliationModel";

export { TENDER_BUCKETS, BUCKET_LABELS };

export const clean = (v) => String(v ?? "").trim();
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Dollar-ish → integer cents (sign-aware half-away-from-zero, same formula
// the shared model uses: the ±1e-7 nudge rides past the input sign so
// 1.005→101 and -1.005→-101). `+ 0` normalizes -0 → +0.
export const toCents = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + Math.sign(n) * 1e-7) + 0;
};

// Integer cents → dollars.
export const fromCents = (cents) => Math.round(num(cents)) / 100;

// 'YYYY-MM-DD' — leading date prefix wins so ISO stamps never shift days.
export const toDay = (value) => {
  const s = clean(value);
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
};

// ---------------------------------------------------------------------------
// Batch snapshot fields. I-03 batches carry *_amount mirrors (dollars,
// cent-exact); legacy rows only have *_total / cash_adjustment / variance.
// Read the mirror first, fall back to the legacy field.
// ---------------------------------------------------------------------------
export const batchExpected = (b) => num(b?.expected_amount ?? b?.expected_total);
export const batchCollected = (b) => num(b?.collected_amount ?? b?.collected_total);
export const batchAdjustmentsAmount = (b) => num(b?.adjustments_amount ?? b?.cash_adjustment);
// Variance = collected + adjustments − expected; a stored variance wins when
// present (it was computed over the payments actually swept at close time).
export const batchVariance = (b) =>
  b?.variance_amount !== undefined || b?.variance !== undefined
    ? num(b?.variance_amount ?? b?.variance)
    : num(batchCollected(b) + batchAdjustmentsAmount(b) - batchExpected(b));

export const batchName = (b) => clean(b?.name) || clean(b?.batch_number) || "Batch";
export const batchNumber = (b) => clean(b?.batch_number);
export const batchStatus = (b) => clean(b?.status).toLowerCase() || "closed";
export const batchPaymentCount = (b) =>
  Number.isFinite(Number(b?.payment_count))
    ? Number(b.payment_count)
    : (Array.isArray(b?.payment_ids) ? b.payment_ids.length : 0);

// StatusChip tones: a closed batch is finished work (emerald), reopened is an
// audit stub needing attention (amber), open is in progress (sky).
export const batchStatusTone = (status) => {
  const s = clean(status).toLowerCase() || "closed";
  if (s === "closed") return "emerald";
  if (s === "reopened") return "amber";
  if (s === "open") return "sky";
  return "slate";
};

// Itemized adjustments for display: the I-03 adjustments[] rows win; a legacy
// scalar cash_adjustment + adjustment_note folds into a single row.
export function batchAdjustmentRows(b) {
  const rows = (Array.isArray(b?.adjustments) ? b.adjustments : [])
    .map((a) => ({ amount: num(a?.amount), reason: clean(a?.reason), note: clean(a?.note) }))
    .filter((a) => a.amount !== 0 || a.reason || a.note);
  if (rows.length === 0 && num(b?.cash_adjustment) !== 0) {
    rows.push({ amount: num(b.cash_adjustment), reason: clean(b?.adjustment_note), note: "" });
  }
  return rows;
}

// Status timeline for the detail view: the close event plus the reopen event
// (with reason) when the batch was reopened.
export function statusHistory(b) {
  const events = [];
  const closedAt = clean(b?.closed_at);
  const closedBy = clean(b?.closed_by) || clean(b?.created_by);
  if (closedAt || closedBy) events.push({ label: "Closed", at: closedAt, by: closedBy, detail: "" });
  if (batchStatus(b) === "reopened" || clean(b?.reopened_at)) {
    events.push({
      label: "Reopened",
      at: clean(b?.reopened_at),
      by: clean(b?.reopened_by),
      detail: clean(b?.reopen_reason),
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Candidate rows. The server returns paymentSnapshot rows carrying
// bucket/location_id/paid_date; the shared model's working copies carry
// _bucket/_location_id/_day. Read both so either wire shape renders.
// ---------------------------------------------------------------------------
export const candidateDay = (p) => clean(p?._day) || toDay(p?.paid_date) || toDay(p?.created_date);
export const candidateBucket = (p) => {
  const b = clean(p?._bucket) || clean(p?.bucket);
  return TENDER_BUCKETS.includes(b) ? b : bucketFor(p?.method);
};
export const candidateLocationId = (p) =>
  clean(p?._location_id) || clean(p?.location_id) || clean(p?.location_name) || clean(p?.location);

// Per-bucket expected totals over a candidate set (client-side recompute when
// the user deselects rows — the server's groups.by_method covers the full
// unfiltered candidate pool).
export function expectedBuckets(payments = []) {
  const buckets = Object.fromEntries(TENDER_BUCKETS.map((b) => [b, { count: 0, expectedCents: 0 }]));
  let count = 0;
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!p || typeof p !== "object") continue;
    buckets[candidateBucket(p)].count += 1;
    buckets[candidateBucket(p)].expectedCents += toCents(p?.amount);
    count += 1;
  }
  const totalCents = TENDER_BUCKETS.reduce((s, b) => s + buckets[b].expectedCents, 0);
  return { buckets, totalCents, count };
}

// Resolve the counted drafts (strings from the inputs) into the whole-bucket
// dollar map close_batch expects. The wizard convention holds: a blank input
// means "counted = expected" for that bucket, so previews and the submitted
// payload never disagree.
export function resolveCounted(drafts = {}, expected = null) {
  const counted = {};
  let collectedCents = 0;
  let allBlank = true;
  for (const b of TENDER_BUCKETS) {
    const raw = clean(drafts[b]);
    if (raw !== "") allBlank = false;
    const cents = raw === "" ? num(expected?.buckets?.[b]?.expectedCents) : toCents(raw);
    counted[b] = fromCents(cents);
    collectedCents += cents;
  }
  return { counted, collectedCents, allBlank };
}

// Variance in integer cents: collected + adjustments − expected.
export const varianceCents = (expectedCents, collectedCents, adjustmentsCents = 0) =>
  Math.round(num(collectedCents)) + Math.round(num(adjustmentsCents)) - Math.round(num(expectedCents));

// A single {amount, reason} draft → the itemized cash_adjustments[] the I-03
// close writes. Zero/blank amount → no rows (a reason-only draft is dropped
// with it — there is nothing to explain).
export function adjustmentDrafts(amount, reason) {
  const cents = toCents(amount);
  if (cents === 0) return [];
  return [{ amount: fromCents(cents), reason: clean(reason) }];
}

export const adjustmentsCentsOf = (rows = []) =>
  (Array.isArray(rows) ? rows : []).reduce((s, r) => s + toCents(r?.amount), 0);

// ---------------------------------------------------------------------------
// Request payloads.
// ---------------------------------------------------------------------------

// list_candidates filters — flat keys; blank values are dropped entirely.
export function buildCandidateFilters({ locationId = "", dateStart = "", dateEnd = "", method = "" } = {}) {
  const filters = {};
  if (clean(locationId)) filters.location_id = clean(locationId);
  const ds = toDay(dateStart);
  const de = toDay(dateEnd);
  if (ds) filters.date_start = ds;
  if (de) filters.date_end = de;
  if (clean(method)) filters.method = clean(method).toLowerCase();
  return filters;
}

// list_batches filters — same cleaning, plus the 500-row cap.
export function buildBatchFilters({ status = "", locationId = "", dateStart = "", dateEnd = "", limit = 250 } = {}) {
  const filters = buildCandidateFilters({ locationId, dateStart, dateEnd });
  if (clean(status)) filters.status = clean(status).toLowerCase();
  filters.limit = Math.max(1, Math.min(500, num(limit, 250) || 250));
  return filters;
}

// close_batch body. payment_ids always ride along when provided — pinning the
// exact swept set is what makes a retried close converge on the same members
// instead of re-evaluating filters against newly-arrived payments. Empties
// are dropped so the backend's own defaults apply.
export function buildClosePayload({
  paymentIds = [],
  locationId = "",
  locationName = "",
  name = "",
  counted = null,
  adjustments = [],
  notes = "",
  creationKey = "",
} = {}) {
  const body = { action: "close_batch", creation_request_key: clean(creationKey) };
  const ids = (Array.isArray(paymentIds) ? paymentIds : []).map(clean).filter(Boolean);
  if (ids.length) body.payment_ids = ids;
  if (clean(locationId)) body.location_id = clean(locationId);
  if (clean(locationName)) body.location = clean(locationName);
  if (clean(name)) body.name = clean(name);
  if (counted && typeof counted === "object") {
    body.counted = Object.fromEntries(TENDER_BUCKETS.map((b) => [b, num(counted[b])]));
  }
  const adj = (Array.isArray(adjustments) ? adjustments : [])
    .map((a) => ({ amount: num(a?.amount), reason: clean(a?.reason), note: clean(a?.note) }))
    .filter((a) => a.amount !== 0 || a.reason || a.note);
  if (adj.length) body.cash_adjustments = adj;
  if (clean(notes)) body.notes = clean(notes);
  return body;
}

// ---------------------------------------------------------------------------
// Reopen guards — mirror the backend contract so the UI refuses before the
// wire does (admin only, batch must be closed, reason ≥ 3 chars).
// ---------------------------------------------------------------------------
export const isAdminUser = (user) =>
  !!user && (clean(user.role).toLowerCase() === "admin" || user.is_full_admin === true);
export const canReopenBatch = (user, batch) => isAdminUser(user) && batchStatus(batch) === "closed";
export const validReopenReason = (reason) => clean(reason).length >= 3;
