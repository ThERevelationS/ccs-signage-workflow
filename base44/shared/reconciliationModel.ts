// Reconciliation batch model — I-03 (batched cash close with filtered
// candidate selection + admin-gated reopen). Pure TS, zero imports: safe to
// bundle into Deno functions (base44/functions/*) and frontend modules alike.
// All I/O lives in the wiring layer (manageReconciliation/entry.ts); every
// function here takes plain rows and returns plain plans.
//
// Money: all monetary outputs are INTEGER CENTS (12345 = $123.45). Inputs are
// dollar-denominated entity fields (Payment.amount, adjustment.amount) and are
// converted exactly once via toCents — no float arithmetic ever touches the
// totals. Storage code converts back with fromCents at the entity boundary.
//
// Payment method enum (Payment.jsonc): cash|check|card|ach|financing|other|
// credit_memo. The close counts four CoreBridge tender buckets — cash, check,
// card, other — where "other" absorbs ach/financing/credit_memo/unknown
// methods (same folding as src/components/reconciliation/reconciliationModel.js).
//
// Candidate semantics: a Payment is batchable when status==='recorded' and it
// carries no reconciliation_batch_id (and, when supplied, is absent from every
// prior batch's payment_ids — the defensive double-check the frontend model
// applies). Close stamps payment.reconciliation_batch_id; reopen clears it.
//
// API:
//   toCents / fromCents / moneyRound               → cent-safe converters
//   bucketFor(method)                              → tender bucket
//   paymentDay(p) / paymentLocationKey(p)          → normalized selectors
//   isUnbatchedPayment(p)                          → recorded + unswept
//   normalizeFilters(raw)                          → cleaned filter spec
//   batchCandidates({payments, filters})           → filtered + grouped candidates
//   normalizeAdjustments(raw)                      → cleaned cash-adjustment rows
//   batchTotals({payments, adjustments?, counted?, collected_cents?})
//                                                  → cent-exact totals + variance
//   closePlan({batch_id, batch?, payments, now, actor})
//                                                  → per-payment stamp spec
//   reopenPlan({batch, payments, actor, reason, now})
//                                                  → un-stamp spec + audit note
//   auditNote({now, actor, reason})                → '[reopened …]' line

export const TENDER_BUCKETS = ['cash', 'check', 'card', 'other'] as const;
export const BUCKET_LABELS: Record<string, string> = {
  cash: 'Cash', check: 'Check', card: 'Card', other: 'Other',
};

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Dollar-ish value → integer cents. Sign-aware fixed pattern:
//   Math.round(v*100 + Math.sign(v)*1e-7)
// The ±1e-7 nudge rides past the input sign so float-boundary values round
// half away from zero in BOTH directions (1.005→101, -1.005→-101). Equivalent
// to the repo's Math.sign(n)*Math.round(Math.abs(n)*100+1e-9) convention;
// written this way per the I-03 spec. `+ 0` normalizes -0 → +0.
// Strings are stripped of currency decoration defensively so imported
// CSV-shaped rows also parse ('$1,234.56' → 123456). Non-finite → 0.
export const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + Math.sign(n) * 1e-7) + 0;
};

// Integer cents → dollars (storage is dollar-denominated like Payment.amount).
export const fromCents = (cents: any): number => Math.round(num(cents)) / 100;

// Round a dollar-ish value to exactly 2dp through the cent path.
export const moneyRound = (v: any): number => fromCents(toCents(v));

// Fold a raw Payment.method into a tender bucket.
export const bucketFor = (method: any): string => {
  const m = clean(method).toLowerCase();
  return (TENDER_BUCKETS as readonly string[]).includes(m) ? m : 'other';
};

// Errors thrown by plan guards carry an HTTP-ish status so the wiring layer
// can forward them through its bad() helper without re-classifying.
export class ReconciliationModelError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message: string, status = 400): never => {
  throw new ReconciliationModelError(message, status);
};

// Normalize any date-ish value to 'YYYY-MM-DD'. Leading-date prefix wins so
// ISO timestamps never shift days across timezones (statementBatchModel's
// toDay convention).
export const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  const s = clean(value);
  if (!s) return '';
  const direct = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
};

