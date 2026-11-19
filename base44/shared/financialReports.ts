// Financial report pack — ESTIMATOR_MASTERPLAN WS-J / item J-08 (w-109).
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Five report specs for the J-01 report catalog engine
// (src/components/reports/reportEngine.js — w-49):
//
//   sales_tax_liability  — CoreBridge "Sales Tax Liability" (I-13): tax
//                          collected per tax group / remit agency for the
//                          period, with taxable base, exempt sales/count.
//   sales_commission     — commission per salesperson OR per income account:
//                          commissionable sales total × rate% → commission $.
//                          `order_basis` param replicates the CoreBridge
//                          completed/closed/vended filters.
//   business_summary     — income by GL income account + COGS + gross profit
//                          + margin (Invoice.income_account_splits[] + cost
//                          fields; I-02 storage shape).
//   invoice_summary      — per-status rollup of invoices in the period:
//                          count / subtotal / tax / total / paid / balance.
//   built_summary        — products that reached a built state in the period
//                          with quoted value + cost rollups.
//
// FINANCIAL_REPORTS holds RAW spec objects in defineReport() shape
// ({id,name,category,params,columns,run,summarize}) — this module cannot
// import defineReport (zero-import rule), so the catalog wiring passes each
// spec through defineReport() itself. run(resolvedParams, data) reads only
// injected collections: data.invoices / data.work_orders / data.tax_groups
// (or taxGroupsById) / data.agencies (or taxAgenciesById /
// jurisdictionsById) / data.accounts (or income_accounts / accountsByCode)
// / data.builder_products — the engine owns data injection.
//
// ── I-13 tax liability: ADAPTER + REPLICA ──────────────────────────────────
// The canonical math lives in base44/shared/taxLiabilityModel.ts (I-13 —
// posted statuses, taxable-base chain, exempt markers, tax-group bucketing,
// agency resolution). The zero-import rule means this module CANNOT import
// it, so the report consumes it through `data` when the wiring layer has it
// loaded (the thin adapter — export shapes allow it):
//   1. data.taxLiabilityRows      — FUNCTION form: called as
//      taxLiabilityRows(invoices, {from,to,taxGroupsById,jurisdictionsById})
//      → verbatim I-13 rows (single source of truth, preferred).
//   2. data.tax_liability_rows    — ROWS form: precomputed taxLiabilityRows
//      output (already period-filtered by the caller) used verbatim.
//   3. Replica — salesTaxLiabilityRows() below ports the same semantics
//      field-for-field (posted-status set, invoiceDate chain, taxable/tax
//      cents, exempt detection, id→name→rate→ungrouped bucketing, group→
//      invoice→derived rate ladder, sort order). scripts/test-financial-
//      reports.mjs deep-equals the replica against the real model on the
//      I-13 fixture so the two can never drift silently.
//
// ── Commission basis (CoreBridge completed/closed/vended filters) ──────────
// Commission is computed on BILLED sales (posted invoices in the period —
// the invoice is the commissionable event). `order_basis` selects WHICH
// orders count, by the linked WorkOrder's state (Invoice.work_order_id):
//   invoiced  — every posted invoice (default; no order-state requirement).
//   completed — the linked work order is complete (completed flag or
//               current_stage 'completed'); an invoice with NO linked work
//               order counts — a direct/counter sale is finished by
//               definition.
//   closed    — the sale is financially closed: invoice fully settled
//               (status 'paid', or a positive billed total with zero
//               remaining balance) OR the linked order is complete AND
//               carries a close_date.
//   vended    — the product was delivered: every tracked product on the
//               linked order is in a delivered/vended state (operational_
//               status vended|built|completed — legacy + locked sets — or
//               fulfillment_state picked_up|installed|shipped|delivered);
//               an order with no products counts when the order is
//               completed; an unlinked invoice counts when it is settled.
// Each basis is self-contained (not cumulative) — pick the milestone the
// shop pays commission on.
//
// Commission math: commissionable sales = the invoice INCOME base (pre-tax
// revenue: subtotal − discount_amount + Σ signed fee_lines.amount — I-02
// incomeBaseCents parity; tax is a liability, never commissionable).
// `rate` is a single scalar PERCENT param (5 → 5%) applied to every bucket
// — per-rep rate maps are a wiring concern (pass per-rep runs), documented
// here so nobody expects a map param. group_by 'salesperson' credits the
// whole income base to Invoice.salesperson ('(unassigned)' when blank);
// 'income_account' splits it via income_account_splits[] — a missing/empty
// split array lands the whole base under '(unmapped)'.
//
// ── Business summary ───────────────────────────────────────────────────────
// Income per GL account comes from income_account_splits[] (stored dollars,
// I-02 storage shape; duplicates merge); invoices without splits post their
// income base under '(unmapped)'. COGS per invoice resolves:
//   1. explicit invoice field — cogs_amount | cogs | cost_of_goods |
//      job_cost | total_cost (verbatim)
//   2. Σ line-item costs — cogs_amount | cost | extended_cost |
//      line_cost | unit_cost|cost_per_unit × quantity
//   3. linked WorkOrder — Σ materials[].extended_cost; materials empty →
//      actual_cost. WO cost is attributed to the FIRST invoice (input order)
//      that references each work_order_id — a multi-invoice job (deposit/
//      progress/final) cannot double-count its job cost.
// The invoice COGS total is allocated across its income accounts pro-rata
// by split amount with LARGEST-REMAINDER apportionment (Σ allocated ≡
// invoice COGS exactly — glSplitModel scheme). Gross profit = income −
// cogs; margin = profit ÷ income (null when income ≤ 0). A COGS-only
// invoice (no income) still reports under '(unmapped)'.
//
// ── Invoice summary ────────────────────────────────────────────────────────
// Status buckets are the five canonical statuses (draft, sent,
// partially_paid, paid, void) in schema order — import aliases normalize
// ('partial'→partially_paid, 'issued'→sent); unknown/blank statuses append
// after canonical order. Canonical buckets always emit (zero rows keep the
// print shape stable); `void_policy` applies the engine void-ish rule
// (status 'void' OR void/voided/is_void/deleted flags OR voided_date).
// date_basis param maps the engine options onto invoice fields:
//   created → the billing day (invoice_date → issue_date → date →
//             created_date — the I-13 invoiceDate chain)
//   completed → paid_date
//   built → sent_date (the day the invoice went out — the invoice-side
//             analog of "built"; falls back to the billing day when no
//             sent stamp exists so the row is still attributable)
// paid = w-63 invoicePaidCents chain (amount_paid → paid_amount/total_paid
// → live payments[] sum → total − balance snapshot); balance = w-63
// invoiceBalanceCents (balance_due/balance/amount_due authoritative else
// total − paid floored at 0).
//
// ── Built summary ──────────────────────────────────────────────────────────
// A WorkOrder product is "built" when it reached a produced-or-later state:
// operational_status built|completed|vended (locked set + legacy value —
// productStatusModel treats them as the terminal wrappers) OR
// fulfillment_state in FULFILLED (picked_up|installed|shipped|delivered —
// productQueueModel/opsReportModel convention). Its built DAY resolves:
//   1. explicit stamp — built_date | built_at | date_built (import rows)
//   2. newest status_history entry that moved operational_status/status to
//      a built-ish value or fulfillment_state to a fulfilled one
//      ({at,field,to} — opsReportModel.productCompletedAt rule)
//   3. operational_status_changed_at when the CURRENT status is built-ish
//   4. order completed → the order's completed_date then updated_date
//      (the documented opsReportModel proxy)
//   '' → the row is undated: kept when the range is unbounded, dropped
//   whenever a bound exists (can't attribute it to the period).
// Value = quoted_total (authoritative at conversion) else quoted_unit_price
// × quantity (opsReportModel.productValue parity). Cost per product:
//   explicit product stamp — frozen_cost | cost | unit_cost|cost_per_unit
//   × quantity | extended_cost → Σ materials[] rows linked by
//   builder_product_id (product.id first, then product.builder_product_id)
//   or estimate_line_id → BuilderProduct.frozen_cost via
//   data.builder_products → 0 (products carry no cost field on the schema —
//   opsReportModel header note).
// group_by 'product' emits one row per built product (detail); 'day' /
// 'product_type' / 'salesperson' roll up with value+cost+margin columns
// (dynamic columns — the run() {rows,columns} override).
//
// Money: the MODEL layer is integer cents end-to-end (toCents → int sums —
// no float dust, statementBatch/arAging convention). run() converts cents →
// dollars once at the report boundary because engine format 'money' expects
// dollars. Report rows keep *_cents extras for drilldowns (the engine
// preserves extra row keys).
//
// API:
//   salesTaxLiabilityRows / liabilityAgencyRows / liabilityTotals
//   commissionRows / businessSummaryRows / invoiceSummaryRows
//   builtProductRows / builtSummaryRows / invoiceCogsCents
//   POSTED_INVOICE_STATUSES / UNASSIGNED_AGENCY / UNGROUPED_KEY /
//     UNMAPPED_ACCOUNT / COMMISSION_BASIS_OPTIONS / BUILT_GROUP_OPTIONS /
//     BUILTISH_STATUSES / FULFILLED_STATES
//   FINANCIAL_REPORTS / FINANCIAL_REPORTS_BY_ID — 5 engine-ready specs

// === shared helpers =========================================================

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const pad2 = (n: number): string => String(n).padStart(2, '0');
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

