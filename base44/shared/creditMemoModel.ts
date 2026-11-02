// Credit memo issuance flow — MASTERPLAN I-12.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// paymentReminderModel / templateRender / lumpSyncModel.
//
// WHAT IT DOES: when invoicingAction `issue_credit_memo` posts a negative
// "recorded" Payment row (method credit_memo), this model produces
//   1. the StoreCreditLedger `credit_issued` row (G-09 in-store credit —
//      the customer now has money on account),
//   2. the template payload for the seeded H-02 'credit_memo'
//      NotificationTemplate,
//   3. the apply plan showing how stored credit is consumed at the next
//      payment (`credit_applied` row + entity patches).
//
// ─── THE CENTS/DOLLARS DIVERGENCE — ENTITY SCHEMA IS CANONICAL ──────────
// Flagged by w-131 (N-05) and w-135 (I-10):
//   src/components/customer360/storeCreditModel.js emits ledger rows with
//   `amount` + `balance_after` in INTEGER CENTS and the timestamp field
//   `created_at` — a PRE-PERSIST shape for an app-side ledger that was
//   never stored (persistence was explicitly "an orchestrator decision").
//   base44/entities/StoreCreditLedger.jsonc — the real, backend-only store
//   that landed under A-35 — declares:
//     amount        → signed DOLLARS (REQUIRED; "display mirror")
//     amount_cents  → signed integer CENTS (the canonical value)
//     balance_after → running customer balance in DOLLARS
//     occurred_at   → date-time effective timestamp
//   Canonical readers prove the convention (customerAnalyticsModel
//   .ledgerAmountCents, customerReports): `amount_cents` wins when finite;
//   a bare `amount` is read as DOLLARS. Persisting a raw storeCreditModel
//   row therefore inflates it 100x — `amount: 2500` (meant as cents) is
//   read as $2,500.00.
// RESOLUTION: this model emits ENTITY-NATIVE rows directly — `amount` is
// dollars and mirrors `amount_cents/100`, `occurred_at` carries the
// timestamp, and every emitted key is a declared StoreCreditLedger
// property. entityLedgerRowFromModelRow() is the one-way bridge for
// callers holding storeCreditModel-shaped rows; it auto-detects the
// convention via `amount_cents` presence so an already-entity row never
// double-converts.
//
// LEDGER ROW SHAPE EMITTED (all fields are declared entity properties):
//   schema_version        1
//   creation_request_key  retry-safe receipt — defaults to the credit memo
//                         Payment's own creation_request_key (dedupe is
//                         per-entity, so reusing it cannot collide and a
//                         retried issue_credit_memo converges to one row)
//   customer_id           required — payment → invoice → customer chain
//   kind                  'credit_issued' | 'credit_applied'
//   amount                signed DOLLARS — positive issued, negative applied
//   amount_cents          signed integer cents — the canonical value
//   reason                free-text (memo reason / apply note)
//   actor                 staff email/id (or system)
//   invoice_id            link — issuance: the credited invoice; apply: the
//                         invoice the credit paid down
//   balance_after         customer credit balance in DOLLARS after posting
//   occurred_at           ISO timestamp (injectable `now` — never reads the
//                         clock when `now` is supplied)
// `ref`/`reversed_kind` stay absent — they are declared for credit_voided
// reversals only (voidCredit in storeCreditModel owns that flow).
//
// NO-OP CONTRACT: an operation with nothing to do returns
// { ledger_row: null, ...empty patches } — never a zero-amount row, same
// convention as storeCreditModel.
//
// API:
//   CREDIT_LEDGER_KINDS            — the 4 entity enum kinds
//   CREDIT_MEMO_TEMPLATE_KEY/KIND  — 'credit_memo' (H-02 seed key+kind)
//   CREDIT_MEMO_PLACEHOLDERS       — the seeded template's documented
//                                    placeholder paths (dot-path, no
//                                    formatter suffixes)
//   STORE_CREDIT_BALANCE_FIELD     — 'in_store_credit_balance'
//   ledgerRowAmountCents(row)      — canonical-cents read of ANY row
//                                    (amount_cents wins; bare amount =
//                                    dollars — analytics parity)
//   liveLedgerRows(rows)           — entity rows: known kind + !deleted
//   ledgerBalanceCents(rows)       — signed sum over live entity rows
//   creditBalanceCents(customer, ledgerRows)
//                                  — stored dollar field wins
//                                    (in_store_credit_balance →
//                                    in_store_credit), else ledger sum;
//                                    raw (negatives surface)
//   entityLedgerRowFromModelRow(row, {convention?})
//                                  — storeCreditModel-shape → entity
//                                    shape; auto-detects via amount_cents
//   creditMemoLedgerRow({payment, invoice, customer, prior_balance_cents,
//                        ledgerRows, reason, actor, now,
//                        creation_request_key})
//     → { ledger_row, customer_patch, amount_cents, balance_cents,
//         skipped? }
//   creditMemoNotificationDraft({invoice, customer, payment, amount,
//                                amount_cents, reason, to, contact,
//                                company, location, actor})
//     → { template_key, kind, to, cc, dedupe_key, context, missing }
//   creditApplyPlan({ledger_rows, invoice_balance_cents, invoice,
//                    invoice_id, customer_id, actor, now, reason,
//                    creation_request_key})
//     → { balance_cents, available_cents, invoice_balance_cents,
//         apply_cents, new_invoice_balance_cents,
//         new_credit_balance_cents, allocations, ledger_row,
//         customer_patch, invoice_patch }
//     allocations = FIFO consumption of credit pools oldest-first
//     (occurred_at order); credit_voided rows drain their `ref` target
//     first, then oldest-first for any remainder.

