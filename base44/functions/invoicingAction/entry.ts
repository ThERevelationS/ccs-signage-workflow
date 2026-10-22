import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: number) => Math.round(value * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

const INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "void"];
const OPEN_AR_STATUSES = new Set(["sent", "partially_paid"]);
const PAYMENT_METHODS = ["cash", "check", "card", "ach", "financing", "other"];

const EDITABLE_INVOICE_FIELDS = [
  "invoice_number", "customer_id", "customer_display_name",
  "opportunity_id", "estimating_request_id", "estimate_id", "work_order_id",
  "contact_id", "location_id",
  "line_items", "discount_amount", "tax_rate", "deposit_applied",
  "issue_date", "due_date", "terms", "notes", "internal_notes",
];

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

function sanitizeLineItems(raw: any) {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw bad("line_items must be a list.");
  return raw.map((row: any, i: number) => {
    const description = clean(row?.description);
    const quantity = num(row?.quantity, NaN);
    const unit_price = num(row?.unit_price, NaN);
    if (!description) throw bad(`Line ${i + 1} needs a description.`);
    if (!(quantity > 0)) throw bad(`Line ${i + 1} needs a positive quantity.`);
    if (!(unit_price >= 0)) throw bad(`Line ${i + 1} needs a non-negative unit price.`);
    return {
      description,
      quantity: money(quantity),
      unit_price: money(unit_price),
      taxable: row?.taxable === true,
      line_total: money(quantity * unit_price),
    };
  });
}

function computeTotals(fields: any) {
  const items = Array.isArray(fields.line_items) ? fields.line_items : [];
  const subtotal = money(items.reduce((s: number, r: any) => s + money(num(r.quantity) * num(r.unit_price)), 0));
  const taxableSubtotal = money(items.filter((r: any) => r.taxable === true)
    .reduce((s: number, r: any) => s + money(num(r.quantity) * num(r.unit_price)), 0));
  const discount = Math.max(0, money(num(fields.discount_amount)));
  const taxRate = Math.max(0, num(fields.tax_rate));
  const taxBase = Math.max(0, taxableSubtotal - discount);
  const taxAmount = money(taxBase * taxRate);
  const deposit = Math.max(0, money(num(fields.deposit_applied)));
  const total = money(subtotal - discount + taxAmount - deposit);
  return { subtotal, discount_amount: discount, tax_rate: taxRate, tax_amount: taxAmount, deposit_applied: deposit, total };
}

function invoiceSnapshot(row: any) {
  return {
    id: clean(row?.id),
    invoice_number: clean(row?.invoice_number),
    status: clean(row?.status),
    customer_id: clean(row?.customer_id),
    customer_display_name: clean(row?.customer_display_name),
    opportunity_id: clean(row?.opportunity_id),
    estimate_id: clean(row?.estimate_id),
    work_order_id: clean(row?.work_order_id),
    issue_date: clean(row?.issue_date),
    due_date: clean(row?.due_date),
    terms: clean(row?.terms),
    subtotal: num(row?.subtotal),
    discount_amount: num(row?.discount_amount),
    tax_rate: num(row?.tax_rate),
    tax_amount: num(row?.tax_amount),
    deposit_applied: num(row?.deposit_applied),
    total: num(row?.total),
    amount_paid: num(row?.amount_paid),
    balance_due: num(row?.balance_due),
    sent_date: clean(row?.sent_date),
    paid_date: clean(row?.paid_date),
  };
}

async function nextInvoiceNumber(Invoice: any) {
  const rows = await Invoice.filter({});
  if (!Array.isArray(rows)) throw bad("Invoice numbering lookup failed.", 500);
  let seq = rows.length + 1001;
  const existing = new Set(rows.map((r: any) => clean(r?.invoice_number)));
  while (existing.has(`INV-${seq}`)) seq += 1;
  return `INV-${seq}`;
}

async function findByCreationKey(entity: any, key: string) {
  const rows = await entity.filter({ creation_request_key: clean(key) });
  if (!Array.isArray(rows)) throw bad("Creation receipt lookup did not return a record list.", 409);
  return rows;
}

