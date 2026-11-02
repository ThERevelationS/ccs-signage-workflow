// Pure helpers for the Customer 360 credit-terms / credit-limit engine — no
// React, no IO. This file is esbuild-bundled and unit-tested under plain Node
// by scripts/test-credit-terms.mjs.
//
// Data contract (base44/entities/Customer.jsonc):
//   Customer.credit_terms_days       — net terms in days (30 = "Net 30").
//                                      0 / absent / negative = "due on
//                                      receipt" — there is no terms basis.
//   Customer.credit_limit            — cap on open account charges.
//                                      0 / absent = no configured limit; the
//                                      check never warns and never blocks.
//   Customer.in_store_credit_balance — current in-store credit balance owed
//                                      TO the customer (preferred when set).
//   Customer.in_store_credit         — parallel unapplied-credit field; used
//                                      when in_store_credit_balance is unset.
// Invoice rows key the account by customer_id. Open-balance convention
// mirrors customer360Model.computeTotals: deleted===true rows are dead,
// statuses "void"/"paid" never count, and the server-stamped balance_due is
// authoritative.
//
// CoreBridge parity: the limit check is WARN-ONLY — it reports severity for
// the UI and never blocks a sale.

import { clean, num, money, usd } from "./customer360Model";

const liveRows = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((r) => r && r.deleted !== true);

// --- invoiceDueDate -----------------------------------------------------------

// Parses an invoice date into a UTC-midnight epoch so day arithmetic is
// DST-proof. 'YYYY-MM-DD' strings are taken literally (rollover dates like
// 2026-02-31 are rejected); full ISO datetimes and Date objects contribute
// their UTC calendar date. Returns NaN for anything unparseable.
const toUtcDay = (v) => {
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return NaN;
    return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  const s = clean(v);
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const epoch = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(epoch);
    return d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() === +m[2] - 1 &&
      d.getUTCDate() === +m[3]
      ? epoch
      : NaN;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return NaN;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// invoiceDueDate({ customer, invoiceDate }) →
//   { due_date: null, basis: 'receipt' }            — terms days ≤ 0 / absent
//   { due_date: 'YYYY-MM-DD', basis: 'terms', days } — terms basis; due_date is
//     null when the invoice date itself cannot be parsed.
// `invoiceDate` accepts 'YYYY-MM-DD', an ISO datetime, or a Date.
export function invoiceDueDate({ customer, invoiceDate } = {}) {
  const days = num(customer?.credit_terms_days);
  if (days <= 0) return { due_date: null, basis: "receipt" };
  const base = toUtcDay(invoiceDate);
  return {
    due_date: Number.isFinite(base)
      ? new Date(base + days * 86400000).toISOString().slice(0, 10)
      : null,
    basis: "terms",
    days,
  };
}

// --- creditUsage --------------------------------------------------------------

// creditUsage({ customer, invoices, portalPending }) →
//   { openInvoiceBalance, portalPending, totalUsage }
// Open invoices: live rows matching customer.id whose status is NOT
// void/paid and whose balance_due is > 0. `portalPending` covers authorized /
// in-flight portal charges that are not invoiced yet — pass a number, or a
// list of pending rows ({ amount }) which is summed the same way.
export function creditUsage({ customer, invoices, portalPending } = {}) {
  const cid = clean(customer?.id);
  const openInvoiceBalance = money(
    liveRows(invoices)
      .filter((i) => cid && clean(i?.customer_id) === cid)
      .filter((i) => !["void", "paid"].includes(clean(i?.status).toLowerCase()))
      .map((i) => num(i?.balance_due))
      .filter((b) => b > 0)
      .reduce((s, b) => s + b, 0),
  );
  const pendingRaw = Array.isArray(portalPending)
    ? liveRows(portalPending).reduce((s, p) => s + num(p?.amount), 0)
    : num(portalPending);
  const pending = money(Math.max(0, pendingRaw));
  return {
    openInvoiceBalance,
    portalPending: pending,
    totalUsage: money(openInvoiceBalance + pending),
  };
}

// --- creditLimitCheck ---------------------------------------------------------

// creditLimitCheck({ customer, usage, newAmount }) →
//   { over, current, limit, projected, severity: 'ok'|'warn'|'exceeded' }
// `usage` accepts the creditUsage result or a bare number. Severity ladder:
//   'exceeded' — projected (current + newAmount) is over the limit.
//   'warn'     — the account is ALREADY at/over its limit before the new
//                amount (current ≥ limit) but projected is not over it.
//   'ok'       — otherwise. Landing projected exactly ON the limit is 'ok'
//                (exceeded is strictly >); a 0/blank limit is "not configured"
//                and is always 'ok'.
// `over` mirrors the exceeded condition (projected > limit). Warn-only — the
// caller decides whether to proceed; nothing here blocks.
export function creditLimitCheck({ customer, usage, newAmount } = {}) {
  const limit = Math.max(0, num(customer?.credit_limit));
  const current = money(
    usage && typeof usage === "object" ? num(usage.totalUsage) : num(usage),
  );
  const projected = money(current + num(newAmount));
  if (limit <= 0) return { over: false, current, limit, projected, severity: "ok" };
  const over = projected > limit;
  const severity = over ? "exceeded" : current >= limit ? "warn" : "ok";
  return { over, current, limit, projected, severity };
}

// --- creditLimitBanner --------------------------------------------------------

// creditLimitBanner(result) → { show, tone: 'amber'|'red', text } — display
// contract for a banner component. 'exceeded' → red, 'warn' → amber,
// 'ok'/garbage → hidden (tone defaults to 'amber', text empty). A bare
// { over: true } without a severity is surfaced as exceeded.
export function creditLimitBanner(result) {
  const r = result && typeof result === "object" ? result : {};
  const severity = clean(r.severity) || (r.over === true ? "exceeded" : "ok");
  if (severity === "exceeded") {
    return {
      show: true,
      tone: "red",
      text: `Credit limit exceeded — balance ${usd(r.projected)} against a ${usd(r.limit)} limit (warning only, sale may still proceed).`,
    };
  }
  if (severity === "warn") {
    return {
      show: true,
      tone: "amber",
      text: `Customer is at their credit limit — ${usd(r.current)} open against a ${usd(r.limit)} limit.`,
    };
  }
  return { show: false, tone: "amber", text: "" };
}

// --- applyInStoreCredit --------------------------------------------------------

// First value that is present AND numeric wins; null/blank falls through.
const pickNum = (v) =>
  v != null && Number.isFinite(Number(v)) ? num(v) : null;

// applyInStoreCredit({ customer, amount, creditBalance }) →
//   { applied, remainingCredit, remainingAmount }
// Applies min(amount, available credit) — CoreBridge "apply in-store credit"
// at checkout. Credit resolution order: explicit `creditBalance` arg →
// customer.in_store_credit_balance → customer.in_store_credit → 0. Amounts
// and balances clamp at 0; everything is cent-rounded.
export function applyInStoreCredit({ customer, amount, creditBalance } = {}) {
  const available = Math.max(
    0,
    pickNum(creditBalance) ??
      pickNum(customer?.in_store_credit_balance) ??
      pickNum(customer?.in_store_credit) ??
      0,
  );
  const requested = Math.max(0, num(amount));
  const applied = money(Math.min(available, requested));
  return {
    applied,
    remainingCredit: money(available - applied),
    remainingAmount: money(requested - applied),
  };
}
