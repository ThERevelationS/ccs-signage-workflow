// Pure customer-statement model (CoreBridge-style statement of account).
// No imports, no I/O — every function is deterministic so the same inputs
// always produce the same statement. Data comes from the invoicingAction
// function (list_invoices snapshots + export_ar payments CSV); this module
// only reshapes it.

const clean = (v) => String(v ?? "").trim();
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const money = (n) => Math.round(num(n) * 100) / 100;
const DAY_MS = 86400000;

// Invoices: draft / sent / partially_paid / paid / void.
// Payments: recorded / void / refunded.
// "Voidish" rows stay on the activity ledger (audit trail, badge) but carry
// zero debit/credit effect and never enter balances or aging.
const VOIDISH = new Set(["void", "refunded", "cancelled", "canceled"]);
export const isVoidStatus = (status) => VOIDISH.has(clean(status).toLowerCase());

export const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  ach: "ACH",
  financing: "Financing",
  other: "Other",
};

// Normalize any date-ish value to "YYYY-MM-DD". Leading-date prefix wins so
// ISO timestamps never shift days across timezones.
export const toDay = (value) => {
  const s = clean(value);
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
};

// Whole days from `fromDay` to `toDay` (negative when toDay is earlier).
export const daysBetween = (fromDay, toDay) => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / DAY_MS);
};

// Statement aging buckets keyed on days past due relative to as-of:
// current = not yet due, d30 = 1–30, d60 = 31–60, d90 = 61+ (over 60).
export const agingBucket = (daysPastDue) =>
  daysPastDue <= 0 ? "current" : daysPastDue <= 30 ? "d30" : daysPastDue <= 60 ? "d60" : "d90";

export const AGING_BUCKET_LABELS = {
  current: "Current",
  d30: "1–30 days",
  d60: "31–60 days",
  d90: "Over 60 days",
};

/**
 * RFC-4180-style cell parser (handles quoted cells, escaped quotes, CR/LF).
 * Returns an array of string arrays — no header interpretation.
 */
export function parseDelimited(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 1; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Reshape invoicingAction `export_ar` → `payments_csv` into payment rows the
 * model understands. Backend header order:
 * Date, Invoice Number, Customer, Amount, Method, Reference, Status, Notes
 * (header names are looked up defensively so column order can drift).
 */
export function paymentsFromArCsv(csv) {
  const rows = parseDelimited(csv);
  if (!rows.length) return [];
  const header = rows[0].map((h) => clean(h).toLowerCase());
  const idx = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const col = {
    paid_date: idx(["date", "paid_date"]),
    invoice_number: idx(["invoice number", "invoice_number", "invoice"]),
    customer: idx(["customer"]),
    amount: idx(["amount"]),
    method: idx(["method"]),
    reference_number: idx(["reference", "reference_number", "ref"]),
    status: idx(["status"]),
    notes: idx(["notes"]),
  };
  const cellAt = (r, i) => (i >= 0 ? clean(r[i]) : "");
  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => clean(c) === "")) continue;
    const amount = num(String(row[col.amount] ?? "").replace(/[$,\s]/g, ""), NaN);
    if (!Number.isFinite(amount)) continue; // totals/summary rows, not payments
    out.push({
      paid_date: toDay(cellAt(row, col.paid_date)),
      invoice_number: cellAt(row, col.invoice_number),
      customer: cellAt(row, col.customer),
      amount: money(amount),
      method: cellAt(row, col.method),
      reference_number: cellAt(row, col.reference_number),
      status: cellAt(row, col.status) || "recorded",
      notes: cellAt(row, col.notes),
    });
  }
  return out;
}

const matchInvoice = (payment, invoice) => {
  const pid = clean(payment?.invoice_id);
  if (pid && clean(invoice?.id) === pid) return true;
  const pnum = clean(payment?.invoice_number);
  return Boolean(pnum) && clean(invoice?.invoice_number) === pnum;
};

