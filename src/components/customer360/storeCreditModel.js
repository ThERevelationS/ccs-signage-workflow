// Pure helpers for the Customer in-store credit ledger (masterplan G-09) —
// no React, no IO. This file is esbuild-bundled and unit-tested under plain
// Node by scripts/test-store-credit.mjs.
//
// WHAT IT DOES: issues credit (credit memo → balance owed TO the customer),
// applies credit at payment time (reduces Invoice.balance_due + the ledger),
// voids entries by reversal (the ledger is append-only — rows are never
// edited or deleted), and reconciles the cached Customer balance field
// against the ledger sum.
//
// STORAGE: this model is persistence-agnostic — callers own where ledger
// rows live (a StoreCreditEntry-style entity or a Customer array field is
// an orchestrator decision). Every function takes `ledgerRows` in and/or
// returns a `ledger_row` object for the caller to append and persist.
//
// UNIT CONTRACT — integer-cent math (same cent-safe rule as
// completedVsPaidModel):
//   * Everything the MODEL returns or accepts as an amount is INTEGER
//     CENTS: `amount` args, creditBalance(), apply_amount,
//     new_invoice_balance, new_credit_balance, balance_after, computed,
//     stored.
//   * ENTITY fields are read in DOLLARS (matching invoicingAction /
//     creditTermsModel / CoreBridge parity) and converted once via
//     toCents: customer.in_store_credit_balance, customer.in_store_credit,
//     invoice.balance_due, invoice.amount_paid, invoice.credit_applied.
//   * ENTITY PATCHES are written back in DOLLARS via fromCents, so a
//     patched customer/invoice stays readable by every existing reader:
//     customer_patch { in_store_credit_balance }, invoice_patch
//     { amount_paid, balance_due, credit_applied }.
//
// LEDGER ROW SHAPE (amounts are signed integer cents — sign carries the
// direction, so the balance is a literal sum, same convention as
// Payment.jsonc "negative for credit-memo and refund rows"):
//   credit_issued   — amount > 0; new credit owed to the customer
//                     {kind, amount, reason, actor, created_at,
//                      balance_after, customer_id?}
//   credit_applied  — amount < 0; credit consumed against an invoice
//                     {kind, amount, reason?, actor, created_at,
//                      balance_after, customer_id?, invoice_id?}
//   credit_expired  — amount < 0; credit lapsed (reserved; rows with this
//                     kind are summed but never created by this model)
//   credit_voided   — reversal row; amount = -1 × the reversed row's amount,
//                     ref = id of the row it reverses
//                     {kind, amount, ref, reversed_kind, reason, actor,
//                      created_at, balance_after}
// Rows also may carry `id`/`row_id` (caller-assigned at persist time —
// voidCredit targets rows by it), `deleted`, or `creation_request_key`.
// Rows with `deleted === true` are dead and never counted.
//
// BALANCE SEMANTICS:
//   * Customer.in_store_credit_balance (dollars) is the cached authority
//     when present (finite, incl. 0); the legacy parallel
//     Customer.in_store_credit is the second choice (same precedence as
//     creditTermsModel.applyInStoreCredit). Only when NEITHER field is
//     present does the balance fall back to summing the ledger.
//   * Ledger-path and stored-path balances are reported RAW — a negative
//     value means the customer net-owes the store (possible after voiding
//     an issuance whose credit was partly consumed). Spending paths clamp
//     at zero so negative credit can never be "applied".
//   * reconcileCredit() compares the stored field (converted to cents)
//     against the raw ledger sum — the drift check callers run after any
//     write or sweep.
//
// VOID RULES (append-only): the original row is never touched; voidCredit
// appends a signed reversal. A row may be voided only once — a live
// credit_voided row with ref === target makes it 'already_voided'.
// Reversal rows themselves cannot be voided ('cannot_void_reversal');
// undoing a mistaken void is a NEW corrective entry (issue/apply again),
// keeping "voided" a flat check. Voiding a credit_applied row restores
// the customer's balance but does NOT reopen the invoice — the caller
// owns the invoice fix-up (the reversal row's ref identifies the
// application to reverse).
//
// NO-OP CONTRACT: an operation with nothing to do returns
// { ledger_row: null, ...patch objects empty } — never a zero-amount
// ledger row.

