// Pure model helpers for the /WalkIn counter-sale flow (CoreBridge "on-the-spot
// checkout", COREBRIDGE_MAP.md §6). A walk-in sale is a pay-and-leave order: it
// produces a completed WorkOrder with quoted products plus an immediately-paid
// Invoice + Payment — there is no standalone paid-order path, because the
// codebase only records money through invoicingAction (Payment rows always
// hang off an Invoice). Kept React/base44-free so the totals and record shapes
// are unit-testable under Node (scripts/test-walk-in.mjs).

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).toLowerCase();
const money = (value) => Math.round(num(value) * 100) / 100;

export const WALK_IN_TITLE = "Walk-in sale";
export const WALK_IN_CUSTOMER_NAME = "Walk-in";
// Deterministic creation key for the shared counter customer: ensureNewCustomer
// dedupes on creation_request_key, so every register converges on one record.
export const WALK_IN_CUSTOMER_CREATION_KEY = "counter-sale:walk-in-customer";
export const WALK_IN_MODULE_KEY = "walk_in";

// Matches invoicingAction's PAYMENT_METHODS allowlist — the record_payment
// action rejects anything outside this set.
export const WALK_IN_PAYMENT_METHODS = ["cash", "card", "check", "ach", "financing", "other"];
export const WALK_IN_PAYMENT_METHOD_LABELS = {
  cash: "Cash", card: "Card", check: "Check", ach: "ACH", financing: "Financing", other: "Other",
};

// The default counter customer is identified by an explicit flag when one is
// present (is_walk_in / walk_in) and otherwise by its company name. Returns the
// flagged row first so a "Walk-in Services LLC" can't shadow the real flag.
export function findWalkInCustomer(customers = []) {
  const rows = Array.isArray(customers) ? customers : [];
  const flagged = rows.find((row) => row?.id && (row.is_walk_in === true || row.walk_in === true));
  if (flagged) return flagged;
  return rows.find((row) => {
    if (!row?.id) return false;
    const name = norm(row.company_name || row.name).replace(/[^a-z0-9]/g, "");
    return name === "walkin" || name === "walkincustomer" || name === "walkincounter";
  }) || null;
}

export function newWalkInItem() {
  return {
    description: "",
    category: "",
    quantity: 1,
    unit_price: "",
    taxable: true,
    produces_work: false,
  };
}

// Per-item qty × unit price roll-up plus tax on the taxable subtotal. Mirrors
// invoicingAction's computeTotals (tax_rate is a fraction; tax applies to the
// taxable subtotal after discount — walk-in sales carry no discount/deposit).
export function walkInItemsTotal(items = [], taxPercent = 0) {
  const rows = (Array.isArray(items) ? items : []).map((row, index) => {
    const quantity = num(row?.quantity, NaN);
    const unitPrice = num(row?.unit_price, NaN);
    return {
      description: clean(row?.description),
      category: clean(row?.category),
      quantity,
      unit_price: unitPrice,
      taxable: row?.taxable !== false,
      produces_work: row?.produces_work === true,
      line_total: money(quantity * unitPrice),
      _index: index,
    };
  });
  const subtotal = money(rows.reduce((sum, row) => sum + row.line_total, 0));
  const taxableSubtotal = money(rows.filter((row) => row.taxable).reduce((sum, row) => sum + row.line_total, 0));
  const rate = Math.max(0, num(taxPercent)) / 100;
  const taxAmount = money(taxableSubtotal * rate);
  return {
    items: rows,
    subtotal,
    taxable_subtotal: taxableSubtotal,
    tax_percent: Math.max(0, num(taxPercent)),
    tax_amount: taxAmount,
    total: money(subtotal + taxAmount),
    item_count: rows.length,
  };
}

function validateItems(totals) {
  if (!totals.items.length) throw new Error("Add at least one item before checkout.");
  totals.items.forEach((row) => {
    if (!row.description) throw new Error(`Line ${row._index + 1} needs a description.`);
    if (!(row.quantity > 0)) throw new Error(`Line ${row._index + 1} needs a positive quantity.`);
    if (!(row.unit_price >= 0)) throw new Error(`Line ${row._index + 1} needs a non-negative unit price.`);
  });
}

