import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginCoreBridge } from './auth.mjs';
import { AppCallError } from './lib/app-client.mjs';
import { captureAccountFixture } from './lib/accountSource.mjs';
import { fetchAccount } from './lib/accountSource.mjs';
import { captureOrder, loadOrderReferences } from './lib/order-capture.mjs';
import { estimateRecord } from './lib/order-model.mjs';
import { runSync } from './lib/sync-engine.mjs';

const copy = (value) => structuredClone(value);
class FakeApp {
  constructor() {
    this.serial = 0;
    this.created = {};
    this.changes = [];
    this.rows = {
      LegacyMigrationMap: [{
        id: 'map-seed', created_date: '2026-01-01T00:00:00Z', source_app_id: 'corebridge',
        source_entity: 'estimates', source_id: '11286', target_entity: 'AllInOneEstimate', target_id: 'est-seed',
      }],
      Customer: [],
      CustomerContact: [], CustomerLocation: [],
      AllInOneEstimate: [{ id: 'est-seed', creation_request_key: 'cb:estimates:11286', status: 'sent', customer_id: '', estimate_number: 'EST-14767', updated_date: 'v1', line_items: [] }],
      WorkOrder: [
        { id: 'wo-seed', estimate_id: 'est-seed', customer_id: '', updated_date: 'v1' },
        { id: 'wo-invoice', estimate_id: '', customer_id: '', est_inv_at: 'INV-200', updated_date: 'v1' },
      ],
      Invoice: [], Payment: [],
      ReconciliationBatch: [{ id: 'batch', creation_request_key: 'cb:reconciliation-batch:historical', status: 'closed',
        payment_ids: [], payment_count: 0, expected_total: 0, collected_total: 0, expected_amount: 0, collected_amount: 0 }],
    };
    this.lease = '';
    this.timeoutKey = '';
    this.hiddenKey = '';
    this.failCasOnce = '';
  }
  async lock(action, runId) {
    if (action === 'claim') {
      if (this.lease && this.lease !== runId) return { acquired: false, reason: 'already_running' };
      this.lease = runId; return { acquired: true };
    }
    if (action === 'heartbeat') return { acquired: this.lease === runId };
    if (action === 'release' && this.lease === runId) { this.lease = ''; return { released: true }; }
    return { acquired: false, reason: 'not_owner' };
  }
  async list(entity, query = {}) {
    return copy(this.rows[entity].filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)));
  }
  async get(entity, id) {
    const row = this.rows[entity].find((item) => item.id === id);
    if (!row) throw new Error(`${entity} ${id} missing`);
    return copy(row);
  }
  async map(entity, source) {
    return this.list('LegacyMigrationMap', { source_app_id: 'corebridge', source_entity: entity, source_id: String(source) });
  }
  async appendMap(data) {
    const row = { ...copy(data), id: `map-${++this.serial}`, created_date: new Date(this.serial * 1000).toISOString() };
    this.rows.LegacyMigrationMap.push(row);
    return copy(row);
  }
  async byKey(entity, key) {
    if (this.hiddenKey === key) { this.hiddenKey = ''; return []; }
    return copy(this.rows[entity].filter((row) => row.creation_request_key === key));
  }
  async cas(entity, current, patch) {
    if (entity === this.failCasOnce) { this.failCasOnce = ''; throw new Error('Injected CAS interruption'); }
    const row = this.rows[entity].find((item) => item.id === current.id);
    if (!row || row.updated_date !== current.updated_date) throw new Error('CAS conflict');
    this.changes.push({ entity, id: current.id, patch: copy(patch) });
    Object.assign(row, copy(patch), { updated_date: `v${++this.serial}` });
    return copy(row);
  }
  async importMapped(entity, data) {
    const target = { customers: 'Customer', estimates: 'AllInOneEstimate', contacts: 'CustomerContact', addresses: 'CustomerLocation' }[entity];
    if (!target) throw new Error(`Unexpected mapper ${entity}`);
    const source = data.__source_id__, id = `${target}-${++this.serial}`;
    const row = { ...copy(data), id, creation_request_key: `cb:${entity}:${source}`, updated_date: `v${this.serial}` };
    if (entity !== 'customers') {
      const map = (await this.map('customers', data.customer_id))[0];
      row.customer_id = map?.target_id || '';
    }
    this.rows[target].push(row);
    await this.appendMap({ source_app_id: 'corebridge', source_entity: entity, source_id: source, target_entity: target, target_id: id });
    this.created[target] = (this.created[target] || 0) + 1;
    return { status: 'created', target_id: id };
  }
  async importEstimate(data) { return this.importMapped('estimates', data); }
  async historyWrite(entity, row) {
    const id = `${entity}-${++this.serial}`;
    this.rows[entity].push({ ...copy(row.data), id, updated_date: `v${this.serial}` });
    await this.appendMap({ source_app_id: 'corebridge', source_entity: row.source_entity, source_id: row.source_id, target_entity: entity, target_id: id });
    this.created[entity] = (this.created[entity] || 0) + 1;
    if (this.timeoutKey === row.data.creation_request_key) {
      this.timeoutKey = '';
      this.hiddenKey = row.data.creation_request_key;
      throw new AppCallError('Injected ambiguous timeout', { ambiguous: true });
    }
    return { status: 'created', target_id: id };
  }
  async historyGet(entity, id) { return this.get(entity, id); }
  async historyUpdate(entity, id, set) {
    const row = this.rows[entity].find((item) => item.id === id);
    this.changes.push({ entity, id, patch: copy(set) });
    Object.assign(row, copy(set));
    return copy(row);
  }
  async links(estimateId) {
    const estimate = await this.get('AllInOneEstimate', estimateId);
    return { estimate_id: estimateId, customer_id: estimate.customer_id,
      work_order_ids: this.rows.WorkOrder.filter((item) => item.estimate_id === estimateId).map((item) => item.id) };
  }
}

