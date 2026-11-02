// Statement batch WRITE side — ESTIMATOR_MASTERPLAN WS-I / item I-11.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// statementBatchModel (the READ/plan side — this file is its write twin).
//
// statementBatchModel decides WHO gets a statement (completed-balance
// candidates, dedupe-checked plan rows). This model decides WHAT the batch
// run persists, still with zero I/O — the wiring layer (scheduled
// function / admin action) loads rows, applies these patch specs, and
// stores the receipt:
//
//   1. statementBatchId(period)                — the batch identity,
//      'stmt-batch:<period_start>' — deterministic on the covered month,
//      NOT per run. A rerun of the same period produces the same id, which
//      is exactly what makes the invoice stamps idempotent.
//   2. statementInvoiceStamp({batch_id, period, now}) — the A-16 patch:
//      {statement_batch_id, statement_period_start, statement_period_end,
//       statement_generated_at} applied to every invoice on the statement.
//      Invoice.jsonc declares ONLY statement_batch_id (A-16); the other
//      three are spec'd additions for the orchestrator — until declared
//      they ride as stored extras (same convention as digest kind:'daily_
//      digest' / WorkOrder _salesTaskAdoption extras).
//      LAST-WRITE-WINS per invoice: an invoice still open next month is
//      stamped by the newer batch; period history never lives on the
//      invoice — it lives on the dedupe-keyed statement RECORD (step 4).
//   3. statementBatchWritePlan(rows, opts)     — per-customer write specs:
//      invoice_patches (with CAS `expected` anchors), already-stamped
//      ids, opt-out + missing-email flags, and the statement-record
//      create-row. Idempotent: a customer whose statement invoices are
//      ALL already stamped current-batch (or whose dedupe_key is in
//      existingKeys) is skipped, not re-written.
//   4. markStatementSent(...)                  — patch builder flipping a
//      generated statement record to sent (+channel/to/at); the history
//      row is what "statement history" means absent a Statement entity.
//   5. statementBatchReceipt(...)              — {batch_id, count, sent,
//      skipped, missing_email_ids, dedupe_keys, …} the run-report object
//      the caller persists/responds with.
//
// Money: context money fields stay INTEGER CENTS end-to-end (batch-model
// convention, N-05.2) — the receipt/history rows carry closing_balance etc.
// verbatim, no re-formatting here.
//
// Customer opt-out: Customer.send_monthly_statements === false marks the
// row send_opted_out — the statement is still GENERATED + stamped (AR
// truth doesn't change) but the delivery adapter must not email it.
//
// API:
//   STATEMENT_BATCH_ID_PREFIX / STATEMENT_INVOICE_STAMP_FIELDS /
//     STATEMENT_RECORD_KIND / STATEMENT_HISTORY_DEDUPE_PREFIX
//   statementBatchId(period)
//   statementDedupeKeyLocal(customer_id, period_start)  — parity copy
//   statementInvoiceStamp({batch_id, period, now})
//   invoiceStatementMark(invoice, {batch_id, period_start})
//     → 'current' | 'other_batch' | 'conflict' | 'unstamped'
//   statementCustomerWrite(row, {batch_id, period?, now, invoicesById, customersById, existingKeys})
//   statementBatchWritePlan(rows, {batch_id, now, invoicesById, customersById, existingKeys})
//   markStatementSent({row|customer_id, dedupe_key, batch_id, context, channel, sent_to, now})
//   statementBatchReceipt({batch_id, plan, results, now})

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

// 'YYYY-MM-DD' — leading-date-prefix wins so ISO timestamps never shift
// days (same rule as statementBatchModel.toDay).
const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

// Full ISO UTC timestamp for generated_at / sent_at stamps.
const toIso = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const s = clean(value);
  if (!s) return '';
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

// ---------------------------------------------------------------------------
// vocabulary / constants
// ---------------------------------------------------------------------------

export const STATEMENT_BATCH_ID_PREFIX = 'stmt-batch';

// The A-16 stamp set — statement_batch_id is schema-declared; the other
// three are I-11 spec'd fields (see header / FINAL REPORT).
export const STATEMENT_INVOICE_STAMP_FIELDS = [
  'statement_batch_id',
  'statement_period_start',
  'statement_period_end',
  'statement_generated_at',
] as const;