// Loose numeric parse: accepts numbers and plain/decorated numeric strings
// ('1,234.56', '$5.00', '-2.5', '7.8%') but rejects letter-laden strings
// like 'INV-001' (taxLiabilityModel.looseNum — a naive strip reads those -1).
const MONEYISH = /^\s*\$?\s*-?[\d,]*\.?\d+\s*%?\s*$/;
const looseNum = (v: any): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = clean(v);
  if (!s || !MONEYISH.test(s)) return NaN;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const firstFinite = (...vals: any[]): number => {
  for (const v of vals) {
    const n = looseNum(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
};

const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Dollar-ish field → integer cents via looseNum (decorated strings parse,
// letter-laden strings don't). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = looseNum(v);
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};
const fromCents = (c: any): number => Math.round(num(c)) / 100;

// Normalize any date-ish value to 'YYYY-MM-DD'. Leading-date prefix wins so
// ISO timestamps never shift days across timezones; Date instances and
// epoch millis contribute their UTC calendar date (toDay convention shared
// by taxLiabilityModel / statementBatch / arAgingReports).
const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

// LOCAL calendar day of a Date — engine-resolved date_range bounds are
// local startOfDay/endOfDay Dates; their intended day is the local one.
const localDay = (d: any): string => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Resolved date_range param → {from,to} 'YYYY-MM-DD' bounds. Engine-
// resolved values arrive {preset, from:Date, to:Date}; raw 'YYYY-MM-DD'
// strings / {from:'YYYY-MM-DD'} shapes tolerated for direct run() callers.
// A bare preset string reaching run() unresolved is unbounded — resolution
// is the engine's job (customerReports.rangeBounds convention).
const rangeBounds = (p: any): { from: string; to: string } => {
  if (isObj(p)) {
    const from = localDay(p.from) || toDay(p.from);
    const to = localDay(p.to) || toDay(p.to);
    return { from, to };
  }
  const d = toDay(p);
  return d ? { from: d, to: d } : { from: '', to: '' };
};

// Day ∈ [from,to]: unbounded keeps everything (undated rows included); any
// bound drops undated rows — an undated row can't be attributed.
const dayInRange = (day: string, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

// Map | {id:row} | row[] → Map keyed by clean id (arAging normalizeMap
// convention, generalized to customerReports.indexById).
const indexById = (input: any): Map<string, any> => {
  if (input instanceof Map) {
    const out = new Map<string, any>();
    for (const [k, v] of input) if (clean(k)) out.set(clean(k), v);
    return out;
  }
  const out = new Map<string, any>();
  if (Array.isArray(input)) {
    for (const r of input) if (isObj(r) && clean(r.id)) out.set(clean(r.id), r);
  } else if (isObj(input)) {
    for (const [k, v] of Object.entries(input)) if (clean(k)) out.set(clean(k), v);
  }
  return out;
};

// Largest-remainder apportionment: distribute `totalCents` across `weights`
// preserving Σ exactly (glSplitModel scheme — floors + leftover pennies to
// the largest remainders, ties → earliest index). weights[i] ≤ 0 never
// participates. Returns number[] aligned to weights.
const apportion = (totalCents: number, weights: number[]): number[] => {
  const out = weights.map(() => 0);
  const total = Math.round(num(totalCents));
  if (!total) return out;
  const pool = weights.reduce((s, w) => s + Math.max(0, num(w)), 0);
  if (pool <= 0) {
    // No weight to spread by — dump on the first slot so the sum still ties.
    out[0] = total;
    return out;
  }
  const exacts = weights.map((w, i) => {
    const share = Math.max(0, num(w)) / pool;
    const exact = share * total;
    return { i, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = total - exacts.reduce((s, e) => s + e.floor, 0);
  for (const e of [...exacts].sort((a, b) => (b.remainder - a.remainder) || (a.i - b.i))) {
    if (leftover <= 0) break;
    e.floor += 1;
    leftover -= 1;
  }
  for (const e of exacts) out[e.i] = e.floor;
  return out;
};

// === invoice primitives =====================================================

// Invoice statuses that carry billed money (schema enum is
// draft|sent|partially_paid|paid|void). Same set as taxLiabilityModel /
// accountingExportModel (+ 'partial'/'issued' import aliases).
export const POSTED_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid'] as const;
const POSTED = new Set<string>([...POSTED_INVOICE_STATUSES, 'partial', 'issued']);

const isPostedInvoice = (inv: any): boolean => POSTED.has(norm(inv?.status));

// Void-ish per the engine isVoidRow alias set (+ status ladder used across
// the AR models: refunded/cancelled rows carry no live money either).
const VOIDISH_STATUSES = new Set(['void', 'refunded', 'cancelled', 'canceled']);
const isVoidishInvoice = (inv: any): boolean => {
  if (!isObj(inv)) return true;
  if (VOIDISH_STATUSES.has(norm(inv.status))) return true;
  if (inv.void === true || inv.voided === true || inv.is_void === true || inv.deleted === true) return true;
  return Boolean(clean(inv.voided_date));
};

// The invoice's billing day — I-13 invoiceDate chain verbatim:
// invoice_date → issue_date → date → created_date.
const invoiceDate = (inv: any): string =>
  toDay(firstText(inv?.invoice_date, inv?.issue_date, inv?.date, inv?.created_date));

// w-63 invoicePaidCents chain: amount_paid → paid_amount/total_paid →
// live payments[] sum (void entries skipped) → total − balance snapshot.
const invoicePaidCents = (inv: any): number => {
  for (const v of [inv?.amount_paid, inv?.paid_amount, inv?.total_paid]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  if (Array.isArray(inv?.payments) && inv.payments.length) {
    return inv.payments
      .filter((p: any) => p && !VOIDISH_STATUSES.has(norm(p.status)))
      .reduce((s: number, p: any) => s + toCents(p.amount ?? p.value ?? p.total ?? p.paid_amount), 0);
  }
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance)) && inv?.total != null) {
    return Math.max(0, toCents(inv.total) - toCents(balance));
  }
  return 0;
};

// w-63 invoiceBalanceCents: balance_due (or balance/amount_due alias)
// authoritative; else total − paid floored at 0.
const invoiceBalanceCents = (inv: any): number => {
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance))) return toCents(balance);
  return Math.max(0, toCents(inv?.total) - invoicePaidCents(inv));
};

// The invoice's billed total: stored total → grand_total alias → computed
// (subtotal − discount + tax) fallback so imported rows still foot.
const invoiceTotalCents = (inv: any): number => {
  const explicit = firstFinite(inv?.total, inv?.grand_total);
  if (Number.isFinite(explicit)) return toCents(explicit);
  return Math.max(
    0,
    toCents(inv?.subtotal) - Math.max(0, toCents(inv?.discount_amount)) +
      toCents(firstFinite(inv?.tax_amount, inv?.tax, inv?.tax_total)),
  );
};

// The invoice's pre-tax income base, integer cents:
// subtotal − discount_amount + Σ signed fee_lines.amount (I-02
// incomeBaseCents parity — 'discount' fee kind posts negative even when
// stored positive). This is the commissionable/revenue figure — never
// `total` (tax is a liability, not income).
const incomeBaseCents = (inv: any): number => {
  let cents = toCents(inv?.subtotal) - Math.max(0, toCents(inv?.discount_amount));
  if (Array.isArray(inv?.fee_lines)) {
    for (const fee of inv.fee_lines) {
      if (!isObj(fee)) continue;
      const amount = num(fee.amount, 0);
      const signed = norm(fee.kind) === 'discount' && amount > 0 ? -amount : amount;
      cents += Math.sign(signed) * Math.round(Math.abs(signed) * 100 + 1e-9);
    }
  }
  return cents;
};

// Income account bucket for "no resolvable account" postings (the
// glSplitModel '' unmapped bucket, named for display).
export const UNMAPPED_ACCOUNT = '(unmapped)';

// Stored income_account_splits[] → merged [{account_code, amount_cents}]
// (storage amount is signed DOLLARS — I-02 shape; duplicate account rows
// merge, first-seen order kept). Falls back to a single income-base bucket
// under '' (unmapped) so every posted invoice's revenue lands somewhere.
const incomeSplitsOf = (inv: any): Array<{ account_code: string; amount_cents: number }> => {
  const stored = Array.isArray(inv?.income_account_splits) ? inv.income_account_splits : null;
  if (stored && stored.length) {
    const merged = new Map<string, number>();
    const order: string[] = [];
    for (const raw of stored) {
      if (!isObj(raw)) continue;
      const account = firstText(
        raw.income_account_code, raw.account_code, raw.account_id,
        raw.income_account_id, raw.income_account, raw.gl_account_code, raw.gl_account, raw.code,
      );
      let cents: number;
      if (Number.isFinite(Number(raw.amount_cents))) cents = Math.round(Number(raw.amount_cents));
      else {
        const n = looseNum(raw.amount);
        if (!Number.isFinite(n)) continue;
        cents = Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9);
      }
      if (cents === 0) continue;
      if (merged.has(account)) merged.set(account, (merged.get(account) || 0) + cents);
      else { merged.set(account, cents); order.push(account); }
    }
    const out = order
      .map((k) => ({ account_code: k, amount_cents: merged.get(k) || 0 }))
      .filter((s) => s.amount_cents !== 0);
    if (out.length) return out;
  }
  const base = incomeBaseCents(inv);
  return base !== 0 ? [{ account_code: '', amount_cents: base }] : [];
};

// The salesperson credited on a financial row — Invoice.salesperson is
// canonical (carried from Opportunity/AllInOneEstimate); rep/sales_rep/
// representative spellings tolerated on imports.
const salespersonOf = (inv: any): string =>
  firstText(inv?.salesperson, inv?.sales_rep, inv?.rep, inv?.representative);

// === I-13 replica: sales tax liability ======================================
// Verbatim port of base44/shared/taxLiabilityModel.ts semantics — see the
// file header for the injection adapter that makes the real model the
// single source of truth when the wiring layer has it loaded. Keep this
// block field-for-field with taxLiabilityRows (the test deep-equals them).