async function recomputeInvoiceAfterPayments({ Invoice, Payment, invoiceId, actor }: any) {
  const payments = await Payment.filter({ invoice_id: invoiceId });
  if (!Array.isArray(payments)) throw bad("Payment lookup failed while updating the invoice.", 500);
  const amountPaid = money(payments
    .filter((p: any) => clean(p?.status) === "recorded")
    .reduce((s: number, p: any) => s + num(p?.amount), 0));
  const invoice = await Invoice.get(invoiceId);
  if (!invoice?.id) throw bad("The invoice no longer exists.", 409);
  const balanceDue = money(num(invoice.total) - amountPaid);
  let status = clean(invoice.status);
  if (status !== "void") {
    if (balanceDue <= 0.005 && num(invoice.total) > 0) status = "paid";
    else if (amountPaid > 0) status = "partially_paid";
    else status = clean(invoice.sent_date) ? "sent" : "draft";
  }
  const desired: any = {
    amount_paid: amountPaid,
    balance_due: balanceDue,
    status,
    paid_date: status === "paid" ? clean(invoice.paid_date) || today() : "",
    updated_by: actor,
  };
  const expected = expectedFoundationFields(invoice, desired);
  await replaceFoundationFieldsIfUnchanged({
    entity: Invoice,
    recordId: invoiceId,
    expectedFields: expected,
    nextFields: desired,
    label: "Invoice payment totals",
  });
  return Invoice.get(invoiceId);
}