// Marker kind for the per-customer statement history record (Notification
// or a future Statement entity — the writer chooses the store; dedupe_key
// + creation_request_key make the create idempotent either way).
export const STATEMENT_RECORD_KIND = 'customer_statement';
export const STATEMENT_HISTORY_DEDUPE_PREFIX = 'stmt-rec';

export const STATEMENT_STATUS_GENERATED = 'generated';
export const STATEMENT_STATUS_SENT = 'sent';

// Skip reasons surfaced on plan.skipped rows + receipt.skipped_ids.
export const STATEMENT_SKIP_REASONS = {
  no_customer_id: 'no_customer_id',
  no_period: 'no_period',
  already_generated: 'already_generated',
  already_stamped: 'already_stamped',
  duplicate_in_plan: 'duplicate_in_plan',
} as const;

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

// 'YYYY-MM-DD' period bound — accepts a period object or a bare date-ish.
const periodStartOf = (period: any): string =>
  toDay(isObj(period) ? period.period_start : period);
const periodEndOf = (period: any): string =>
  toDay(isObj(period) ? period.period_end : '');

/**
 * statementBatchId — the batch identity stamped on invoices + history
 * rows. Deterministic on the covered period ('stmt-batch:2026-10-01'):
 * same period → same batch, so reruns re-derive the same stamp set and the
 * invoice patch becomes a no-op instead of a new write. `generated_at`
 * inside the stamp is what distinguishes run time.
 */
export function statementBatchId(period: any): string {
  const start = periodStartOf(period);
  return start ? `${STATEMENT_BATCH_ID_PREFIX}:${start}` : '';
}

/**
 * statementDedupeKeyLocal — PARITY COPY of
 * statementBatchModel.statementDedupeKey ('stmt:<customer_id>:<period_start>').
 * The shared-model contract keeps this file import-free; changes there
 * must mirror here.
 */
export function statementDedupeKeyLocal(customer_id: any, period_start: any): string {
  const cid = clean(customer_id);
  const start = toDay(period_start);
  return `stmt:${cid}:${start}`;
}

// Dedupe key stamped on the statement-history RECORD — distinct namespace
// from the plan key so a Notification-row filter can't collide with the
// plan dedupe set.
export function statementHistoryDedupeKey(customer_id: any, period_start: any): string {
  const cid = clean(customer_id);
  const start = toDay(period_start);
  return `${STATEMENT_HISTORY_DEDUPE_PREFIX}:${cid}:${start}`;
}

// ---------------------------------------------------------------------------
// the invoice stamp
// ---------------------------------------------------------------------------

/**
 * statementInvoiceStamp — the per-invoice patch. Returns {} when the batch
 * or period bound is missing (an unkeyed stamp would orphan the audit
 * trail — callers skip empty patches).
 */
export function statementInvoiceStamp({ batch_id, period, now }: any = {}) {
  const batch = clean(batch_id);
  const start = periodStartOf(period);
  const end = periodEndOf(period);
  if (!batch || !start) return {};
  return {
    statement_batch_id: batch,
    statement_period_start: start,
    statement_period_end: end,
    statement_generated_at: toIso(now) || new Date().toISOString(),
  };
}

/**
 * invoiceStatementMark — how an invoice row already sits vs THIS batch:
 *   'unstamped'   — no statement_batch_id (or unreadable row) → patch.
 *   'current'     — stamped by this batch for this period (a matching
 *                   batch_id with a blank stored period_start counts —
 *                   rows written before the period fields existed still
 *                   belong to the batch their id names) → skip.
 *   'conflict'    — batch_id matches but a DIFFERENT stored period_start —
 *                   contradictory data; re-patch to repair.
 *   'other_batch' — stamped by another batch → re-patch (last-write-wins;
 *                   the older batch's history row keeps its own record).
 */
export function invoiceStatementMark(invoice: any, { batch_id, period_start }: any = {}): string {
  const batch = clean(batch_id);
  const start = toDay(period_start);
  const storedBatch = clean(invoice?.statement_batch_id);
  if (!storedBatch || !batch) return 'unstamped';
  if (storedBatch !== batch) return 'other_batch';
  const storedStart = toDay(invoice?.statement_period_start);
  if (!storedStart || storedStart === start) return 'current';
  return 'conflict';
}

// ---------------------------------------------------------------------------
// per-customer write spec
// ---------------------------------------------------------------------------