// Each payment row: { method, amount?, tendered?, reference_number?, paid_date?, notes? }.
// `amount` is what applies to the invoice; it defaults to the unallocated
// remainder so a single-method checkout only needs a method (+ tendered for
// cash). Tendered is receipt-level cash handling — the recorded amount stays
// the invoice share so record_payment never exceeds the open balance.
function normalizePayments(payments, totals) {
  const list = (Array.isArray(payments) ? payments : payments ? [payments] : [])
    .map((row) => ({ ...(row || {}) }));
  let allocated = 0;
  const normalized = list.map((row, index) => {
    const method = norm(row.method) || "other";
    if (!WALK_IN_PAYMENT_METHODS.includes(method)) {
      throw new Error(`Unknown payment method "${clean(row.method)}" — must be one of ${WALK_IN_PAYMENT_METHODS.join(", ")}.`);
    }
    const remainder = money(totals.total - allocated);
    const amount = row.amount === undefined || row.amount === null || row.amount === ""
      ? remainder
      : money(row.amount);
    if (!(amount > 0) && totals.total > 0) {
      throw new Error(`Payment ${index + 1} needs a positive amount.`);
    }
    allocated = money(allocated + amount);
    const tendered = row.tendered === undefined || row.tendered === null || row.tendered === ""
      ? null
      : money(row.tendered);
    if (tendered !== null && tendered + 0.005 < amount) {
      throw new Error(`Tendered ${tendered.toFixed(2)} is less than the ${amount.toFixed(2)} due for this payment.`);
    }
    return {
      method,
      amount,
      amount_tendered: tendered,
      change_due: tendered !== null ? Math.max(0, money(tendered - amount)) : 0,
      reference_number: clean(row.reference_number),
      paid_date: clean(row.paid_date),
      notes: clean(row.notes),
    };
  });
  if (Math.abs(allocated - totals.total) > 0.005) {
    throw new Error(`Payments add up to ${allocated.toFixed(2)} but the sale total is ${totals.total.toFixed(2)} — a walk-in sale must be paid in full.`);
  }
  return normalized;
}

// Walk-in products seed the same operational fields conversion writes so
// queue views understand them. `produces_work` items stay queue-visible
// (order_review / fulfillment none); pure counter items go straight to
// fulfilled (picked_up) and fall out of default queue filters.
function buildProduct(row, index) {
  const needsWork = row.produces_work === true;
  return {
    id: `walkin-${index + 1}`,
    description: row.description,
    product_type: "",
    estimate_line_id: "",
    builder_product_id: "",
    source_project_id: "",
    module_key: WALK_IN_MODULE_KEY,
    quantity: row.quantity,
    quoted_unit_price: row.unit_price,
    quoted_total: row.line_total,
    category: row.category,
    customer_description: "",
    estimator_notes: "",
    operational_status: needsWork ? "order_review" : "none",
    operational_substatus: "",
    customer_facing_status: needsWork ? "Prepping Your Order" : "",
    fulfillment_state: needsWork ? "none" : "picked_up",
    proof_status: "none",
    design_due_date: "",
    product_due_date: "",
    hard_due_date: false,
    designer: "",
    assigned_to: "",
    responsibility: "",
    queue_priority: 0,
    requires_production: needsWork,
    taxable: row.taxable,
  };
}