export const CREDIT_LEDGER_KINDS = [
  'credit_issued',
  'credit_applied',
  'credit_expired',
  'credit_voided',
] as const;

export const CREDIT_MEMO_TEMPLATE_KEY = 'credit_memo';
export const CREDIT_MEMO_TEMPLATE_KIND = 'credit_memo';

// Documented placeholder vocabulary of the seeded 'credit_memo'
// NotificationTemplate (seedNotificationTemplates placeholder_map), as
// resolvable dot-paths — the `|money`/`|default` formatter suffixes are
// render-time concerns, not context keys.
export const CREDIT_MEMO_PLACEHOLDERS = [
  'contact.name',
  'customer.company_name',
  'credit_memo.number',
  'credit_memo.amount',
  'credit_memo.reason',
  'location.name',
  'location.phone',
  'company.name',
] as const;

// The Customer field carrying the denormalized credit-balance cache
// (G-09). in_store_credit is the legacy parallel second choice, same
// precedence as creditTermsModel.applyInStoreCredit/storeCreditModel.
export const STORE_CREDIT_BALANCE_FIELD = 'in_store_credit_balance';
export const STORE_CREDIT_LEGACY_FIELD = 'in_store_credit';

export const LEDGER_SCHEMA_VERSION = 1;

const LEDGER_KIND_SET = new Set<string>(CREDIT_LEDGER_KINDS);

const clean = (v: any): string => String(v ?? '').trim();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Dollars → integer cents, round-half-away at the penny — the exact
// convention of storeCreditModel.toCents (the +1e-9 nudge keeps 1.005 →
// 101 instead of IEEE754's 100).
const toCents = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};
// Integer cents → dollars (2dp mirror).
const fromCents = (c: any): number => Math.round(num(c)) / 100;
// Coerce any numeric-ish to integer cents (input ALREADY in cents).
const asCents = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

// Normalizes a `now` argument (ISO string, Date, or epoch ms) to an ISO
// timestamp; falls back to wall-clock now — storeCreditModel.isoNow parity.
const isoNow = (v: any): string => {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString();
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  const s = clean(v);
  if (s) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    return s; // preserve unparseable-but-present stamps verbatim
  }
  return new Date().toISOString();
};