const html = `<form id="form1" action="/Login.aspx">
<input name="__VIEWSTATE" value="v"><input name="__VIEWSTATEGENERATOR" value="g">
<input name="__EVENTVALIDATION" value="e"><input name="txtUsername"><input name="txtPassword"></form>`;
let status = 'ESTIMATE', hasRefund = false, paymentAmount = 50, secondOrderOtherAccount = false, seedOrderNameMissing = false;
let estimatePrice = 100, estimateTotal = 100, addEstimateLine = false, seedDetail = 'Parts', includeLaterOrder = false;
let removePayment = false, paymentType = 'Cash', paymentReference = '', paymentDate = '';
let refundType = 'Cash', refundReference = '', refundDate = '', forceInvoicePaid = false, estimateHistory = false;
const accountHtml = await readFile(new URL('./fixtures/account-synthetic.html', import.meta.url), 'utf8');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/Login.aspx') {
    if (req.method === 'GET') { res.setHeader('set-cookie', 'session=test'); return res.end(html); }
    res.writeHead(302, { location: '/Home.aspx', 'set-cookie': 'auth=test' }); return res.end();
  }
  if (!String(req.headers.cookie).includes('auth=test')) { res.writeHead(302, { location: '/Login.aspx' }); return res.end(); }
  if (url.pathname === '/SalesModule/Accounts/Account.aspx') {
    const id = Number(url.searchParams.get('AcctId'));
    if (![3835, 3837].includes(id)) { res.writeHead(404); return res.end(); }
    let page = accountHtml.replace('99999', String(id));
    if (id === 3837) page = page.replaceAll('Synthetic Client &amp; Co', 'Second Synthetic Client')
      .replaceAll('value="123"', 'value="124"').replace('(555) 010-1234', '(555) 010-9876');
    return res.end(`<!-- Sanitized synthetic account fixture -->${page}`);
  }
  const body = [];
  for await (const chunk of req) body.push(chunk);
  const payload = body.length ? JSON.parse(Buffer.concat(body).toString()) : {};
  const orderId = Number(url.searchParams.get('OrderId') || url.searchParams.get('orderId') || payload.OrderId);
  if (url.pathname.endsWith('GetProductCategories')) return res.end(JSON.stringify({ d: JSON.stringify({ productCategories: [{ id: 4, name: 'Synthetic category' }] }) }));
  if (url.pathname.endsWith('GetAllContacts')) return res.end(JSON.stringify({ d: JSON.stringify({ aaData: [{ Id: 99, FirstName: 'Synthetic', LastName: 'Contact' }], iTotalRecords: 1 }) }));
  if (url.pathname.endsWith('/Order.aspx')) {
    if (![11286, 11287].includes(orderId) && !(orderId === 11288 && includeLaterOrder)) { res.writeHead(404); return res.end(); }
    const header = orderId === 11286
      ? { Id: 11286, AccountId: 3835, CompanyName: 'Synthetic Client', OrderStatus: status, EstimateNumber: 'EST-14767',
        TotalPrice: estimateTotal, BalanceDue: estimateTotal, SubTotalPrice: estimateTotal, TaxableAmount: estimateTotal }
      : orderId === 11287
        ? { Id: 11287, AccountId: secondOrderOtherAccount ? 3837 : 3835, CompanyName: secondOrderOtherAccount ? 'Second Synthetic Client' : 'Synthetic Client',
          OrderStatus: 'INVOICED', InvoiceNumber: 'INV-200', TotalPrice: 100, BalanceDue: forceInvoicePaid ? 0 : hasRefund ? 70 : 50, SubTotalPrice: 100, TaxableAmount: 100 }
        : { Id: 11288, AccountId: 3835, CompanyName: 'Synthetic Client', OrderStatus: 'ESTIMATE', EstimateNumber: 'EST-14768',
          TotalPrice: 100, BalanceDue: 100, SubTotalPrice: 100, TaxableAmount: 100 };
    if (orderId === 11286 && status === 'INVOICED') header.InvoiceNumber = 'INV-201';
    if (orderId === 11286 && seedOrderNameMissing) header.CompanyName = '';
    header.OrderContactId = 99;
    header.Account = { Id: header.AccountId, CompanyName: header.CompanyName, CompanyPhone: '555-000-1111' };
    return res.end(`<title>Order</title><script>var orderObj = ${JSON.stringify(header)};</script>`);
  }
  if (url.pathname.endsWith('GetOrderProductsView')) {
    const price = orderId === 11286 ? estimatePrice : 100;
    const products = [{ Id: 9, ProductCategoryId: 4, Description: 'Synthetic product', Qty: 1, TotalPrice: price, TaxableAmount: price }];
    if (orderId === 11286 && addEstimateLine) products.push({ Id: 10, ProductCategoryId: 4, Description: 'Second synthetic product', Qty: 1, TotalPrice: 40, TaxableAmount: 40 });
    return res.end(JSON.stringify({ OrderProducts: products }));
  }
  if (url.pathname.endsWith('GetOrderPayments2')) return res.end(JSON.stringify({ d: JSON.stringify({ ReportResults: orderId === 11287 && !removePayment
    ? [{ Id: 77, Amount: paymentAmount, Type: paymentType, CheckNumber: paymentReference, CreatedDate: paymentDate }] : [] }) }));
  if (url.pathname.endsWith('GetOrderRefunds')) return res.end(JSON.stringify({ d: JSON.stringify({ ReportResults: hasRefund && orderId === 11287
    ? [{ Id: 78, Amount: -20, Type: refundType, CheckNumber: refundReference, CreatedDate: refundDate,
      OrderPaymentRefundInfos: [{ TransactionToRefundId: 77 }] }] : [] }) }));
  if (url.pathname.endsWith('OrderNotes.aspx')) return res.end('<input id="hdnOrderNotes" value="">');
  if (url.pathname.endsWith('OrderHistory.aspx')) return res.end(orderId === 11286 && estimateHistory
    ? '<table><tr><td>Synthetic history</td><td>11/18/2026 10:00 AM</td><td>Synthetic staff</td></tr></table>' : '<table></table>');
  if (url.pathname.endsWith('DetailedOrderView.aspx')) return res.end(`<div>${orderId === 11286 ? seedDetail : 'Parts'}</div>`);
  res.writeHead(404); res.end();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const session = await loginCoreBridge({ username: 'test-user', password: 'test-password', baseUrl: `http://127.0.0.1:${server.address().port}` });
  const references = await loadOrderReferences(session);
  assert.equal(references.categories.get(4), 'Synthetic category');
  assert.equal(references.contacts.get(99).FirstName, 'Synthetic');
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'cb-sync-fixture-'));
  try {
    const path = await captureAccountFixture(session, '/accounts.aspx', 3835, fixtureDirectory);
    assert.match(await readFile(path, 'utf8'), /Sanitized synthetic account fixture/);
    await assert.rejects(() => captureAccountFixture(session, '/accounts.aspx', 3836, fixtureDirectory), /not found/);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
  const capture = (id) => captureOrder(session, id);
  const run = (options) => runSync({ capture, references, ...options });
  async function seedMappedEstimate(app, tags = 'corebridge_import') {
    const order = await capture(11286);
    const mapped = estimateRecord(order, { contact: references.contacts.get(99), categories: references.categories });
    Object.assign(app.rows.AllInOneEstimate[0], mapped.row, {
      id: 'est-seed', creation_request_key: 'cb:estimates:11286', customer_id: '', updated_date: 'v1',
      line_items: mapped.lines, tags, notes_log: [],
    });
  }
  function mergedCustomer(app, hops = 2) {
    for (let i = 0; i < hops; i++) {
      app.rows.Customer.push({ id: `merged-${i}`, company_name: 'Old Synthetic Client',
        merged_into_customer_id: i + 1 === hops ? 'survivor' : `merged-${i + 1}`, deleted: i === 0, updated_date: `old-v${i}` });
    }
    app.rows.Customer.push({ id: 'survivor', company_name: 'Synthetic Client', updated_date: 'survivor-v1' });
    app.rows.LegacyMigrationMap.push({
      id: 'account-map', source_app_id: 'corebridge', source_entity: 'customers', source_id: '3835',
      target_entity: 'Customer', target_id: 'merged-0',
      notes: JSON.stringify({ matched_existing: true, account_detail_pending: true }),
    });
  }
  {
    const app = new FakeApp();
    const dry = await run({ app, runId: 'dry' });
    assert.deepEqual(dry.errors, []);
    assert.equal(app.rows.Customer.length, 0);
    assert.equal(app.rows.Invoice.length, 0);
    assert.equal(app.rows.LegacyMigrationMap.length, 1);
    const report = await run({ app, apply: true, runId: 'one' });
    assert.deepEqual(report.errors, []);
    assert.equal(app.created.Customer, 1);
    assert.equal(app.created.AllInOneEstimate, 1);
    assert.equal(app.created.Invoice, 1);
    assert.equal(app.created.Payment, 1);
    const newEstimate = app.rows.AllInOneEstimate.find((item) => item.id !== 'est-seed');
    assert.equal(newEstimate.contact_name, 'Synthetic Contact');
    assert.equal(newEstimate.line_items[0].product_category, 'Synthetic category');
    assert.equal(app.rows.AllInOneEstimate.find((item) => item.id === 'est-seed').customer_id, app.rows.Customer[0].id);
    assert.equal(app.rows.WorkOrder[0].customer_id, app.rows.Customer[0].id);
    assert.ok(app.rows.WorkOrder[1].estimate_id);
    assert.equal(app.rows.Invoice[0].work_order_id, 'wo-invoice');
    assert.equal(app.rows.Payment[0].work_order_id, 'wo-invoice');
    assert.equal(app.rows.ReconciliationBatch[0].expected_total, 50);
    assert.equal(report.cursor_after.last_account_id, 3834);
    assert.equal(report.cursor_after.last_order_id, 11287);
    const previous = copy(app.created);
    const again = await run({ app, apply: true, runId: 'two' });
    assert.deepEqual(again.errors, []);
    assert.deepEqual(app.created, previous);
    status = 'CANCELLED';
    const changed = await run({ app, apply: true, runId: 'three' });
    assert.deepEqual(changed.errors, []);
    assert.equal(app.rows.AllInOneEstimate.find((item) => item.id === 'est-seed').status, 'cancelled');
    assert.ok(changed.watched_changes.some((item) => item.order_id === 11286 && item.after === 'cancelled'));
    assert.ok(!changed.cursor_after.watch_orders.includes(11286));
    paymentAmount = 55;
    const amountChanged = await run({ app, apply: true, runId: 'changed-payment' });
    assert.deepEqual(amountChanged.errors, []);
    assert.deepEqual(amountChanged.needs_review, [{ order_id: 11287, invoice_number: 'INV-200',
      issues: [{ source_id: '77', kind: 'amount_changed', app_amount: 50, corebridge_amount: 55 }] }]);
    assert.equal(app.rows.ReconciliationBatch[0].expected_total, 50);
    paymentAmount = 50;
    hasRefund = true;
    const refunded = await run({ app, apply: true, runId: 'refund' });
    assert.deepEqual(refunded.errors, []);
    const original = app.rows.Payment.find((item) => item.creation_request_key === 'cb:payment:77');
    const refund = app.rows.Payment.find((item) => item.creation_request_key === 'cb:refund:78');
    assert.equal(original.refunded_amount, 20);
    assert.equal(refund.refund_of_payment_id, original.id);
    assert.equal(app.rows.Invoice[0].balance_due, 70);
    assert.equal(app.rows.ReconciliationBatch[0].expected_total, 30);
    hasRefund = false;
    status = 'ESTIMATE';
  }
  {
    const app = new FakeApp();
    await seedMappedEstimate(app);
    const first = await run({ app, apply: true, runId: 'refresh-seed' });
    assert.deepEqual(first.errors, []);
    const originalNotes = app.rows.AllInOneEstimate[0].notes;
    const auditCount = app.rows.AllInOneEstimate[0].notes_log.length;
    estimatePrice = 120; estimateTotal = 160; addEstimateLine = true; estimateHistory = true;
    const changed = await run({ app, apply: true, runId: 'refresh-changed', now: () => Date.parse('2026-11-19T12:00:00.000Z') });
    assert.deepEqual(changed.errors, []);
    const estimate = app.rows.AllInOneEstimate[0];
    assert.equal(estimate.quote_total, 160);
    assert.equal(estimate.line_items.length, 2);
    assert.equal(estimate.line_items[0].total_snapshot, 120);
    assert.equal(estimate.line_items[1].line_id, 'cb-10');
    assert.equal(estimate.notes, originalNotes);
    assert.equal(estimate.tags, 'corebridge_import');
    const change = changed.watched_changes.find((item) => item.order_id === 11286 && item.fields?.includes('line_items'));
    assert.ok(change.fields.includes('quote_total'));
    const audits = estimate.notes_log.filter((entry) => entry.by === 'corebridge-sync');
    assert.equal(audits.length, 1);
    assert.equal(audits[0].at, '2026-11-19T12:00:00.000Z');
    assert.match(audits[0].text, /Refreshed from CoreBridge:.*quote_total.*line_items/);
    assert.equal(estimate.notes_log.length, auditCount + 2);
    assert.ok(estimate.notes_log.some((entry) => entry.text === '[CoreBridge] Synthetic history'));
    const version = estimate.updated_date, log = copy(estimate.notes_log), changes = app.changes.length;
    const again = await run({ app, apply: true, runId: 'refresh-unchanged' });
    assert.deepEqual(again.errors, []);
    assert.equal(app.rows.AllInOneEstimate[0].updated_date, version);
    assert.deepEqual(app.rows.AllInOneEstimate[0].notes_log, log);
    assert.equal(app.changes.slice(changes).filter((item) => item.entity === 'AllInOneEstimate' && item.id === 'est-seed').length, 0);
    estimatePrice = 100; estimateTotal = 100; addEstimateLine = false; estimateHistory = false;
  }
  {
    const app = new FakeApp();
    await seedMappedEstimate(app, 'manual');
    assert.deepEqual((await run({ app, apply: true, runId: 'unowned-seed' })).errors, []);
    const before = copy(app.rows.AllInOneEstimate[0]);
    estimatePrice = 150; estimateTotal = 150; status = 'CANCELLED'; estimateHistory = true;
    const watched = await run({ app, apply: true, runId: 'unowned-watch' });
    assert.deepEqual(watched.errors, []);
    assert.ok(watched.warnings.includes('Estimate EST-14767 is watched but not CoreBridge-owned; refresh skipped'));
    assert.equal(app.rows.AllInOneEstimate[0].quote_total, before.quote_total);
    assert.deepEqual(app.rows.AllInOneEstimate[0].line_items, before.line_items);
    assert.equal(app.rows.AllInOneEstimate[0].notes, before.notes);
    assert.equal(app.rows.AllInOneEstimate[0].status, 'cancelled');
    assert.ok(app.rows.AllInOneEstimate[0].notes_log.some((entry) => entry.text === '[CoreBridge] Synthetic history'));
    assert.ok(!app.rows.AllInOneEstimate[0].notes_log.some((entry) => entry.by === 'corebridge-sync'));
    estimatePrice = 100; estimateTotal = 100; status = 'ESTIMATE'; estimateHistory = false;
  }
  {
    const app = new FakeApp();
    await seedMappedEstimate(app);
    assert.deepEqual((await run({ app, apply: true, runId: 'detail-seed' })).errors, []);
    const oldNotes = app.rows.AllInOneEstimate[0].line_items[0].product_notes;
    const marker = '\n\nCoreBridge order detail';
    assert.ok(oldNotes.includes(marker));
    seedDetail = ''; estimatePrice = 120; estimateTotal = 120;
    const updated = await run({ app, apply: true, runId: 'detail-missing' });
    assert.deepEqual(updated.errors, []);
    assert.ok(updated.watched_changes.some((entry) => entry.order_id === 11286 && entry.fields?.includes('line_items')));
    const lineNotes = app.rows.AllInOneEstimate[0].line_items[0].product_notes;
    assert.equal(lineNotes.slice(lineNotes.indexOf(marker)), oldNotes.slice(oldNotes.indexOf(marker)));
    const version = app.rows.AllInOneEstimate[0].updated_date, log = copy(app.rows.AllInOneEstimate[0].notes_log);
    const unchanged = await run({ app, apply: true, runId: 'detail-unchanged' });
    assert.deepEqual(unchanged.errors, []);
    assert.equal(app.rows.AllInOneEstimate[0].updated_date, version);
    assert.deepEqual(app.rows.AllInOneEstimate[0].notes_log, log);
    seedDetail = 'Parts'; estimatePrice = 100; estimateTotal = 100;
  }
  {
    const app = new FakeApp();
    hasRefund = true;
    const first = await run({ app, apply: true, runId: 'metadata-seed' });
    assert.deepEqual(first.errors, []);
    assert.deepEqual(first.cursor_after.watch_transactions['11287'], ['77', '78']);
    paymentType = 'Check'; paymentReference = 'SYN-77'; paymentDate = '2026-11-18T10:00:00Z';
    refundType = 'Visa'; refundReference = 'SYN-78'; refundDate = '2026-11-19T10:00:00Z';
    const changed = await run({ app, apply: true, runId: 'metadata-changed' });
    assert.deepEqual(changed.errors, []);
    const payment = app.rows.Payment.find((item) => item.creation_request_key === 'cb:payment:77');
    const refund = app.rows.Payment.find((item) => item.creation_request_key === 'cb:refund:78');
    assert.deepEqual([payment.method, payment.reference_number, payment.paid_date], ['check', 'SYN-77', '2026-11-18']);
    assert.deepEqual([refund.method, refund.reference_number, refund.paid_date], ['card', 'SYN-78', '2026-11-19']);
    for (const id of ['77', '78']) {
      const change = changed.watched_changes.find((item) => item.entity === 'Payment' && item.source_id === id);
      for (const field of ['method', 'reference_number', 'paid_date']) assert.ok(change.fields.includes(field));
    }
    forceInvoicePaid = true;
    const terminal = await run({ app, apply: true, runId: 'metadata-terminal' });
    assert.deepEqual(terminal.errors, []);
    assert.ok(!terminal.cursor_after.watch_orders.includes(11287));
    assert.equal(Object.hasOwn(terminal.cursor_after.watch_transactions, '11287'), false);
    hasRefund = false; forceInvoicePaid = false;
    paymentType = 'Cash'; paymentReference = ''; paymentDate = '';
    refundType = 'Cash'; refundReference = ''; refundDate = '';
  }
  {
    const app = new FakeApp();
    const first = await run({ app, apply: true, runId: 'amount-seed' });
    assert.deepEqual(first.errors, []);
    assert.deepEqual(first.cursor_after.watch_transactions['11287'], ['77']);
    const invoice = copy(app.rows.Invoice[0]), payment = copy(app.rows.Payment[0]), batch = copy(app.rows.ReconciliationBatch[0]);
    paymentAmount = 55; includeLaterOrder = true; forceInvoicePaid = true;
    const beforeDry = copy(app.rows);
    const dry = await run({ app, runId: 'amount-review-dry' });
    assert.deepEqual(dry.errors, []);
    assert.equal(dry.needs_review[0].issues[0].kind, 'amount_changed');
    assert.deepEqual(app.rows, beforeDry);
    const reviewed = await run({ app, apply: true, runId: 'amount-review' });
    assert.deepEqual(reviewed.errors, []);
    assert.deepEqual(reviewed.needs_review, [{ order_id: 11287, invoice_number: 'INV-200',
      issues: [{ source_id: '77', kind: 'amount_changed', app_amount: 50, corebridge_amount: 55 }] }]);
    assert.deepEqual(app.rows.Invoice[0], invoice);
    assert.deepEqual(app.rows.Payment[0], payment);
    assert.deepEqual(app.rows.ReconciliationBatch[0], batch);
    assert.ok(reviewed.cursor_after.watch_orders.includes(11287));
    assert.deepEqual(reviewed.cursor_after.watch_transactions['11287'], ['77']);
    assert.equal(reviewed.cursor_after.last_order_id, 11288);
    assert.ok(app.rows.AllInOneEstimate.some((item) => item.creation_request_key === 'cb:estimates:11288'));
    const cursorRows = app.rows.LegacyMigrationMap.filter((item) => item.source_entity === '__sync_cursor__');
    assert.deepEqual(JSON.parse(cursorRows.at(-1).notes).summary.needs_review, reviewed.needs_review);
    paymentAmount = 50; includeLaterOrder = false; forceInvoicePaid = false;
  }
  for (const removed of ['payment', 'refund']) {
    const app = new FakeApp();
    hasRefund = removed === 'refund';
    const first = await run({ app, apply: true, runId: `removed-${removed}-seed` });
    assert.deepEqual(first.errors, []);
    const snapshot = copy(first.cursor_after.watch_transactions['11287']);
    const invoice = copy(app.rows.Invoice[0]), payments = copy(app.rows.Payment), batch = copy(app.rows.ReconciliationBatch[0]);
    if (removed === 'payment') removePayment = true;
    else hasRefund = false;
    const reviewed = await run({ app, apply: true, runId: `removed-${removed}` });
    assert.deepEqual(reviewed.errors, []);
    assert.deepEqual(reviewed.needs_review[0].issues, [{ source_id: removed === 'payment' ? '77' : '78', kind: 'removed_in_corebridge' }]);
    assert.deepEqual(app.rows.Invoice[0], invoice);
    assert.deepEqual(app.rows.Payment, payments);
    assert.deepEqual(app.rows.ReconciliationBatch[0], batch);
    assert.ok(reviewed.cursor_after.watch_orders.includes(11287));
    assert.deepEqual(reviewed.cursor_after.watch_transactions['11287'], snapshot);
    removePayment = false; hasRefund = false;
  }
  {
    const app = new FakeApp();
    const first = await run({ app, apply: true, runId: 'nonwatch-review-seed' });
    assert.deepEqual(first.errors, []);
    const cursor = copy(first.cursor_after);
    cursor.watch_orders = cursor.watch_orders.filter((id) => id !== 11287);
    cursor.pending_account_orders.push({ order_id: 11287, account_id: '3835', account_name: 'Synthetic Client' });
    await app.appendMap({ source_app_id: 'corebridge', source_entity: '__sync_cursor__', source_id: 'nonwatch',
      notes: JSON.stringify({ cursor }) });
    const invoice = copy(app.rows.Invoice[0]), payment = copy(app.rows.Payment[0]);
    paymentAmount = 55;
    const reviewed = await run({ app, apply: true, runId: 'nonwatch-review' });
    assert.deepEqual(reviewed.errors, []);
    assert.equal(reviewed.needs_review[0].issues[0].kind, 'amount_changed');
    assert.ok(reviewed.cursor_after.watch_orders.includes(11287));
    assert.deepEqual(app.rows.Invoice[0], invoice);
    assert.deepEqual(app.rows.Payment[0], payment);
    paymentAmount = 50;
  }
  {
    const app = new FakeApp();
    app.timeoutKey = 'cb:invoice:11287';
    const first = await run({ app, apply: true, runId: 'timeout' });
    assert.match(first.errors[0], /Unresolved ambiguous write/);
    assert.equal(first.cursor_after.last_order_id, 11286);
    const markers = app.rows.LegacyMigrationMap.filter((row) => row.source_entity === '__sync_write__' && row.source_id === 'cb:invoice:11287');
    assert.equal(markers.length, 1);
    assert.equal(JSON.parse(markers[0].notes).state, 'pending');
    const second = await run({ app, apply: true, runId: 'recovery' });
    assert.deepEqual(second.errors, []);
    assert.equal(second.cursor_after.last_order_id, 11287);
    assert.equal(app.created.Invoice, 1);
    assert.equal(app.rows.LegacyMigrationMap.filter((row) => row.source_entity === '__sync_write__' && row.source_id === 'cb:invoice:11287').length, 2);
  }
  {
    const app = new FakeApp();
    const first = await run({ app, apply: true, runId: 'transition-start' });
    assert.deepEqual(first.errors, []);
    status = 'INVOICED';
    const second = await run({ app, apply: true, runId: 'transition-finish' });
    assert.deepEqual(second.errors, []);
    assert.equal(app.rows.AllInOneEstimate.find((row) => row.id === 'est-seed').estimate_number, 'INV-201');
    assert.equal(app.rows.Invoice.filter((row) => row.invoice_number === 'INV-201').length, 1);
    assert.equal(app.rows.AllInOneEstimate.filter((row) => row.creation_request_key === 'cb:estimates:11286').length, 1);
    status = 'ESTIMATE';
  }
  {
    const app = new FakeApp();
    app.lease = 'other-run';
    const collision = await run({ app, apply: true, runId: 'loser' });
    assert.equal(collision.already_running, true);
    assert.deepEqual(collision.errors, []);
    assert.equal(app.rows.Customer.length, 0);
  }
  {
    const app = new FakeApp();
    app.rows.Customer.push(
      { id: 'match-one', company_name: 'Synthetic Client', updated_date: 'v1' },
      { id: 'match-two', company_name: 'Synthetic Client', updated_date: 'v2' },
    );
    const blocked = await run({ app, apply: true, runId: 'ambiguous-account' });
    assert.deepEqual(blocked.errors, []);
    assert.deepEqual(blocked.cursor_after.pending_account_orders.map((item) => item.order_id), [11286, 11287]);
    assert.equal(blocked.cursor_after.last_order_id, 11287);
    assert.equal(app.rows.Invoice.length, 0);
    app.rows.Customer[1].deleted = true;
    const resolved = await run({ app, apply: true, runId: 'resolved-account' });
    assert.deepEqual(resolved.errors, []);
    assert.deepEqual(resolved.cursor_after.pending_account_orders, []);
    assert.equal(app.rows.Invoice.length, 1);
    assert.equal(app.rows.AllInOneEstimate.find((row) => row.id === 'est-seed').customer_id, 'match-one');
  }
  {
    const app = new FakeApp();
    app.rows.Customer.push({ id: 'existing', company_name: 'Synthetic Client', updated_date: 'v1' });
    app.failCasOnce = 'Customer';
    const interrupted = await run({ app, apply: true, runId: 'customer-link-interrupted' });
    assert.match(interrupted.errors[0], /Injected CAS interruption/);
    assert.equal((await app.map('customers', '3835'))[0].target_id, 'existing');
    const resumed = await run({ app, apply: true, runId: 'customer-link-resumed' });
    assert.deepEqual(resumed.errors, []);
    assert.match(app.rows.Customer[0].notes, /account_detail_pending: true/);
    assert.equal(app.rows.Customer[0].company_phone, '555-000-1111');
  }
  {
    const app = new FakeApp();
    app.rows.Customer.push({ id: 'order-customer', company_name: 'Synthetic Client & Co',
      notes: 'CoreBridge ID: 3835\nprevious import\nCoreBridge ID: 3835\naccount_detail_pending: true', updated_date: 'v1' });
    app.rows.LegacyMigrationMap.push({ id: 'customer-ledger', source_app_id: 'corebridge', source_entity: 'customers',
      source_id: '3835', target_entity: 'Customer', target_id: 'order-customer',
      notes: JSON.stringify({ matched_existing: true, account_detail_pending: true }) });
    const accountReferences = { ...references, contacts: new Map([...references.contacts,
      [123, { Id: 123, AccountId: 3835, FirstName: 'Synthetic', LastName: 'Contact', Email: 'one@example.test', PrimaryPhoneNumber: '5550101234', IsActive: true }],
      [124, { Id: 124, AccountId: 3837, FirstName: 'Other', LastName: 'Contact', Email: 'two@example.test', PrimaryPhoneNumber: '5550109876', IsActive: true }],
    ]) };
    const options = { app, capture, references: accountReferences, fetchAccount: (id, options) => fetchAccount(session, id, options) };
    const dry = await runSync({ ...options, runId: 'accounts-dry' });
    assert.deepEqual(dry.errors, []);
    assert.deepEqual(dry.clients.map((item) => [item.account_id, item.action]), [['3835', 'enriched'], ['3837', 'created']]);
    assert.equal(dry.cursor_after.last_account_id, 3837);
    assert.equal(app.rows.Customer.length, 1);
    assert.equal(app.rows.CustomerContact.length, 0);
    assert.equal(app.rows.CustomerLocation.length, 0);
    const applied = await runSync({ ...options, apply: true, runId: 'accounts-apply' });
    assert.deepEqual(applied.errors, []);
    assert.equal(applied.cursor_after.last_account_id, 3837);
    assert.equal(app.rows.Customer.length, 2);
    assert.equal(app.rows.CustomerContact.length, 2);
    assert.equal(app.rows.CustomerLocation.length, 4);
    assert.match(app.rows.Customer.find((item) => item.id === 'order-customer').notes, /account_detail_pending: false/);
    assert.equal(app.rows.Customer.find((item) => item.id === 'order-customer').pricing_tier, 2);
    const created = copy(app.created);
    const again = await runSync({ ...options, apply: true, runId: 'accounts-rerun' });
    assert.deepEqual(again.errors, []);
    assert.deepEqual(app.created, created);
    assert.equal(app.rows.Customer.find((item) => item.id === 'order-customer').notes.includes('account_detail_pending: true'), false);
  }
  {
    secondOrderOtherAccount = true;
    seedOrderNameMissing = true;
    const app = new FakeApp();
    app.rows.Customer.push(
      { id: 'match-one', company_name: 'Synthetic Client & Co', updated_date: 'v1' },
      { id: 'match-two', company_name: 'Synthetic Client & Co', updated_date: 'v2' },
    );
    const accountReferences = { ...references, contacts: new Map([...references.contacts,
      [124, { Id: 124, AccountId: 3837, FirstName: 'Other', LastName: 'Contact', Email: 'two@example.test', IsActive: true }],
    ]) };
    const firstSeen = '2026-11-18T12:00:00.000Z';
    const options = { app, capture, references: accountReferences, fetchAccount: (id, options) => fetchAccount(session, id, options),
      now: () => Date.parse(firstSeen) };
    const before = copy(app.rows);
    const dry = await runSync({ ...options, runId: 'held-dry' });
    assert.deepEqual(dry.errors, []);
    assert.deepEqual(app.rows, before);
    assert.equal(dry.cursor_after.last_account_id, 3837);
    assert.deepEqual(dry.cursor_after.held_accounts, [{ account_id: '3835', name: 'Synthetic Client & Co',
      reason: 'multiple customer name/phone matches', first_seen: firstSeen }]);
    assert.deepEqual(dry.cursor_after.pending_account_orders.map((item) => item.order_id), [11286]);
    assert.equal(dry.cursor_after.pending_account_orders[0].account_name, 'Synthetic Client & Co');
    const first = await runSync({ ...options, apply: true, runId: 'held-first' });
    assert.deepEqual(first.errors, []);
    assert.equal(first.cursor_after.last_account_id, 3837);
    assert.equal(first.cursor_after.last_order_id, 11287);
    assert.deepEqual(first.cursor_after.held_accounts, dry.cursor_after.held_accounts);
    assert.deepEqual(first.cursor_after.pending_account_orders.map((item) => item.order_id), [11286]);
    const skipped = first.skipped.find((item) => item.account_id === '3835' && item.candidate_customer_ids);
    assert.equal(skipped.name, 'Synthetic Client & Co');
    assert.deepEqual(skipped.candidate_customer_ids, ['match-one', 'match-two']);
    assert.equal(app.rows.AllInOneEstimate.find((item) => item.id === 'est-seed').customer_id, '');
    assert.equal(app.rows.Invoice.length, 1);
    assert.equal(app.rows.Invoice[0].invoice_number, 'INV-200');
    assert.equal(app.rows.Customer.filter((item) => item.company_name === 'Synthetic Client & Co').length, 2);
    const stillHeld = await runSync({ ...options, now: () => Date.parse('2026-11-19T12:00:00.000Z'), apply: true, runId: 'held-again' });
    assert.deepEqual(stillHeld.errors, []);
    assert.deepEqual(stillHeld.cursor_after.held_accounts, first.cursor_after.held_accounts);
    assert.deepEqual(stillHeld.cursor_after.pending_account_orders.map((item) => item.order_id), [11286]);
    assert.equal(app.rows.Invoice.length, 1);
    app.rows.Customer.find((item) => item.id === 'match-two').merged_into_customer_id = 'match-one';
    app.rows.Customer.find((item) => item.id === 'match-two').deleted = true;
    accountReferences.contacts.set(123, { Id: 123, AccountId: 3835, FirstName: 'Synthetic', LastName: 'Contact', Email: 'one@example.test', IsActive: true });
    const second = await runSync({ ...options, apply: true, runId: 'held-resolved' });
    assert.deepEqual(second.errors, []);
    assert.deepEqual(second.cursor_after.held_accounts, []);
    assert.deepEqual(second.cursor_after.pending_account_orders, []);
    assert.equal(second.cursor_after.last_account_id, 3837);
    assert.equal(app.rows.AllInOneEstimate.find((item) => item.id === 'est-seed').customer_id, 'match-one');
    assert.equal(app.rows.Invoice.length, 1);
    assert.equal(app.rows.Customer.filter((item) => item.company_name === 'Synthetic Client & Co').length, 2);
    secondOrderOtherAccount = false;
    seedOrderNameMissing = false;
  }
  {
    const app = new FakeApp();
    app.rows.Customer.push({ id: 'unique', company_name: 'Synthetic Client', updated_date: 'v1' });
    const hold = { account_id: '3835', name: 'Synthetic Client', reason: 'multiple matches', first_seen: '2026-11-18T12:00:00.000Z' };
    await app.appendMap({ source_app_id: 'corebridge', source_entity: '__sync_cursor__', source_id: 'old',
      notes: JSON.stringify({ cursor: { last_account_id: 3835, last_order_id: 11286, watch_orders: [], held_accounts: [hold],
        pending_account_orders: [{ order_id: 11286, account_id: '3835', account_name: 'Synthetic Client' }] } }) });
    const missing = await runSync({ app, capture, references, apply: true, runId: 'held-missing', fetchAccount: async () => null });
    assert.deepEqual(missing.errors, []);
    assert.deepEqual(missing.cursor_after.held_accounts, [hold]);
    assert.deepEqual(missing.cursor_after.pending_account_orders.map((item) => item.order_id), [11286, 11287]);
    assert.ok(missing.skipped.some((item) => item.account_id === '3835' && /no longer found/.test(item.reason)));
    assert.equal((await app.map('customers', '3835')).length, 0);
    assert.equal(app.rows.Invoice.length, 0);
  }
  {
    const app = new FakeApp();
    const hold = { account_id: '3835', name: 'Synthetic Client & Co', reason: 'multiple matches', first_seen: '2026-11-18T12:00:00.000Z' };
    await app.appendMap({ source_app_id: 'corebridge', source_entity: '__sync_cursor__', source_id: 'old',
      notes: JSON.stringify({ cursor: { last_account_id: 3835, last_order_id: 11286, watch_orders: [], held_accounts: [hold],
        pending_account_orders: [{ order_id: 11286, account_id: '3835', account_name: 'Synthetic Client' }] } }) });
    const accountReferences = { ...references, contacts: new Map([...references.contacts,
      [123, { Id: 123, AccountId: 3835, FirstName: 'Synthetic', LastName: 'Contact', Email: 'one@example.test', IsActive: true }],
    ]) };
    const resolved = await runSync({ app, capture, references: accountReferences, apply: true, runId: 'held-no-match',
      fetchAccount: (id, options) => id === 3835 ? fetchAccount(session, id, options) : Promise.resolve(null) });
    assert.deepEqual(resolved.errors, []);
    assert.deepEqual(resolved.cursor_after.held_accounts, []);
    assert.deepEqual(resolved.cursor_after.pending_account_orders, []);
    assert.equal(app.created.Customer, 1);
    assert.equal(app.rows.AllInOneEstimate.find((item) => item.id === 'est-seed').customer_id, app.rows.Customer[0].id);
  }
  {
    const app = new FakeApp();
    app.rows.Customer.push(
      { id: 'match-one', company_name: 'Synthetic Client & Co', updated_date: 'v1' },
      { id: 'match-two', company_name: 'Synthetic Client & Co', updated_date: 'v2' },
    );
    const heldAccounts = Array.from({ length: 200 }, (_, i) => ({
      account_id: String(1000 + i), name: `Held ${i}`, reason: 'multiple matches', first_seen: '2026-11-18T12:00:00.000Z',
    }));
    await app.appendMap({ source_app_id: 'corebridge', source_entity: '__sync_cursor__', source_id: 'old',
      notes: JSON.stringify({ cursor: { last_account_id: 3834, last_order_id: 11286, watch_orders: [],
        pending_account_orders: [{ order_id: 11286, account_id: '3835', account_name: 'Synthetic Client' }], held_accounts: heldAccounts } }) });
    const result = await runSync({ app, capture, references, apply: true, runId: 'held-capacity',
      fetchAccount: (id, options) => id < 3835 ? Promise.resolve(null) : fetchAccount(session, id, options) });
    assert.deepEqual(result.errors, []);
    assert.equal(result.cursor_after.last_account_id, 3834);
    assert.equal(result.cursor_after.last_order_id, 11287);
    assert.deepEqual(result.cursor_after.held_accounts, heldAccounts);
    assert.deepEqual(result.cursor_after.pending_account_orders.map((item) => item.order_id), [11286, 11287]);
    assert.ok(result.warnings.some((message) => /Held account limit reached/.test(message)));
    assert.equal(app.rows.Invoice.length, 0);
    assert.equal(app.created.Customer, undefined);
  }
  {
    const app = new FakeApp();
    mergedCustomer(app);
    const loser = copy(app.rows.Customer.find((row) => row.id === 'merged-0'));
    app.rows.AllInOneEstimate[0].customer_id = 'merged-0';
    app.rows.WorkOrder[1].customer_id = 'merged-0';
    app.rows.AllInOneEstimate.push({ id: 'other-estimate', customer_id: 'merged-1', updated_date: 'v1' });
    app.rows.WorkOrder.push({ id: 'other-job', estimate_id: 'other-estimate', customer_id: '', updated_date: 'v1' });
    const dry = await run({ app, runId: 'merged-dry' });
    assert.deepEqual(dry.errors, []);
    assert.equal(dry.pipeline_links.find((row) => row.id === 'other-job').customer_id, 'survivor');
    assert.deepEqual(app.rows.Customer.find((row) => row.id === 'merged-0'), loser);
    const applied = await run({ app, apply: true, runId: 'merged-apply' });
    assert.deepEqual(applied.errors, []);
    assert.equal(app.rows.AllInOneEstimate.find((row) => row.id === 'est-seed').customer_id, 'survivor');
    assert.equal(app.rows.AllInOneEstimate.find((row) => row.creation_request_key === 'cb:estimates:11287').customer_id, 'survivor');
    assert.equal(app.rows.Invoice[0].customer_id, 'survivor');
    assert.equal(app.rows.Payment[0].customer_id, 'survivor');
    for (const row of app.rows.WorkOrder) assert.equal(row.customer_id, 'survivor');
    assert.deepEqual(app.rows.Customer.find((row) => row.id === 'merged-0'), loser);
  }
  {
    const app = new FakeApp();
    mergedCustomer(app);
    app.rows.Invoice.push({ id: 'old-invoice', creation_request_key: 'cb:invoice:11287', customer_id: 'merged-0', estimate_id: '' });
    app.rows.Payment.push({ id: 'old-payment', creation_request_key: 'cb:payment:77', customer_id: 'merged-0', invoice_id: 'old-invoice', amount: 50 });
    app.rows.LegacyMigrationMap.push(
      { id: 'old-invoice-map', source_app_id: 'corebridge', source_entity: 'invoices', source_id: '11287', target_entity: 'Invoice', target_id: 'old-invoice' },
      { id: 'old-payment-map', source_app_id: 'corebridge', source_entity: 'payments', source_id: '77', target_entity: 'Payment', target_id: 'old-payment' },
    );
    const applied = await run({ app, apply: true, runId: 'merged-existing-invoice' });
    assert.deepEqual(applied.errors, []);
    assert.equal(app.rows.Invoice[0].customer_id, 'survivor');
    assert.equal(app.rows.Payment[0].customer_id, 'survivor');
    assert.equal(app.created.Invoice, undefined);
    assert.equal(app.created.Payment, undefined);
  }
  {
    const app = new FakeApp();
    mergedCustomer(app, 5);
    const applied = await run({ app, apply: true, runId: 'five-merge-hops' });
    assert.deepEqual(applied.errors, []);
    assert.equal(app.rows.Invoice[0].customer_id, 'survivor');
  }
  for (const scenario of ['cycle', 'missing', 'deleted', 'too-many-hops']) {
    const app = new FakeApp();
    mergedCustomer(app, scenario === 'too-many-hops' ? 6 : 2);
    if (scenario === 'cycle') app.rows.Customer.find((row) => row.id === 'merged-1').merged_into_customer_id = 'merged-0';
    if (scenario === 'missing') app.rows.Customer.find((row) => row.id === 'merged-1').merged_into_customer_id = 'missing';
    if (scenario === 'deleted') app.rows.Customer.find((row) => row.id === 'survivor').deleted = true;
    const blocked = await run({ app, apply: true, runId: `merge-${scenario}` });
    assert.match(blocked.errors[0], { cycle: /cyclic/, missing: /missing/, deleted: /deleted/, 'too-many-hops': /exceeds five hops/ }[scenario]);
    assert.equal(blocked.cursor_after.last_order_id, 11286);
    assert.equal(app.rows.Invoice.length, 0);
  }
  {
    const app = new FakeApp();
    await app.appendMap({
      source_app_id: 'corebridge', source_entity: '__sync_write__', source_id: 'cb:invoice:11287',
      target_entity: '__sync_write__', target_id: 'pending',
      notes: JSON.stringify({ state: 'pending', key: 'cb:invoice:11287', entity: 'Invoice', source_entity: 'invoices', source_id: '11287', order_id: 11287, at: '2000-01-01T00:00:00.000Z' }),
    });
    const blocked = await run({ app, apply: true, runId: 'unresolved' });
    assert.match(blocked.errors[0], /Unresolved pending/);
    assert.equal(blocked.cursor_after.last_order_id, 11286);
    assert.equal(app.rows.Invoice.length, 0);
  }
  console.log('PASS fake HTTP CoreBridge and app: held accounts and orders, retry after merge, overflow, account scans, enrichment, idempotence, watches, pipeline and recovery');
} finally {
  server.close();
  await once(server, 'close');
}