// Build the record set for one counter checkout. `payments` accepts a single
// payment object or an array (split tender). `docNumber` should come from a
// one-time generateDocNumber({ doc_type: "order" }) allocation held across
// retries so WorkOrder recovery matching stays exact.
export function buildWalkInSale({
  items = [],
  customerId = "",
  customerName = "",
  payments = [],
  payment = null,
  taxPercent = 0,
  notes = "",
  docNumber = "",
  saleDate = "",
  actor = "",
} = {}) {
  const totals = walkInItemsTotal(items, taxPercent);
  validateItems(totals);
  const tender = payment ? [payment, ...(Array.isArray(payments) ? payments : [payments])].filter(Boolean) : payments;
  const paidRows = normalizePayments(tender, totals);
  const needsWork = totals.items.some((row) => row.produces_work === true);
  const customer_id = clean(customerId);
  const customerDisplay = clean(customerName);
  const today = clean(saleDate) || new Date().toISOString();
  const ref = clean(docNumber);
  const orderNotes = clean(notes);
  const products = totals.items.map((row, index) => buildProduct(row, index));

  const walkInSummary = {
    doc_number: ref,
    subtotal: totals.subtotal,
    tax_percent: totals.tax_percent,
    tax_amount: totals.tax_amount,
    total: totals.total,
    amount_paid: money(paidRows.reduce((sum, row) => sum + row.amount, 0)),
    balance_due: money(totals.total - paidRows.reduce((sum, row) => sum + row.amount, 0)),
    payments: paidRows.map((row) => ({
      method: row.method,
      amount: row.amount,
      amount_tendered: row.amount_tendered,
      change_due: row.change_due,
      reference_number: row.reference_number,
      paid_date: row.paid_date,
    })),
    item_count: totals.item_count,
    requires_production: needsWork,
  };

  const workOrderFields = {
    title: WALK_IN_TITLE,
    client_name: customerDisplay,
    customer_id,
    description: [
      `Walk-in counter sale${ref ? ` ${ref}` : ""} — ${totals.item_count} item${totals.item_count === 1 ? "" : "s"}, paid in full at the counter.`,
      orderNotes,
    ].filter(Boolean).join("\n\n"),
    current_stage: "completed",
    // completed=false while any item still needs production so queue views
    // (which filter on the completed flag) keep the pending products visible.
    completed: !needsWork,
    sales_status: "won",
    in_pipeline: false,
    is_walk_in_sale: true,
    walk_in_sale: walkInSummary,
    estimate_amount: totals.total,
    date_order_created: today,
    corbridge_invoice_number: ref,
    products,
    ...(orderNotes ? { notes: [{ text: orderNotes, timestamp: today, created_by: clean(actor) || "walk-in" }] } : {}),
  };

  // Invoices in this codebase are created only through invoicingAction, which
  // requires a real Customer. Without one the sale is WorkOrder-only and the
  // walk_in_sale summary still carries the tender details on the order.
  const invoiceFields = customer_id ? {
    customer_id,
    customer_display_name: customerDisplay,
    // Filled by the submit flow once the WorkOrder exists — the backend
    // verifies linked ids against live records.
    work_order_id: "",
    line_items: totals.items.map((row) => ({
      description: row.description,
      quantity: row.quantity,
      unit_price: row.unit_price,
      taxable: row.taxable,
    })),
    discount_amount: 0,
    tax_rate: totals.tax_percent / 100,
    deposit_applied: 0,
    issue_date: today.slice(0, 10),
    due_date: today.slice(0, 10),
    terms: "Due on receipt",
    notes: orderNotes,
    internal_notes: `Walk-in counter sale${ref ? ` ${ref}` : ""}`,
    source_summary: {
      kind: "walk_in_sale",
      doc_number: ref,
      item_count: totals.item_count,
    },
  } : null;

  const paymentFields = customer_id ? paidRows.map((row) => ({
    // invoice_id is assigned at submit time from the created invoice.
    invoice_id: "",
    amount: row.amount,
    method: row.method,
    reference_number: row.reference_number,
    paid_date: row.paid_date || today.slice(0, 10),
    notes: [
      row.notes,
      row.amount_tendered !== null ? `Tendered $${row.amount_tendered.toFixed(2)}${row.change_due > 0 ? `, change $${row.change_due.toFixed(2)}` : ""}` : "",
    ].filter(Boolean).join(" · "),
    amount_tendered: row.amount_tendered,
    change_due: row.change_due,
  })) : [];

  return { totals, workOrderFields, invoiceFields, paymentFields, walkInSale: walkInSummary, requiresProduction: needsWork };
}