const rowCustomerId = (row: any): string =>
  clean(row?.customer_id) || clean(row?.context?.customer_id) || clean(row?.customer?.id);

const rowContext = (row: any): any => (isObj(row?.context) ? row.context : {});

const rowDedupeKey = (row: any, periodStart: string): string =>
  clean(row?.dedupe_key) || statementDedupeKeyLocal(rowCustomerId(row), periodStart);

/**
 * statementCustomerWrite — the write spec for ONE plan row / candidate.
 * Returns {skipped:false, …write spec…} or {skipped:true, skip_reason,
 * customer_id, dedupe_key}.
 *
 * invoice_patches entries:
 *   {invoice_id, invoice_number, patch, expected:{statement_batch_id}}
 *   `expected` is the stored stamp the CAS writer asserts before
 *   overwriting — '' means "expected unstamped" (a row that gained a
 *   foreign stamp mid-run fails the CAS instead of being silently
 *   re-tagged).
 */
export function statementCustomerWrite(row: any, { batch_id, period, now, invoicesById, customersById, existingKeys }: any = {}) {
  const ctx = rowContext(row);
  const p = isObj(period) ? period : ctx;
  const start = periodStartOf(p) || periodStartOf(ctx);
  const end = periodEndOf(p) || periodEndOf(ctx);
  const customer_id = rowCustomerId(row);
  const dedupe_key = rowDedupeKey(row, start);
  const base = { customer_id, dedupe_key };

  if (!customer_id) return { ...base, skipped: true, skip_reason: STATEMENT_SKIP_REASONS.no_customer_id };
  if (!start) return { ...base, skipped: true, skip_reason: STATEMENT_SKIP_REASONS.no_period };

  // Dedupe-set skip — the same skip statementBatchPlan applies to
  // generation; the write side re-checks so a caller can feed raw
  // candidates without pre-filtering.
  const keys = new Set<string>();
  if (existingKeys instanceof Set) {
    for (const k of existingKeys) keys.add(clean(k));
  } else if (Array.isArray(existingKeys)) {
    for (const k of existingKeys) keys.add(clean(k));
  } else if (isObj(existingKeys)) {
    for (const k of Object.keys(existingKeys)) if (existingKeys[k]) keys.add(clean(k));
  }
  if (keys.has(dedupe_key)) {
    return { ...base, skipped: true, skip_reason: STATEMENT_SKIP_REASONS.already_generated };
  }

  // Plan rows (statementBatchPlan output) drop the customer object — the
  // opt-out flag resolves from a passed customersById map when present;
  // candidate-shaped rows carry it inline.
  const custLookup = isObj(customersById) ? customersById : {};
  const customer = isObj(row?.customer) ? row.customer : isObj(custLookup[customer_id]) ? custLookup[customer_id] : {};
  const batch = clean(batch_id) || statementBatchId({ period_start: start });
  const stamp = statementInvoiceStamp({ batch_id: batch, period: { period_start: start, period_end: end }, now });
  const lookup = isObj(invoicesById) ? invoicesById : {};

  const invoice_patches: any[] = [];
  const already_stamped_invoice_ids: string[] = [];
  const unkeyed_invoice_numbers: string[] = [];
  const seenInvoices = new Set<string>();
  const items = Array.isArray(ctx.line_items) ? ctx.line_items : [];
  for (const item of items) {
    const invoice_id = clean(item?.invoice_id ?? item?.id);
    const invoice_number = clean(item?.invoice_number ?? item?.number);
    if (!invoice_id) {
      if (invoice_number) unkeyed_invoice_numbers.push(invoice_number);
      continue;
    }
    if (seenInvoices.has(invoice_id)) continue;
    seenInvoices.add(invoice_id);
    const stored = lookup[invoice_id] || {};
    const mark = invoiceStatementMark(stored, { batch_id: batch, period_start: start });
    if (mark === 'current') {
      already_stamped_invoice_ids.push(invoice_id);
      continue;
    }
    invoice_patches.push({
      invoice_id,
      invoice_number,
      mark,
      patch: { ...stamp },
      expected: { statement_batch_id: clean(stored.statement_batch_id) },
    });
  }

  // Full-stamp idempotency: every KEYED line-item invoice already carries
  // this batch+period — the rerun has nothing to write. Requires ≥1 keyed
  // invoice: a statement whose items are all unkeyed was never stamped and
  // must still produce a history row.
  if (seenInvoices.size > 0 && invoice_patches.length === 0 && already_stamped_invoice_ids.length === seenInvoices.size) {
    return {
      ...base,
      skipped: true,
      skip_reason: STATEMENT_SKIP_REASONS.already_stamped,
      already_stamped_invoice_ids,
      unkeyed_invoice_numbers,
      batch_id: batch,
    };
  }

  const missing_email = row?.missing_email === true || !clean(ctx.billing_email).includes('@');
  const send_opted_out = customer.send_monthly_statements === false;
  const generated_at = clean(stamp.statement_generated_at) || toIso(now) || new Date().toISOString();

  return {
    ...base,
    skipped: false,
    batch_id: batch,
    period_start: start,
    period_end: end,
    generated_at,
    missing_email,
    send_opted_out,
    invoice_patches,
    already_stamped_invoice_ids,
    unkeyed_invoice_numbers,
    // The dedupe-keyed statement history record — what the caller creates
    // to make this generation auditable + re-runnable. creation_request_key
    // is the idempotent-create handle (createFoundationRecordWithRecovery
    // convention).
    history: {
      kind: STATEMENT_RECORD_KIND,
      dedupe_key,
      creation_request_key: `${statementHistoryDedupeKey(customer_id, start)}`.slice(0, 256),
      customer_id,
      company_name: clean(ctx.company_name) || clean(customer.company_name) || clean(customer.name),
      billing_email: clean(ctx.billing_email),
      statement_batch_id: batch,
      statement_period_start: start,
      statement_period_end: end,
      period_label: clean(ctx.period_label),
      statement_generated_at: generated_at,
      statement_status: STATEMENT_STATUS_GENERATED,
      invoice_ids: invoice_patches.map((p: any) => p.invoice_id).concat(already_stamped_invoice_ids),
      open_invoice_count: items.length,
      closing_balance: Number(ctx.closing_balance) || 0,
      missing_email,
      send_opted_out,
    },
  };
}