export const UNASSIGNED_AGENCY = '(unassigned)';
export const UNGROUPED_KEY = 'ungrouped';

// Stored tax charged, integer cents (tax_amount|tax|tax_total).
const invoiceTaxCents = (inv: any): number =>
  toCents(firstFinite(inv?.tax_amount, inv?.tax, inv?.tax_total));

// The invoice's stored rate normalized to PERCENT (≤1 decimal → ×100).
const invoiceRatePercent = (inv: any): number | null => {
  const raw = firstFinite(inv?.tax_rate, inv?.tax_percent, inv?.rate);
  if (!Number.isFinite(raw) || raw < 0) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return round4(pct);
};

// Exemption evidence aliases (invoice-level stamps incl. source_summary).
const exemptReasonOf = (inv: any): string => firstText(
  inv?.exemption_reason, inv?.tax_exempt_reason, inv?.exempt_reason,
  inv?.tax_exemption?.reason,
  inv?.source_summary?.exemption_reason, inv?.source_summary?.tax_exempt_reason,
  inv?.source_summary?.exempt_reason,
);
const exemptCertificateOf = (inv: any): string => firstText(
  inv?.exemption_certificate_id, inv?.exemption_certificate, inv?.tax_exempt_certificate,
  inv?.tax_exempt_id, inv?.tax_exemption?.certificate_id, inv?.tax_exemption?.id,
  inv?.certificate_id,
  inv?.source_summary?.exemption_certificate_id, inv?.source_summary?.tax_exempt_id,
  inv?.source_summary?.certificate_id,
);

// isExemptInvoice — explicit marker required: boolean flag (incl.
// source_summary), a tax_exemption object with status 'active', or evidence
// (reason/certificate). Zero-tax alone is merely UNTAXED, never exempt.
const isExemptInvoice = (inv: any): boolean => {
  if (!isObj(inv)) return false;
  const src = isObj(inv.source_summary) ? inv.source_summary : {};
  if (inv.tax_exempt === true || inv.exempt === true || inv.is_tax_exempt === true) return true;
  if (src.tax_exempt === true || src.exempt === true || src.is_tax_exempt === true) return true;
  const reg = isObj(inv.tax_exemption) ? inv.tax_exemption : {};
  if (clean(reg.status).toLowerCase() === 'active') return true;
  return Boolean(exemptReasonOf(inv) || exemptCertificateOf(inv));
};

// invoiceTaxableCents — the base tax was levied on (I-13 chain verbatim):
//   1. explicit taxable_base | tax_base                    (verbatim)
//   2. taxable_subtotal | taxable_amount − discount        (floored 0)
//   3. Σ taxable line_items (qty × unit_price) − discount
//   4. derived tax_amount ÷ tax_rate (both > 0)
//   5. 0 — untaxed/exempt/indeterminate; a flagged-exempt invoice with zero
//      tax short-circuits to 0 (the sale reports via exempt_sales_cents).
const invoiceTaxableCents = (inv: any): number => {
  if (!isObj(inv)) return 0;
  const tax = invoiceTaxCents(inv);
  if (tax === 0 && isExemptInvoice(inv)) return 0;
  const discount = Math.max(0, toCents(inv?.discount_amount));
  const explicit = firstFinite(inv?.taxable_base, inv?.tax_base);
  if (Number.isFinite(explicit)) return Math.max(0, toCents(explicit));
  const preDiscount = firstFinite(inv?.taxable_subtotal, inv?.taxable_amount);
  if (Number.isFinite(preDiscount)) return Math.max(0, toCents(preDiscount) - discount);
  const items = Array.isArray(inv?.line_items) ? inv.line_items : null;
  if (items && items.length) {
    let cents = 0;
    for (const li of items) {
      if (!isObj(li) || li.taxable !== true) continue;
      const line = firstFinite(li?.line_total, num(li?.quantity) * num(li?.unit_price));
      cents += toCents(Number.isFinite(line) ? line : 0);
    }
    return Math.max(0, cents - discount);
  }
  const rate = invoiceRatePercent(inv);
  if (tax !== 0 && rate && rate > 0) return Math.max(0, Math.round(tax / (rate / 100)));
  return 0;
};

// exemptSaleCents — non-taxed sale value of an exempt invoice:
// (subtotal − discount) → (Σ line_items − discount) → (total − tax).
const exemptSaleCents = (inv: any): number => {
  if (!isExemptInvoice(inv)) return 0;
  const discount = Math.max(0, toCents(inv?.discount_amount));
  const sub = firstFinite(inv?.subtotal);
  if (Number.isFinite(sub)) return Math.max(0, toCents(sub) - discount);
  const items = Array.isArray(inv?.line_items) ? inv.line_items : null;
  if (items && items.length) {
    let cents = 0;
    for (const li of items) {
      if (!isObj(li)) continue;
      const line = firstFinite(li?.line_total, num(li?.quantity) * num(li?.unit_price));
      cents += toCents(Number.isFinite(line) ? line : 0);
    }
    return Math.max(0, cents - discount);
  }
  const total = firstFinite(inv?.total, inv?.grand_total);
  if (Number.isFinite(total)) return Math.max(0, toCents(total) - invoiceTaxCents(inv));
  return 0;
};

// Display percent for a bucket — '7.8%' (the model's formatRate, needed for
// the 'Ungrouped (x%)' bucket label).
const formatRate = (v: any): string => {
  const n = firstFinite(v);
  const pct = Number.isFinite(n) ? round4(n) : null;
  return pct == null ? '—' : `${pct}%`;
};

// {id:row} map OR bare row array → {byId, list}; rows contribute their own
// .id too (indexLookup parity).
const indexLookup = (input: any): { byId: Map<string, any>; list: any[] } => {
  const byId = new Map<string, any>();
  const list: any[] = [];
  const add = (key: any, row: any) => {
    if (!isObj(row)) return;
    list.push(row);
    const k = clean(key);
    if (k && !byId.has(k)) byId.set(k, row);
    const rid = clean(row.id);
    if (rid && !byId.has(rid)) byId.set(rid, row);
  };
  if (Array.isArray(input)) for (const r of input) add(r?.id, r);
  else if (isObj(input)) for (const [k, v] of Object.entries(input)) add(k, v);
  return { byId, list };
};

const groupNameOf = (g: any): string => firstText(g?.group_name, g?.name, g?.label, g?.title);

// TaxGroup.tax_percent is already a PERCENT; decimal-rate rows tolerated.
const groupPercentOf = (g: any): number | null => {
  const direct = firstFinite(g?.tax_percent, g?.percent);
  if (Number.isFinite(direct) && direct >= 0) return round4(direct);
  const raw = firstFinite(g?.tax_rate, g?.rate);
  if (Number.isFinite(raw) && raw >= 0) return round4(raw <= 1 ? raw * 100 : raw);
  return null;
};

const agencyLabelOf = (row: any, agencyId: string): string | null => {
  if (!isObj(row)) return clean(agencyId) || null;
  let label = firstText(row.name, row.agency_name, row.jurisdiction, row.label, row.title);
  const st = clean(row.state);
  if (label && st && !label.toLowerCase().endsWith(st.toLowerCase())) label = `${label}, ${st}`;
  return label || clean(agencyId) || null;
};

const buildGroupIndex = (input: any) => {
  const { byId, list } = indexLookup(input);
  const byName = new Map<string, any>();
  for (const g of list) {
    const n = groupNameOf(g).toLowerCase();
    if (n && !byName.has(n)) byName.set(n, g);
  }
  return { byId, byName };
};

// resolveTaxGroup — which bucket an invoice posts to (I-13 verbatim):
//   1. tax_group_id (id → group; unknown ids stay separate buckets)
//   2. tax_group / tax_group_name / taxgroup (id match, then case-insensitive
//      group_name match, else a name-only bucket)
//   3. source_summary.{tax_group_id|tax_group|tax_group_name} stamps
//   4. rate bucket 'rate:<pct>' for group-less invoices that charged tax
//   5. UNGROUPED_KEY — no group, no rate, no tax
const resolveTaxGroup = (inv: any, idx: { byId: Map<string, any>; byName: Map<string, any> }) => {
  const src = isObj(inv.source_summary) ? inv.source_summary : {};
  const idRef = firstText(inv?.tax_group_id, inv?.taxgroup_id, inv?.taxGroupId, src?.tax_group_id);
  if (idRef) {
    const g = idx.byId.get(idRef) || null;
    const gid = clean(g?.id) || idRef;
    return { key: `id:${gid}`, id: gid, group: g, nameOnly: '', rate: null as number | null };
  }
  const nameRef = firstText(
    inv?.tax_group, inv?.tax_group_name, inv?.taxgroup, inv?.taxGroup,
    src?.tax_group, src?.tax_group_name,
  );
  if (nameRef) {
    const byIdHit = idx.byId.get(nameRef);
    if (byIdHit) return { key: `id:${clean(byIdHit.id) || nameRef}`, id: clean(byIdHit.id) || nameRef, group: byIdHit, nameOnly: '', rate: null as number | null };
    const byNameHit = idx.byName.get(nameRef.toLowerCase());
    if (byNameHit) return { key: `id:${clean(byNameHit.id) || nameRef.toLowerCase()}`, id: clean(byNameHit.id), group: byNameHit, nameOnly: '', rate: null as number | null };
    return { key: `name:${nameRef.toLowerCase()}`, id: '', group: null, nameOnly: nameRef, rate: null as number | null };
  }
  const pct = invoiceRatePercent(inv);
  if (pct && pct > 0) return { key: `rate:${round4(pct)}`, id: '', group: null, nameOnly: '', rate: pct };
  return { key: UNGROUPED_KEY, id: '', group: null, nameOnly: '', rate: null as number | null };
};

