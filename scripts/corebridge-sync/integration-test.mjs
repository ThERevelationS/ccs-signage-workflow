import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginCoreBridge } from './auth.mjs';
import { AppCallError } from './lib/app-client.mjs';
import { captureAccountFixture } from './lib/accountSource.mjs';
import { captureOrder, loadOrderReferences } from './lib/order-capture.mjs';
import { runSync } from './lib/sync-engine.mjs';

const copy = (value) => structuredClone(value);
class FakeApp {
  constructor() {
    this.serial = 0;
    this.created = {};
    this.rows = {
      LegacyMigrationMap: [{
        id: 'map-seed', created_date: '2026-01-01T00:00:00Z', source_app_id: 'corebridge',
        source_entity: 'estimates', source_id: '11286', target_entity: 'AllInOneEstimate', target_id: 'est-seed',
      }],
      Customer: [],
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
    Object.assign(row, copy(patch), { updated_date: `v${++this.serial}` });
    return copy(row);
  }
  async importMapped(entity, data) {
    const target = entity === 'customers' ? 'Customer' : 'AllInOneEstimate';
    const source = data.__source_id__, id = `${target}-${++this.serial}`;
    const row = { ...copy(data), id, creation_request_key: `cb:${entity}:${source}`, updated_date: `v${this.serial}` };
    if (entity === 'estimates') {
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
let status = 'ESTIMATE', hasRefund = false, paymentAmount = 50;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/Login.aspx') {
    if (req.method === 'GET') { res.setHeader('set-cookie', 'session=test'); return res.end(html); }
    res.writeHead(302, { location: '/Home.aspx', 'set-cookie': 'auth=test' }); return res.end();
  }
  if (!String(req.headers.cookie).includes('auth=test')) { res.writeHead(302, { location: '/Login.aspx' }); return res.end(); }
  if (url.pathname === '/accounts.aspx') return res.end('<a href="/account.aspx?AccountId=3835">Synthetic account</a>');
  if (url.pathname === '/account.aspx') return res.end('<html>Sanitized synthetic account fixture</html>');
  const body = [];
  for await (const chunk of req) body.push(chunk);
  const payload = body.length ? JSON.parse(Buffer.concat(body).toString()) : {};
  const orderId = Number(url.searchParams.get('OrderId') || url.searchParams.get('orderId') || payload.OrderId);
  if (url.pathname.endsWith('GetProductCategories')) return res.end(JSON.stringify({ d: JSON.stringify({ productCategories: [{ id: 4, name: 'Synthetic category' }] }) }));
  if (url.pathname.endsWith('GetAllContacts')) return res.end(JSON.stringify({ d: JSON.stringify({ aaData: [{ Id: 99, FirstName: 'Synthetic', LastName: 'Contact' }], iTotalRecords: 1 }) }));
  if (url.pathname.endsWith('/Order.aspx')) {
    if (![11286, 11287].includes(orderId)) { res.writeHead(404); return res.end(); }
    const header = orderId === 11286
      ? { Id: 11286, AccountId: 3835, CompanyName: 'Synthetic Client', OrderStatus: status, EstimateNumber: 'EST-14767', TotalPrice: 100, BalanceDue: 100, SubTotalPrice: 100, TaxableAmount: 100 }
      : { Id: 11287, AccountId: 3835, CompanyName: 'Synthetic Client', OrderStatus: 'INVOICED', InvoiceNumber: 'INV-200', TotalPrice: 100, BalanceDue: hasRefund ? 70 : 50, SubTotalPrice: 100, TaxableAmount: 100 };
    if (orderId === 11286 && status === 'INVOICED') header.InvoiceNumber = 'INV-201';
    header.OrderContactId = 99;
    header.Account = { Id: 3835, CompanyName: 'Synthetic Client', CompanyPhone: '555-000-1111' };
    return res.end(`<title>Order</title><script>var orderObj = ${JSON.stringify(header)};</script>`);
  }
  if (url.pathname.endsWith('GetOrderProductsView')) return res.end(JSON.stringify({ OrderProducts: [{ Id: 9, ProductCategoryId: 4, Description: 'Synthetic product', Qty: 1, TotalPrice: 100, TaxableAmount: 100 }] }));
  if (url.pathname.endsWith('GetOrderPayments2')) return res.end(JSON.stringify({ d: JSON.stringify({ ReportResults: orderId === 11287 ? [{ Id: 77, Amount: paymentAmount, Type: 'Cash' }] : [] }) }));
  if (url.pathname.endsWith('GetOrderRefunds')) return res.end(JSON.stringify({ d: JSON.stringify({ ReportResults: hasRefund && orderId === 11287
    ? [{ Id: 78, Amount: -20, Type: 'Cash', OrderPaymentRefundInfos: [{ TransactionToRefundId: 77 }] }] : [] }) }));
  if (url.pathname.endsWith('OrderNotes.aspx')) return res.end('<input id="hdnOrderNotes" value="">');
  if (url.pathname.endsWith('OrderHistory.aspx')) return res.end('<table></table>');
  if (url.pathname.endsWith('DetailedOrderView.aspx')) return res.end('<div>Parts</div>');
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
    assert.match(amountChanged.errors[0], /amount changed; batch reconciliation is required/);
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
  console.log('PASS fake HTTP CoreBridge and app: dry run, apply, idempotence, seed recovery, watches, refunds, pipeline, timeout recovery, lease collision, deferred accounts and merged-customer chains');
} finally {
  server.close();
  await once(server, 'close');
}
