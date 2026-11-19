import { readFileSync, writeFileSync, appendFileSync, existsSync, renameSync, createReadStream, openSync, closeSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';

const DIR = 'imports/corebridge-2026-11-16/';
const PLAN = '.audit-work/cb-inv-plan.json';
const STATE = '.audit-work/cb-inv-state.json';
const AMBIGUOUS = '.audit-work/cb-inv-ambiguous.jsonl';
const BATCH = 'cb-invoices-2026-11-17';
const BASE = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const mode = process.argv[2] || 'plan';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value || 0);
const cents = (value) => Math.round(num(value) * 100);
const round2 = (value) => cents(value) / 100;
const date = (value) => {
  if (!value) return '';
  const raw = text(typeof value === 'object' ? value.DateTimeOffset : value);
  const iso = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const ms = raw.match(/^\/Date\((-?\d+)/);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const display = text(typeof value === 'object' ? value.DisplayDate : '');
  const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : '';
};
const displayDate = (value) => text(value?.DisplayDate) || date(value);
const jsonl = async function* (path) {
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) if (line.trim()) yield JSON.parse(line);
};
const atomic = (path, value) => {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${path}.tmp`, path);
};
let token = '';
async function raw(fn, payload) {
  const response = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, ...(token ? { session_token: token } : {}) }),
    signal: AbortSignal.timeout(120000),
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body: body.data || body };
}
async function login() {
  const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
  const response = await raw('verifyLogin', { username: credentials.user, password: credentials.pass });
  if (response.status !== 200 || !response.body.token) throw new Error(`Staff login failed: HTTP ${response.status}`);
  token = response.body.token;
}
async function readAction(payload) {
  for (let attempt = 0; ; attempt++) {
    const response = await raw('corebridgeHistoryImport', payload);
    if (response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
    if (response.status !== 200 || !response.body.success) throw new Error(`${payload.action}: HTTP ${response.status} ${response.body.error || ''}`);
    return response.body;
  }
}
const method = (value) => ({
  Check: 'check', Visa: 'card', MasterCard: 'card', AMEX: 'card', Discover: 'card',
  ACH: 'ach', Cash: 'cash', CustomerCredit: 'credit_memo', BadDebt: 'other', Other: 'other',
})[text(value)] || 'other';
const sourceLine = (product) => {
  const price = Number(product.TotalPriceOverridden ?? product.TotalPrice ?? 0);
  if (price) return round2(price);
  return round2(num(product.TaxableAmount) + num(product.NonTaxableAmount) || num(product.CalculatedPartsTotalRetail));
};
function invoiceLines(products) {
  return [...(products || [])].sort((a, b) => num(a.LineItemOrder) - num(b.LineItemOrder)).flatMap((p, index) => {
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
    return [{ description, quantity: 1, unit_price: sourceLine(p), taxable: tax > 0 }];
  });
}
const address = (h, prefix) => [h[`${prefix}AddressStreet1`], h[`${prefix}AddressStreet2`], h[`${prefix}AddressCity`], h[`${prefix}AddressState`], h[`${prefix}AddressZip`], h[`${prefix}AddressCountry`]].filter(Boolean).join(', ');
function invoiceRecord(order, link, transactions, importedAt) {
  const h = order.header;
  const id = text(order.order_id);
  const total = num(h.TotalPrice);
  const balance = num(h.BalanceDue);
  const orderStatus = text(h.OrderStatus).toUpperCase();
  const voided = ['VOIDED', 'CANCELLED'].includes(orderStatus);
  const netCents = [...transactions.payments, ...transactions.refunds].reduce((sum, row) => sum + cents(row.Amount), 0);
  const paid = voided ? netCents / 100 : round2(total - balance);
  const fullyPaid = !voided && balance <= 0.005;
  const status = voided ? 'void' : fullyPaid ? 'paid' : paid > 0 ? 'partially_paid' : ['WIP', 'BUILT'].includes(orderStatus) ? 'draft' : 'sent';
  const created = date(h.CreatedDate);
  const paymentDates = transactions.payments.map((p) => date(p.CreatedDate)).filter(Boolean).sort();
  const data = {
    creation_request_key: `cb:invoice:${id}`,
    invoice_number: text(h.InvoiceNumber),
    customer_id: link.customer_id,
    estimate_id: link.estimate_id,
    work_order_id: link.work_order_ids.length === 1 ? link.work_order_ids[0] : '',
    customer_display_name: text(h.CompanyName),
    salesperson: text(h.PrimarySalesPersonName),
    entered_by: text(h.EnteredByUserName),
    subtotal: num(h.SubTotalPrice), tax_rate: num(h.SalesTaxRate), tax_amount: num(h.TaxesPrice),
    total, balance_due: voided ? 0 : balance, amount_paid: paid, issue_date: created, due_date: '', terms: '',
    status, billing_type: 'standard',
    line_items: invoiceLines(order.products),
    notes: `Imported from CoreBridge order ${id} (${text(h.InvoiceNumber)}, status ${text(h.OrderStatus)}). Entered by ${text(h.EnteredByUserName)} on ${created}. PO: ${text(h.PoNumber)}.`,
    internal_notes: [
      text(h.Description), h.DueDate ? `Production due: ${displayDate(h.DueDate)}` : '',
      num(h.ShippingAmount) ? `Shipping: ${h.ShippingAmount}` : '',
      num(h.PostageAmount) ? `Postage: ${h.PostageAmount}` : '',
      address(h, 'Billing') ? `Billing: ${address(h, 'Billing')}` : '',
      address(h, 'Shipping') ? `Shipping: ${address(h, 'Shipping')}` : '',
    ].filter(Boolean).join('\n'),
    source_summary: { source: 'corebridge', order_id: id, invoice_number: text(h.InvoiceNumber), order_status: text(h.OrderStatus), account_id: h.AccountId, batch_id: BATCH, imported_at: importedAt },
  };
  if (voided) { data.voided_date = date(h.ModifiedDate); data.void_reason = 'Voided in CoreBridge'; }
  if (fullyPaid) data.paid_date = paymentDates.at(-1) || date(h.ModifiedDate);
  return data;
}
function paymentRecord(row, invoice, isRefund, refundedCents) {
  const source = text(row.Id);
  const refunded = (refundedCents || 0) / 100;
  return {
    creation_request_key: `cb:${isRefund ? 'refund' : 'payment'}:${source}`,
    customer_id: invoice.customer_id, estimate_id: invoice.estimate_id, work_order_id: invoice.work_order_id,
    amount: num(row.Amount), method: method(row.Type),
    reference_number: text(row.CheckNumber || row.MasterTransactionPaymentNumber),
    paid_date: date(row.CreatedDate),
    status: isRefund ? 'refunded' : refunded > 0 && refunded >= num(row.Amount) - 0.005 ? 'refunded' : 'recorded',
    ...(!isRefund ? { refunded_amount: refunded } : {}),
    notes: `CoreBridge payment ${text(row.PaymentNumber)} (${text(row.TypeLong)}) entered by ${text(row.UpdatedByUserCompleteName)}: ${text(row.Notes)}`,
    gl_memo: `CoreBridge historical${text(row.Type) === 'BadDebt' ? ' — bad debt write-off' : ''}`,
  };
}

async function makePlan() {
  const done = new Map();
  for await (const row of jsonl(`${DIR}estimate-lines-done.jsonl`)) {
    const key = text(row.source_id);
    if (done.has(key) && done.get(key) !== row.target_id) throw new Error('Conflicting estimate mapping in source log.');
    done.set(key, text(row.target_id));
  }
  const orders = [];
  for await (const row of jsonl(`${DIR}orders/orders.jsonl`)) if (text(row.header?.InvoiceNumber)) orders.push(row);
  const ids = new Set(orders.map((order) => text(order.order_id)));
  if (ids.size !== orders.length) throw new Error('Duplicate archive order ids.');
  const pass2 = new Map();
  for await (const row of jsonl(`${DIR}orders/orders-pass2.jsonl`)) if (ids.has(text(row.order_id))) {
    const id = text(row.order_id);
    if (pass2.has(id)) throw new Error('Duplicate pass2 order ids.');
    pass2.set(id, row);
  }
  if (pass2.size !== orders.length) throw new Error(`Missing pass2 records: ${orders.length - pass2.size}`);
  const estimateIds = [...new Set(orders.map((order) => done.get(text(order.order_id))).filter(Boolean))];
  const links = new Map();
  for (let i = 0; i < estimateIds.length; i += 50) {
    const start = Date.now();
    const response = await readAction({ action: 'lookup_links', estimate_ids: estimateIds.slice(i, i + 50) });
    for (const link of response.links) links.set(link.estimate_id, link);
    if (response.links.length !== estimateIds.slice(i, i + 50).length) throw new Error('Incomplete estimate link lookup.');
    if (i + 50 < estimateIds.length) await sleep(Math.max(0, 1600 - (Date.now() - start)));
  }
  const missingCustomers = [], invoiceDiffs = [], lineDiffs = [], missingParents = [], ambiguousWorkOrders = [];
  const importedAt = new Date().toISOString();
  const invoices = [], payments = [], refunds = [], byPayment = new Map(), allTransactions = new Set();
  for (const order of orders) {
    const orderId = text(order.order_id);
    const link = links.get(done.get(orderId));
    if (!link?.customer_id) { missingCustomers.push({ order_id: orderId, estimate_id: done.get(orderId) || '', invoice_number: text(order.header.InvoiceNumber) }); continue; }
    if (link.work_order_ids.length > 1) ambiguousWorkOrders.push({ order_id: orderId, count: link.work_order_ids.length });
    const tx = pass2.get(orderId);
    tx.payments ||= [];
    tx.refunds ||= [];
    const data = invoiceRecord(order, link, tx, importedAt);
    const net = [...tx.payments, ...tx.refunds].reduce((sum, p) => sum + cents(p.Amount), 0);
    if (Math.abs(net - cents(data.amount_paid)) > 1) invoiceDiffs.push({ order_id: orderId, invoice_number: data.invoice_number, amount_paid: data.amount_paid, net_transactions: net / 100, diff: (net - cents(data.amount_paid)) / 100 });
    const lineTotal = data.line_items.reduce((sum, line) => sum + cents(line.unit_price), 0);
    const taxable = data.line_items.filter((line) => line.taxable).reduce((sum, line) => sum + cents(line.unit_price), 0);
    const subtotalDiff = lineTotal - cents(order.header.SubTotalPrice);
    const taxableDiff = taxable - cents(order.header.TaxableAmount);
    if (Math.abs(subtotalDiff) > 1 || Math.abs(taxableDiff) > 1) lineDiffs.push({ order_id: orderId, subtotal_diff: subtotalDiff / 100, taxable_diff: taxableDiff / 100 });
    invoices.push({ source_entity: 'invoices', source_id: orderId, data });
    for (const p of tx.payments) {
      const id = text(p.Id);
      if (!id || allTransactions.has(id)) throw new Error('Missing or duplicate payment/refund source id.');
      allTransactions.add(id);
      const entry = { source_entity: 'payments', source_id: id, order_id: orderId, source: p, data: null };
      payments.push(entry);
      byPayment.set(id, entry);
    }
    for (const p of tx.refunds) {
      const id = text(p.Id);
      if (!id || allTransactions.has(id)) throw new Error('Missing or duplicate payment/refund source id.');
      allTransactions.add(id);
      const refs = [...new Set((p.OrderPaymentRefundInfos || []).map((x) => text(x.TransactionToRefundId)).filter(Boolean))];
      refunds.push({ source_entity: 'refunds', source_id: id, order_id: orderId, parent_source_id: refs.length === 1 ? refs[0] : '', source: p, data: null });
    }
  }
  const invoiceIndex = new Map(invoices.map((invoice) => [invoice.source_id, invoice.data]));
  const refundedByPayment = new Map();
  for (const refund of refunds) {
    const parent = byPayment.get(refund.parent_source_id);
    if (!parent || parent.order_id !== refund.order_id) { missingParents.push({ refund_id: refund.source_id, parent_source_id: refund.parent_source_id }); continue; }
    refundedByPayment.set(parent.source_id, (refundedByPayment.get(parent.source_id) || 0) + Math.abs(cents(refund.source.Amount)));
  }
  for (const payment of payments) {
    payment.data = paymentRecord(payment.source, invoiceIndex.get(payment.order_id), false, refundedByPayment.get(payment.source_id));
    delete payment.source;
  }
  for (const refund of refunds) {
    refund.data = paymentRecord(refund.source, invoiceIndex.get(refund.order_id), true, 0);
    delete refund.source;
  }
  const totalPaymentCents = [...payments, ...refunds].reduce((sum, p) => sum + cents(p.data.amount), 0);
  const batch = {
    source_entity: 'reconciliation_batches', source_id: 'historical',
    data: {
      creation_request_key: 'cb:reconciliation-batch:historical', batch_number: 'CB-HISTORICAL',
      name: 'CoreBridge historical payments (pre-migration)', status: 'closed', closed_at: importedAt,
      collected_total: totalPaymentCents / 100, expected_total: totalPaymentCents / 100,
      expected_amount: totalPaymentCents / 100, collected_amount: totalPaymentCents / 100,
      adjustments_amount: 0, cash_adjustment: 0, variance: 0, variance_amount: 0,
      payment_count: payments.length + refunds.length,
      notes: 'Historical CoreBridge payments and refunds are grouped here so they do not appear as undeposited.',
    },
  };
  const statusCounts = {};
  for (const invoice of invoices) statusCounts[invoice.data.status] = (statusCounts[invoice.data.status] || 0) + 1;
  const archivePayments = [...pass2.values()].flatMap((row) => row.payments || []);
  const archiveRefunds = [...pass2.values()].flatMap((row) => row.refunds || []);
  const knownMethods = new Set(['Check', 'Visa', 'MasterCard', 'AMEX', 'Discover', 'ACH', 'Cash', 'CustomerCredit', 'BadDebt', 'Other']);
  const unknownMethods = {};
  for (const row of [...archivePayments, ...archiveRefunds]) {
    const value = text(row.Type);
    if (!knownMethods.has(value)) unknownMethods[value || '(blank)'] = (unknownMethods[value || '(blank)'] || 0) + 1;
  }
  const summary = {
    archive_invoices: orders.length, invoices: invoices.length, payments: payments.length, refunds: refunds.length,
    archive_payments: archivePayments.length, archive_refunds: archiveRefunds.length,
    archive_payment_total: archivePayments.reduce((sum, row) => sum + cents(row.Amount), 0) / 100,
    archive_refund_total: archiveRefunds.reduce((sum, row) => sum + cents(row.Amount), 0) / 100,
    unknown_methods: unknownMethods,
    unresolved_customers: missingCustomers.length, missing_refund_parents: missingParents.length,
    ambiguous_work_orders: ambiguousWorkOrders.length, amount_paid_diffs: invoiceDiffs.length, line_diffs: lineDiffs.length,
    statuses: statusCounts,
    archive_invoice_total: orders.reduce((sum, row) => sum + cents(row.header.TotalPrice), 0) / 100,
    invoice_total: invoices.reduce((sum, row) => sum + cents(row.data.total), 0) / 100,
    payment_total: payments.reduce((sum, row) => sum + cents(row.data.amount), 0) / 100,
    refund_total: refunds.reduce((sum, row) => sum + cents(row.data.amount), 0) / 100,
  };
  const plan = { batch_id: BATCH, generated_at: importedAt, summary, missing_customers: missingCustomers, missing_parents: missingParents, ambiguous_work_orders: ambiguousWorkOrders, amount_paid_diffs: invoiceDiffs, line_diffs: lineDiffs, batch, invoices, payments, refunds };
  atomic(PLAN, plan);
  console.log(JSON.stringify(summary, null, 2));
  if (missingParents.length) throw new Error('Refund parent links unresolved; inspect plan before applying.');
  if (Object.keys(unknownMethods).length) throw new Error('Unmapped payment methods; inspect plan before applying.');
}

const newState = () => ({ batch_id: BATCH, ids: { Invoice: {}, Payment: {}, ReconciliationBatch: {} }, ambiguous: [], pending: null, last_write_started_at: 0, apply_ended_at: 0, backfill_count: 0 });
function loadState() {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : newState();
  if (state.batch_id !== BATCH) throw new Error('State batch mismatch.');
  if (state.pending) {
    markAmbiguous(state, state.pending);
    state.pending = null;
    state.apply_ended_at = Date.now();
    atomic(STATE, state);
  }
  return state;
}
function markAmbiguous(state, item) {
  for (const row of item.rows) {
    const entry = { entity: item.entity, action: item.action, row, at: new Date().toISOString() };
    if (!state.ambiguous.some((x) => x.entity === entry.entity && x.action === entry.action && text(x.row.source_id || x.row.id) === text(row.source_id || row.id))) {
      state.ambiguous.push(entry);
      appendFileSync(AMBIGUOUS, `${JSON.stringify(entry)}\n`);
    }
  }
}
async function pacedWrite(state, payload) {
  const rows = payload.rows;
  const delay = state.last_write_started_at + 16000 - Date.now();
  if (delay > 0) await sleep(delay);
  const pending = { entity: payload.entity, action: payload.action, rows, started_at: Date.now() };
  state.pending = pending;
  state.last_write_started_at = pending.started_at;
  atomic(STATE, state);
  let response;
  try {
    for (let attempt = 0; ; attempt++) {
      response = await raw('corebridgeHistoryImport', payload);
      if (response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
      break;
    }
  } catch (error) {
    markAmbiguous(state, pending);
    state.pending = null;
    atomic(STATE, state);
    if (error?.cause?.code === 'ECONNREFUSED') throw new Error('Connection refused; write outcome recorded as ambiguous, stopping.');
    return { ambiguous: rows.length, results: [] };
  }
  if (response.status >= 500) {
    markAmbiguous(state, pending);
    state.pending = null;
    atomic(STATE, state);
    return { ambiguous: rows.length, results: [] };
  }
  if (response.status !== 200 || !response.body.success) {
    state.pending = null;
    atomic(STATE, state);
    throw new Error(`${payload.action}: HTTP ${response.status} ${response.body.error || ''}`);
  }
  const results = response.body.results;
  if (!Array.isArray(results) || results.length !== rows.length) {
    markAmbiguous(state, pending);
    state.pending = null;
    atomic(STATE, state);
    throw new Error('Incomplete write response; outcomes recorded as ambiguous.');
  }
  let ambiguous = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const result = results[i];
    if (result.status === 'error') {
      if (result.ambiguous || payload.action === 'update_rows') { markAmbiguous(state, { ...pending, rows: [rows[i]] }); ambiguous++; }
      else errors.push({ source_id: rows[i].source_id || rows[i].id, error: result.error });
    } else if (payload.action === 'write_rows') {
      if (!result.target_id) throw new Error('Write response omitted target_id.');
      state.ids[payload.entity][rows[i].source_id] = result.target_id;
    }
  }
  state.pending = null;
  atomic(STATE, state);
  if (errors.length) throw new Error(`Definite row errors: ${JSON.stringify(errors).slice(0, 800)}`);
  return { ambiguous, results };
}
const unsettled = (state, entity, sourceId) => state.ambiguous.some((x) => x.action === 'write_rows' && x.entity === entity && x.row.source_id === sourceId);
function hydrate(entry, state) {
  const invoiceId = state.ids.Invoice[entry.order_id];
  const batchId = state.ids.ReconciliationBatch.historical;
  if (!invoiceId || !batchId) return null;
  const data = { ...entry.data, invoice_id: invoiceId, reconciliation_batch_id: batchId };
  if (entry.source_entity === 'refunds') {
    data.refund_of_payment_id = state.ids.Payment[entry.parent_source_id];
    if (!data.refund_of_payment_id) return null;
  }
  return { source_entity: entry.source_entity, source_id: entry.source_id, data };
}
async function writeEntries(state, entity, entries) {
  let submitted = 0, ambiguous = 0;
  for (let i = 0; i < entries.length; i += 20) {
    const rows = entries.slice(i, i + 20);
    if (!rows.length) continue;
    const result = await pacedWrite(state, { action: 'write_rows', entity, batch_id: BATCH, rows });
    submitted += rows.length;
    ambiguous += result.ambiguous;
    console.log(JSON.stringify({ entity, submitted, total: entries.length, ambiguous: state.ambiguous.length }));
  }
  return ambiguous;
}
async function backfill(state, paymentIds, plan) {
  const ids = [...new Set(paymentIds)];
  const batchId = state.ids.ReconciliationBatch.historical;
  if (!batchId) throw new Error('Historical batch is not available.');
  const set = { payment_ids: ids };
  if (ids.length === plan.payments.length + plan.refunds.length) {
    for (const field of ['collected_total', 'expected_total', 'expected_amount', 'collected_amount', 'adjustments_amount', 'cash_adjustment', 'variance', 'variance_amount', 'payment_count']) {
      set[field] = plan.batch.data[field];
    }
  }
  const result = await pacedWrite(state, { action: 'update_rows', entity: 'ReconciliationBatch', rows: [{ id: batchId, set }] });
  if (result.ambiguous) throw new Error('Batch payment_ids update ambiguous; reconcile before proceeding.');
  const checked = await readAction({ action: 'get_rows', entity: 'ReconciliationBatch', ids: [batchId] });
  const item = checked.results[0]?.item;
  const differences = [];
  diffValue('set', set, item, differences);
  if (!item || differences.length) throw new Error('Batch update readback mismatch.');
  state.backfill_count = ids.length;
  atomic(STATE, state);
}
function plannedPaymentRows(plan, state, orderIds) {
  return [...plan.payments, ...plan.refunds].filter((entry) => orderIds.has(entry.order_id))
    .map((entry) => ({ entry, row: hydrate(entry, state) }));
}
function diffValue(path, expected, actual, diffs) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) { diffs.push({ path, expected, actual }); return; }
    expected.forEach((value, i) => diffValue(`${path}[${i}]`, value, actual[i], diffs));
  } else if (expected && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) diffValue(`${path}.${key}`, value, actual?.[key], diffs);
  } else if (expected !== actual) diffs.push({ path, expected, actual });
}
async function pilotReadback(plan, state, orderIds) {
  const groups = [
    { entity: 'Invoice', rows: plan.invoices.filter((entry) => orderIds.has(entry.source_id)) },
    { entity: 'Payment', rows: plannedPaymentRows(plan, state, orderIds).map((x) => x.row).filter(Boolean) },
  ];
  const report = { compared: { Invoice: 0, Payment: 0 }, differences: [] };
  for (const group of groups) {
    for (let i = 0; i < group.rows.length; i += 50) {
      const chunk = group.rows.slice(i, i + 50);
      const ids = chunk.map((row) => state.ids[group.entity][row.source_id]);
      if (ids.some((id) => !id)) throw new Error('Pilot row missing a target id.');
      const result = await readAction({ action: 'get_rows', entity: group.entity, ids });
      for (let j = 0; j < chunk.length; j++) {
        const actual = result.results[j]?.item;
        if (!actual) { report.differences.push({ entity: group.entity, source_id: chunk[j].source_id, error: result.results[j]?.error || 'missing' }); continue; }
        const differences = [];
        diffValue('data', chunk[j].data, actual, differences);
        if (differences.length) report.differences.push({ entity: group.entity, source_id: chunk[j].source_id, differences });
        report.compared[group.entity]++;
      }
    }
  }
  atomic('.audit-work/cb-inv-pilot-readback.json', report);
  console.log(JSON.stringify({ pilot_compared: report.compared, pilot_rows_with_differences: report.differences.length }));
  if (report.differences.length) throw new Error('Pilot readback differs from plan; inspect report before continuing.');
}
function selectInvoices(plan, limit) {
  if (!Number.isFinite(limit)) return plan.invoices;
  const picked = [];
  const add = (row) => {
    if (row && picked.length < limit && !picked.some((item) => item.source_id === row.source_id)) picked.push(row);
  };
  const refundedOrders = new Set(plan.refunds.map((row) => row.order_id));
  add(plan.invoices.find((row) => refundedOrders.has(row.source_id)));
  add(plan.invoices.find((row) => row.data.line_items.some((line) => line.description.includes('(taxable portion)'))));
  add(plan.invoices.find((row) => row.data.status === 'void'));
  add(plan.invoices.find((row) => row.data.status === 'partially_paid'));
  for (const row of plan.invoices) add(row);
  return picked;
}
async function apply(plan, state, limit) {
  if (plan.missing_parents.length) throw new Error('Unresolved refund parents.');
  if (!state.ids.ReconciliationBatch.historical && !unsettled(state, 'ReconciliationBatch', 'historical')) {
    await writeEntries(state, 'ReconciliationBatch', [plan.batch]);
  }
  if (!state.ids.ReconciliationBatch.historical) throw new Error('Historical batch unresolved; reconcile before continuing.');
  const selected = selectInvoices(plan, limit);
  const orderIds = new Set(selected.map((row) => row.source_id));
  await writeEntries(state, 'Invoice', selected.filter((row) => !state.ids.Invoice[row.source_id] && !unsettled(state, 'Invoice', row.source_id)));
  for (const sourceEntity of ['payments', 'refunds']) {
    const source = plan[sourceEntity].filter((row) => orderIds.has(row.order_id));
    const ready = source.filter((row) => !state.ids.Payment[row.source_id] && !unsettled(state, 'Payment', row.source_id))
      .map((row) => hydrate(row, state)).filter(Boolean);
    await writeEntries(state, 'Payment', ready);
  }
  const allCreatedPaymentIds = [...plan.payments, ...plan.refunds].map((entry) => state.ids.Payment[entry.source_id]).filter(Boolean);
  if (!state.ambiguous.some((entry) => entry.action === 'update_rows')) await backfill(state, allCreatedPaymentIds, plan);
  const missingInvoices = selected.filter((entry) => !state.ids.Invoice[entry.source_id]).length;
  const missingPayments = plannedPaymentRows(plan, state, orderIds).filter(({ entry }) => !state.ids.Payment[entry.source_id]).length;
  console.log(JSON.stringify({ apply_invoices: selected.length, missing_invoices: missingInvoices, missing_payments: missingPayments, ambiguous: state.ambiguous.length, batch_payment_ids: state.backfill_count }));
  if (Number.isFinite(limit)) {
    if (missingInvoices || missingPayments || state.ambiguous.length) throw new Error('Pilot has unresolved records.');
    await pilotReadback(plan, state, orderIds);
  }
}

async function correctVoids(plan, state) {
  if (state.pending || state.ambiguous.some((entry) => entry.action === 'update_rows')) throw new Error('Resolve ambiguous updates before correcting void invoices.');
  const reportPath = '.audit-work/cb-inv-void-corrections.json';
  let report;
  if (existsSync(reportPath)) {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } else {
    const wanted = new Set([
      ...Object.keys(state.ids.Invoice),
      ...state.ambiguous.filter((entry) => entry.entity === 'Invoice' && entry.action === 'write_rows').map((entry) => entry.row.source_id),
    ]);
    const candidates = plan.invoices.filter((entry) => wanted.has(entry.source_id) && entry.data.status === 'void');
    report = { candidates: candidates.length, planned: [], verified_ids: [], ambiguous_missing: 0 };
    for (let i = 0; i < candidates.length; i += 50) {
      const chunk = candidates.slice(i, i + 50);
      const found = await readAction({ action: 'find_by_keys', entity: 'Invoice', keys: chunk.map((entry) => entry.data.creation_request_key) });
      const byKey = new Map(found.results.map((entry) => [entry.key, entry.matches]));
      for (const entry of chunk) {
        const matches = byKey.get(entry.data.creation_request_key) || [];
        if (matches.length > 1) throw new Error(`Duplicate void invoice key for ${entry.source_id}.`);
        if (!matches.length) {
          if (state.ids.Invoice[entry.source_id]) throw new Error(`Confirmed void invoice missing for ${entry.source_id}.`);
          report.ambiguous_missing++;
          continue;
        }
        const actual = matches[0];
        if (actual.status !== 'void' || (state.ids.Invoice[entry.source_id] && actual.id !== state.ids.Invoice[entry.source_id])) throw new Error(`Unexpected void invoice target for ${entry.source_id}.`);
        if (Number(actual.amount_paid || 0) !== entry.data.amount_paid || Number(actual.balance_due || 0) !== entry.data.balance_due) {
          report.planned.push({
            id: actual.id, source_id: entry.source_id,
            before: { amount_paid: actual.amount_paid, balance_due: actual.balance_due },
            after: { amount_paid: entry.data.amount_paid, balance_due: entry.data.balance_due },
          });
        }
      }
    }
    atomic(reportPath, report);
  }
  const pending = report.planned.filter((entry) => !report.verified_ids.includes(entry.id));
  for (let i = 0; i < pending.length; i += 20) {
    const chunk = pending.slice(i, i + 20);
    const before = await readAction({ action: 'get_rows', entity: 'Invoice', ids: chunk.map((entry) => entry.id) });
    const needsUpdate = [];
    for (let j = 0; j < chunk.length; j++) {
      const current = before.results[j]?.item;
      if (!current || current.status !== 'void') throw new Error(`Void correction target unavailable: ${chunk[j].source_id}`);
      const differences = [];
      diffValue('set', chunk[j].after, current, differences);
      if (differences.length) needsUpdate.push({ id: chunk[j].id, set: chunk[j].after });
    }
    if (needsUpdate.length) {
      const result = await pacedWrite(state, { action: 'update_rows', entity: 'Invoice', rows: needsUpdate });
      if (result.ambiguous) throw new Error('Void correction update ambiguous; reconcile before continuing.');
    }
    const checked = await readAction({ action: 'get_rows', entity: 'Invoice', ids: chunk.map((entry) => entry.id) });
    for (let j = 0; j < chunk.length; j++) {
      const item = checked.results[j]?.item;
      const differences = [];
      diffValue('set', chunk[j].after, item, differences);
      if (!item || differences.length) throw new Error(`Void correction readback failed: ${chunk[j].source_id}`);
      if (!report.verified_ids.includes(chunk[j].id)) report.verified_ids.push(chunk[j].id);
    }
    atomic(reportPath, report);
    console.log(JSON.stringify({ void_corrections_verified: report.verified_ids.length, total: report.planned.length }));
  }
  console.log(JSON.stringify({ void_candidates: report.candidates, void_corrected: report.planned.length, void_verified: report.verified_ids.length, ambiguous_targets_missing: report.ambiguous_missing }));
}

async function reconcile(state) {
  const remaining = 180000 - (Date.now() - state.apply_ended_at);
  if (remaining > 0) {
    console.log(JSON.stringify({ reconciliation_wait_seconds: Math.ceil(remaining / 1000) }));
    await sleep(remaining);
  }
  const original = [...state.ambiguous];
  for (const entry of original) {
    if (entry.action === 'write_rows') {
      const key = entry.row.data.creation_request_key;
      const found = await readAction({ action: 'find_by_keys', entity: entry.entity, keys: [key] });
      const matches = found.results[0]?.matches;
      if (!Array.isArray(matches) || matches.length > 1) throw new Error('Ambiguous lookup returned duplicate or invalid targets.');
      const result = await pacedWrite(state, {
        action: 'write_rows', entity: entry.entity, batch_id: BATCH,
        adopt: matches.length === 1, rows: [entry.row],
      });
      if (result.ambiguous) continue;
    } else if (entry.action === 'update_rows') {
      const found = await readAction({ action: 'get_rows', entity: entry.entity, ids: [entry.row.id] });
      const current = found.results[0]?.item;
      if (!current) throw new Error('Ambiguous update target unavailable.');
      const differences = [];
      diffValue('set', entry.row.set, current, differences);
      if (differences.length) {
        const result = await pacedWrite(state, { action: 'update_rows', entity: entry.entity, rows: [entry.row] });
        if (result.ambiguous) continue;
        const checked = await readAction({ action: 'get_rows', entity: entry.entity, ids: [entry.row.id] });
        const after = checked.results[0]?.item;
        const remainingDifferences = [];
        diffValue('set', entry.row.set, after, remainingDifferences);
        if (!after || remainingDifferences.length) throw new Error('Reconciled update did not read back as expected.');
      }
      if (Array.isArray(entry.row.set.payment_ids)) state.backfill_count = entry.row.set.payment_ids.length;
    } else throw new Error('Unknown ambiguous action.');
    state.ambiguous = state.ambiguous.filter((item) => item !== entry);
    atomic(STATE, state);
    console.log(JSON.stringify({ reconciled: entry.action, remaining: state.ambiguous.length }));
  }
  if (state.ambiguous.length) {
    state.apply_ended_at = Date.now();
    atomic(STATE, state);
    throw new Error('Some outcomes remain ambiguous; wait before reconciling again.');
  }
}

async function loadLedger() {
  const rows = [];
  for (let skip = 0; ; skip += 1000) {
    let response;
    for (let attempt = 0; ; attempt++) {
      response = await raw('staffDataRead', { entity: 'LegacyMigrationMap', query: { migration_batch: BATCH }, sort: 'created_date', limit: 1000, skip });
      if (response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
      break;
    }
    if (response.status !== 200 || !Array.isArray(response.body.items)) throw new Error(`Ledger read failed: HTTP ${response.status} ${response.body.error || ''}`);
    rows.push(...response.body.items);
    if (response.body.items.length < 1000) return rows;
  }
}
async function verify(plan, state) {
  if (state.ambiguous.length || state.pending) throw new Error('Ambiguous writes must be reconciled before verification.');
  const maps = await loadLedger();
  const expected = [...plan.invoices.map((row) => ({ entity: 'Invoice', ...row })), ...plan.payments.map((row) => ({ entity: 'Payment', ...row })), ...plan.refunds.map((row) => ({ entity: 'Payment', ...row })), { entity: 'ReconciliationBatch', ...plan.batch }];
  const ledgerIndex = new Map(), duplicateSources = [], invalidLedger = [], missingLedger = [], orphans = [], unexpectedLedger = [], referenceErrors = [];
  const expectedKeys = new Set(expected.map((row) => `${row.source_entity}:${row.source_id}`));
  const ledgerCounts = {};
  for (const row of maps) {
    if (row.source_app_id !== 'corebridge') continue;
    const key = `${row.source_entity}:${row.source_id}`;
    if (ledgerIndex.has(key)) duplicateSources.push(key);
    else ledgerIndex.set(key, row);
    if (!expectedKeys.has(key)) unexpectedLedger.push(key);
    let status = '';
    try { status = JSON.parse(row.notes || '{}').status; } catch {}
    if (status !== 'created') invalidLedger.push(key);
    ledgerCounts[row.source_entity] = (ledgerCounts[row.source_entity] || 0) + 1;
  }
  for (const row of expected) if (!ledgerIndex.has(`${row.source_entity}:${row.source_id}`)) missingLedger.push(`${row.source_entity}:${row.source_id}`);
  const actualTotals = { invoice_total: 0, payment_total: 0, refund_total: 0 };
  let checked = 0;
  for (const entity of ['Invoice', 'Payment', 'ReconciliationBatch']) {
    const group = expected.filter((row) => row.entity === entity);
    for (let i = 0; i < group.length; i += 50) {
      const start = Date.now();
      const chunk = group.slice(i, i + 50);
      const result = await readAction({ action: 'find_by_keys', entity, keys: chunk.map((row) => row.data.creation_request_key) });
      const byKey = new Map(result.results.map((item) => [item.key, item.matches]));
      for (const row of chunk) {
        const ledger = ledgerIndex.get(`${row.source_entity}:${row.source_id}`);
        const matches = byKey.get(row.data.creation_request_key) || [];
        if (matches.length !== 1 || !ledger || matches[0]?.id !== ledger.target_id || ledger.target_entity !== entity) {
          orphans.push({ entity, source_entity: row.source_entity, source_id: row.source_id, matches: matches.length });
          continue;
        }
        const actual = matches[0];
        if (entity === 'Invoice') actualTotals.invoice_total += cents(actual.total);
        else if (row.source_entity === 'payments') actualTotals.payment_total += cents(actual.amount);
        else if (row.source_entity === 'refunds') actualTotals.refund_total += cents(actual.amount);
        if (entity === 'Invoice' && (actual.customer_id !== row.data.customer_id || actual.estimate_id !== row.data.estimate_id || (actual.work_order_id || '') !== row.data.work_order_id)) {
          referenceErrors.push({ source_entity: row.source_entity, source_id: row.source_id, error: 'invoice links mismatch' });
        }
        if (entity === 'Payment' && (actual.invoice_id !== state.ids.Invoice[row.order_id] || actual.customer_id !== row.data.customer_id || actual.estimate_id !== row.data.estimate_id || (actual.work_order_id || '') !== row.data.work_order_id)) {
          referenceErrors.push({ source_entity: row.source_entity, source_id: row.source_id, error: 'payment links mismatch' });
        }
        if (row.source_entity === 'refunds' && actual.refund_of_payment_id !== state.ids.Payment[row.parent_source_id]) {
          referenceErrors.push({ source_entity: row.source_entity, source_id: row.source_id, error: 'refund parent mismatch' });
        }
        if (entity === 'ReconciliationBatch') {
          const ids = [...plan.payments, ...plan.refunds].map((payment) => state.ids.Payment[payment.source_id]).filter(Boolean);
          if (JSON.stringify(actual.payment_ids || []) !== JSON.stringify(ids) || actual.payment_count !== ids.length) {
            referenceErrors.push({ source_entity: row.source_entity, source_id: row.source_id, error: 'batch membership mismatch' });
          }
          const differences = [];
          diffValue('batch', row.data, actual, differences);
          if (differences.length) referenceErrors.push({ source_entity: row.source_entity, source_id: row.source_id, error: 'batch values mismatch', differences });
        }
        checked++;
      }
      if (i + 50 < group.length) await sleep(Math.max(0, 1600 - (Date.now() - start)));
    }
  }
  for (const key of Object.keys(actualTotals)) actualTotals[key] /= 100;
  const totalsMatch = actualTotals.invoice_total === plan.summary.invoice_total &&
    actualTotals.payment_total === plan.summary.payment_total && actualTotals.refund_total === plan.summary.refund_total;
  const result = {
    ledger_counts: ledgerCounts, expected_counts: { invoices: plan.invoices.length, payments: plan.payments.length, refunds: plan.refunds.length, reconciliation_batches: 1 },
    duplicate_source_ids: duplicateSources.length, invalid_ledger_rows: invalidLedger.length,
    missing_ledger_rows: missingLedger.length, unexpected_ledger_rows: unexpectedLedger.length,
    orphans: orphans.length, reference_errors: referenceErrors.length, checked,
    totals: actualTotals, archive_payment_total: plan.summary.archive_payment_total, archive_refund_total: plan.summary.archive_refund_total,
    totals_match_plan: totalsMatch, unresolved_customers: plan.missing_customers.length,
    duplicate_sources: duplicateSources, invalid_ledger: invalidLedger, missing_ledger: missingLedger, orphan_details: orphans, unexpected_ledger: unexpectedLedger, reference_error_details: referenceErrors,
  };
  atomic('.audit-work/cb-inv-verify.json', result);
  console.log(JSON.stringify({ ...result, duplicate_sources: undefined, invalid_ledger: undefined, missing_ledger: undefined, orphan_details: undefined, unexpected_ledger: undefined, reference_error_details: undefined }, null, 2));
  if (duplicateSources.length || invalidLedger.length || missingLedger.length || unexpectedLedger.length || orphans.length || referenceErrors.length || !totalsMatch) throw new Error('Final verification failed; inspect cb-inv-verify.json.');
}

if (!['plan', 'apply', 'reconcile', 'verify', 'void-correct'].includes(mode)) throw new Error('Expected plan, apply, reconcile, verify, or void-correct.');
const lockPath = '.audit-work/cb-inv-import.lock';
let lock;
try {
  if (['apply', 'reconcile', 'void-correct'].includes(mode)) {
    lock = openSync(lockPath, 'wx');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, mode, started_at: new Date().toISOString() }));
  }
  await login();
  if (mode === 'plan') {
    if (existsSync(PLAN) || existsSync(STATE)) throw new Error('Plan or state already exists; preserve it rather than overwrite.');
    await makePlan();
  } else {
    const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
    const state = loadState();
    if (mode === 'apply') {
      if (plan.missing_parents.length || Object.keys(plan.summary.unknown_methods || {}).length) throw new Error('Plan has unresolved parents or payment methods.');
      const index = process.argv.indexOf('--limit');
      const limit = index < 0 ? Infinity : Number(process.argv[index + 1]);
      if (!(limit > 0)) throw new Error('Invalid --limit.');
      try { await apply(plan, state, limit); }
      finally { state.apply_ended_at = Date.now(); atomic(STATE, state); }
    } else if (mode === 'reconcile') await reconcile(state);
    else if (mode === 'void-correct') {
      try { await correctVoids(plan, state); }
      finally { state.apply_ended_at = Date.now(); atomic(STATE, state); }
    }
    else await verify(plan, state);
  }
} finally {
  if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
}
