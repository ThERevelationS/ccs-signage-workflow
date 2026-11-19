// Pure order-waterfall model for the Job Workspace (CoreBridge "Order.aspx"
// waterfall, COREBRIDGE_MAP.md §5): Subtotal → Discount → Shipping → Postage →
// New Subtotal → Tax% → Total → Total Paid → Balance Due. Kept React/base44-
// free so the math is unit-testable under Node
// (scripts/test-order-waterfall-history.mjs) and a page or deployed function
// can render the same rows.
//
// Server parity: invoicingAction.computeTotals derives
//   subtotal        = Σ money(qty × unit_price) over line_items
//   taxable subtotal= Σ money(qty × unit_price) over line_items where taxable === true
//   tax base        = max(0, taxable subtotal − discount_amount)
//   tax amount      = money(tax base × tax_rate)          (tax_rate is a fraction: 0.0825)
//   total           = money(subtotal − discount + tax − deposit_applied)
// OrderFee lines (A-22 canonical shape {label, kind: shipping|postage|
// discount|fee, amount [signed — discounts negative], taxable,
// income_account_code}) layer on top: shipping/postage/fee rows add into New
// Subtotal, and every fee line flagged taxable contributes its signed amount
// to the tax base (so a taxable discount-fee reduces the tax base just like
// the legacy discount_amount does). All arithmetic runs in integer cents so
// rows foot to the cent against the stored invoice totals.

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const toCents = (v) => Math.sign(num(v)) * Math.round(Math.abs(num(v)) * 100 + 1e-9);
const fromCents = (c) => c / 100;

// Canonical OrderFee kinds (Invoice.jsonc / AllInOneEstimate.jsonc fee_lines).
export const ORDER_FEE_KINDS = ["shipping", "postage", "discount", "fee"];
export const ORDER_FEE_KIND_LABELS = {
  shipping: "Shipping",
  postage: "Postage",
  discount: "Discount",
  fee: "Fee",
};

// Fixed row keys in waterfall order (misc fee rows slot in after postage as
// `fee:<n>`; a `deposit_applied` row appears between tax and total only when
// the invoice actually carries a deposit).
export const ORDER_WATERFALL_KEYS = [
  "subtotal",
  "discount",
  "shipping",
  "postage",
  "new_subtotal",
  "tax",
  "total",
  "total_paid",
  "balance_due",
];

const FEE_KIND_SET = new Set(ORDER_FEE_KINDS);

// Normalize one OrderFee line. Discount-kind amounts are canonicalized to a
// negative magnitude ("signed; discounts are negative") so downstream signed
// math never double-flips a stray positive value.
export function normalizeFeeLine(line, index = 0) {
  const raw = line && typeof line === "object" ? line : {};
  const kind = FEE_KIND_SET.has(clean(raw.kind).toLowerCase())
    ? clean(raw.kind).toLowerCase()
    : "fee";
  let cents = toCents(raw.amount);
  if (kind === "discount") cents = -Math.abs(cents);
  return {
    key: `fee:${index}`,
    label: clean(raw.label) || ORDER_FEE_KIND_LABELS[kind],
    kind,
    amount: fromCents(cents),
    amount_cents: cents,
    taxable: raw.taxable === true,
    income_account_code: clean(raw.income_account_code),
  };
}

export function normalizeFeeLines(feeLines) {
  return (Array.isArray(feeLines) ? feeLines : [])
    .filter((line) => line && typeof line === "object")
    .map((line, i) => normalizeFeeLine(line, i));
}

// Line-item roll-up identical to invoicingAction: per-line money() rounding,
// taxable base counts only rows flagged taxable === true. When an invoice has
// no line_items (e.g. a stored snapshot carrying only totals) the taxable base
// falls back to the whole subtotal — the most useful reading of a snapshot.
function lineItemRollup(invoice) {
  const items = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  let subtotalCents = 0;
  let taxableCents = 0;
  let sawItems = false;
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    sawItems = true;
    const lineCents = toCents(num(row.quantity) * num(row.unit_price));
    subtotalCents += lineCents;
    if (row.taxable === true) taxableCents += lineCents;
  }
  return { subtotalCents, taxableCents, sawItems };
}

// A payment row counts toward an invoice's Total Paid exactly the way
// invoicingAction.recomputeInvoiceAfterPayments counts it: live "recorded"
// rows plus "refunded" rows (which carry negative amounts so credits net out);
// "void" rows and deleted rows are excluded.
export function paymentCountsTowardInvoice(payment, invoiceId) {
  if (!payment || payment.deleted === true) return false;
  if (clean(payment.invoice_id) !== clean(invoiceId)) return false;
  const status = clean(payment.status).toLowerCase();
  return status === "" || status === "recorded" || status === "refunded";
}

const formatTaxPercent = (rate) => {
  const pct = Math.round(num(rate) * 100 * 10000) / 10000;
  return `Tax ${pct}%`;
};

const row = (key, label, cents, extra = {}) => ({
  key,
  label,
  amount: fromCents(cents),
  amount_cents: cents,
  ...extra,
});