/**
 * statementBatchWritePlan — write specs for a whole candidate/plan set.
 * Dedupes on dedupe_key inside the plan (a double-submitted candidate
 * list can't double-stamp). Returns {batch_id, generated_at, rows,
 * skipped} — rows carry statementCustomerWrite output; skipped rows carry
 * {customer_id, dedupe_key, skip_reason}.
 */
export function statementBatchWritePlan(rows: any, { batch_id, period, now, invoicesById, customersById, existingKeys }: any = {}) {
  const out_rows: any[] = [];
  const skipped: any[] = [];
  const seen = new Set<string>();
  let start = periodStartOf(period);
  let end = periodEndOf(period);

  for (const row of Array.isArray(rows) ? rows : []) {
    const spec = statementCustomerWrite(row, { batch_id, period, now, invoicesById, customersById, existingKeys });
    if (!spec.skipped && spec.dedupe_key && seen.has(spec.dedupe_key)) {
      skipped.push({
        customer_id: spec.customer_id,
        dedupe_key: spec.dedupe_key,
        skip_reason: STATEMENT_SKIP_REASONS.duplicate_in_plan,
      });
      continue;
    }
    if (spec.skipped) {
      skipped.push({
        customer_id: spec.customer_id,
        dedupe_key: spec.dedupe_key,
        skip_reason: spec.skip_reason,
      });
      continue;
    }
    seen.add(spec.dedupe_key);
    if (!start) {
      start = spec.period_start;
      end = spec.period_end;
    }
    out_rows.push(spec);
  }

  const batch = clean(batch_id) || statementBatchId({ period_start: start });
  return {
    batch_id: batch,
    period_start: start,
    period_end: end,
    generated_at: toIso(now) || new Date().toISOString(),
    rows: out_rows,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// markStatementSent — the generated → sent patch builder
// ---------------------------------------------------------------------------

/**
 * markStatementSent — the patch flipping a statement history record from
 * 'generated' to 'sent' after the delivery adapter confirms the channel.
 * Returns {dedupe_key, customer_id, batch_id, patch} — `patch` is the
 * $set shape for the history record (or any statement store row):
 *   {statement_status, statement_sent_at, statement_sent_to,
 *    statement_channel, statement_batch_id}
 * Empty channel/sent_to are tolerated (print lane has no recipient) but
 * sent_to falls back to the context billing email when omitted.
 */
export function markStatementSent({ row, customer_id, dedupe_key, batch_id, context, channel, sent_to, now }: any = {}) {
  const ctx = isObj(context) ? context : rowContext(row);
  const cid = clean(customer_id) || rowCustomerId(row) || clean(ctx.customer_id);
  const start = periodStartOf(ctx);
  const key = clean(dedupe_key) || clean(row?.dedupe_key) || statementDedupeKeyLocal(cid, start);
  const batch = clean(batch_id) || clean(row?.batch_id) || statementBatchId({ period_start: start });
  const sentAt = toIso(now) || new Date().toISOString();
  const to = clean(sent_to) || clean(ctx.billing_email);
  const ch = clean(channel) || 'email';
  return {
    dedupe_key: key,
    customer_id: cid,
    batch_id: batch,
    sent_to: to,
    channel: ch,
    sent_at: sentAt,
    patch: {
      statement_status: STATEMENT_STATUS_SENT,
      statement_sent_at: sentAt,
      statement_sent_to: to,
      statement_channel: ch,
      statement_batch_id: batch,
    },
  };
}

// ---------------------------------------------------------------------------
// statementBatchReceipt — the run-report object
// ---------------------------------------------------------------------------

/**
 * statementBatchReceipt — the summary the batch action persists/responds
 * with. `plan` is statementBatchWritePlan output (or {rows, skipped});
 * `results` is the delivery adapter's per-customer outcome list
 * ([{customer_id|dedupe_key, sent, channel, skipped, reason}]) — rows with
 * no result count as generated-not-sent.
 *
 * dedupe_keys = the keys to persist into the next run's existingKeys set:
 * every row this run actually WROTE (generated or sent), never a skipped
 * row — a skip for missing data must be retryable.
 */
export function statementBatchReceipt({ batch_id, plan, results, now }: any = {}) {
  const p = isObj(plan) ? plan : {};
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const planSkipped = Array.isArray(p.skipped) ? p.skipped : [];
  const res = Array.isArray(results) ? results : [];

  const resultByKey = new Map<string, any>();
  for (const r of res) {
    if (!isObj(r)) continue;
    const k = clean(r.dedupe_key) || clean(r.customer_id);
    if (k) resultByKey.set(k, r);
    const cid = clean(r.customer_id);
    if (cid && !resultByKey.has(cid)) resultByKey.set(cid, r);
  }

  let sent = 0;
  const resultSkipped: string[] = [];
  const missing_email_ids: string[] = [];
  const opted_out_ids: string[] = [];
  const dedupe_keys: string[] = [];
  const invoice_ids: string[] = [];
  const already_stamped_invoice_ids: string[] = [];
  let invoice_patch_count = 0;

  for (const row of rows) {
    const cid = clean(row.customer_id);
    const key = clean(row.dedupe_key);
    if (row.missing_email === true && cid) missing_email_ids.push(cid);
    if (row.send_opted_out === true && cid) opted_out_ids.push(cid);
    if (key) dedupe_keys.push(key);
    for (const ip of Array.isArray(row.invoice_patches) ? row.invoice_patches : []) {
      invoice_patch_count += 1;
      const iid = clean(ip.invoice_id);
      if (iid) invoice_ids.push(iid);
    }
    for (const iid of Array.isArray(row.already_stamped_invoice_ids) ? row.already_stamped_invoice_ids : []) {
      const s = clean(iid);
      if (s) already_stamped_invoice_ids.push(s);
    }
    const r = resultByKey.get(key) || (cid ? resultByKey.get(cid) : undefined);
    if (r) {
      if (r.sent === true) sent += 1;
      if (r.skipped === true && cid) resultSkipped.push(cid);
    }
  }

  const skipped_ids = planSkipped
    .map((s: any) => clean(s.customer_id))
    .filter(Boolean)
    .concat(resultSkipped);

  return {
    batch_id: clean(batch_id) || clean(p.batch_id),
    period_start: clean(p.period_start),
    period_end: clean(p.period_end),
    generated_at: clean(p.generated_at) || toIso(now) || new Date().toISOString(),
    count: rows.length,
    sent,
    skipped: skipped_ids.length,
    skipped_ids,
    missing_email_ids,
    opted_out_ids,
    dedupe_keys,
    invoice_patch_count,
    invoice_ids,
    already_stamped_invoice_ids,
  };
}