const bucketName = (res: { id: string; group: any; nameOnly: string; rate: number | null }): string => {
  if (res.group) return groupNameOf(res.group) || res.id || 'Tax group';
  if (res.nameOnly) return res.nameOnly;
  if (res.id) return res.id;
  if (res.rate && res.rate > 0) return `Ungrouped (${formatRate(res.rate)})`;
  return 'No tax group';
};

/**
 * salesTaxLiabilityRows — replica of taxLiabilityModel.taxLiabilityRows
 * (I-13). Same posted-status + period filter, same buckets, same row shape:
 * [{tax_group_id, name, agency, agency_id, rate, rate_source,
 *   taxable_cents, tax_collected_cents, exempt_sales_cents, invoice_count,
 *   exempt_count}] sorted tax_collected desc → name, with `.period` on the
 * array. opts.from/to are inclusive 'YYYY-MM-DD' bounds (period_start /
 * period_end / start_date / end_date aliases ok); both absent → unbounded.
 * opts.taxGroupsById / opts.jurisdictionsById (agenciesById /
 * taxAgenciesById aliases) accept {id:row} maps or arrays — TaxAgency rows
 * or JurisdictionProfile maps both work as agency lookups.
 */
export function salesTaxLiabilityRows(invoices: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const fromDay = toDay(o.from ?? o.period_start ?? o.start ?? o.start_date);
  const toBound = toDay(o.to ?? o.period_end ?? o.end ?? o.end_date);
  const bounded = Boolean(fromDay || toBound);
  const groups = buildGroupIndex(o.taxGroupsById ?? o.tax_groups ?? o.taxGroups);
  const agencies = indexLookup(
    o.agenciesById ?? o.jurisdictionsById ?? o.taxAgenciesById ?? o.agencies ?? o.jurisdictions,
  );

  const buckets = new Map<string, any>();
  const bucketFor = (res: ReturnType<typeof resolveTaxGroup>) => {
    let b = buckets.get(res.key);
    if (b) return b;
    const g = res.group;
    const agencyId = firstText(g?.agency_id, g?.tax_agency_id, g?.agency);
    const agencyRow = agencyId ? agencies.byId.get(agencyId) : null;
    const pct = g ? groupPercentOf(g) : null;
    b = {
      tax_group_id: res.id || '',
      name: bucketName(res),
      agency: agencyLabelOf(agencyRow, agencyId),
      agency_id: agencyId || '',
      rate: Number.isFinite(pct) ? pct : null,
      rate_source: Number.isFinite(pct) ? 'group' : 'none',
      taxable_cents: 0,
      tax_collected_cents: 0,
      exempt_sales_cents: 0,
      invoice_count: 0,
      exempt_count: 0,
      _invoice_rate: null as number | null,
    };
    buckets.set(res.key, b);
    return b;
  };

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !isPostedInvoice(inv)) continue;
    const day = invoiceDate(inv);
    if (bounded && (!day || (fromDay && day < fromDay) || (toBound && day > toBound))) continue;
    const b = bucketFor(resolveTaxGroup(inv, groups));
    b.invoice_count += 1;
    b.taxable_cents += invoiceTaxableCents(inv);
    b.tax_collected_cents += invoiceTaxCents(inv);
    if (isExemptInvoice(inv)) {
      b.exempt_count += 1;
      b.exempt_sales_cents += exemptSaleCents(inv);
    }
    if (b._invoice_rate == null) {
      const p = invoiceRatePercent(inv);
      if (p && p > 0) b._invoice_rate = p;
    }
  }

  const rows = [...buckets.values()].map((b) => {
    if (b.rate == null && b._invoice_rate != null) {
      b.rate = b._invoice_rate;
      b.rate_source = 'invoice';
    }
    if (b.rate == null && b.taxable_cents > 0 && b.tax_collected_cents > 0) {
      b.rate = round4((b.tax_collected_cents / b.taxable_cents) * 100);
      b.rate_source = 'derived';
    }
    delete b._invoice_rate;
    return b;
  });
  rows.sort(
    (a: any, b: any) =>
      b.tax_collected_cents - a.tax_collected_cents ||
      clean(a.name).localeCompare(clean(b.name)) ||
      String(a.tax_group_id).localeCompare(String(b.tax_group_id)),
  );
  (rows as any).period = { from: fromDay || null, to: toBound || null };
  return rows;
}

/**
 * liabilityAgencyRows — roll liability rows up to the remit agency (the
 * report's group_by 'agency' mode; mirrors liabilitySummary.by_agency but
 * carries exempt_sales + a 'name' column so it fits the report shape).
 * Rows with no resolved agency roll under UNASSIGNED_AGENCY. rate is null —
 * agencies mix group rates; the effective rate is per-group. Sorted
 * tax_cents desc → agency name.
 */
export function liabilityAgencyRows(rows: any[] = []) {
  const byAgency = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    const label = clean(r.agency) || UNASSIGNED_AGENCY;
    let a = byAgency.get(label);
    if (!a) {
      a = {
        name: label,
        agency: label,
        agency_id: clean(r.agency_id),
        rate: null,
        rate_source: 'none',
        taxable_cents: 0,
        tax_collected_cents: 0,
        exempt_sales_cents: 0,
        invoice_count: 0,
        exempt_count: 0,
        group_count: 0,
      };
      byAgency.set(label, a);
    }
    a.taxable_cents += num(r.taxable_cents);
    a.tax_collected_cents += num(r.tax_collected_cents);
    a.exempt_sales_cents += num(r.exempt_sales_cents);
    a.invoice_count += num(r.invoice_count);
    a.exempt_count += num(r.exempt_count);
    a.group_count += 1;
    if (!a.agency_id && clean(r.agency_id)) a.agency_id = clean(r.agency_id);
  }
  return [...byAgency.values()].sort(
    (a, b) => b.tax_collected_cents - a.tax_collected_cents || a.name.localeCompare(b.name),
  );
}

/**
 * liabilityTotals — the report-level rollup (liabilitySummary parity):
 * {taxable_cents, tax_collected_cents, exempt_sales_cents, invoice_count,
 *  exempt_count, by_agency, period}.
 */
export function liabilityTotals(rows: any[] = [], opts: any = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const period = isObj((rows as any)?.period)
    ? (rows as any).period
    : { from: toDay(opts?.from) || null, to: toDay(opts?.to) || null };
  const out = {
    taxable_cents: 0,
    tax_collected_cents: 0,
    exempt_sales_cents: 0,
    invoice_count: 0,
    exempt_count: 0,
    by_agency: liabilityAgencyRows(list),
    period,
  };
  for (const r of list) {
    if (!isObj(r)) continue;
    out.taxable_cents += num(r.taxable_cents);
    out.tax_collected_cents += num(r.tax_collected_cents);
    out.exempt_sales_cents += num(r.exempt_sales_cents);
    out.invoice_count += num(r.invoice_count);
    out.exempt_count += num(r.exempt_count);
  }
  return out;
}

// The data-injection adapter (see file header): a wiring layer that already
// imports taxLiabilityModel passes its taxLiabilityRows function (or
// precomputed rows) through `data` and the report uses the REAL model —
// the replica is the self-contained fallback.
const liabilityRowsFor = (data: any, period: { from: string; to: string }): any[] => {
  const fn = data?.taxLiabilityRows ?? data?.tax_liability_rows_fn;
  if (typeof fn === 'function') {
    const rows = fn(data?.invoices, {
      from: period.from, to: period.to,
      taxGroupsById: data?.tax_groups ?? data?.taxGroupsById ?? data?.taxGroups,
      jurisdictionsById: data?.agencies ?? data?.taxAgenciesById ?? data?.jurisdictionsById,
    });
    return Array.isArray(rows) ? rows : [];
  }
  if (Array.isArray(data?.tax_liability_rows)) return data.tax_liability_rows;
  return salesTaxLiabilityRows(data?.invoices, {
    from: period.from,
    to: period.to,
    taxGroupsById: data?.tax_groups ?? data?.taxGroupsById ?? data?.taxGroups,
    jurisdictionsById: data?.agencies ?? data?.taxAgenciesById ?? data?.jurisdictionsById,
  });
};

// === order-state helpers (commission basis + vended) ========================

// Product states that mean "produced or delivered" — locked-set terminals
// built|completed (productStatusModel) plus the legacy 'vended' value the
// entity enum still carries.
export const BUILTISH_STATUSES = ['built', 'completed', 'vended'] as const;
const BUILTISH = new Set<string>(BUILTISH_STATUSES);

// Delivered fulfillment states (productQueueModel.FULFILLED_STATES parity).
export const FULFILLED_STATES = ['picked_up', 'installed', 'shipped', 'delivered'] as const;
const FULFILLED = new Set<string>(FULFILLED_STATES);

// Product reached a delivered/vended state?
const productVended = (p: any): boolean =>
  isObj(p) && (BUILTISH.has(norm(p.operational_status)) || FULFILLED.has(norm(p.fulfillment_state)));

// Work order complete? completed flag or the 'completed' stage (a product
// list where EVERY product is vended also counts — the least-advanced rule
// would leave the order short of 'completed' otherwise... no: keep it to
// the two explicit signals; product coverage is the vended basis's job).
const woCompleted = (wo: any): boolean =>
  isObj(wo) && (wo.completed === true || norm(wo.current_stage) === 'completed');

// Work order fully vended — every tracked product delivered; an order with
// no products counts when the order itself is completed.
const woVended = (wo: any): boolean => {
  if (!isObj(wo)) return false;
  const products = Array.isArray(wo.products) ? wo.products.filter(isObj) : [];
  if (!products.length) return woCompleted(wo);
  return products.every(productVended);
};