/**
 * buildStatement — the single entry point.
 *
 * @param {object}   arg.customer   Customer entity row (company_name, billing_*…).
 * @param {object[]} arg.invoices   invoicingAction list_invoices snapshots.
 * @param {object[]} arg.payments   payment rows (entity rows or paymentsFromArCsv output).
 * @param {string}   arg.asOfDate   "YYYY-MM-DD"; defaults to today.
 * @returns {{customer, asOf, lines, openItems, totalBilled, totalPaid, balance, aging}}
 *
 * Rules:
 *  - Only issued invoices appear (drafts are not customer activity yet).
 *  - Void/refunded invoices stay on the ledger flagged `void` at $0 effect —
 *    excluded from billed totals, open items and aging.
 *  - Payments reduce balance by application; void/refunded payments apply $0.
 *  - Activity and applications are filtered to the as-of date.
 *  - openItems = per-invoice unpaid remainder (total − payments applied ≤ as-of).
 *  - balance = totalBilled − totalPaid (equals Σ openItems when every payment
 *    is applied; unapplied payments surface as account credit in the ledger).
 */
export function buildStatement({ customer, invoices, payments, asOfDate } = {}) {
  const asOf = toDay(asOfDate) || new Date().toISOString().slice(0, 10);
  const custId = clean(customer?.id);

  const belongsTo = (row) => {
    const cid = clean(row?.customer_id);
    return !custId || !cid || cid === custId;
  };

  const invs = (Array.isArray(invoices) ? invoices : []).filter((r) => r && belongsTo(r));
  const pays = (Array.isArray(payments) ? payments : []).filter((r) => r && belongsTo(r));

  const invoiceById = new Map(invs.map((i) => [clean(i.id), i]).filter(([k]) => k));
  const invoiceByNumber = new Map(invs.map((i) => [clean(i.invoice_number), i]).filter(([k]) => k));
  const linkedInvoice = (p) =>
    invoiceById.get(clean(p?.invoice_id)) || invoiceByNumber.get(clean(p?.invoice_number)) || null;

  // --- Chronological activity ledger ---------------------------------------
  const lines = [];
  for (const inv of invs) {
    const status = clean(inv.status).toLowerCase();
    if (status === "draft") continue; // never billed to the customer
    const date = toDay(inv.issue_date || inv.created_date);
    if (!date || date > asOf) continue;
    const voided = isVoidStatus(status);
    const total = money(inv.total);
    lines.push({
      date,
      kind: "invoice",
      ref: clean(inv.invoice_number) || "Invoice",
      description: invoiceDescription(inv, status, voided),
      debit: voided ? 0 : total,
      credit: 0,
      void: voided,
      status: status || "sent",
      invoice_id: clean(inv.id),
      invoice_number: clean(inv.invoice_number),
      amount: total,
      due_date: toDay(inv.due_date),
    });
  }
  for (const p of pays) {
    const date = toDay(p.paid_date || p.created_date);
    if (!date || date > asOf) continue;
    const voided = isVoidStatus(p.status);
    const inv = linkedInvoice(p);
    const amount = money(p.amount);
    const status = clean(p.status).toLowerCase() || "recorded";
    lines.push({
      date,
      kind: "payment",
      ref: clean(p.reference_number) || PAYMENT_METHOD_LABELS[clean(p.method).toLowerCase()] || "Payment",
      description: paymentDescription(p, inv, status),
      debit: 0,
      credit: voided ? 0 : amount,
      void: voided,
      status,
      payment_id: clean(p.id),
      invoice_id: clean(p.invoice_id) || clean(inv?.id),
      invoice_number: clean(p.invoice_number) || clean(inv?.invoice_number),
      amount,
      method: clean(p.method).toLowerCase(),
    });
  }

  // Deterministic order: date, invoice-before-payment, then ref/id tiebreak.
  const sortKey = (l) =>
    `${l.date}|${l.kind === "invoice" ? 0 : 1}|${l.ref}|${l.invoice_id || l.payment_id}`;
  lines.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  let running = 0;
  for (const line of lines) {
    running = money(running + line.debit - line.credit);
    line.balance = running;
  }

  // --- Open items + aging ---------------------------------------------------
  const appliedTo = (inv) =>
    money(
      pays
        .filter((p) => !isVoidStatus(p.status))
        .filter((p) => toDay(p.paid_date || p.created_date) <= asOf)
        .filter((p) => matchInvoice(p, inv))
        .reduce((s, p) => s + num(p.amount), 0)
    );

  const openItems = [];
  for (const inv of invs) {
    const status = clean(inv.status).toLowerCase();
    if (!status || status === "draft" || isVoidStatus(status)) continue;
    const issued = toDay(inv.issue_date || inv.created_date);
    if (!issued || issued > asOf) continue;
    const total = money(inv.total);
    const paid = appliedTo(inv);
    const balance = money(total - paid);
    if (balance <= 0.005) continue;
    const due = toDay(inv.due_date);
    const daysPastDue = due ? Math.max(0, daysBetween(due, asOf)) : 0;
    openItems.push({
      invoice_id: clean(inv.id),
      invoice_number: clean(inv.invoice_number),
      issue_date: issued,
      due_date: due,
      total,
      paid,
      balance,
      days_past_due: daysPastDue,
      bucket: agingBucket(daysPastDue),
    });
  }
  openItems.sort(
    (a, b) =>
      (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31") ||
      a.invoice_number.localeCompare(b.invoice_number)
  );

  const aging = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const item of openItems) aging[item.bucket] = money(aging[item.bucket] + item.balance);

  const totalBilled = money(
    lines.filter((l) => l.kind === "invoice").reduce((s, l) => s + l.debit, 0)
  );
  const totalPaid = money(
    lines.filter((l) => l.kind === "payment").reduce((s, l) => s + l.credit, 0)
  );
  const balance = money(totalBilled - totalPaid);

  return {
    customer: customer || {},
    asOf,
    lines,
    openItems,
    totalBilled,
    totalPaid,
    balance,
    aging,
    invoiceCount: lines.filter((l) => l.kind === "invoice").length,
    paymentCount: lines.filter((l) => l.kind === "payment").length,
  };
}