// Ordered waterfall rows [{key, label, amount, amount_cents, ...}] for one
// invoice. `feeLines` defaults to invoice.fee_lines (pass explicitly when the
// caller holds a fresher set). `payments` is the Payment-row list for this
// invoice; when omitted the invoice's server-maintained amount_paid is used
// for Total Paid instead.
export function computeOrderWaterfall({ invoice = {}, feeLines, payments } = {}) {
  const inv = invoice && typeof invoice === "object" ? invoice : {};
  const fees = normalizeFeeLines(feeLines === undefined ? inv.fee_lines : feeLines);

  const items = lineItemRollup(inv);
  const subtotalCents = Number.isFinite(Number(inv.subtotal))
    ? toCents(inv.subtotal)
    : items.subtotalCents;
  const taxableItemsCents = items.sawItems ? items.taxableCents : subtotalCents;

  const shippingCents = fees.filter((f) => f.kind === "shipping").reduce((s, f) => s + f.amount_cents, 0);
  const postageCents = fees.filter((f) => f.kind === "postage").reduce((s, f) => s + f.amount_cents, 0);
  const discountFeeCents = fees.filter((f) => f.kind === "discount").reduce((s, f) => s + f.amount_cents, 0);
  const miscFees = fees.filter((f) => f.kind === "fee");

  // Legacy discount_amount is stored as a positive magnitude; discount-kind
  // fee lines are normalized negative. One Discount row carries both.
  const discountAmountCents = Math.max(0, toCents(inv.discount_amount));
  const discountRowCents = -discountAmountCents + discountFeeCents;

  const newSubtotalCents =
    subtotalCents + discountRowCents + shippingCents + postageCents +
    miscFees.reduce((s, f) => s + f.amount_cents, 0);

  // Tax base (server parity + taxable OrderFees): taxable line items less the
  // invoice-level discount, plus the signed amount of every fee line flagged
  // taxable. Clamped at zero, mirroring computeTotals' Math.max(0, …).
  const taxableFeeCents = fees.filter((f) => f.taxable).reduce((s, f) => s + f.amount_cents, 0);
  const taxBaseCents = Math.max(0, taxableItemsCents - discountAmountCents + taxableFeeCents);
  const taxRate = Math.max(0, num(inv.tax_rate));
  const taxCents = Math.round(taxBaseCents * taxRate);

  const depositCents = Math.max(0, toCents(inv.deposit_applied));
  const totalCents = newSubtotalCents + taxCents - depositCents;

  const invoiceId = clean(inv.id);
  const paidCents = Array.isArray(payments)
    ? payments.reduce((s, p) => s + (paymentCountsTowardInvoice(p, invoiceId) ? toCents(p?.amount) : 0), 0)
    : toCents(inv.amount_paid);
  const balanceCents = totalCents - paidCents;

  const rows = [
    row("subtotal", "Subtotal", subtotalCents, { variant: "line" }),
    row("discount", "Discount", discountRowCents, { variant: "line" }),
    row("shipping", "Shipping", shippingCents, { variant: "line" }),
    row("postage", "Postage", postageCents, { variant: "line" }),
    ...miscFees.map((f) => row(f.key, f.label, f.amount_cents, {
      variant: "line",
      fee_kind: f.kind,
      taxable: f.taxable,
      income_account_code: f.income_account_code,
    })),
    row("new_subtotal", "New Subtotal", newSubtotalCents, { variant: "subtotal" }),
    row("tax", formatTaxPercent(taxRate), taxCents, {
      variant: "line",
      rate: taxRate,
      taxable_base: fromCents(taxBaseCents),
      taxable_base_cents: taxBaseCents,
    }),
    ...(depositCents > 0
      ? [row("deposit_applied", "Deposit Applied", -depositCents, { variant: "line" })]
      : []),
    row("total", "Total", totalCents, { variant: "total" }),
    row("total_paid", "Total Paid", paidCents, { variant: "total" }),
    row("balance_due", "Balance Due", balanceCents, { variant: "total" }),
  ];
  return rows;
}

// Convenience lookup so callers don't re-scan the rows array.
export function waterfallRow(rows, key) {
  return (Array.isArray(rows) ? rows : []).find((r) => r?.key === key) || null;
}

// Cents-exact comparison of computed waterfall rows against the invoice's own
// stored totals — the D-02 verify hook ("matches invoice totals to the cent").
export function reconcileWaterfall(rows, invoice = {}) {
  const get = (key) => waterfallRow(rows, key)?.amount_cents ?? 0;
  const checks = {
    subtotal: [get("subtotal"), toCents(invoice?.subtotal)],
    tax: [get("tax"), toCents(invoice?.tax_amount)],
    total: [get("total"), toCents(invoice?.total)],
    total_paid: [get("total_paid"), toCents(invoice?.amount_paid)],
    balance_due: [get("balance_due"), toCents(invoice?.balance_due)],
  };
  const mismatches = Object.entries(checks)
    .filter(([, [computed, stored]]) => Number.isFinite(stored) && computed !== stored)
    .map(([key, [computed, stored]]) => ({ key, computed: fromCents(computed), stored: fromCents(stored) }));
  return { matches: mismatches.length === 0, mismatches };
}

const csvCell = (value) => {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Downloadable waterfall: one row per waterfall line, amounts as fixed-2
// dollars so the CSV foots exactly like the on-screen rows.
export function waterfallToCsv(rows) {
  const header = "key,label,amount";
  const lines = (Array.isArray(rows) ? rows : []).map((r) =>
    [r?.key, r?.label, Number.isFinite(Number(r?.amount)) ? num(r.amount).toFixed(2) : ""]
      .map(csvCell)
      .join(",")
  );
  return [header, ...lines].join("\n");
}