import { clean, num } from "./customer360Model";

const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};
const fromCents = (c) => Math.round(num(c)) / 100;
const asCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

// Normalizes a `now` argument (ISO string, Date, or epoch ms) to an ISO
// timestamp; falls back to wall-clock now.
const isoNow = (v) => {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  const s = clean(v);
  if (s) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    return s; // preserve unparseable-but-present stamps verbatim
  }
  return new Date().toISOString();
};

export const CREDIT_LEDGER_KINDS = Object.freeze([
  "credit_issued",
  "credit_applied",
  "credit_expired",
  "credit_voided",
]);
const LEDGER_KINDS = new Set(CREDIT_LEDGER_KINDS);

const liveLedgerRows = (rows) =>
  (Array.isArray(rows) ? rows : []).filter(
    (r) => r && r.deleted !== true && LEDGER_KINDS.has(clean(r.kind)),
  );

const rowKey = (r) => clean(r?.id ?? r?.row_id);

// ledgerSumCents(ledgerRows) → raw signed-cent balance across live rows of
// the four ledger kinds. Signed `amount` does all the work: issued adds,
// applied/expired subtract, a void row contributes the negation of the row
// it reversed. Unknown kinds and deleted rows are ignored.
export function ledgerSumCents(ledgerRows) {
  return liveLedgerRows(ledgerRows).reduce((s, r) => s + asCents(r.amount), 0);
}