// The day a payment counts toward: its tendered date, falling back to the row's
// created stamp (mirrors entry.ts paymentSnapshot paid_date||created_date).
export const paymentDay = (p: any): string => toDay(p?.paid_date) || toDay(p?.created_date);

// Location resolution: Payment rows do not carry a declared location field, so
// the wiring layer stamps `location_id` onto working copies (payment's own
// location_id first, then the linked invoice's location_id, then a free-text
// `location` label). The model reads whatever landed — id, code or name.
export const paymentLocationKey = (p: any): string =>
  clean(p?.location_id) || clean(p?.locationId) || clean(p?.location) || clean(p?.location_name);

export const paymentStatus = (p: any): string => clean(p?.status).toLowerCase() || 'recorded';
export const paymentBatchId = (p: any): string => clean(p?.reconciliation_batch_id);

// Batchable row: live (recorded) + not already swept into a close.
export const isUnbatchedPayment = (p: any): boolean =>
  isObj(p) && paymentStatus(p) === 'recorded' && !paymentBatchId(p);

export interface ReconciliationFilters {
  location_id?: any;
  date_start?: any;
  date_end?: any;
  method?: any;
  // Defensive sweep guard: ids already listed in any existing batch's
  // payment_ids (mirrors frontend unreconciledPayments) are never candidates.
  exclude_ids?: any;
  statuses?: any;
}

export function normalizeFilters(raw: any = {}) {
  const src = isObj(raw) ? raw : {};
  const methodRaw = clean(src.method).toLowerCase();
  // Bucket names match on the folded bucket; any other value matches the raw
  // method exactly (so 'other' catches ach/financing/credit_memo while 'ach'
  // still selects only ach rows).
  const methodIsBucket = (TENDER_BUCKETS as readonly string[]).includes(methodRaw);
  const exclude = new Set<string>();
  const rawExclude = src.exclude_ids ?? src.excludeIds ?? src.excluded_ids;
  const list = rawExclude instanceof Set ? [...rawExclude] : Array.isArray(rawExclude) ? rawExclude : [];
  for (const id of list) {
    const key = clean(id);
    if (key) exclude.add(key);
  }
  const statuses = new Set<string>();
  const rawStatuses = Array.isArray(src.statuses) ? src.statuses : [];
  for (const s of rawStatuses) {
    const k = clean(s).toLowerCase();
    if (k) statuses.add(k);
  }
  return {
    location_id: clean(src.location_id ?? src.locationId),
    date_start: toDay(src.date_start ?? src.date_from ?? src.start),
    date_end: toDay(src.date_end ?? src.date_to ?? src.end),
    method: methodRaw,
    method_is_bucket: methodIsBucket,
    exclude_ids: exclude,
    statuses,
  };
}

const methodMatches = (p: any, filters: ReturnType<typeof normalizeFilters>): boolean => {
  if (!filters.method) return true;
  const raw = clean(p?.method).toLowerCase() || 'other';
  if (filters.method_is_bucket) return bucketFor(raw) === filters.method;
  return raw === filters.method;
};

const locationMatches = (p: any, filters: ReturnType<typeof normalizeFilters>): boolean => {
  if (!filters.location_id) return true;
  return paymentLocationKey(p).toLowerCase() === filters.location_id.toLowerCase();
};

const dayMatches = (p: any, filters: ReturnType<typeof normalizeFilters>): boolean => {
  if (!filters.date_start && !filters.date_end) return true;
  const day = paymentDay(p);
  if (!day) return false; // undated rows can't prove they're inside the window
  if (filters.date_start && day < filters.date_start) return false;
  if (filters.date_end && day > filters.date_end) return false;
  return true;
};

