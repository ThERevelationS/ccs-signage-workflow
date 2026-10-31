import { allocateDocNumber } from '../../shared/docNumberAllocation.ts';
import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { getWorkflowInvocationCapability } from "../../shared/workflowInvocationCapability.ts";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: number) => Math.round(value * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

// Derive a due_date from freeform payment terms ("Net 30", "Net 45 days", "Due on receipt", "COD").
const dueDateFromTerms = (terms: string, baseDate: string): string => {
  const t = clean(terms).toLowerCase();
  if (!t || !baseDate) return "";
  const base = new Date(`${baseDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return "";
  const net = t.match(/net\s*(\d{1,3})/);
  if (net) base.setUTCDate(base.getUTCDate() + parseInt(net[1], 10));
  else if (/due on receipt|cod|cash on delivery|due now|immediate/.test(t)) { /* base date as-is */ }
  else return "";
  return base.toISOString().slice(0, 10);
};

const INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "void"];
const OPEN_AR_STATUSES = new Set(["sent", "partially_paid"]);
const PAYMENT_METHODS = ["cash", "check", "card", "ach", "financing", "other"];

const EDITABLE_INVOICE_FIELDS = [
  "customer_id", "customer_display_name",
  "opportunity_id", "estimating_request_id", "estimate_id", "work_order_id",
  "contact_id", "location_id", "billing_type",
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
    billing_type: clean(row?.billing_type),
    customer_id: clean(row?.customer_id),
    customer_display_name: clean(row?.customer_display_name || row?.customer_name),
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

async function nextInvoiceNumber(Invoice: any, svc: any) {
  return allocateDocNumber({ svc, configName: 'invoice', prefix: 'INV-', seedEntity: Invoice, seedField: 'invoice_number' });
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

function csvCell(value: any) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells: any[]) => cells.map(csvCell).join(",");

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

    if (action === "revenue_summary") {
      const months = Math.max(3, Math.min(24, Number(body?.months) || 12));
      const [rows, payments] = await Promise.all([
        loadAllEntityRows({ entity: Invoice, query: {}, sort: null, label: 'Revenue summary invoices' }),
        loadAllEntityRows({ entity: Payment, query: {}, sort: null, label: 'Revenue summary payments' }).catch(() => []),
      ]);
      if (!Array.isArray(rows)) throw bad("Invoice lookup failed.", 500);
      const live = rows.filter((r: any) => clean(r?.status) !== "void");
      // Trailing `months` window keyed YYYY-MM, oldest first.
      const now = new Date();
      const buckets: any[] = [];
      for (let i = months - 1; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), invoiced: 0, collected: 0, invoice_count: 0 });
      }
      const bucketByKey = new Map(buckets.map((b) => [b.key, b]));
      const startKey = buckets[0].key;
      for (const r of live) {
        const key = clean(r?.issue_date || r?.created_date).slice(0, 7);
        if (key < startKey) continue;
        const b = bucketByKey.get(key);
        if (!b) continue;
        b.invoiced += num(r?.total);
        b.invoice_count += 1;
      }
      for (const p of Array.isArray(payments) ? payments : []) {
        if (clean(p?.status) === "void") continue;
        const key = clean(p?.paid_date || p?.created_date).slice(0, 7);
        if (key < startKey) continue;
        const b = bucketByKey.get(key);
        if (b) b.collected += num(p?.amount);
      }
      for (const b of buckets) { b.invoiced = money(b.invoiced); b.collected = money(b.collected); }
      const today = new Date().toISOString().slice(0, 10);
      let openAr = 0; let overdueAr = 0; let overdueCount = 0;
      for (const r of live) {
        const bal = num(r?.balance_due);
        if (bal <= 0) continue;
        openAr += bal;
        if (clean(r?.due_date) && clean(r.due_date) < today && ["sent", "partially_paid"].includes(clean(r?.status))) {
          overdueAr += bal; overdueCount += 1;
        }
      }
      return Response.json({
        success: true, action,
        months: buckets,
        open_ar: money(openAr),
        overdue_ar: money(overdueAr),
        overdue_count: overdueCount,
        invoiced_total: money(live.reduce((s: number, r: any) => s + num(r?.total), 0)),
        collected_total: money(live.reduce((s: number, r: any) => s + num(r?.amount_paid), 0)),
      });
    }

    if (action === "export_ar") {
      const status = clean(body?.status);
      if (status && !INVOICE_STATUSES.includes(status)) throw bad("Unknown invoice status filter.");
      const rows = await Invoice.filter(status ? { status } : {});
      if (!Array.isArray(rows)) throw bad("Invoice lookup failed.", 500);
      const query = clean(body?.query).toLowerCase();
      const startDate = clean(body?.start_date);
      const endDate = clean(body?.end_date);
      const inRange = (r: any) => {
        const d = clean(r?.issue_date || r?.created_date?.slice(0, 10));
        return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      };
      const invoices = rows
        .filter((r: any) => (!query
          || clean(r?.invoice_number).toLowerCase().includes(query)
          || clean(r?.customer_display_name || r?.customer_name).toLowerCase().includes(query)) && inRange(r))
        .sort((a: any, b: any) => clean(a?.invoice_number).localeCompare(clean(b?.invoice_number)));
      const invoiceLines = [
        csvRow(["Invoice Number", "Customer", "Issue Date", "Due Date", "Terms", "Item Description", "Qty", "Rate", "Line Total", "Subtotal", "Discount", "Tax", "Deposit Applied", "Total", "Amount Paid", "Balance Due", "Status"]),
        ...invoices.flatMap((inv: any) => {
          const items = Array.isArray(inv?.line_items) && inv.line_items.length ? inv.line_items : [{}];
          return items.map((li: any, i: number) => csvRow([
            inv.invoice_number, inv.customer_display_name || inv.customer_name, inv.issue_date, inv.due_date, inv.terms,
            li.description || "", li.quantity ?? "", li.unit_price ?? "",
            li.description ? money(num(li.quantity) * num(li.unit_price)) : "",
            i === 0 ? inv.subtotal : "", i === 0 ? inv.discount_amount : "", i === 0 ? inv.tax_amount : "",
            i === 0 ? inv.deposit_applied : "", i === 0 ? inv.total : "",
            i === 0 ? inv.amount_paid : "", i === 0 ? inv.balance_due : "", i === 0 ? inv.status : "",
          ]));
        }),
      ];
      const payments = await Payment.filter({});
      if (!Array.isArray(payments)) throw bad("Payment lookup failed.", 500);
      const invoiceById = new Map(invoices.map((r: any) => [clean(r?.id), r]));
      const paymentLines = [
        csvRow(["Date", "Invoice Number", "Customer", "Amount", "Method", "Reference", "Status", "Notes"]),
        ...payments
          .filter((p: any) => invoiceById.has(clean(p?.invoice_id)))
          .sort((a: any, b: any) => clean(a?.paid_date).localeCompare(clean(b?.paid_date)))
          .map((p: any) => {
            const inv = invoiceById.get(clean(p?.invoice_id));
            return csvRow([p.paid_date, inv?.invoice_number, inv?.customer_display_name || inv?.customer_name || p.customer_id, p.amount, p.method, p.reference_number, p.status, p.notes]);
          }),
      ];
      return Response.json({
        success: true,
        action,
        invoice_count: invoices.length,
        invoices_csv: invoiceLines.join("\n"),
        payments_csv: paymentLines.join("\n"),
      });
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
      const invoiceForView = { ...invoice, customer_display_name: clean(invoice.customer_display_name || invoice.customer_name || customer?.company_name) };
      return Response.json({
        success: true,
        action,
        invoice: invoiceForView,
        payments: payments.sort((a: any, b: any) => clean(b?.paid_date || b?.created_date).localeCompare(clean(a?.paid_date || a?.created_date))),
        customer: customer || null,
        estimate: estimate || null,
        work_order: workOrder || null,
        opportunity: opportunity || null,
      });
    }

    if (action === "list_invoiceable_estimates") {
      const rows = await Estimate.filter({ status: "approved" }, "-created_date", 100);
      if (!Array.isArray(rows)) throw bad("Estimate lookup failed.", 500);
      const query = clean(body?.query).toLowerCase();
      const invoices = await Invoice.filter({});
      if (!Array.isArray(invoices)) throw bad("Invoice lookup failed.", 500);
      const billedByEstimate = new Map<string, number>();
      for (const inv of invoices) {
        const eid = clean(inv?.estimate_id);
        if (!eid || clean(inv?.status) === "void") continue;
        billedByEstimate.set(eid, money((billedByEstimate.get(eid) || 0) + num(inv?.total)));
      }
      const estimates = rows
        .filter((e: any) => !e?.deleted && num(e?.quote_total) > 0)
        .filter((e: any) => !query
          || clean(e?.project_name).toLowerCase().includes(query)
          || clean(e?.client_name).toLowerCase().includes(query)
          || clean(e?.estimate_number).toLowerCase().includes(query))
        .slice(0, 50)
        .map((e: any) => {
          const billed = billedByEstimate.get(clean(e?.id)) || 0;
          return {
            id: clean(e?.id),
            estimate_number: clean(e?.estimate_number),
            project_name: clean(e?.project_name),
            client_name: clean(e?.client_name),
            quote_total: num(e?.quote_total),
            deposit_percent: num(e?.deposit_percent, 50),
            already_billed: billed,
            remaining_billable: money(num(e?.quote_total) - billed),
          };
        });
      return Response.json({ success: true, action, estimates });
    }

    if (action === "create_from_estimate") {
      const estimateId = clean(body?.estimate_id);
      const estimate = await Estimate.get(estimateId).catch(() => null);
      if (!estimate?.id) throw bad("Estimate not found.", 404);
      if (clean(estimate.status) !== "approved") throw bad("Only approved estimates can be invoiced.", 409);
      const quoteTotal = num(estimate.quote_total);
      if (!(quoteTotal > 0)) throw bad("The approved estimate has no billable total.", 409);

      const prior = await Invoice.filter({ estimate_id: estimateId });
      if (!Array.isArray(prior)) throw bad("Prior invoice lookup failed.", 500);
      const live = prior.filter((inv: any) => clean(inv?.status) !== "void");
      const billed = money(live.reduce((s: number, inv: any) => s + num(inv?.total), 0));
      const remaining = money(quoteTotal - billed);

      const mode = clean(body?.billing_mode) || "full";
      const projectName = clean(estimate.project_name) || `Estimate ${clean(estimate.estimate_number)}`;
      const ref = clean(estimate.estimate_number) ? `Estimate ${clean(estimate.estimate_number)}` : "Approved estimate";
      let amount = 0;
      let billingType = "standard";
      let lineDescription = `${ref} — ${projectName}`;

      if (mode === "full") {
        if (billed > 0) throw bad(`This estimate already has ${money(billed)} invoiced — use the final billing mode for the remainder.`, 409);
        amount = quoteTotal;
        billingType = "standard";
      } else if (mode === "deposit") {
        const explicitAmount = num(body?.deposit_amount, NaN);
        const pct = num(body?.deposit_percent, NaN);
        amount = Number.isFinite(explicitAmount) && explicitAmount > 0
          ? money(explicitAmount)
          : money(quoteTotal * (Number.isFinite(pct) && pct > 0 ? pct : num(estimate.deposit_percent, 50)) / 100);
        if (!(amount > 0)) throw bad("A positive deposit amount is required.");
        if (money(billed + amount) > quoteTotal) throw bad(`Deposit would exceed the billable remainder of ${money(remaining)}.`, 409);
        billingType = "deposit";
        lineDescription = `Deposit — ${ref} — ${projectName}`;
      } else if (mode === "final") {
        if (!(remaining > 0)) throw bad("Nothing left to bill — the estimate is already fully invoiced.", 409);
        amount = remaining;
        billingType = "final";
        lineDescription = `Final billing — ${ref} — ${projectName}`;
      } else {
        throw bad("billing_mode must be full, deposit, or final.");
      }

      const customerId = clean(estimate.customer_id);
      let customerDisplayName = clean(estimate.client_name);
      if (customerId) {
        const customer = await Customer.get(customerId).catch(() => null);
        if (customer?.id) customerDisplayName = clean(customer.company_name) || customerDisplayName;
      }
      const invoiceNumber = await nextInvoiceNumber(Invoice, base44.asServiceRole);
      const invoiceKey = clean(body?.creation_request_key)
        || `invoice-from-estimate:${estimateId}:${mode}:${Date.now()}`;
      const totals = computeTotals({
        line_items: [{ description: lineDescription, quantity: 1, unit_price: amount, taxable: false }],
        discount_amount: 0, tax_rate: 0, deposit_applied: 0,
      });
      const createdResult = await createFoundationRecordWithRecovery({
        entity: Invoice,
        data: {
          creation_request_key: invoiceKey,
          invoice_number: invoiceNumber,
          status: "draft",
          billing_type: billingType,
          customer_id: customerId,
          customer_display_name: customerDisplayName,
          opportunity_id: clean(estimate.opportunity_id),
          estimating_request_id: clean(estimate.estimating_request_id),
          estimate_id: estimateId,
          work_order_id: clean(estimate.work_order_id),
          line_items: sanitizeLineItems([{ description: lineDescription, quantity: 1, unit_price: amount, taxable: false }]),
          ...totals,
          amount_paid: 0,
          balance_due: totals.total,
          issue_date: clean(body?.issue_date) || today(),
          due_date: clean(body?.due_date) || dueDateFromTerms(clean(body?.terms) || clean(estimate?.terms), clean(body?.issue_date) || today()),
          terms: clean(body?.terms) || clean(estimate?.terms),
          notes: clean(body?.notes),
          internal_notes: clean(body?.internal_notes),
          created_by: actor,
          updated_by: actor,
          source_summary: {
            kind: "create_from_estimate",
            estimate_id: estimateId,
            estimate_number: clean(estimate.estimate_number),
            billing_mode: mode,
            quote_total: quoteTotal,
            previously_billed: billed,
          },
        },
        readMatches: () => findByCreationKey(Invoice, invoiceKey),
        label: "Invoice",
      });
      return Response.json({
        success: true,
        action,
        invoice: createdResult.record,
        billing: { mode, amount, quote_total: quoteTotal, previously_billed: billed, remaining_after: money(remaining - amount) },
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
      const invoiceNumber = clean(fields.invoice_number) || await nextInvoiceNumber(Invoice, base44.asServiceRole);
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
          due_date: clean(fields.due_date) || dueDateFromTerms(clean(fields.terms) || clean(customer?.terms), clean(fields.issue_date) || today()),
          terms: clean(fields.terms) || clean(customer?.terms),
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

    if (action === "email_invoice" || action === "send_past_due_reminder") {
      const reminder = action === "send_past_due_reminder";
      const invoiceId = clean(body?.invoice_id);
      const invoice = await Invoice.get(invoiceId).catch(() => null);
      if (!invoice?.id) throw bad("Invoice not found.", 404);
      if (clean(invoice.status) === "void" || clean(invoice.status) === "draft") {
        throw bad("Only issued invoices (sent/partial/paid) can be emailed.", 409);
      }
      const today = new Date().toISOString().slice(0, 10);
      const daysPastDue = clean(invoice.due_date) ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(clean(invoice.due_date))) / 86400000)) : 0;
      if (reminder) {
        if (num(invoice.balance_due) <= 0) throw bad("This invoice has no open balance — nothing to remind about.", 409);
        if (daysPastDue <= 0) throw bad("This invoice is not past due yet — use the regular invoice email instead.", 409);
      }
      const customer = clean(invoice.customer_id)
        ? await Customer.get(clean(invoice.customer_id)).catch(() => null)
        : null;
      const onFile = [customer?.email, customer?.contact_email, customer?.billing_email, customer?.contact_office_email, customer?.billing_contact_email]
        .map((v: any) => clean(v).toLowerCase()).filter((v: string) => v.includes("@"));
      const requested = clean(body?.email).toLowerCase();
      const to = (requested && onFile.includes(requested)) ? requested : (onFile[0] || '');
      if (!to.includes("@")) throw bad("This customer has no email address on file — add one to the customer record first.");
      const portalBase = (String(Deno.env.get('PUBLIC_APP_URL') || 'https://clay-flow-signage-suite-387da97c.base44.app').replace(/\/+$/, ''));

      // Reuse or mint an invoice-scoped portal link so the recipient can view/pay online.
      const PortalLink = base44.asServiceRole.entities.CustomerPortalLink;
      let portalUrl = "";
      const existing = await PortalLink.filter({ kind: "invoice", record_id: invoiceId }).catch(() => []);
      let link = (Array.isArray(existing) ? existing : []).find((l: any) => l?.id && l?.revoked !== true && (!l?.expires_at || Date.parse(String(l.expires_at)) > Date.now()));
      if (!link) {
        const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
        const key = `portal-link:invoice:${invoiceId}:email:${clean(body?.creation_request_key) || Date.now()}`.slice(0, 256);
        const created = await createFoundationRecordWithRecovery({
          entity: PortalLink,
          data: {
            creation_request_key: key,
            token,
            kind: "invoice",
            record_id: invoiceId,
            customer_id: clean(invoice.customer_id),
            label: `Invoice ${clean(invoice.invoice_number) || invoiceId}`,
            created_by: actor,
            // Per-link expiry override: caller may pass expires_days (clamped 1-365); default stays 90.
            expires_at: new Date(Date.now() + Math.min(365, Math.max(1, Math.floor(Number(body?.expires_days || 0)) || 90)) * 24 * 60 * 60 * 1000).toISOString(),
            revoked: false,
            open_count: 0,
          },
          readMatches: () => PortalLink.filter({ creation_request_key: key }),
          label: "Invoice portal link",
        });
        link = created.record;
      }
      if (portalBase && link?.token) portalUrl = `${portalBase}/customerportal?token=${encodeURIComponent(clean(link.token))}`;

      const invNum = clean(invoice.invoice_number) || "Invoice";
      const companyName = clean(body?.company_name) || "CCS Signage";
      const items = Array.isArray(invoice.line_items) ? invoice.line_items : [];
      const money = (n: any) => `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const rows = items.map((i: any) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${clean(i?.description || i?.name) || "Item"}${num(i?.quantity) > 1 ? ` × ${num(i.quantity)}` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${money(num(i?.quantity) * num(i?.unit_price))}</td></tr>`).join("");
      const subject = reminder
        ? `${companyName} — Payment reminder: ${invNum} (${daysPastDue} day${daysPastDue === 1 ? "" : "s"} past due, ${money(invoice.balance_due)} open)`
        : `${companyName} — ${invNum} ${num(invoice.balance_due) > 0 ? `(${money(invoice.balance_due)} due)` : ""}`;
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        ${reminder ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:16px"><p style="margin:0;font-weight:700;color:#b91c1c">Payment reminder</p><p style="margin:4px 0 0;font-size:13px;color:#7f1d1d">This invoice is ${daysPastDue} day${daysPastDue === 1 ? "" : "s"} past its due date. We'd appreciate payment at your earliest convenience — or a quick note so we know it's on the way.</p></div>` : ""}
        <h2 style="color:#1d4ed8;margin-bottom:4px">${companyName}</h2>
        <p style="margin-top:0;color:#64748b;font-size:13px">${invNum}${clean(invoice.issue_date) ? ` · issued ${clean(invoice.issue_date)}` : ""}${clean(invoice.due_date) ? ` · due ${clean(invoice.due_date)}` : ""}</p>
        ${rows ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">${rows}</table>` : ""}
        <table style="width:100%;font-size:14px;margin-top:8px">
          <tr><td style="color:#64748b">Total</td><td style="text-align:right;font-weight:600">${money(invoice.total)}</td></tr>
          <tr><td style="color:#64748b">Paid</td><td style="text-align:right;color:#059669">${money(num(invoice.total) - num(invoice.balance_due))}</td></tr>
          <tr><td style="color:#64748b;font-weight:600">Balance due</td><td style="text-align:right;font-weight:700;color:${num(invoice.balance_due) > 0 ? "#b91c1c" : "#059669"}">${money(invoice.balance_due)}</td></tr>
        </table>
        ${portalUrl ? `<p style="text-align:center;margin:28px 0"><a href="${portalUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">View invoice online</a></p>
        <p style="font-size:12px;color:#64748b;text-align:center">Your portal link is valid for 90 days — view the invoice, message us, or let us know a payment is on the way.</p>` : ""}
      </div>`;
      const sent = await base44.asServiceRole.functions
        .invoke("sendGmail", { to, subject, body: html, _workflow_capability: getWorkflowInvocationCapability("sendGmail") })
        .catch((e: any) => ({ data: { error: e?.message || String(e) } }));
      const sendResult = sent?.data || sent;
      if (sendResult?.error || sendResult?.success === false) {
        throw bad(`Invoice email could not be sent: ${sendResult?.error || "sendGmail failed"}`);
      }
      return Response.json({ success: true, action, sent_to: to, portal_url: portalUrl || undefined });
    }

    if (action === "email_statement") {
      let cid = clean(body?.customer_id);
      if (!cid && clean(body?.invoice_id)) {
        const inv = await Invoice.get(clean(body?.invoice_id)).catch(() => null);
        cid = clean(inv?.customer_id);
      }
      if (!cid) throw bad("customer_id or invoice_id is required.");
      const customer = await Customer.get(cid).catch(() => null);
      if (!customer?.id) throw bad("Customer not found.", 404);
      const to = clean(body?.email) || clean(customer?.email) || clean(customer?.contact_email) || clean(customer?.billing_email) || clean(customer?.billing_contact_email);
      if (!to.includes("@")) throw bad("This customer has no email address on file — add one to the customer record first.");
      const rows = await Invoice.filter({ customer_id: cid }).catch(() => []);
      const open = (Array.isArray(rows) ? rows : [])
        .filter((i: any) => OPEN_AR_STATUSES.has(clean(i?.status)) && num(i?.balance_due) > 0)
        .sort((a: any, b: any) => clean(a?.due_date).localeCompare(clean(b?.due_date)));
      if (!open.length) throw bad("This customer has no open balance — nothing to put on a statement.", 409);
      const today = new Date().toISOString().slice(0, 10);
      const total = open.reduce((s: number, i: any) => s + num(i?.balance_due), 0);
      const overdue = open.filter((i: any) => clean(i?.due_date) && clean(i?.due_date) < today);
      // Estimate-level subtotals: resolve the linked estimate for each open
      // invoice so the statement shows quote context, not just invoice numbers.
      const stmtEstimates = await Estimate.filter({ customer_id: cid }).catch(() => []);
      const estById = new Map((Array.isArray(stmtEstimates) ? stmtEstimates : []).map((e: any) => [clean(e?.id), e]));

      const portalBase = (String(Deno.env.get('PUBLIC_APP_URL') || 'https://clay-flow-signage-suite-387da97c.base44.app').replace(/\/+$/, ''));
      const PortalLink = base44.asServiceRole.entities.CustomerPortalLink;
      let portalUrl = "";
      const existing = await PortalLink.filter({ kind: "customer", record_id: cid }).catch(() => []);
      let link = (Array.isArray(existing) ? existing : []).find((l: any) => l?.id && l?.revoked !== true && (!l?.expires_at || Date.parse(String(l.expires_at)) > Date.now()));
      if (!link) {
        const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
        const key = `portal-link:customer:${cid}:statement:${clean(body?.creation_request_key) || Date.now()}`.slice(0, 256);
        const created = await createFoundationRecordWithRecovery({
          entity: PortalLink,
          data: {
            creation_request_key: key,
            token,
            kind: "customer",
            record_id: cid,
            customer_id: cid,
            label: `${clean(customer.company_name) || clean(customer.name) || "Customer"} portal`,
            created_by: actor,
            // Per-link expiry override: caller may pass expires_days (clamped 1-365); default stays 90.
            expires_at: new Date(Date.now() + Math.min(365, Math.max(1, Math.floor(Number(body?.expires_days || 0)) || 90)) * 24 * 60 * 60 * 1000).toISOString(),
            revoked: false,
            open_count: 0,
          },
          readMatches: () => PortalLink.filter({ creation_request_key: key }),
          label: "Customer portal link",
        });
        link = created.record;
      }
      if (portalBase && link?.token) portalUrl = `${portalBase}/customerportal?token=${encodeURIComponent(clean(link.token))}`;

      const companyName = clean(body?.company_name) || "CCS Signage";
      const money = (n: any) => `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const custName = clean(customer.company_name) || clean(customer.name) || "Customer";
      const stmtRows = open.map((i: any) => {
        const past = clean(i?.due_date) && clean(i?.due_date) < today;
        const est = estById.get(clean(i?.estimate_id));
        const estLabel = est ? `${clean(est?.estimate_number) || "Estimate"} (${money(est?.quote_total)})` : "";
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${clean(i?.invoice_number) || "Invoice"}${past ? ' <span style="color:#b91c1c;font-size:11px;font-weight:700">PAST DUE</span>' : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${estLabel}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${clean(i?.due_date) || "—"}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${money(i?.balance_due)}</td></tr>`;
      }).join("");
      const subject = `${companyName} — Account statement for ${custName} (${money(total)} open)`;
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        ${overdue.length ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:16px"><p style="margin:0;font-weight:700;color:#b91c1c">Your account has ${overdue.length} past-due invoice${overdue.length === 1 ? "" : "s"}</p><p style="margin:4px 0 0;font-size:13px;color:#7f1d1d">Please arrange payment at your earliest convenience — or reply so we know it is on the way.</p></div>` : ""}
        <h2 style="color:#1d4ed8;margin-bottom:4px">${companyName}</h2>
        <p style="margin-top:0;color:#64748b;font-size:13px">Account statement for ${custName} · as of ${today}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
          <tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:12px">INVOICE</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:12px">ESTIMATE</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:12px">DUE</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:12px">BALANCE</th></tr>
          ${stmtRows}
        </table>
        <table style="width:100%;font-size:14px;margin-top:8px">
          <tr><td style="color:#64748b;font-weight:600">Total open balance</td><td style="text-align:right;font-weight:700;color:${overdue.length ? "#b91c1c" : "#1e293b"}">${money(total)}</td></tr>
        </table>
        ${portalUrl ? `<p style="text-align:center;margin:28px 0"><a href="${portalUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">View your account online</a></p>
        <p style="font-size:12px;color:#64748b;text-align:center">Your portal link is valid for 90 days — view invoices, message us, or let us know a payment is on the way.</p>` : ""}
      </div>`;
      const sent = await base44.asServiceRole.functions
        .invoke("sendGmail", { to, subject, body: html, _workflow_capability: getWorkflowInvocationCapability("sendGmail") })
        .catch((e: any) => ({ data: { error: e?.message || String(e) } }));
      const sendResult = sent?.data || sent;
      if (sendResult?.error || sendResult?.success === false) {
        throw bad(`Statement email could not be sent: ${sendResult?.error || "sendGmail failed"}`);
      }
      return Response.json({ success: true, action, sent_to: to, open_invoices: open.length, open_total: money(total), portal_url: portalUrl || undefined });
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