// Stored balance in cents, or null when neither customer field is present.
// A present-but-zero field is authoritative (returns 0, not null).
const storedCreditCents = (customer) => {
  for (const v of [customer?.in_store_credit_balance, customer?.in_store_credit]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  return null;
};

// creditBalance(customer, ledgerRows) → integer cents. Stored field wins
// when present (authoritative cache); otherwise the ledger sum. Raw —
// negatives surface as negatives.
export function creditBalance(customer, ledgerRows) {
  const stored = storedCreditCents(customer);
  return stored != null ? stored : ledgerSumCents(ledgerRows);
}

// issueCredit({ customer, amount, reason, actor, now, ledgerRows? }) →
//   { ledger_row, customer_patch }
// `amount` is integer cents (Math.round-coerced; ≤ 0 is a no-op).
// `ledgerRows` is optional — pass the live list when the customer row may
// not carry a stored balance yet so balance_after stays truthful.
export function issueCredit({ customer, amount, reason, actor, now, ledgerRows } = {}) {
  const amountCents = asCents(amount);
  if (amountCents <= 0) return { ledger_row: null, customer_patch: {} };
  const before = creditBalance(customer, ledgerRows);
  const after = before + amountCents;
  const cid = clean(customer?.id);
  return {
    ledger_row: {
      kind: "credit_issued",
      amount: amountCents,
      reason: clean(reason),
      actor: clean(actor),
      created_at: isoNow(now),
      balance_after: after,
      ...(cid ? { customer_id: cid } : {}),
    },
    customer_patch: { in_store_credit_balance: fromCents(after) },
  };
}

// applyCreditPlan({ customer, invoice, ledgerRows, now, actor? }) →
//   { apply_amount, new_invoice_balance, new_credit_balance, ledger_row }
// The all-cents PREVIEW of an application — apply_credit decides nothing is
// written. Applies min(credit balance, invoice.balance_due); zero when
// either side is ≤ 0 (ledger_row is null then — nothing to append).
export function applyCreditPlan({ customer, invoice, ledgerRows, now, actor } = {}) {
  const balance = creditBalance(customer, ledgerRows);
  const dueCents = toCents(invoice?.balance_due);
  const apply = Math.max(0, Math.min(balance, dueCents));
  const plan = {
    apply_amount: apply,
    new_invoice_balance: dueCents - apply,
    new_credit_balance: balance - apply,
    ledger_row: null,
  };
  if (apply <= 0) return plan;
  const cid = clean(customer?.id || invoice?.customer_id);
  const invId = clean(invoice?.id);
  plan.ledger_row = {
    kind: "credit_applied",
    amount: -apply,
    reason: "",
    actor: clean(actor),
    created_at: isoNow(now),
    balance_after: plan.new_credit_balance,
    ...(cid ? { customer_id: cid } : {}),
    ...(invId ? { invoice_id: invId } : {}),
  };
  return plan;
}

// applyCredit({ customer, invoice, ledgerRows, actor, now }) →
//   { ledger_row, customer_patch, invoice_patch }
// The write path: the plan's ledger row plus entity-native (dollar) patches.
// invoice_patch = { amount_paid += apply, balance_due -= apply,
// credit_applied += apply } — `credit_applied` tracks cumulative credit
// consumed on the invoice (parallel to Invoice.deposit_applied).
export function applyCredit({ customer, invoice, ledgerRows, actor, now } = {}) {
  const plan = applyCreditPlan({ customer, invoice, ledgerRows, now, actor });
  if (!plan.ledger_row) {
    return { ledger_row: null, customer_patch: {}, invoice_patch: {} };
  }
  const applyDollars = fromCents(plan.apply_amount);
  return {
    ledger_row: plan.ledger_row,
    customer_patch: { in_store_credit_balance: fromCents(plan.new_credit_balance) },
    invoice_patch: {
      amount_paid: fromCents(toCents(invoice?.amount_paid) + plan.apply_amount),
      balance_due: fromCents(plan.new_invoice_balance),
      credit_applied: fromCents(toCents(invoice?.credit_applied) + plan.apply_amount),
    },
    // Echoed so dollar-side callers don't reconvert; cents callers use
    // ledger_row.amount / plan fields.
    apply_amount: plan.apply_amount,
    apply_amount_dollars: applyDollars,
  };
}

// voidCredit({ ledgerRows, row_id, actor, reason, now }) →
//   { ledger_row, balance_after, customer_patch, reversed_row_id?, error? }
// Appends a signed reversal (never mutates the target). `error` is absent
// on success; on failure ledger_row is null and error is one of
// 'not_found' | 'cannot_void_reversal' | 'already_voided'.
export function voidCredit({ ledgerRows, row_id, actor, reason, now } = {}) {
  const rows = liveLedgerRows(ledgerRows);
  const key = clean(row_id);
  const base = rows.reduce((s, r) => s + asCents(r.amount), 0);
  const fail = (error) => ({
    ledger_row: null,
    balance_after: base,
    customer_patch: {},
    error,
  });
  const target = rows.find((r) => rowKey(r) === key && key !== "");
  if (!target) return fail("not_found");
  if (clean(target.kind) === "credit_voided") return fail("cannot_void_reversal");
  const already = rows.some(
    (r) => clean(r.kind) === "credit_voided" && clean(r.ref ?? r.voided_row_id) === rowKey(target),
  );
  if (already) return fail("already_voided");
  const after = base - asCents(target.amount);
  const cid = clean(target.customer_id);
  return {
    ledger_row: {
      kind: "credit_voided",
      amount: -asCents(target.amount),
      ref: rowKey(target),
      reversed_kind: clean(target.kind),
      reason: clean(reason),
      actor: clean(actor),
      created_at: isoNow(now),
      balance_after: after,
      ...(cid ? { customer_id: cid } : {}),
    },
    balance_after: after,
    customer_patch: { in_store_credit_balance: fromCents(after) },
    reversed_row_id: rowKey(target),
  };
}

// reconcileCredit(customer, ledgerRows) → { matches, computed, stored }
// `computed` is the raw ledger sum in cents; `stored` is the customer's
// cached field in cents (null when neither field is present). matches:
// stored === computed, or — with no stored field at all — true only when
// the ledger is also empty (an absent cache reconciles to an empty ledger).
export function reconcileCredit(customer, ledgerRows) {
  const computed = ledgerSumCents(ledgerRows);
  const stored = storedCreditCents(customer);
  return {
    matches: stored == null ? computed === 0 : stored === computed,
    computed,
    stored,
  };
}