// Batchable candidates under the filter spec, plus the groupings a selection
// UI needs (by tender bucket, by day, by location). Returned rows are shallow
// copies carrying normalized `_day`/`_bucket`/`_location_id` selectors — the
// caller's payment objects are never mutated.
export function batchCandidates({ payments = [], filters = {} }: { payments?: any[]; filters?: any } = {}) {
  const f = normalizeFilters(filters);
  const candidates: any[] = [];
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!isObj(p)) continue;
    if (f.statuses.size ? !f.statuses.has(paymentStatus(p)) : !isUnbatchedPayment(p)) continue;
    if (f.exclude_ids.has(clean(p.id))) continue;
    if (!locationMatches(p, f) || !dayMatches(p, f) || !methodMatches(p, f)) continue;
    candidates.push({ ...p, _day: paymentDay(p), _bucket: bucketFor(p?.method), _location_id: paymentLocationKey(p) });
  }
  candidates.sort((a, b) => (a._day || '').localeCompare(b._day || '') || clean(a.id).localeCompare(clean(b.id)));

  const by_method: Record<string, { count: number; expected_cents: number }> = {};
  const by_day: Record<string, { count: number; expected_cents: number }> = {};
  const by_location: Record<string, { count: number; expected_cents: number }> = {};
  let expected = 0;
  for (const p of candidates) {
    const cents = toCents(p.amount);
    expected += cents;
    const bump = (map: Record<string, any>, key: string) => {
      const k = key || '(none)';
      map[k] = map[k] || { count: 0, expected_cents: 0 };
      map[k].count += 1;
      map[k].expected_cents += cents;
    };
    bump(by_method, p._bucket);
    bump(by_day, p._day || '(undated)');
    bump(by_location, p._location_id || '(none)');
  }
  return {
    candidates,
    count: candidates.length,
    expected_cents: expected,
    groups: { by_method, by_day, by_location },
    applied_filters: {
      location_id: f.location_id,
      date_start: f.date_start,
      date_end: f.date_end,
      method: f.method,
      excluded_count: f.exclude_ids.size,
    },
  };
}

// Clean a cash_adjustments[] input into {amount, amount_cents, reason, note}
// rows. Legacy scalar forms ({amount,reason} | 'cash_adjustment'+'note' pairs
// already folded by the caller) are normalized identically. A non-zero
// adjustment without any explanation is rejected here so the guard is
// testable without the function layer.
export function normalizeAdjustments(raw: any = []) {
  const list = Array.isArray(raw) ? raw : (isObj(raw) || raw === 0 || Number.isFinite(Number(raw)) ? [raw] : []);
  const out: { amount: number; amount_cents: number; reason: string; note: string }[] = [];
  for (const item of list) {
    const row = isObj(item) ? item : { amount: item };
    const amountCents = toCents(row.amount ?? row.value ?? 0);
    const reason = clean(row.reason ?? row.adjustment_note).slice(0, 500);
    const note = clean(row.note).slice(0, 500);
    if (amountCents !== 0 && !reason && !note) {
      fail('A cash adjustment needs an explanation (reason or note).', 400);
    }
    out.push({ amount: fromCents(amountCents), amount_cents: amountCents, reason, note });
  }
  return out;
}

export const adjustmentsAmountCents = (rows: any[] = []): number =>
  rows.reduce((s, r) => s + (Number.isFinite(Number(r?.amount_cents)) ? Number(r.amount_cents) : toCents(r?.amount)), 0);