// Date-only 'YYYY-MM-DD' → ISO start-of-day UTC, for occurred_at values
// sourced from Payment.paid_date (a date, not a datetime).
const isoFromDateish = (v: any): string => {
  const s = clean(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

// ---------------------------------------------------------------------------
// canonical-cents ledger reads — customerAnalyticsModel.ledgerAmountCents
// parity: amount_cents wins when finite; a bare `amount` is read as
// DOLLARS (the entity convention — pre-persist model rows are a caller
// detail, not the canonical store).
// ---------------------------------------------------------------------------

export function ledgerRowAmountCents(row: any): number {
  if (!isObj(row)) return 0;
  if (row.amount_cents != null && Number.isFinite(Number(row.amount_cents))) {
    return Math.round(Number(row.amount_cents));
  }
  return toCents(row.amount);
}

// Live entity rows: one of the four enum kinds, not tombstoned.
// (storeCreditModel.liveLedgerRows parity — same filter.)
export function liveLedgerRows(rows: any): any[] {
  return (Array.isArray(rows) ? rows : []).filter(
    (r: any) => isObj(r) && r.deleted !== true && LEDGER_KIND_SET.has(clean(r.kind)),
  );
}

// Signed cent balance across live ENTITY rows — issued adds, applied/
// expired subtract, a void row contributes its signed reversal.
export function ledgerBalanceCents(rows: any): number {
  return liveLedgerRows(rows).reduce((s: number, r: any) => s + ledgerRowAmountCents(r), 0);
}

// Customer credit balance in integer cents. The stored dollar field is
// the authoritative cache when present (finite, including 0); the legacy
// parallel field is second choice; only when neither is present does the
// balance fall back to summing the ledger — storeCreditModel.creditBalance
// parity, reading ENTITY rows.
export function creditBalanceCents(customer: any, ledgerRows?: any): number {
  for (const v of [customer?.[STORE_CREDIT_BALANCE_FIELD], customer?.[STORE_CREDIT_LEGACY_FIELD]]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  return ledgerBalanceCents(ledgerRows);
}

// ---------------------------------------------------------------------------
// entityLedgerRowFromModelRow — one-way bridge from the storeCreditModel
// PRE-PERSIST shape (amount/balance_after integer CENTS, created_at) to
// the entity shape (amount/balance_after DOLLARS, amount_cents canonical,
// occurred_at). Convention detection: a finite amount_cents marks the row
// entity-shaped already (normalize + mirror-check only); otherwise the
// row is treated as cents — which is exactly the w-131/w-135 defect path
// this bridge exists to close. Pass {convention:'model'|'entity'} to
// force when a caller knows better.
// ---------------------------------------------------------------------------

export function entityLedgerRowFromModelRow(row: any, opts: any = {}): any {
  if (!isObj(row)) return null;
  const convention = clean(opts?.convention);
  const isEntity =
    convention === 'entity' ||
    (convention !== 'model' &&
      row.amount_cents != null && Number.isFinite(Number(row.amount_cents)));
  if (isEntity) {
    // Already entity-shaped: canonicalize the pair — amount_cents is
    // canonical, so the dollar mirror is REGENERATED from it (a stale or
    // divergent mirror can never survive this bridge).
    const cents = Math.round(Number(row.amount_cents));
    const out: any = { ...row };
    out.amount_cents = cents;
    out.amount = fromCents(cents);
    if (row.balance_after != null && Number.isFinite(Number(row.balance_after))) {
      out.balance_after = num(row.balance_after); // dollars — leave as-is
    }
    const occ = isoFromDateish(row.occurred_at) || isoFromDateish(row.created_at);
    if (occ) out.occurred_at = occ;
    delete out.created_at; // consumed into occurred_at — model-convention field
    if (!('schema_version' in out)) out.schema_version = LEDGER_SCHEMA_VERSION;
    return out;
  }
  // Model convention: amount + balance_after are integer CENTS.
  const cents = asCents(row.amount);
  const out: any = { ...row };
  out.amount_cents = cents;
  out.amount = fromCents(cents);
  if (row.balance_after != null && Number.isFinite(Number(row.balance_after))) {
    out.balance_after = fromCents(row.balance_after);
  }
  const occ = isoFromDateish(row.occurred_at) || isoFromDateish(row.created_at) || isoNow(row.created_at);
  out.occurred_at = occ || isoNow(undefined);
  // `created_at` was the model's timestamp field — it has been consumed
  // into occurred_at, and leaving it would persist a second, non-declared
  // timestamp convention on the row. id/row_id pass through as caller
  // identifiers (ref-targeting), never as declared fields.
  delete out.created_at;
  if (!('schema_version' in out)) out.schema_version = LEDGER_SCHEMA_VERSION;
  return out;
}

// ---------------------------------------------------------------------------
// creditMemoLedgerRow — the StoreCreditLedger credit_issued row for one
// credit memo Payment (issue_credit_memo's negative "recorded" row).
//
//   payment              the created Payment row {amount: -dollars,
//                        method:'credit_memo', creation_request_key,
//                        invoice_id, customer_id, reference_number, notes}
//   invoice              the credited Invoice (optional — links/fallbacks)
//   customer             the Customer row (optional — id/balance fallbacks)
//   prior_balance_cents  integer cents of credit BEFORE this memo; when
//                        non-finite/absent, derived from
//                        creditBalanceCents(customer, ledgerRows)
//   ledgerRows           existing live rows for the fallback balance
//   reason               memo reason (else mined from payment.notes)
//   actor                staff email/id (else payment.created_by)
//   now                  injectable timestamp (else payment.paid_date →
//                        created_date → wall clock)
//   creation_request_key retry receipt (else payment's own key, else a
//                        deterministic fallback)
//
// → { ledger_row, customer_patch, amount_cents, balance_cents, skipped? }
//   ledger_row is the EXACT entity row to persist; customer_patch carries
//   the denormalized cache in dollars.
// ---------------------------------------------------------------------------

export function creditMemoLedgerRow(input: any = {}) {
  const payment = isObj(input?.payment) ? input.payment : null;
  const invoice = isObj(input?.invoice) ? input.invoice : null;
  const customer = isObj(input?.customer) ? input.customer : null;

  const priorCents = Number.isFinite(Number(input?.prior_balance_cents))
    ? Math.round(Number(input.prior_balance_cents))
    : creditBalanceCents(customer, input?.ledgerRows);

  const empty = (skipped: string) => ({
    ledger_row: null,
    customer_patch: {},
    amount_cents: 0,
    balance_cents: priorCents,
    skipped,
  });

  if (!payment) return empty('no_payment');
  // The credit memo Payment row is negative-signed by convention (money
  // returning to the customer / reopening the invoice). The ledger's
  // credit_issued row is positive — credit OWED to the customer — so the
  // magnitude is what matters; a non-negative or non-credit_memo input is
  // still normalized via abs() and the caller's skipped flag stays clean.
  const amountCents = Math.abs(toCents(payment.amount));
  if (amountCents <= 0) return empty('zero_amount');

  const customerId =
    clean(customer?.id) || clean(payment.customer_id) || clean(invoice?.customer_id);
  if (!customerId) return empty('no_customer');

  const invoiceId = clean(invoice?.id) || clean(payment.invoice_id);
  // payment.notes carries "Credit memo: <reason>" or the bare boilerplate
  // "Credit memo" — strip either form so a reason-less memo stays empty.
  const reason =
    clean(input?.reason) ||
    clean(payment.notes).replace(/^credit memo:?\s*/i, '') ||
    '';
  const actor = clean(input?.actor) || clean(payment.created_by);
  const occurred =
    isoFromDateish(input?.now) ||
    isoFromDateish(payment.paid_date) ||
    isoFromDateish(payment.created_date) ||
    isoNow(input?.now);
  const requestKey =
    clean(input?.creation_request_key) ||
    clean(payment.creation_request_key) ||
    `credit-ledger:${clean(payment.id) || invoiceId || 'credit'}:${amountCents}`;

  const balanceCents = priorCents + amountCents;
  const ledger_row: any = {
    schema_version: LEDGER_SCHEMA_VERSION,
    creation_request_key: requestKey.slice(0, 256),
    customer_id: customerId,
    kind: 'credit_issued',
    amount: fromCents(amountCents),       // DOLLARS — the display mirror
    amount_cents: amountCents,            // integer cents — CANONICAL
    balance_after: fromCents(balanceCents), // DOLLARS
    occurred_at: occurred,
  };
  if (reason) ledger_row.reason = reason;
  if (actor) ledger_row.actor = actor;
  if (invoiceId) ledger_row.invoice_id = invoiceId;

  return {
    ledger_row,
    customer_patch: { [STORE_CREDIT_BALANCE_FIELD]: fromCents(balanceCents) },
    amount_cents: amountCents,
    balance_cents: balanceCents,
  };
}

// ---------------------------------------------------------------------------
// creditMemoNotificationDraft — payload for the seeded 'credit_memo'
// NotificationTemplate (H-02, seed key+kind 'credit_memo'). The dispatcher
// looks the template row up by template_key, renders subject+body against
// `context` via shared/templateRender, and sends to `to` (+ `cc` when the
// template's cc_billing toggle is on — resolved here from
// billing_contact_email). `dedupe_key` is stable per credit memo so a
// retried issuance never double-notifies. `missing` lists the template's
// documented placeholder paths that resolved EMPTY in this context — a
// send-gate signal for the caller (render itself never throws).
//
//   amount / amount_cents — the credit size; `amount` is DOLLARS
//     (issue_credit_memo's `credited_amount`), amount_cents wins when both
//     are supplied. credit_memo.amount in the context is DOLLARS — the
//     template's `|money` formatter expects dollars.
//   credit_memo.number resolves: explicit number → payment.reference_number
//     → 'CM-<invoice_number>' → 'CM-<payment.id>'.
// ---------------------------------------------------------------------------

const resolveCtxPath = (ctx: any, path: string): any => {
  let cur = ctx;
  for (const seg of String(path).split('.')) {
    if (cur === null || cur === undefined || typeof cur === 'function') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur;
};

export function creditMemoNotificationDraft(input: any = {}) {
  const invoice = isObj(input?.invoice) ? input.invoice : null;
  const customer = isObj(input?.customer) ? input.customer : null;
  const payment = isObj(input?.payment) ? input.payment : null;
  const contact = isObj(input?.contact) ? input.contact : null;
  const company = isObj(input?.company) ? input.company : null;
  const location = isObj(input?.location) ? input.location : null;

  const amountCents = Number.isFinite(Number(input?.amount_cents))
    ? Math.abs(Math.round(Number(input.amount_cents)))
    : Math.abs(toCents(input?.amount ?? payment?.amount));

  // Recipient chain — invoicingAction email_statement parity:
  // explicit `to` → customer.email → contact_email → billing_email →
  // billing_contact_email. `cc` is the cc_billing target.
  const to =
    clean(input?.to) ||
    clean(contact?.email) ||
    clean(customer?.email) ||
    clean(customer?.contact_email) ||
    clean(customer?.billing_email) ||
    clean(customer?.billing_contact_email);
  const billingCc = clean(customer?.billing_contact_email);
  const cc = billingCc && billingCc !== to ? billingCc : '';

  const contactName =
    clean(contact?.name) ||
    [clean(customer?.contact_first_name), clean(customer?.contact_last_name)]
      .filter(Boolean).join(' ') ||
    clean(customer?.billing_contact_name);
  const companyName =
    clean(company?.name) || clean(input?.company_name) || 'CCS Signage';

  const memoNumber =
    clean(input?.number) ||
    clean(payment?.reference_number) ||
    (clean(invoice?.invoice_number) ? `CM-${clean(invoice?.invoice_number)}` : '') ||
    (clean(payment?.id) ? `CM-${clean(payment?.id)}` : '');

  const context: any = {
    contact: {
      name: contactName,
      email: to,
    },
    customer: {
      id: clean(customer?.id) || clean(invoice?.customer_id) || clean(payment?.customer_id),
      company_name: clean(customer?.company_name) || clean(customer?.name) ||
        clean(invoice?.customer_display_name),
    },
    credit_memo: {
      number: memoNumber,
      amount: fromCents(amountCents),       // DOLLARS for |money
      amount_cents: amountCents,
      reason: clean(input?.reason) ||
        clean(payment?.notes).replace(/^credit memo:?\s*/i, ''),
      invoice_id: clean(invoice?.id) || clean(payment?.invoice_id),
      date: isoFromDateish(input?.now) || isoFromDateish(payment?.paid_date) || '',
    },
    invoice: {
      id: clean(invoice?.id) || clean(payment?.invoice_id),
      number: clean(invoice?.invoice_number),
      balance_due: num(invoice?.balance_due),
    },
    company: { name: companyName },
    location: {
      name: clean(location?.name) || clean(input?.location_name) || companyName,
      phone: clean(location?.phone) || clean(input?.location_phone) ||
        clean(customer?.company_phone),
    },
    user: {
      display_name: clean(input?.actor) || clean(payment?.created_by),
    },
  };

  const missing = CREDIT_MEMO_PLACEHOLDERS.filter((p) => {
    const v = resolveCtxPath(context, p);
    return v === undefined || v === null || clean(v) === '';
  });

  return {
    template_key: CREDIT_MEMO_TEMPLATE_KEY,
    kind: CREDIT_MEMO_TEMPLATE_KIND,
    to,
    cc,
    dedupe_key:
      clean(input?.dedupe_key) ||
      `credit-memo-notify:${clean(payment?.creation_request_key) || clean(payment?.id) || memoNumber || 'memo'}`,
    context,
    missing,
  };
}

// ---------------------------------------------------------------------------
// creditApplyPlan — how stored credit is consumed at the NEXT payment.
// The plan is pure preview math (nothing written): which credit pools fund
// the application (FIFO, oldest credit first — expiry-friendly ordering),
// the cap at the invoice balance, and the exact entity rows/patches a
// writer persists.
//
//   ledger_rows            the customer's StoreCreditLedger ENTITY rows
//   invoice_balance_cents  invoice.balance_due in integer cents
//   invoice                optional — enables invoice_patch
//                          {amount_paid += apply, balance_due, credit_applied
//                          += apply} in DOLLARS (storeCreditModel parity)
//   invoice_id             link for the credit_applied row (else invoice.id)
//   customer_id            link (else the customer_id carried by the rows —
//                          rows are customer-scoped)
//   actor / now / reason / creation_request_key — row metadata
//
// FIFO allocation: live rows walk in occurred_at order (created_at →
// created_date fallbacks, then input order); positive rows enqueue credit
// pools, negative rows drain them — a credit_voided row drains its `ref`
// target first (reversing THAT row specifically), then oldest-first. The
// remaining pools fund `apply_cents` oldest-first.
// ---------------------------------------------------------------------------

const rowInstant = (r: any): number => {
  for (const v of [r?.occurred_at, r?.created_at, r?.created_date]) {
    const t = Date.parse(clean(v));
    if (Number.isFinite(t)) return t;
  }
  return NaN;
};

export function creditApplyPlan(input: any = {}) {
  const rows = liveLedgerRows(input?.ledger_rows);
  const balanceCents = rows.reduce((s: number, r: any) => s + ledgerRowAmountCents(r), 0);
  const availableCents = Math.max(0, balanceCents);
  const dueCents = Math.max(0, asCents(input?.invoice_balance_cents));
  const applyCents = Math.max(0, Math.min(availableCents, dueCents));
  const invoice = isObj(input?.invoice) ? input.invoice : null;
  const invoiceId = clean(input?.invoice_id) || clean(invoice?.id);
  const customerId =
    clean(input?.customer_id) ||
    clean(rows.find((r: any) => clean(r?.customer_id))?.customer_id) ||
    clean(invoice?.customer_id);

  // FIFO pools — chronological order; stable for equal/missing timestamps.
  const ordered = rows
    .map((r: any, i: number) => ({ r, i, t: rowInstant(r) }))
    .sort((a: any, b: any) =>
      (Number.isFinite(a.t) ? a.t : Infinity) - (Number.isFinite(b.t) ? b.t : Infinity) ||
      a.i - b.i);
  const pools: any[] = []; // {row_id, remaining} oldest-first
  const poolById = new Map<string, any>();
  for (const { r } of ordered) {
    const amt = ledgerRowAmountCents(r);
    if (!amt) continue;
    if (amt > 0) {
      const pool = {
        row_id: clean(r?.id) || clean(r?.row_id) || clean(r?.creation_request_key),
        occurred_at: clean(r?.occurred_at) || clean(r?.created_at) || '',
        remaining: amt,
      };
      pools.push(pool);
      if (pool.row_id) poolById.set(pool.row_id, pool);
      continue;
    }
    // Negative rows drain credit: ref-targeted first (a void reverses the
    // specific row it names), then oldest-first for any remainder.
    let drain = -amt;
    const refKey = clean(r?.ref ?? r?.voided_row_id);
    if (refKey && poolById.has(refKey)) {
      const target = poolById.get(refKey);
      const take = Math.min(target.remaining, drain);
      target.remaining -= take;
      drain -= take;
    }
    for (const p of pools) {
      if (drain <= 0) break;
      const take = Math.min(p.remaining, drain);
      p.remaining -= take;
      drain -= take;
    }
  }

  // Allocate the application oldest-first across surviving pools.
  const allocations: any[] = [];
  let left = applyCents;
  for (const p of pools) {
    if (left <= 0) break;
    const take = Math.min(p.remaining, left);
    if (take > 0) {
      allocations.push({ row_id: p.row_id, occurred_at: p.occurred_at, applied_cents: take });
      left -= take;
    }
  }

  const newInvoiceCents = dueCents - applyCents;
  const newCreditCents = balanceCents - applyCents;

  const plan: any = {
    balance_cents: balanceCents,
    available_cents: availableCents,
    invoice_balance_cents: dueCents,
    apply_cents: applyCents,
    new_invoice_balance_cents: newInvoiceCents,
    new_credit_balance_cents: newCreditCents,
    allocations,
    ledger_row: null,
    customer_patch: {},
    invoice_patch: {},
  };
  if (applyCents <= 0) return plan;

  const requestKey =
    clean(input?.creation_request_key) ||
    `credit-apply:${invoiceId || 'invoice'}:${customerId || 'customer'}:${applyCents}`;
  const ledger_row: any = {
    schema_version: LEDGER_SCHEMA_VERSION,
    creation_request_key: requestKey.slice(0, 256),
    kind: 'credit_applied',
    amount: -fromCents(applyCents),       // DOLLARS — negative on apply
    amount_cents: -applyCents,            // canonical cents
    balance_after: fromCents(newCreditCents),
    occurred_at: isoNow(input?.now),
  };
  if (customerId) ledger_row.customer_id = customerId;
  if (invoiceId) ledger_row.invoice_id = invoiceId;
  const reason = clean(input?.reason);
  if (reason) ledger_row.reason = reason;
  const actor = clean(input?.actor);
  if (actor) ledger_row.actor = actor;
  plan.ledger_row = ledger_row;

  if (customerId) {
    plan.customer_patch = { [STORE_CREDIT_BALANCE_FIELD]: fromCents(newCreditCents) };
  }
  if (invoice) {
    plan.invoice_patch = {
      amount_paid: fromCents(toCents(invoice.amount_paid) + applyCents),
      balance_due: fromCents(newInvoiceCents),
      credit_applied: fromCents(toCents(invoice.credit_applied) + applyCents),
    };
  }
  return plan;
}