// Invoice financially closed — paid status or a positive billed total with
// no remaining balance.
const invoiceSettled = (inv: any): boolean => {
  if (!isObj(inv)) return false;
  if (norm(inv.status) === 'paid') return true;
  return invoiceTotalCents(inv) > 0 && invoiceBalanceCents(inv) <= 0;
};

export const COMMISSION_BASIS_OPTIONS = ['invoiced', 'completed', 'closed', 'vended'] as const;

/**
 * orderBasisOk — does this posted invoice qualify under the commission
 * order_basis? (Semantics documented in the file header — self-contained,
 * not cumulative.) Unknown basis strings fall back to 'invoiced'.
 */
const orderBasisOk = (inv: any, basis: any, woById: Map<string, any>): boolean => {
  const b = norm(basis) || 'invoiced';
  if (b === 'invoiced') return true;
  const wo = woById.get(clean(inv?.work_order_id)) || null;
  switch (b) {
    case 'completed':
      return wo ? woCompleted(wo) : true;
    case 'closed':
      return invoiceSettled(inv) || (wo ? woCompleted(wo) && Boolean(toDay(wo.close_date)) : false);
    case 'vended':
      return wo ? woVended(wo) : invoiceSettled(inv);
    default:
      return true;
  }
};

// === commission ==============================================================

/**
 * commissionRows — commissionable sales per bucket for a period.
 * opts.from/to 'YYYY-MM-DD' bounds; opts.basis ∈ COMMISSION_BASIS_OPTIONS;
 * opts.groupBy 'salesperson' | 'income_account'; opts.rate PERCENT scalar;
 * opts.workOrdersById Map/{id:wo}/wo[] for the basis filter;
 * opts.accountsByCode enriches account_name (map code→row|name or row[]).
 * Rows: {key, label, salesperson?, account_code?, account_name?,
 *        invoice_count, sales_cents, rate, commission_cents}
 * sorted sales_cents desc → label. Rate ≤ 0 → commission 0 (documented
 * scalar — see file header).
 */
export function commissionRows(invoices: any[] = [], opts: any = {}) {
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const groupBy = norm(opts?.groupBy) === 'income_account' ? 'income_account' : 'salesperson';
  const rate = firstFinite(opts?.rate);
  const pct = Number.isFinite(rate) ? rate : 0;
  const woById = indexById(opts?.workOrdersById ?? opts?.work_orders ?? opts?.workOrders);
  const accountName = makeAccountNameLookup(opts?.accountsByCode);

  const buckets = new Map<string, any>();
  const bucketFor = (key: string, label: string) => {
    let b = buckets.get(key);
    if (b) return b;
    b = {
      key,
      label,
      salesperson: groupBy === 'salesperson' ? label : '',
      account_code: groupBy === 'income_account' ? key : '',
      account_name: groupBy === 'income_account' ? accountName(key) || label : '',
      invoice_count: 0,
      sales_cents: 0,
      rate: pct,
      commission_cents: 0,
    };
    buckets.set(key, b);
    return b;
  };

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !isPostedInvoice(inv)) continue;
    const day = invoiceDate(inv);
    if (!dayInRange(day, from, to)) continue;
    if (!orderBasisOk(inv, opts?.basis, woById)) continue;
    if (groupBy === 'salesperson') {
      const rep = salespersonOf(inv);
      const b = bucketFor(rep || '(unassigned)', rep || '(unassigned)');
      b.invoice_count += 1;
      b.sales_cents += incomeBaseCents(inv);
    } else {
      const splits = incomeSplitsOf(inv);
      for (const s of splits) {
        const label = s.account_code || UNMAPPED_ACCOUNT;
        const b = bucketFor(s.account_code || UNMAPPED_ACCOUNT, label);
        b.invoice_count += 1; // per-account participation count
        b.sales_cents += s.amount_cents;
      }
    }
  }

  const rows = [...buckets.values()].map((b) => ({
    ...b,
    commission_cents: pct > 0 ? Math.round((b.sales_cents * pct) / 100) : 0,
  }));
  rows.sort(
    (a, b) =>
      b.sales_cents - a.sales_cents ||
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.key.localeCompare(b.key),
  );
  return rows;
}

// === business summary ========================================================

// code → account name lookup (IncomeAccount/COGSAccount rows {code|id→row,
// name|account_name|display_name}; {code:name|string-row} maps and arrays
// both accepted — accountingExportModel.makeAccountNameLookup parity).
const ACCOUNT_ID_KEYS = ['code', 'id', 'account_code', 'account_id', 'gl_account_code'];
const ACCOUNT_NAME_KEYS = ['name', 'account_name', 'display_name', 'label'];
function makeAccountNameLookup(source: any): (code: string) => string {
  if (!source) return () => '';
  const direct = (k: string): string => {
    if (isObj(source) && !(source instanceof Map)) {
      const v = source[k];
      if (typeof v === 'string') return clean(v);
      if (isObj(v)) return firstText(v.name, v.account_name, v.display_name, v.label);
    }
    return '';
  };
  return (code: string) => {
    const d = direct(code);
    if (d) return d;
    const rows = source instanceof Map ? [...source.values()] : Array.isArray(source) ? source : [];
    for (const row of rows) {
      if (!isObj(row)) continue;
      for (const key of ACCOUNT_ID_KEYS) {
        if (clean(row[key]) === code) return firstText(row.name, row.account_name, row.display_name, row.label);
      }
    }
    return '';
  };
}

/**
 * invoiceCogsCents — the job cost attributable to one invoice, integer
 * cents (chain documented in the file header): explicit invoice field →
 * Σ line-item costs → linked WorkOrder materials/actual_cost. Pass a shared
 * `claimedWoIds` Set so WO-level cost is attributed to only ONE invoice
 * (multi-invoice jobs can't double-count); when omitted, each invoice may
 * claim the same WO — acceptable only for single-invoice datasets.
 */
export function invoiceCogsCents(inv: any, opts: any = {}): number {
  if (!isObj(inv)) return 0;
  const explicit = firstFinite(inv?.cogs_amount, inv?.cogs, inv?.cost_of_goods, inv?.job_cost, inv?.total_cost);
  if (Number.isFinite(explicit)) return Math.max(0, toCents(explicit));

  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  let lineCents = 0;
  for (const li of items) {
    if (!isObj(li)) continue;
    const flat = firstFinite(li?.cogs_amount, li?.cost, li?.extended_cost, li?.line_cost);
    if (Number.isFinite(flat)) { lineCents += toCents(flat); continue; }
    const unit = firstFinite(li?.unit_cost, li?.cost_per_unit);
    if (Number.isFinite(unit)) lineCents += Math.round(toCents(unit) * num(li?.quantity, 1));
  }
  if (lineCents > 0) return lineCents;

  const wo = indexById(opts?.workOrdersById ?? opts?.work_orders ?? opts?.workOrders)
    .get(clean(inv.work_order_id));
  if (!isObj(wo)) return 0;
  const woId = clean(wo.id) || clean(inv.work_order_id);
  const claimed: Set<string> | undefined = opts?.claimedWoIds instanceof Set ? opts.claimedWoIds : undefined;
  if (claimed && woId && claimed.has(woId)) return 0;

  const materials = Array.isArray(wo.materials) ? wo.materials : [];
  let matCents = 0;
  for (const m of materials) {
    if (!isObj(m)) continue;
    const c = firstFinite(m?.extended_cost, m?.total_cost, m?.cost);
    if (Number.isFinite(c)) matCents += toCents(c);
    else {
      const unit = firstFinite(m?.unit_cost, m?.cost_per_unit);
      if (Number.isFinite(unit)) matCents += Math.round(toCents(unit) * num(m?.quantity, 1));
    }
  }
  const woCents = matCents > 0 ? matCents : Math.max(0, toCents(wo.actual_cost));
  if (woCents > 0 && claimed && woId) claimed.add(woId);
  return woCents;
}

/**
 * businessSummaryRows — income/COGS/margin per GL income account for a
 * period of posted invoices: {account_code, account_name, income_cents,
 * cogs_cents, gross_profit_cents, margin (0–1|null), invoice_count}.
 * Sorted income_cents desc → account code. opts.accountsByCode enriches
 * names; opts.workOrdersById feeds the COGS fallback chain;
 * opts.claimedWoIds optionally carries over from a caller.
 */
export function businessSummaryRows(invoices: any[] = [], opts: any = {}) {
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const accountName = makeAccountNameLookup(opts?.accountsByCode ?? opts?.accounts ?? opts?.income_accounts);
  const woOpts = {
    workOrdersById: opts?.workOrdersById ?? opts?.work_orders ?? opts?.workOrders,
    claimedWoIds: opts?.claimedWoIds instanceof Set ? opts.claimedWoIds : new Set<string>(),
  };

  const buckets = new Map<string, any>();
  const bucketFor = (account: string) => {
    const key = account || UNMAPPED_ACCOUNT;
    let b = buckets.get(key);
    if (b) return b;
    b = {
      key,
      account_code: account,
      account_name: accountName(account) || '',
      income_cents: 0,
      cogs_cents: 0,
      gross_profit_cents: 0,
      margin: null as number | null,
      invoice_count: 0,
    };
    buckets.set(key, b);
    return b;
  };

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !isPostedInvoice(inv)) continue;
    const day = invoiceDate(inv);
    if (!dayInRange(day, from, to)) continue;

    const splits = incomeSplitsOf(inv);
    const cogs = invoiceCogsCents(inv, woOpts);
    const shares = splits.map((s) => s.amount_cents);
    const allocated = splits.length ? apportion(cogs, shares) : [];
    if (!splits.length && cogs > 0) {
      const b = bucketFor('');
      b.cogs_cents += cogs;
      b.invoice_count += 1;
      continue;
    }
    const counted = new Set<string>();
    splits.forEach((s, i) => {
      const b = bucketFor(s.account_code);
      b.income_cents += s.amount_cents;
      b.cogs_cents += allocated[i] || 0;
      if (!counted.has(s.account_code)) { b.invoice_count += 1; counted.add(s.account_code); }
    });
  }

  const rows = [...buckets.values()].map((b) => {
    const profit = b.income_cents - b.cogs_cents;
    return {
      ...b,
      gross_profit_cents: profit,
      margin: b.income_cents > 0 ? profit / b.income_cents : null,
    };
  });
  rows.sort(
    (a, b) =>
      b.income_cents - a.income_cents ||
      a.key.toLowerCase().localeCompare(b.key.toLowerCase()),
  );
  return rows;
}