function agingSummary(invoices: any[]) {
  const summary = {
    open_invoices: 0,
    open_balance: 0,
    overdue_invoices: 0,
    overdue_balance: 0,
    buckets: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 },
  };
  const now = Date.now();
  for (const inv of invoices) {
    if (!OPEN_AR_STATUSES.has(clean(inv?.status))) continue;
    const balance = num(inv?.balance_due);
    if (balance <= 0) continue;
    summary.open_invoices += 1;
    summary.open_balance = money(summary.open_balance + balance);
    const due = Date.parse(clean(inv?.due_date));
    const daysOver = Number.isFinite(due) ? Math.floor((now - due) / 86400000) : 0;
    if (daysOver <= 0) summary.buckets.current = money(summary.buckets.current + balance);
    else if (daysOver <= 30) summary.buckets.days_1_30 = money(summary.buckets.days_1_30 + balance);
    else if (daysOver <= 60) summary.buckets.days_31_60 = money(summary.buckets.days_31_60 + balance);
    else if (daysOver <= 90) summary.buckets.days_61_90 = money(summary.buckets.days_61_90 + balance);
    else summary.buckets.days_90_plus = money(summary.buckets.days_90_plus + balance);
    if (daysOver > 0) {
      summary.overdue_invoices += 1;
      summary.overdue_balance = money(summary.overdue_balance + balance);
    }
  }
  return summary;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const Invoice = base44.asServiceRole.entities.Invoice;
    const Payment = base44.asServiceRole.entities.Payment;
    const Customer = base44.asServiceRole.entities.Customer;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Opportunity = base44.asServiceRole.entities.Opportunity;

    if (action === "list_invoices") {
      const status = clean(body?.status);
      if (status && !INVOICE_STATUSES.includes(status)) throw bad("Unknown invoice status filter.");
      const rows = await Invoice.filter(status ? { status } : {});
      if (!Array.isArray(rows)) throw bad("Invoice lookup failed.", 500);
      const query = clean(body?.query).toLowerCase();
      const invoices = rows
        .filter((r: any) => !query
          || clean(r?.invoice_number).toLowerCase().includes(query)
          || clean(r?.customer_display_name).toLowerCase().includes(query))
        .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)))
        .slice(0, 250)
        .map(invoiceSnapshot);
      return Response.json({ success: true, action, invoices, aging: agingSummary(rows) });
    }

    if (action === "get_invoice") {
      const invoiceId = clean(body?.invoice_id);
      const invoice = await Invoice.get(invoiceId).catch(() => null);
      if (!invoice?.id) throw bad("Invoice not found.", 404);
      const [payments, customer, estimate, workOrder, opportunity] = await Promise.all([
        Payment.filter({ invoice_id: invoiceId }),
        clean(invoice.customer_id) ? Customer.get(clean(invoice.customer_id)).catch(() => null) : null,
        clean(invoice.estimate_id) ? Estimate.get(clean(invoice.estimate_id)).catch(() => null) : null,
        clean(invoice.work_order_id) ? WorkOrder.get(clean(invoice.work_order_id)).catch(() => null) : null,
        clean(invoice.opportunity_id) ? Opportunity.get(clean(invoice.opportunity_id)).catch(() => null) : null,
      ]);
      if (!Array.isArray(payments)) throw bad("Payment lookup failed.", 500);
      return Response.json({
        success: true,
        action,
        invoice,
        payments: payments.sort((a: any, b: any) => clean(b?.paid_date || b?.created_date).localeCompare(clean(a?.paid_date || a?.created_date))),
        customer: customer || null,
        estimate: estimate || null,
        work_order: workOrder || null,
        opportunity: opportunity || null,
      });
    }

    if (action === "create_invoice") {
      const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const customerId = clean(fields.customer_id);
      if (!customerId) throw bad("A customer is required.");
      const customer = await Customer.get(customerId).catch(() => null);
      if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
      const lineItems = sanitizeLineItems(fields.line_items) || [];
      const linkChecks: Array<[string, any]> = [
        ["estimate_id", Estimate], ["work_order_id", WorkOrder], ["opportunity_id", Opportunity],
      ];
      for (const [key, entity] of linkChecks) {
        const id = clean((fields as any)[key]);
        if (id) {
          const linked = await entity.get(id).catch(() => null);
          if (!linked?.id) throw bad(`The linked ${key.replace(/_/g, " ")} no longer exists.`, 409);
        }
      }
      const totals = computeTotals({ ...fields, line_items: lineItems });
      const invoiceNumber = clean(fields.invoice_number) || await nextInvoiceNumber(Invoice);
      const invoiceKey = clean(body?.creation_request_key) || `invoice:${customerId}:${Date.now()}`;
      const createdResult = await createFoundationRecordWithRecovery({
        entity: Invoice,
        data: {
          creation_request_key: invoiceKey,
          invoice_number: invoiceNumber,
          status: "draft",
          customer_id: customerId,
          customer_display_name: clean(fields.customer_display_name) || clean(customer.company_name),
          opportunity_id: clean(fields.opportunity_id),
          estimating_request_id: clean(fields.estimating_request_id),
          estimate_id: clean(fields.estimate_id),
          work_order_id: clean(fields.work_order_id),
          contact_id: clean(fields.contact_id),
          location_id: clean(fields.location_id),
          line_items: lineItems,
          ...totals,
          amount_paid: 0,
          balance_due: totals.total,
          issue_date: clean(fields.issue_date),
          due_date: clean(fields.due_date),
          terms: clean(fields.terms),
          notes: clean(fields.notes),
          internal_notes: clean(fields.internal_notes),
          created_by: actor,
          updated_by: actor,
          source_summary: fields.source_summary && typeof fields.source_summary === "object" ? fields.source_summary : {},
        },
        readMatches: () => findByCreationKey(Invoice, invoiceKey),
        label: "Invoice",
      });
      return Response.json({ success: true, action, invoice: createdResult.record });
    }

    if (action === "update_invoice") {
      const invoiceId = clean(body?.invoice_id);
      const current = await Invoice.get(invoiceId).catch(() => null);
      if (!current?.id) throw bad("Invoice not found.", 404);
      if (["paid", "void"].includes(clean(current.status))) throw bad("Paid or void invoices cannot be edited.", 409);
      const desired: any = {};
      const incoming = body?.fields && typeof body.fields === "object" ? body.fields : {};
      for (const key of EDITABLE_INVOICE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) desired[key] = incoming[key];
      }
      if (Object.keys(desired).length === 0) throw bad("No editable fields supplied.");
      if (Object.prototype.hasOwnProperty.call(desired, "line_items")) {
        desired.line_items = sanitizeLineItems(desired.line_items) || [];
      }
      if (Object.prototype.hasOwnProperty.call(desired, "customer_id")) {
        const cid = clean(desired.customer_id);
        const customer = cid ? await Customer.get(cid).catch(() => null) : null;
        if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
        desired.customer_id = cid;
        desired.customer_display_name = clean(desired.customer_display_name) || clean(customer.company_name);
      }
      const merged = { ...current, ...desired };
      const totals = computeTotals(merged);
      Object.assign(desired, totals, {
        balance_due: money(totals.total - num(current.amount_paid)),
        updated_by: actor,
      });
      const baseline = body?.baseline && typeof body.baseline === "object" ? body.baseline : current;
      const expected = expectedFoundationFields({ ...current, ...baseline }, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: Invoice,
        recordId: invoiceId,
        expectedFields: expected,
        nextFields: desired,
        label: "Invoice fields",
      });
      return Response.json({ success: true, action, invoice: updated });
    }

    if (action === "mark_sent") {
      const invoiceId = clean(body?.invoice_id);
      const current = await Invoice.get(invoiceId).catch(() => null);
      if (!current?.id) throw bad("Invoice not found.", 404);
      if (clean(current.status) !== "draft") throw bad("Only draft invoices can be marked sent.", 409);
      const desired = {
        status: "sent",
        sent_date: today(),
        issue_date: clean(current.issue_date) || today(),
        updated_by: actor,
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: Invoice, recordId: invoiceId, expectedFields: expected, nextFields: desired, label: "Invoice send",
      });
      return Response.json({ success: true, action, invoice: updated });
    }

    if (action === "void_invoice") {
      const invoiceId = clean(body?.invoice_id);
      const current = await Invoice.get(invoiceId).catch(() => null);
      if (!current?.id) throw bad("Invoice not found.", 404);
      if (clean(current.status) === "void") throw bad("Invoice is already void.", 409);
      const payments = await Payment.filter({ invoice_id: invoiceId });
      if (Array.isArray(payments) && payments.some((p: any) => clean(p?.status) === "recorded")) {
        throw bad("Void the recorded payments before voiding this invoice.", 409);
      }
      const desired = {
        status: "void",
        voided_date: new Date().toISOString(),
        void_reason: clean(body?.void_reason),
        balance_due: 0,
        updated_by: actor,
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: Invoice, recordId: invoiceId, expectedFields: expected, nextFields: desired, label: "Invoice void",
      });
      return Response.json({ success: true, action, invoice: updated });
    }

    if (action === "record_payment") {
      const invoiceId = clean(body?.invoice_id);
      const invoice = await Invoice.get(invoiceId).catch(() => null);
      if (!invoice?.id) throw bad("Invoice not found.", 404);
      if (!OPEN_AR_STATUSES.has(clean(invoice.status))) {
        throw bad("Payments can only be recorded on sent or partially paid invoices.", 409);
      }
      const amount = num(body?.amount, NaN);
      if (!(amount > 0)) throw bad("Payment amount must be positive.");
      if (amount - num(invoice.balance_due) > 0.005) {
        throw bad(`Payment exceeds the open balance of $${money(num(invoice.balance_due)).toFixed(2)}.`, 409);
      }
      const method = clean(body?.method) || "other";
      if (!PAYMENT_METHODS.includes(method)) throw bad(`method must be one of ${PAYMENT_METHODS.join(", ")}.`);
      const paymentKey = clean(body?.creation_request_key) || `payment:${invoiceId}:${Date.now()}`;
      const createdResult = await createFoundationRecordWithRecovery({
        entity: Payment,
        data: {
          creation_request_key: paymentKey,
          invoice_id: invoiceId,
          customer_id: clean(invoice.customer_id),
          opportunity_id: clean(invoice.opportunity_id),
          estimate_id: clean(invoice.estimate_id),
          work_order_id: clean(invoice.work_order_id),
          amount: money(amount),
          method,
          reference_number: clean(body?.reference_number),
          paid_date: clean(body?.paid_date) || today(),
          status: "recorded",
          notes: clean(body?.notes),
          created_by: actor,
        },
        readMatches: () => findByCreationKey(Payment, paymentKey),
        label: "Payment",
      });
      const updated = await recomputeInvoiceAfterPayments({ Invoice, Payment, invoiceId, actor });
      return Response.json({ success: true, action, payment: createdResult.record, invoice: updated });
    }

    if (action === "void_payment") {
      const paymentId = clean(body?.payment_id);
      const payment = await Payment.get(paymentId).catch(() => null);
      if (!payment?.id) throw bad("Payment not found.", 404);
      if (clean(payment.status) !== "recorded") throw bad("Only recorded payments can be voided.", 409);
      const desired = {
        status: "void",
        void_reason: clean(body?.void_reason),
        voided_date: new Date().toISOString(),
      };
      const expected = expectedFoundationFields(payment, desired);
      await replaceFoundationFieldsIfUnchanged({
        entity: Payment, recordId: paymentId, expectedFields: expected, nextFields: desired, label: "Payment void",
      });
      const updated = await recomputeInvoiceAfterPayments({ Invoice, Payment, invoiceId: clean(payment.invoice_id), actor });
      return Response.json({ success: true, action, invoice: updated });
    }

    throw bad(`Unsupported action "${action}".`);
  } catch (error: any) {
    const status = error?.statusCode || error?.status || 500;
    return Response.json(
      { success: false, error: error?.message || "Request failed." },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
});