// Cent-exact close totals.
//   expected_cents    — Σ recorded payment amounts.
//   collected_cents   — what was actually counted. Per-payment overrides read
//                       from p.collected_amount / p.counted_amount (dollars);
//                       `counted` {bucket: dollars} overrides whole buckets;
//                       `collected_cents` overrides the batch total (any delta
//                       vs the per-payment sum lands on the cash bucket, the
//                       same convention the close wizard documents).
//   adjustments_cents — Σ normalized adjustment rows.
//   variance_cents    — collected + adjustments − expected (+over / −short).
export function batchTotals({ payments = [], adjustments = [], counted = null, collected_cents = null }: any = {}) {
  const by_method: Record<string, { expected_cents: number; collected_cents: number; count: number }> = {};
  for (const b of TENDER_BUCKETS) by_method[b] = { expected_cents: 0, collected_cents: 0, count: 0 };
  const countedMap = isObj(counted) ? counted : null;
  let expected = 0;
  let collected = 0;
  let count = 0;
  const payment_ids: string[] = [];
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!isObj(p) || paymentStatus(p) !== 'recorded') continue;
    const bucket = bucketFor(p?.method);
    const exp = toCents(p.amount);
    // Per-payment collected overrides only — `counted` is a WHOLE-BUCKET
    // figure applied after the loop, not a per-row amount.
    const perRow = p.collected_amount !== undefined ? p.collected_amount
      : p.counted_amount !== undefined ? p.counted_amount
      : undefined;
    const got = perRow !== undefined ? toCents(perRow) : exp;
    by_method[bucket].expected_cents += exp;
    by_method[bucket].collected_cents += got;
    by_method[bucket].count += 1;
    expected += exp;
    collected += got;
    count += 1;
    const id = clean(p.id);
    if (id) payment_ids.push(id);
  }

  // Bucket-level `counted` overrides: each named bucket's collected figure
  // replaces its per-row sum — including buckets with zero payments, which
  // still represent counted money (counted cash with no cash payments = over).
  if (countedMap) {
    for (const b of TENDER_BUCKETS) {
      if (countedMap[b] !== undefined) {
        by_method[b].collected_cents = toCents(countedMap[b]);
      }
    }
    collected = 0;
    for (const b of TENDER_BUCKETS) collected += by_method[b].collected_cents;
  }

  // Scalar collected override: the counted figure replaces the per-row sum;
  // the difference is attributed to the cash line (till counts are the ones
  // that drift) so per-bucket numbers still tie to the batch total.
  if (collected_cents !== null && collected_cents !== undefined) {
    const target = Math.round(num(collected_cents));
    collected = target;
    let accounted = 0;
    for (const b of TENDER_BUCKETS) accounted += by_method[b].collected_cents;
    by_method.cash.collected_cents += target - accounted;
  }

  const adjustmentsCents = adjustmentsAmountCents(normalizeAdjustments(adjustments));
  return {
    expected_cents: expected,
    collected_cents: collected,
    adjustments_cents: adjustmentsCents,
    variance_cents: collected + adjustmentsCents - expected,
    count,
    payment_ids,
    by_method,
  };
}

const actorEmail = (actor: any): string =>
  clean(isObj(actor) ? (actor.email || actor.full_name || actor.id) : actor) || 'unknown';

// Admin actor check shared with the wiring layer: AuthorizedEmail `role` is
// the canonical gate (manageAnnouncements convention); is_full_admin covers
// rows that carry the flag instead.
export const isAdminActor = (actor: any): boolean =>
  isObj(actor) && (clean(actor.role).toLowerCase() === 'admin' || actor.is_full_admin === true);

// Close plan: per-payment {reconciliation_batch_id} stamp spec.
// - already stamped with THIS batch → `already` (idempotent re-close no-op).
// - stamped with a DIFFERENT batch → `conflicts` (the caller 409s — a closed
//   batch's payments are locked and must never be silently re-swept).
// - non-recorded rows → `skipped`.
// - everything else → `payment_updates` with the $set patch.
// When `batch` is supplied and it is already closed, NEW stamps are rejected
// outright (a closed batch rejects new payments); re-stamping its own rows
// stays a no-op so retries still converge. `authorized_ids` lets the caller
// pass the batch's recorded payment_ids snapshot — on a closed batch those
// ids are still allowed to stamp (they are completing the recorded close,
// e.g. a retry after a timeout between batch write and payment sweep), while
// any other unbatched row is rejected.
export function closePlan({ batch_id = '', batch = null, payments = [], authorized_ids = null, now = null, actor = null }: any = {}) {
  const batchId = clean(batch_id);
  if (!batchId) fail('A batch id is required to stamp payments.', 400);
  const when = clean(now) || new Date().toISOString();
  const who = actorEmail(actor);
  const closedBatch = isObj(batch) && clean(batch.status).toLowerCase() === 'closed';
  const authorized = new Set<string>(
    (Array.isArray(authorized_ids) ? authorized_ids
      : Array.isArray(batch?.payment_ids) ? batch.payment_ids
      : []).map((id: any) => clean(id)).filter(Boolean),
  );
  const payment_updates: any[] = [];
  const to_stamp: string[] = [];
  const already: string[] = [];
  const conflicts: any[] = [];
  const skipped: any[] = [];
  const memberIds: string[] = [];

  for (const p of Array.isArray(payments) ? payments : []) {
    if (!isObj(p)) continue;
    const id = clean(p.id);
    if (!id) { skipped.push({ id: '', reason: 'missing_id' }); continue; }
    const current = paymentBatchId(p);
    if (current === batchId) {
      payment_updates.push({ id, set: { reconciliation_batch_id: batchId }, expected_batch_id: batchId, already: true });
      already.push(id);
      memberIds.push(id);
      continue;
    }
    if (current) {
      conflicts.push({ id, reconciliation_batch_id: current });
      continue;
    }
    if (paymentStatus(p) !== 'recorded') {
      skipped.push({ id, reason: `status:${paymentStatus(p)}` });
      continue;
    }
    if (closedBatch && !authorized.has(id)) {
      skipped.push({ id, reason: 'batch_closed' });
      continue;
    }
    payment_updates.push({ id, set: { reconciliation_batch_id: batchId }, expected_batch_id: '', already: false });
    to_stamp.push(id);
    memberIds.push(id);
  }
  if (closedBatch && skipped.some((s) => s.reason === 'batch_closed')) {
    fail('This reconciliation batch is closed; reopen it before adding payments.', 409);
  }
  return {
    batch_id: batchId,
    actor: who,
    now: when,
    patch: { reconciliation_batch_id: batchId },
    payment_updates,
    to_stamp,
    already,
    conflicts,
    skipped,
    member_ids: memberIds,
    changed: to_stamp.length > 0,
  };
}