// === invoice summary =========================================================

// Canonical status display order (Invoice.jsonc enum); import aliases fold
// in — 'partial'→partially_paid, 'issued'→sent.
const INVOICE_STATUS_ORDER = ['draft', 'sent', 'partially_paid', 'paid', 'void'] as const;
const STATUS_ALIAS: Record<string, string> = { partial: 'partially_paid', issued: 'sent' };
const statusOf = (inv: any): string => {
  const s = STATUS_ALIAS[norm(inv?.status)] || norm(inv?.status) || 'unknown';
  return s;
};

// The day a basis reads off an invoice (engine date_basis options mapped
// invoice-side — see header):
//   created → billing day (I-13 invoiceDate chain)
//   completed → paid_date
//   built → sent_date, billing day fallback
const invoiceBasisDay = (inv: any, basis: any): string => {
  const b = norm(basis) || 'created';
  if (b === 'completed') return toDay(inv?.paid_date);
  if (b === 'built') return toDay(inv?.sent_date) || invoiceDate(inv);
  return invoiceDate(inv);
};

/**
 * invoiceSummaryRows — per-status rollup of invoices for the period:
 * [{status, label, invoice_count, subtotal_cents, tax_cents, total_cents,
 *   paid_cents, balance_cents}] — canonical order first, extras appended
 * alphabetically. opts.basis selects the invoice date field (created |
 * completed | built); opts.voidPolicy 'exclude' (default) | 'include' |
 * 'only' applies the void-ish rule. Canonical buckets always emit so the
 * print shape is stable.
 */
export function invoiceSummaryRows(invoices: any[] = [], opts: any = {}) {
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const basis = norm(opts?.basis) || 'created';
  const policy = ['exclude', 'include', 'only'].includes(norm(opts?.voidPolicy))
    ? norm(opts.voidPolicy) : 'exclude';
  const rep = norm(opts?.salesperson);
  const cust = norm(opts?.customer);

  const groups = new Map<string, any>();
  const groupFor = (status: string) => {
    let g = groups.get(status);
    if (g) return g;
    g = {
      status,
      label: status === 'unknown' ? 'Unknown' : status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      invoice_count: 0,
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      paid_cents: 0,
      balance_cents: 0,
    };
    groups.set(status, g);
    return g;
  };
  // Canonical buckets always emit (stable print shape).
  for (const s of INVOICE_STATUS_ORDER) groupFor(s);

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv)) continue;
    const voidish = isVoidishInvoice(inv);
    if (policy === 'exclude' && voidish) continue;
    if (policy === 'only' && !voidish) continue;
    const day = invoiceBasisDay(inv, basis);
    if (!dayInRange(day, from, to)) continue;
    if (rep && !norm(salespersonOf(inv)).includes(rep)) continue;
    if (cust) {
      const name = firstText(inv?.customer_display_name, inv?.customer_name, inv?.client_name);
      if (!norm(name).includes(cust) && norm(inv?.customer_id) !== cust) continue;
    }
    const g = groupFor(statusOf(inv));
    g.invoice_count += 1;
    g.subtotal_cents += toCents(inv?.subtotal);
    g.tax_cents += invoiceTaxCents(inv);
    g.total_cents += invoiceTotalCents(inv);
    g.paid_cents += invoicePaidCents(inv);
    g.balance_cents += invoiceBalanceCents(inv);
  }

  const rank = (s: string) => {
    const i = INVOICE_STATUS_ORDER.indexOf(s as any);
    return i === -1 ? INVOICE_STATUS_ORDER.length : i;
  };
  return [...groups.values()].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.status.localeCompare(b.status),
  );
}

// === built summary ===========================================================

export const BUILT_GROUP_OPTIONS = ['product', 'day', 'product_type', 'salesperson'] as const;

// The day a product reached a built state (chain in the file header —
// status_history transitions → operational_status_changed_at → order
// proxies → explicit stamps).
const productBuiltDay = (p: any, wo: any): string => {
  const stamped = toDay(firstText(p?.built_date, p?.built_at, p?.date_built));
  if (stamped) return stamped;
  let transition = '';
  const history = Array.isArray(p?.status_history) ? p.status_history : [];
  for (const entry of history) {
    if (!isObj(entry) || !entry.at) continue;
    const field = norm(entry.field);
    const to = norm(entry.to ?? entry.value ?? entry.status);
    const builtish =
      ((field === 'operational_status' || field === 'status' || field === '') && BUILTISH.has(to)) ||
      (field === 'fulfillment_state' && FULFILLED.has(to));
    if (builtish) {
      const d = toDay(entry.at);
      if (d && d > transition) transition = d;
    }
  }
  if (transition) return transition;
  if (BUILTISH.has(norm(p?.operational_status)) || FULFILLED.has(norm(p?.fulfillment_state))) {
    const changed = toDay(p?.operational_status_changed_at);
    if (changed) return changed;
  }
  if (isObj(wo) && (wo.completed === true || norm(wo.current_stage) === 'completed')) {
    const d = toDay(firstText(wo?.completed_date, wo?.updated_date));
    if (d) return d;
  }
  return '';
};

const isBuiltProduct = (p: any): boolean =>
  isObj(p) && (BUILTISH.has(norm(p.operational_status)) || FULFILLED.has(norm(p.fulfillment_state)));

// Customer-facing product value in cents — quoted_total authoritative,
// unit price × quantity fallback (opsReportModel.productValue parity).
const productValueCents = (p: any): number => {
  if (!isObj(p)) return 0;
  const total = firstFinite(p?.quoted_total);
  if (Number.isFinite(total) && total !== 0) return toCents(total);
  return Math.round(toCents(p?.quoted_unit_price) * (num(p?.quantity) || 1));
};

// Per-product cost: explicit stamps → linked materials → BuilderProduct
// frozen_cost (see header — products carry no cost field on the schema).
const productCostCents = (p: any, wo: any, builderById: Map<string, any>): number => {
  if (!isObj(p)) return 0;
  const flat = firstFinite(p?.frozen_cost, p?.cost, p?.extended_cost, p?.total_cost);
  if (Number.isFinite(flat) && flat !== 0) return Math.max(0, toCents(flat));
  const unit = firstFinite(p?.unit_cost, p?.cost_per_unit);
  if (Number.isFinite(unit) && unit !== 0) return Math.max(0, Math.round(toCents(unit) * (num(p?.quantity) || 1)));

  const materials = Array.isArray(wo?.materials) ? wo.materials : [];
  const pid = clean(p?.id);
  const bpId = clean(p?.builder_product_id);
  const lineId = clean(p?.estimate_line_id);
  let cents = 0;
  for (const m of materials) {
    if (!isObj(m)) continue;
    const linked =
      (pid && clean(m?.builder_product_id) === pid) ||
      (bpId && clean(m?.builder_product_id) === bpId) ||
      (lineId && clean(m?.estimate_line_id) === lineId);
    if (!linked) continue;
    const c = firstFinite(m?.extended_cost, m?.total_cost, m?.cost);
    if (Number.isFinite(c)) cents += toCents(c);
    else {
      const u = firstFinite(m?.unit_cost, m?.cost_per_unit);
      if (Number.isFinite(u)) cents += Math.round(toCents(u) * num(m?.quantity, 1));
    }
  }
  if (cents > 0) return cents;
  const bp = (bpId && builderById.get(bpId)) || (pid && builderById.get(pid));
  const frozen = firstFinite(bp?.frozen_cost, bp?.cost);
  return Number.isFinite(frozen) ? Math.max(0, toCents(frozen)) : 0;
};

/**
 * builtProductRows — one row per product that reached a built state in the
 * period: {work_order_id, order_ref, customer_id, customer_name,
 * product_id, product_name, product_type, salesperson, quantity,
 * built_date, value_cents, cost_cents, gross_profit_cents, margin, status}.
 * Sorted built_date asc → order → product name.
 */
export function builtProductRows(workOrders: any[] = [], opts: any = {}) {
  const from = toDay(opts?.from) || '';
  const to = toDay(opts?.to) || '';
  const builderById = indexById(opts?.builderProductsById ?? opts?.builder_products);
  const rows: any[] = [];
  for (const wo of Array.isArray(workOrders) ? workOrders : []) {
    if (!isObj(wo) || wo.deleted === true) continue;
    const products = Array.isArray(wo.products) ? wo.products : [];
    const orderRef = firstText(wo.work_order_number, wo.order_number, wo.corbridge_invoice_number, wo.title, wo.id);
    const salesperson = firstText(wo.sales_rep, wo.salesperson, wo.representative, wo.estimator);
    for (const p of products) {
      if (!isBuiltProduct(p)) continue;
      const day = productBuiltDay(p, wo);
      if (!dayInRange(day, from, to)) continue;
      const value = productValueCents(p);
      const cost = productCostCents(p, wo, builderById);
      const profit = value - cost;
      rows.push({
        work_order_id: clean(wo.id),
        order_ref: orderRef,
        customer_id: clean(wo.customer_id),
        customer_name: firstText(wo.client_name, wo.customer_name),
        product_id: clean(p.id) || clean(p.builder_product_id),
        product_name: firstText(p.description, p.product_name, p.customer_description, p.name, p.label) || '(product)',
        product_type: firstText(p.product_type, p.category, p.module_key) || '(untyped)',
        salesperson,
        quantity: num(p?.quantity, 0) || 1,
        built_date: day || null,
        status: norm(p.operational_status) || norm(p.fulfillment_state),
        value_cents: value,
        cost_cents: cost,
        gross_profit_cents: profit,
        margin: value > 0 ? profit / value : null,
      });
    }
  }
  rows.sort(
    (a, b) =>
      String(a.built_date || '9999-12-31').localeCompare(String(b.built_date || '9999-12-31')) ||
      a.order_ref.localeCompare(b.order_ref) ||
      a.product_name.toLowerCase().localeCompare(b.product_name.toLowerCase()),
  );
  return rows;
}

