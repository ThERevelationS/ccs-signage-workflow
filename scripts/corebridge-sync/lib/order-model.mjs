const STATUS = {
  ESTIMATE: 'sent', 'DRAFT ESTIMATE': 'archived', DRAFT: 'archived',
  CANCELLED: 'cancelled', VOIDED: 'cancelled', WIP: 'approved',
  BUILT: 'approved', COMPLETED: 'approved', CLOSED: 'approved', INVOICED: 'approved',
};
const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value || 0);
const cents = (value) => Math.round(num(value) * 100);
const round2 = (value) => cents(value) / 100;
const day = (value) => value?.DateTimeOffset ? String(value.DateTimeOffset).slice(0, 10) : '';
const ts = (value) => value?.DateTimeOffset ? new Date(value.DateTimeOffset).toISOString() : '';
const ordered = (products) => [...(products || [])].sort((a, b) => num(a.LineItemOrder) - num(b.LineItemOrder));

export function sourceLine(product) {
  const total = Number(product.TotalPriceOverridden ?? product.TotalPrice ?? 0);
  if (total) return total;
  return num(product.TaxableAmount) + num(product.NonTaxableAmount) || num(product.CalculatedPartsTotalRetail);
}

export function estimateRecord(order, { contact, categories = new Map(), importedAt = new Date().toISOString() } = {}) {
  const h = order.header;
  const number = h.InvoiceNumber || h.EstimateNumber || (text(order.title).match(/#\s*([A-Z]+-\d+)/) || [])[1] || '';
  const status = STATUS[h.OrderStatus] || 'archived';
  const products = ordered(order.products);
  const subtotal = products.reduce((sum, product) => sum + sourceLine(product), 0);
  const total = num(h.TotalPrice);
  const fees = total ? num(h.ShippingAmount) + num(h.PostageAmount) : 0;
  const tax = num(h.TaxesPrice);
  const taxBase = num(h.TaxableAmount) + num(h.NonTaxableAmount);
  const cbSubtotal = taxBase > 0 && taxBase < num(h.SubTotalPrice) - 0.005 ? taxBase : num(h.SubTotalPrice);
  const discount = subtotal > 0 && cbSubtotal > 0 && cbSubtotal < subtotal - 0.005
    ? ((subtotal - cbSubtotal) / subtotal) * 100 : 0;
  const afterDiscount = subtotal * (1 - discount / 100);
  const taxPercent = afterDiscount + fees > 0 ? tax / (afterDiscount + fees) * 100 : 0;
  const notes = [
    `CoreBridge ${number || 'order'} (OrderId ${order.order_id}) — imported read-only history ${importedAt.slice(0, 10)}.`,
    `CoreBridge status: ${h.OrderStatus}${h.EstimateCancelledDate ? `; cancelled ${day(h.EstimateCancelledDate)}` : ''}. Entered by ${h.EnteredByUserName || '?'}.`,
    `Totals: subtotal $${round2(h.SubTotalPrice)} · tax $${round2(tax)} (rate ${round2(num(h.SalesTaxRate) * 100)}%) · total $${round2(total)} · balance due $${round2(h.BalanceDue)}.`,
    order.notes_text ? `Order notes${order.notes_important ? ' (IMPORTANT)' : ''}:\n${order.notes_text}` : '',
  ].filter(Boolean);
  const row = {
    __source_id__: String(order.order_id), project_name: (h.Description || number || 'CoreBridge order').slice(0, 300),
    estimate_number: number, client_name: h.CompanyName || '', customer_id: String(h.AccountId || ''),
    contact_name: contact ? `${contact.FirstName || ''} ${contact.LastName || ''}`.trim() : '',
    contact_email: contact?.Email || '', contact_phone: contact?.PrimaryPhoneNumber || '',
    salesperson: h.PrimarySalesPersonName || '', sales_center: h.SalesCenterName || '', po_number: h.PoNumber || '',
    status, tax_percent: Math.round(taxPercent * 10000) / 10000,
    quote_total: round2(total), total_cost: round2(total), shipping_fee: total ? round2(fees) : 0,
    discount_percent: Math.round(discount * 10000) / 10000,
    quote_issue_date: day(h.EstimateCreatedDate) || day(h.CreatedDate), target_install_date: day(h.DueDate),
    accepted_at: status === 'approved' ? (ts(h.OrderCreatedDate) || ts(h.CreatedDate)) : '',
    site_address: [h.ShippingAddressStreet1, h.ShippingAddressStreet2, h.ShippingAddressCity, h.ShippingAddressState, h.ShippingAddressZip].filter(Boolean).join(', '),
    tags: 'corebridge_import', notes: notes.join('\n\n'),
  };
  const lines = products.map((p, i) => ({
    line_id: `cb-${p.Id}`, builder_name: (p.Description || `Product ${i + 1}`).slice(0, 300),
    client_product_name: (p.Description || '').slice(0, 300), product_category: categories.get(p.ProductCategoryId) || '',
    customer_description: [p.ProductSummary, p.Qty ? `Qty ${p.Qty}` : ''].filter(Boolean).join(' · '),
    customer_quantity: 1, total_snapshot: round2(sourceLine(p)), live_total_snapshot: round2(sourceLine(p)),
    include_in_customer: true, section_status: p.OrderProductStatusCbText || '',
    product_notes: [`CoreBridge product ${p.Id} · status ${p.OrderProductStatusCbText || p.Status} · qty ${p.Qty}`,
      p.DesignNotes ? `Design notes: ${p.DesignNotes}` : '', p.ProductionNotes ? `Production notes: ${p.ProductionNotes}` : '',
      p.ProofFileName ? `Proof: ${p.ProofFileName}` : ''].filter(Boolean).join('\n'),
  }));
  if (order.detail_text && lines.length) lines[0].product_notes += `\n\nCoreBridge order detail (parts · price · cost · margin):\n${order.detail_text.slice(0, 20000)}`;
  return { row, lines };
}

export function invoiceLines(products) {
  return ordered(products).flatMap((p, index) => {
    const description = text(p.Description) || `Product ${index + 1}`;
    const tax = num(p.TaxableAmount);
    const nonTax = num(p.NonTaxableAmount);
    if (tax > 0 && nonTax > 0) {
      const label = `${description} — qty ${p.Qty ?? 1}`;
      return [
        { description: `${label} (taxable portion)`, quantity: 1, unit_price: tax, taxable: true },
        { description: `${label} (non-taxable portion)`, quantity: 1, unit_price: nonTax, taxable: false },
      ];
    }
    return [{ description, quantity: 1, unit_price: round2(sourceLine(p)), taxable: tax > 0 }];
  });
}

export function invoiceDate(value) {
  if (!value) return '';
  const raw = text(typeof value === 'object' ? value.DateTimeOffset : value);
  const iso = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const ms = raw.match(/^\/Date\((-?\d+)/);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const match = text(typeof value === 'object' ? value.DisplayDate : '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : '';
}

const address = (h, prefix) => [h[`${prefix}AddressStreet1`], h[`${prefix}AddressStreet2`], h[`${prefix}AddressCity`], h[`${prefix}AddressState`], h[`${prefix}AddressZip`], h[`${prefix}AddressCountry`]].filter(Boolean).join(', ');

export function invoiceRecord(order, link, transactions, importedAt, batchId = 'cb-invoices-2026-11-17') {
  const h = order.header, id = text(order.order_id), total = num(h.TotalPrice), balance = num(h.BalanceDue);
  const orderStatus = text(h.OrderStatus).toUpperCase();
  const voided = ['VOIDED', 'CANCELLED'].includes(orderStatus);
  const paid = voided ? [...transactions.payments, ...transactions.refunds].reduce((sum, row) => sum + cents(row.Amount), 0) / 100 : round2(total - balance);
  const fullyPaid = !voided && balance <= 0.005;
  const status = voided ? 'void' : fullyPaid ? 'paid' : paid > 0 ? 'partially_paid' : ['WIP', 'BUILT'].includes(orderStatus) ? 'draft' : 'sent';
  const created = invoiceDate(h.CreatedDate);
  const paymentDates = transactions.payments.map((p) => invoiceDate(p.CreatedDate)).filter(Boolean).sort();
  const data = {
    creation_request_key: `cb:invoice:${id}`, invoice_number: text(h.InvoiceNumber), customer_id: link.customer_id,
    estimate_id: link.estimate_id, work_order_id: link.work_order_ids.length === 1 ? link.work_order_ids[0] : '',
    customer_display_name: text(h.CompanyName), salesperson: text(h.PrimarySalesPersonName), entered_by: text(h.EnteredByUserName),
    subtotal: num(h.SubTotalPrice), tax_rate: num(h.SalesTaxRate), tax_amount: num(h.TaxesPrice),
    total, balance_due: voided ? 0 : balance, amount_paid: paid, issue_date: created, due_date: '', terms: '',
    status, billing_type: 'standard', line_items: invoiceLines(order.products),
    notes: `Imported from CoreBridge order ${id} (${text(h.InvoiceNumber)}, status ${text(h.OrderStatus)}). Entered by ${text(h.EnteredByUserName)} on ${created}. PO: ${text(h.PoNumber)}.`,
    internal_notes: [text(h.Description), h.DueDate ? `Production due: ${text(h.DueDate?.DisplayDate) || invoiceDate(h.DueDate)}` : '',
      num(h.ShippingAmount) ? `Shipping: ${h.ShippingAmount}` : '', num(h.PostageAmount) ? `Postage: ${h.PostageAmount}` : '',
      address(h, 'Billing') ? `Billing: ${address(h, 'Billing')}` : '', address(h, 'Shipping') ? `Shipping: ${address(h, 'Shipping')}` : ''].filter(Boolean).join('\n'),
    source_summary: { source: 'corebridge', order_id: id, invoice_number: text(h.InvoiceNumber), order_status: text(h.OrderStatus), account_id: h.AccountId, batch_id: batchId, imported_at: importedAt },
  };
  if (voided) { data.voided_date = invoiceDate(h.ModifiedDate); data.void_reason = 'Voided in CoreBridge'; }
  if (fullyPaid) data.paid_date = paymentDates.at(-1) || invoiceDate(h.ModifiedDate);
  return data;
}

export function paymentRecord(row, invoice, isRefund, refundedCents = 0) {
  const method = { Check: 'check', Visa: 'card', MasterCard: 'card', AMEX: 'card', Discover: 'card',
    ACH: 'ach', Cash: 'cash', CustomerCredit: 'credit_memo', BadDebt: 'other', Other: 'other' }[text(row.Type)] || 'other';
  const refunded = refundedCents / 100;
  return {
    creation_request_key: `cb:${isRefund ? 'refund' : 'payment'}:${text(row.Id)}`,
    customer_id: invoice.customer_id, estimate_id: invoice.estimate_id, work_order_id: invoice.work_order_id,
    amount: num(row.Amount), method, reference_number: text(row.CheckNumber || row.MasterTransactionPaymentNumber),
    paid_date: invoiceDate(row.CreatedDate), status: isRefund ? 'refunded' : refunded > 0 && refunded >= num(row.Amount) - 0.005 ? 'refunded' : 'recorded',
    ...(!isRefund ? { refunded_amount: refunded } : {}),
    notes: `CoreBridge payment ${text(row.PaymentNumber)} (${text(row.TypeLong)}) entered by ${text(row.UpdatedByUserCompleteName)}: ${text(row.Notes)}`,
    gl_memo: `CoreBridge historical${text(row.Type) === 'BadDebt' ? ' — bad debt write-off' : ''}`,
  };
}