export const auditNote = ({ now = null, actor = null, reason = '' }: any = {}): string =>
  `[reopened ${clean(now) || new Date().toISOString()} by ${actorEmail(actor)}] ${clean(reason)}`;

// Reopen plan: admin-only + reason-required un-stamp. Guards throw
// ReconciliationModelError (status-tagged) so the tests exercise the same
// contract the function enforces:
//   - batch must exist and currently be 'closed' (a 'reopened' batch is an
//     immutable audit stub — payments re-sweep into NEW batches).
//   - actor must be admin.
//   - reason must be at least 3 non-space characters.
// Only rows stamped with THIS batch id are cleared; rows that a later close
// pulled into a different batch are left alone and reported in `foreign`.
export function reopenPlan({ batch = null, payments = [], actor = null, reason = '', now = null }: any = {}) {
  if (!isObj(batch) || !clean(batch.id)) fail('Reconciliation batch not found.', 404);
  const status = clean(batch.status).toLowerCase() || 'closed';
  if (status !== 'closed') {
    fail(`Only a closed batch can be reopened (this batch is ${status || 'unknown'}).`, 409);
  }
  if (!isAdminActor(actor)) fail('Only an admin can reopen a reconciliation batch.', 403);
  const why = clean(reason);
  if (why.length < 3) fail('A reason is required to reopen a reconciliation batch.', 400);

  const batchId = clean(batch.id);
  const when = clean(now) || new Date().toISOString();
  const who = actorEmail(actor);
  const note = auditNote({ now: when, actor, reason: why });
  const payment_updates: any[] = [];
  const foreign: any[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!isObj(p)) continue;
    const id = clean(p.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const current = paymentBatchId(p);
    if (current === batchId) {
      payment_updates.push({ id, set: { reconciliation_batch_id: '' }, expected_batch_id: batchId });
    } else if (current) {
      foreign.push({ id, reconciliation_batch_id: current });
    }
  }
  // Snapshot ids are cleared even if the back-link was lost: list the ids the
  // batch recorded so the caller can force-clear stragglers by id.
  const snapshot_ids = (Array.isArray(batch.payment_ids) ? batch.payment_ids : [])
    .map((id: any) => clean(id)).filter(Boolean);
  const snapshot_only = snapshot_ids.filter((id: string) => !seen.has(id));

  return {
    batch_id: batchId,
    actor: who,
    now: when,
    audit_note: note,
    batch_update: {
      status: 'reopened',
      reopened_by: who,
      reopened_at: when,
      reopen_reason: why,
      appended_note: note,
    },
    payment_updates,
    unstamp_ids: payment_updates.map((u) => u.id),
    snapshot_ids,
    snapshot_only,
    foreign,
  };
}