/**
 * builtSummaryRows — roll builtProductRows up by 'day' | 'product_type' |
 * 'salesperson' (or any row key): {key, label, built_count, order_count,
 * quantity, value_cents, cost_cents, gross_profit_cents, margin}. Sorted
 * day→asc, others→value desc.
 */
export function builtSummaryRows(rows: any[] = [], groupBy: any = 'product_type') {
  const by = norm(groupBy) || 'product_type';
  const keyOf = (r: any): { key: string; label: string } => {
    if (by === 'day' || by === 'built_date') {
      const d = clean(r?.built_date) || 'undated';
      return { key: d, label: d === 'undated' ? '(undated)' : d };
    }
    if (by === 'salesperson') {
      const s = clean(r?.salesperson) || '(unassigned)';
      return { key: s, label: s };
    }
    const t = clean(r?.product_type) || '(untyped)';
    return { key: t, label: t };
  };
  const groups = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    const { key, label } = keyOf(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        key, label,
        built_count: 0,
        order_ids: new Set<string>(),
        quantity: 0,
        value_cents: 0,
        cost_cents: 0,
      };
      groups.set(key, g);
    }
    g.built_count += 1;
    if (clean(r.work_order_id)) g.order_ids.add(clean(r.work_order_id));
    g.quantity += num(r.quantity);
    g.value_cents += num(r.value_cents);
    g.cost_cents += num(r.cost_cents);
  }
  const out = [...groups.values()].map((g) => {
    const profit = g.value_cents - g.cost_cents;
    return {
      key: g.key,
      label: g.label,
      built_count: g.built_count,
      order_count: g.order_ids.size,
      quantity: Math.round(g.quantity * 1000) / 1000,
      value_cents: g.value_cents,
      cost_cents: g.cost_cents,
      gross_profit_cents: profit,
      margin: g.value_cents > 0 ? profit / g.value_cents : null,
    };
  });
  out.sort((a, b) =>
    by === 'day' || by === 'built_date'
      ? a.key.localeCompare(b.key)
      : b.value_cents - a.value_cents || a.label.toLowerCase().localeCompare(b.label.toLowerCase()),
  );
  return out;
}

// === report specs ============================================================

const moneyCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'money' });
const intCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'int' });
const textCol = (key: string, label: string, align = 'left') => ({ key, label, align, format: 'text' });
const dateCol = (key: string, label: string) => ({ key, label, align: 'left', format: 'date' });
const pctCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'percent' });
const numCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'num1' });

// Param specs (engine types only — PARAM_TYPES =
// date_range|date_basis|select|multiselect|boolean|text|number).
const DATE_RANGE_PARAM = {
  key: 'date_range',
  type: 'date_range',
  label: 'Date Range',
  default: 'this_month',
};
const DATE_BASIS_PARAM = {
  key: 'date_basis',
  type: 'date_basis',
  label: 'Date Basis',
  default: 'created',
};
const SALESPERSON_PARAM = {
  key: 'salesperson',
  type: 'text',
  label: 'Salesperson',
  default: '',
};
const CUSTOMER_PARAM = {
  key: 'customer',
  type: 'text',
  label: 'Customer',
  default: '',
};
const VOID_PARAM = {
  key: 'void_policy',
  type: 'select',
  label: 'Void Handling',
  options: ['exclude', 'include', 'only'],
  default: 'exclude',
};
const TAX_GROUP_BY_PARAM = {
  key: 'group_by',
  type: 'select',
  label: 'Group By',
  options: [
    { value: 'tax_group', label: 'Tax Group' },
    { value: 'agency', label: 'Tax Agency' },
  ],
  default: 'tax_group',
};
const COMMISSION_GROUP_BY_PARAM = {
  key: 'group_by',
  type: 'select',
  label: 'Group By',
  options: [
    { value: 'salesperson', label: 'Salesperson' },
    { value: 'income_account', label: 'Income Account' },
  ],
  default: 'salesperson',
};
const COMMISSION_BASIS_PARAM = {
  key: 'order_basis',
  type: 'select',
  label: 'Order Basis',
  options: [
    { value: 'invoiced', label: 'All Invoiced' },
    { value: 'completed', label: 'Completed Orders' },
    { value: 'closed', label: 'Closed Orders' },
    { value: 'vended', label: 'Vended Orders' },
  ],
  default: 'invoiced',
};
const COMMISSION_RATE_PARAM = {
  key: 'rate',
  type: 'number',
  label: 'Commission Rate %',
  default: 0,
};
const BUILT_GROUP_BY_PARAM = {
  key: 'group_by',
  type: 'select',
  label: 'Group By',
  options: [
    { value: 'product', label: 'Product (Detail)' },
    { value: 'product_type', label: 'Product Type' },
    { value: 'day', label: 'Built Date' },
    { value: 'salesperson', label: 'Salesperson' },
  ],
  default: 'product',
};

// run() adapters: model rows (integer cents) → report rows (money columns
// in dollars — engine format 'money'; *_cents keys preserved as extras).
const centsToMoneyCols = (obj: any, centsKeys: string[], outKey?: (k: string) => string) => {
  const out: any = { ...obj };
  for (const k of centsKeys) out[outKey ? outKey(k) : k.replace(/_cents$/, '')] = fromCents(obj[k]);
  return out;
};
const sumMoney = (rows: any[], key: string) =>
  Math.round(rows.reduce((s, r) => s + num(r[key]), 0) * 100) / 100;

const FINANCIAL_REPORT_DESCRIPTIONS: Record<string, string> = {
  sales_tax_liability:
    'Sales tax liability for the period — tax collected per tax group (or remit agency) with taxable base, exempt sales and exempt invoice counts. Ties to posted-invoice tax sums to the cent.',
  sales_commission:
    'Sales commission — commissionable pre-tax sales per salesperson (or income account) times the rate parameter. Order basis selects which orders count: invoiced, completed, closed or vended.',
  business_summary:
    'Business summary — income per GL income account with cost of goods and gross margin, from invoice GL splits and job cost fields.',
  invoice_summary:
    'Invoice summary — invoices bucketed by status for the period: count, subtotal, tax, total, paid and open balance per status.',
  built_summary:
    'Built summary — products that reached a built/fulfilled state in the period, with quoted value, cost and margin; detail or rolled up by date, type or salesperson.',
};