function invoiceDescription(inv, status, voided) {
  const bits = [];
  if (voided) bits.push("VOID");
  else if (status === "partially_paid") bits.push("Partially paid");
  else if (status === "paid") bits.push("Paid in full");
  if (clean(inv.billing_type) && clean(inv.billing_type) !== "standard") {
    bits.push(`${clean(inv.billing_type)} billing`);
  }
  const label = clean(inv.invoice_number) || "Invoice";
  return bits.length ? `${label} — ${bits.join(" · ")}` : `${label}`;
}

function paymentDescription(p, inv, status) {
  const method = PAYMENT_METHOD_LABELS[clean(p.method).toLowerCase()] || clean(p.method) || "Payment";
  const target = clean(inv?.invoice_number) || clean(p.invoice_number);
  const voided = isVoidStatus(status);
  const base = `${method} payment${target ? ` — applied to ${target}` : " — unapplied credit"}`;
  const extra = clean(p.notes);
  return `${voided ? "VOID — " : ""}${base}${extra ? ` (${extra})` : ""}`;
}

/**
 * Activity table → rows for the shared downloadCsv(filename, headers, rows)
 * helper. Columns match the printed statement ledger.
 */
export const STATEMENT_ACTIVITY_HEADERS = [
  "Date",
  "Type",
  "Reference",
  "Description",
  "Debit",
  "Credit",
  "Balance",
];

export function activityCsvRows(statement) {
  return (statement?.lines || []).map((l) => [
    l.date,
    l.void ? `${l.kind} (void)` : l.kind,
    l.ref,
    l.description,
    l.debit ? l.debit.toFixed(2) : "",
    l.credit ? l.credit.toFixed(2) : "",
    l.balance.toFixed(2),
  ]);
}