export const FINANCIAL_REPORTS = [
  {
    id: 'sales_tax_liability',
    name: 'Sales Tax Liability',
    category: 'financial',
    description: FINANCIAL_REPORT_DESCRIPTIONS.sales_tax_liability,
    params: [DATE_RANGE_PARAM, TAX_GROUP_BY_PARAM],
    columns: [
      textCol('name', 'Tax Group'),
      textCol('agency', 'Agency'),
      { key: 'rate', label: 'Rate %', align: 'right', format: 'num1' },
      moneyCol('taxable', 'Taxable Sales'),
      moneyCol('tax_collected', 'Tax Collected'),
      moneyCol('exempt_sales', 'Exempt Sales'),
      intCol('invoice_count', 'Invoices'),
      intCol('exempt_count', 'Exempt'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const rows = liabilityRowsFor(data, { from, to });
      const groupBy = norm(params?.group_by) || 'tax_group';
      if (groupBy === 'agency') {
        return {
          columns: [
            textCol('name', 'Tax Agency'),
            textCol('agency', 'Agency'),
            { key: 'rate', label: 'Rate %', align: 'right', format: 'num1' },
            moneyCol('taxable', 'Taxable Sales'),
            moneyCol('tax_collected', 'Tax Collected'),
            moneyCol('exempt_sales', 'Exempt Sales'),
            intCol('invoice_count', 'Invoices'),
            intCol('exempt_count', 'Exempt'),
          ],
          rows: liabilityAgencyRows(rows).map((r) =>
            centsToMoneyCols(r, ['taxable_cents', 'tax_collected_cents', 'exempt_sales_cents']),
          ),
        };
      }
      return {
        rows: (Array.isArray(rows) ? rows : []).map((r) =>
          centsToMoneyCols(r, ['taxable_cents', 'tax_collected_cents', 'exempt_sales_cents']),
        ),
      };
    },
    summarize: (rows: any[]) => {
      const totals = {
        name: 'Total',
        agency: '',
        rate: null,
        taxable: sumMoney(rows, 'taxable'),
        tax_collected: sumMoney(rows, 'tax_collected'),
        exempt_sales: sumMoney(rows, 'exempt_sales'),
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        exempt_count: rows.reduce((s, r) => s + num(r.exempt_count), 0),
      };
      const byAgency = liabilityAgencyRows(rows.map((r) => ({
        agency: r.agency, agency_id: r.agency_id,
        taxable_cents: toCents(r.taxable), tax_collected_cents: toCents(r.tax_collected),
        exempt_sales_cents: toCents(r.exempt_sales),
        invoice_count: r.invoice_count, exempt_count: r.exempt_count,
      }))).map((a) => ({
        agency: a.agency,
        taxable: fromCents(a.taxable_cents),
        tax_collected: fromCents(a.tax_collected_cents),
        invoice_count: a.invoice_count,
        exempt_count: a.exempt_count,
      }));
      return { totals, by_agency: byAgency };
    },
  },
  {
    id: 'sales_commission',
    name: 'Sales Commission',
    category: 'financial',
    description: FINANCIAL_REPORT_DESCRIPTIONS.sales_commission,
    params: [
      DATE_RANGE_PARAM,
      COMMISSION_BASIS_PARAM,
      COMMISSION_GROUP_BY_PARAM,
      COMMISSION_RATE_PARAM,
      SALESPERSON_PARAM,
    ],
    columns: [
      textCol('label', 'Salesperson'),
      textCol('account_name', 'Account Name'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('sales', 'Sales'),
      { key: 'rate', label: 'Rate %', align: 'right', format: 'num1' },
      moneyCol('commission', 'Commission'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const groupBy = norm(params?.group_by) || 'salesperson';
      const rep = norm(params?.salesperson);
      const rows = commissionRows(data?.invoices, {
        from,
        to,
        basis: params?.order_basis,
        groupBy,
        rate: params?.rate,
        workOrdersById: data?.work_orders ?? data?.workOrders ?? data?.workOrdersById,
        accountsByCode: data?.accounts ?? data?.income_accounts ?? data?.accountsByCode,
      }).filter((r) => !rep || norm(r.salesperson).includes(rep) || norm(r.label).includes(rep));
      const shaped = rows.map((r) =>
        centsToMoneyCols(r, ['sales_cents', 'commission_cents']),
      );
      // Grouped-by-account rows deserve account-first labels.
      if (groupBy === 'income_account') {
        return {
          columns: [
            textCol('label', 'Income Account'),
            textCol('account_name', 'Account Name'),
            intCol('invoice_count', 'Invoices'),
            moneyCol('sales', 'Sales'),
            { key: 'rate', label: 'Rate %', align: 'right', format: 'num1' },
            moneyCol('commission', 'Commission'),
          ],
          rows: shaped,
        };
      }
      return { rows: shaped };
    },
    summarize: (rows: any[]) => ({
      totals: {
        label: 'Total',
        account_name: '',
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        sales: sumMoney(rows, 'sales'),
        rate: null,
        commission: sumMoney(rows, 'commission'),
      },
    }),
  },
  {
    id: 'business_summary',
    name: 'Business Summary',
    category: 'financial',
    description: FINANCIAL_REPORT_DESCRIPTIONS.business_summary,
    params: [DATE_RANGE_PARAM],
    columns: [
      textCol('account_code', 'Account'),
      textCol('account_name', 'Account Name'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('income', 'Income'),
      moneyCol('cogs', 'COGS'),
      moneyCol('gross_profit', 'Gross Profit'),
      pctCol('margin', 'Margin'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const rows = businessSummaryRows(data?.invoices, {
        from,
        to,
        workOrdersById: data?.work_orders ?? data?.workOrders ?? data?.workOrdersById,
        accountsByCode: data?.accounts ?? data?.income_accounts ?? data?.accountsByCode,
      });
      return {
        rows: rows.map((r) => ({
          ...centsToMoneyCols(r, ['income_cents', 'cogs_cents', 'gross_profit_cents']),
          account_code: r.account_code || UNMAPPED_ACCOUNT,
        })),
      };
    },
    summarize: (rows: any[]) => {
      const income = rows.reduce((s, r) => s + num(r.income), 0);
      const cogs = rows.reduce((s, r) => s + num(r.cogs), 0);
      const profit = income - cogs;
      return {
        totals: {
          account_code: 'Total',
          account_name: '',
          invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
          income: Math.sign(income) * Math.round(Math.abs(income) * 100 + 1e-9) / 100,
          cogs: Math.sign(cogs) * Math.round(Math.abs(cogs) * 100 + 1e-9) / 100,
          gross_profit: Math.sign(profit) * Math.round(Math.abs(profit) * 100 + 1e-9) / 100,
          margin: income > 0 ? profit / income : null,
        },
      };
    },
  },
  {
    id: 'invoice_summary',
    name: 'Invoice Summary',
    category: 'financial',
    description: FINANCIAL_REPORT_DESCRIPTIONS.invoice_summary,
    params: [DATE_BASIS_PARAM, DATE_RANGE_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM, VOID_PARAM],
    columns: [
      textCol('label', 'Status'),
      intCol('invoice_count', 'Invoices'),
      moneyCol('subtotal', 'Subtotal'),
      moneyCol('tax', 'Tax'),
      moneyCol('total', 'Total'),
      moneyCol('paid', 'Paid'),
      moneyCol('balance', 'Balance'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const rows = invoiceSummaryRows(data?.invoices, {
        from,
        to,
        basis: params?.date_basis,
        voidPolicy: params?.void_policy,
        salesperson: params?.salesperson,
        customer: params?.customer,
      });
      return {
        rows: rows.map((r) =>
          centsToMoneyCols(r, ['subtotal_cents', 'tax_cents', 'total_cents', 'paid_cents', 'balance_cents']),
        ),
      };
    },
    summarize: (rows: any[]) => ({
      totals: {
        label: 'Total',
        invoice_count: rows.reduce((s, r) => s + num(r.invoice_count), 0),
        subtotal: sumMoney(rows, 'subtotal'),
        tax: sumMoney(rows, 'tax'),
        total: sumMoney(rows, 'total'),
        paid: sumMoney(rows, 'paid'),
        balance: sumMoney(rows, 'balance'),
      },
    }),
  },
  {
    id: 'built_summary',
    name: 'Built Summary',
    category: 'financial',
    description: FINANCIAL_REPORT_DESCRIPTIONS.built_summary,
    params: [DATE_RANGE_PARAM, BUILT_GROUP_BY_PARAM, SALESPERSON_PARAM],
    columns: [
      dateCol('built_date', 'Built'),
      textCol('order_ref', 'Order'),
      textCol('product_name', 'Product'),
      textCol('product_type', 'Type'),
      textCol('salesperson', 'Salesperson'),
      numCol('quantity', 'Qty'),
      moneyCol('value', 'Value'),
      moneyCol('cost', 'Cost'),
      moneyCol('gross_profit', 'Gross Profit'),
      pctCol('margin', 'Margin'),
    ],
    run: (params: any, data: any) => {
      const { from, to } = rangeBounds(params?.date_range);
      const rep = norm(params?.salesperson);
      const groupBy = norm(params?.group_by) || 'product';
      const detail = builtProductRows(data?.work_orders ?? data?.workOrders ?? [], {
        from,
        to,
        builderProductsById: data?.builder_products ?? data?.builderProductsById,
      }).filter((r) => !rep || norm(r.salesperson).includes(rep));

      if (groupBy !== 'product' && ['day', 'product_type', 'salesperson'].includes(groupBy)) {
        const rolled = builtSummaryRows(detail, groupBy).map((r) =>
          centsToMoneyCols(r, ['value_cents', 'cost_cents', 'gross_profit_cents']),
        );
        const labelText =
          groupBy === 'day' ? 'Built Date' : groupBy === 'salesperson' ? 'Salesperson' : 'Product Type';
        return {
          columns: [
            textCol('label', labelText),
            intCol('built_count', 'Products'),
            intCol('order_count', 'Orders'),
            numCol('quantity', 'Qty'),
            moneyCol('value', 'Value'),
            moneyCol('cost', 'Cost'),
            moneyCol('gross_profit', 'Gross Profit'),
            pctCol('margin', 'Margin'),
          ],
          rows: rolled,
        };
      }
      return {
        rows: detail.map((r) =>
          centsToMoneyCols(r, ['value_cents', 'cost_cents', 'gross_profit_cents']),
        ),
      };
    },
    summarize: (rows: any[], ctx: any) => {
      const value = rows.reduce((s, r) => s + num(r.value), 0);
      const cost = rows.reduce((s, r) => s + num(r.cost), 0);
      const profit = value - cost;
      const grouped = norm(ctx?.params?.group_by) && norm(ctx.params.group_by) !== 'product';
      if (grouped) {
        return {
          totals: {
            label: 'Total',
            built_count: rows.reduce((s, r) => s + num(r.built_count), 0),
            order_count: rows.reduce((s, r) => s + num(r.order_count), 0),
            quantity: Math.round(rows.reduce((s, r) => s + num(r.quantity), 0) * 1000) / 1000,
            value: Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-9) / 100,
            cost: Math.sign(cost) * Math.round(Math.abs(cost) * 100 + 1e-9) / 100,
            gross_profit: Math.sign(profit) * Math.round(Math.abs(profit) * 100 + 1e-9) / 100,
            margin: value > 0 ? profit / value : null,
          },
        };
      }
      return {
        totals: {
          built_date: '',
          order_ref: '',
          product_name: `${rows.length} product${rows.length === 1 ? '' : 's'}`,
          product_type: '',
          salesperson: '',
          quantity: Math.round(rows.reduce((s, r) => s + num(r.quantity), 0) * 1000) / 1000,
          value: Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-9) / 100,
          cost: Math.sign(cost) * Math.round(Math.abs(cost) * 100 + 1e-9) / 100,
          gross_profit: Math.sign(profit) * Math.round(Math.abs(profit) * 100 + 1e-9) / 100,
          margin: value > 0 ? profit / value : null,
        },
      };
    },
  },
];

export const FINANCIAL_REPORTS_BY_ID: Record<string, any> = Object.fromEntries(
  FINANCIAL_REPORTS.map((spec) => [spec.id, spec]),
);
