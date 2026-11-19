import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCredentials, loginCoreBridge, parseLoginForm } from './auth.mjs';
import { parseCursor, scanAbove, updateWatchOrders } from './cursor.mjs';
import { captureOrder, extractJsonAfter, historyRows, scrub } from './lib/order-capture.mjs';
import { estimateRecord, invoiceLines, invoiceRecord, paymentRecord, sourceLine } from './lib/order-model.mjs';
import { matchAccount, matchLead } from './lib/matching.mjs';
import { RateLimiter, requestCost } from './lib/app-client.mjs';
import { fetchAccount } from './lib/accountSource.mjs';
import { parseAccount } from './lib/accountParser.mjs';
import { accountContactRows } from './lib/account-model.mjs';

const html = `<form name="form1" id="form1" action="/Login.aspx"><input name="__VIEWSTATE" value="a&amp;b">
<input value='generator' name='__VIEWSTATEGENERATOR'><input name="__EVENTVALIDATION" value="valid">
<input name="txtUsername"><input name="txtPassword"></form>`;
assert.equal(parseLoginForm(html).fields.__VIEWSTATE, 'a&b');
assert.throws(() => parseLoginForm('<form id="form1"></form>'), /missing __VIEWSTATE/);
assert.throws(() => loadCredentials({ CB_USERNAME: 'name' }, () => { throw Object.assign(new Error(), { code: 'ENOENT' }); }), /Both/);
let requests = 0;
const fakeFetch = async (url, init) => {
  requests++;
  if (requests === 1) return new Response(html, { status: 200, headers: { 'set-cookie': 'ASP.NET_SessionId=example; Path=/' } });
  if (requests === 2) {
    assert.equal(init.method, 'POST');
    assert.match(init.headers.get('cookie'), /ASP.NET_SessionId=example/);
    assert.equal(init.body.get('__EVENTTARGET'), 'btnLogin');
    assert.equal(init.body.get('txtUsername'), 'example-user');
    assert.equal(init.body.get('txtPassword'), 'example-password');
    return new Response(null, { status: 302, headers: { location: '/Default.aspx', 'set-cookie': '.ASPXAUTH=session; Path=/' } });
  }
  assert.match(init.headers.get('cookie'), /\.ASPXAUTH=session/);
  return new Response('order', { status: 200 });
};
await loginCoreBridge({ username: 'example-user', password: 'example-password', fetchImpl: fakeFetch });
assert.equal(requests, 3);
let failedRequests = 0;
await assert.rejects(() => loginCoreBridge({
  username: 'example-user', password: 'example-password',
  fetchImpl: async () => {
    failedRequests++;
    return failedRequests === 1 ? new Response(html) : new Response(null, { status: 302, headers: { location: '/Login.aspx' } });
  },
}), /rejected/);
assert.equal(failedRequests, 2);
assert.deepEqual(parseCursor(null), { last_account_id: 3834, last_order_id: 11286, watch_orders: [], pending_account_orders: [
  { order_id: 11286, account_id: '3835', account_name: 'Cincinnati Vietnamese Baptist Church' },
], held_accounts: [] });
assert.deepEqual(parseCursor({ notes: JSON.stringify({ cursor: { last_account_id: 3835, last_order_id: 11290, watch_orders: [11287, 11288] } }) }), { last_account_id: 3835, last_order_id: 11290, watch_orders: [11287, 11288], pending_account_orders: [], held_accounts: [] });
assert.throws(() => parseCursor({ notes: '{}' }), /invalid/);
assert.throws(() => parseCursor({ notes: JSON.stringify({ cursor: { last_account_id: 3835, last_order_id: 11290, watch_orders: [12, 12] } }) }), /invalid watched/);
const held = { account_id: '3835', name: 'Synthetic Client', reason: 'multiple matches', first_seen: '2026-11-18T12:00:00.000Z' };
const cursorWithHeld = (items) => ({ notes: JSON.stringify({ cursor: { last_account_id: 3835, last_order_id: 11290, held_accounts: items } }) });
assert.deepEqual(parseCursor(cursorWithHeld([held])).held_accounts, [held]);
assert.deepEqual(parseCursor(cursorWithHeld([{ ...held, account_id: 3835 }])).held_accounts, [held]);
for (const item of [
  { ...held, account_id: '0' }, { ...held, account_id: '1.5' }, { ...held, name: '' },
  { ...held, reason: '' }, { ...held, first_seen: 'bad' }, null,
]) assert.throws(() => parseCursor(cursorWithHeld([item])), /invalid held accounts/);
assert.throws(() => parseCursor(cursorWithHeld([held, { ...held, account_id: 3835 }])), /invalid held accounts/);
assert.throws(() => parseCursor(cursorWithHeld(Array.from({ length: 201 }, (_, i) => ({ ...held, account_id: String(i + 1) })))), /invalid held accounts/);
assert.deepEqual(updateWatchOrders([1, 2], 1, true), { watch_orders: [1, 2], dropped: [] });
assert.deepEqual(updateWatchOrders([1, 2], 1, false), { watch_orders: [2], dropped: [] });
const watch = updateWatchOrders(Array.from({ length: 200 }, (_, i) => i + 1), 201, true);
assert.equal(watch.watch_orders.length, 200);
assert.deepEqual(watch.dropped, [1]);
const scanned = [];
const scan = await scanAbove({
  high: 10, missLimit: 3, maxRecords: 10,
  probe: async (id) => [11, 13].includes(id) ? { id } : null,
  processRecord: async (_row, id) => scanned.push(id),
});
assert.deepEqual(scanned, [11, 13]);
assert.equal(scan.lastProcessed, 13);
assert.equal(scan.lastProbed, 16);
assert.equal(scan.consecutiveMisses, 3);
const cap = await scanAbove({ high: 10, missLimit: 3, maxRecords: 2, probe: async (id) => ({ id }), processRecord: async () => {} });
assert.equal(cap.lastProcessed, 12);
assert.equal(cap.capReached, true);
await assert.rejects(() => scanAbove({ high: 10, missLimit: 3, maxRecords: 2, probe: async (id) => ({ id }), processRecord: async () => { throw new Error('failed'); } }), /failed/);
await assert.rejects(() => scanAbove({
  high: 10, missLimit: 3, maxRecords: 3, probe: async (id) => ({ id }),
  processRecord: async (_row, id) => { if (id === 12) throw new Error('failed'); },
}), (error) => error.message === 'failed' && error.lastProcessed === 11 && error.failedId === 12);
console.log('PASS CoreBridge login and cursor fixtures');

let clock = 0;
const waits = [];
const limiter = new RateLimiter({ intervalMs: 550, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
await limiter.wait(3);
await limiter.wait();
assert.deepEqual(waits, [1100, 550]);
assert.equal(requestCost('manageMigration', { action: 'import_rows', entity: 'estimates' }), 60);
const accountHtml = readFileSync(new URL('./fixtures/account-synthetic.html', import.meta.url), 'utf8');
const accountExpected = JSON.parse(readFileSync(new URL('./fixtures/account-synthetic.json', import.meta.url), 'utf8'));
assert.deepEqual(parseAccount(accountHtml, 99999), accountExpected);
assert.deepEqual(parseAccount(accountHtml, 99999).contact_ids, ['123']);
assert.deepEqual(accountContactRows(accountExpected, [{ Id: 123, FirstName: 'Synthetic', PrimaryPhoneNumber: '5550101000',
  PrimaryPhoneNumberTypeText: 'Mobile', SecondaryPhoneNumber: '5550102000', SecondaryPhoneNumberTypeText: 'Work' }])
  .map(({ phone, mobile_phone }) => ({ phone, mobile_phone })), [{ phone: '5550102000', mobile_phone: '5550101000' }]);
assert.equal(accountContactRows(accountExpected, [{ Id: 123, FirstName: 'Synthetic', SecondaryPhoneNumber: '5550102000' }])[0].mobile_phone, undefined);
assert.equal(await fetchAccount({ request: async () => new Response('', { status: 500 }) }, 99999), null);
assert.equal(await fetchAccount({ request: async () => new Response('', { status: 404 }) }, 99999), null);
await assert.rejects(() => fetchAccount({ request: async () => new Response(null, { status: 302, headers: { location: '/Login.aspx' } }) }, 99999), /session expired/);
assert.throws(() => parseAccount(accountHtml, 99998), /invalid detail page/);
console.log('PASS weighted entity rate limiter and sanitized account parser');

const archived = JSON.parse(readFileSync(new URL('./fixtures/orders-sanitized.json', import.meta.url), 'utf8'));
const expectedNotes = {
  11286: 'CoreBridge EST-14767 (OrderId 11286) — imported read-only history 2026-11-17.\n\nCoreBridge status: ESTIMATE. Entered by ?.\n\nTotals: subtotal $877.15 · tax $68.42 (rate 7.8%) · total $945.57 · balance due $945.57.',
  2: 'CoreBridge INV-1000 (OrderId 2) — imported read-only history 2026-11-17.\n\nCoreBridge status: CLOSED. Entered by ?.\n\nTotals: subtotal $242.41 · tax $16.97 (rate 7%) · total $259.38 · balance due $0.',
  6: 'CoreBridge EST-1002 (OrderId 6) — imported read-only history 2026-11-17.\n\nCoreBridge status: CANCELLED; cancelled 2015-06-25. Entered by ?.\n\nTotals: subtotal $0 · tax $0 (rate 7%) · total $0 · balance due $0.',
};
for (const order of archived) {
  const { row, lines } = estimateRecord(order, { importedAt: '2026-11-17T00:00:00.000Z', categories: new Map([[4, 'Lobby Sign']]) });
  assert.deepEqual(row, {
    __source_id__: String(order.order_id), project_name: order.expected.estimate_number, ...order.expected,
    client_name: '', customer_id: String(order.header.AccountId), contact_name: '', contact_email: '', contact_phone: '',
    salesperson: '', sales_center: '', po_number: '', site_address: '', tags: 'corebridge_import',
    notes: expectedNotes[order.order_id],
  }, `complete anonymized estimate row ${order.order_id}`);
  assert.deepEqual(lines, order.products.map((product, i) => ({
    line_id: `cb-${product.Id}`, builder_name: `Product ${i + 1}`, client_product_name: '',
    product_category: product.ProductCategoryId === 4 ? 'Lobby Sign' : '',
    customer_description: `Qty ${product.Qty}`, customer_quantity: 1,
    total_snapshot: product.TotalPrice, live_total_snapshot: product.TotalPrice, include_in_customer: true,
    section_status: product.OrderProductStatusCbText,
    product_notes: `CoreBridge product ${product.Id} · status ${product.OrderProductStatusCbText} · qty ${product.Qty}`,
  })), `complete anonymized line rows ${order.order_id}`);
}
assert.equal(sourceLine({ TotalPriceOverridden: 0, TotalPrice: 0, TaxableAmount: 8.25, NonTaxableAmount: 1.75 }), 10);
const discounted = estimateRecord({
  order_id: 99, header: { OrderStatus: 'ESTIMATE', TotalPrice: 85.6, SubTotalPrice: 80, TaxableAmount: 80, NonTaxableAmount: 0, TaxesPrice: 5.6 },
  products: [{ Id: 1, Qty: 1, TotalPrice: 100 }],
}).row;
assert.equal(discounted.discount_percent, 20);
assert.equal(discounted.tax_percent, 7);
const mixed = invoiceLines([{ Description: 'Synthetic product', Qty: 3, TaxableAmount: 9.5, NonTaxableAmount: 4.25 }]);
assert.deepEqual(mixed.map((line) => [line.quantity, line.unit_price, line.taxable]), [[1, 9.5, true], [1, 4.25, false]]);
assert.match(mixed[0].description, /qty 3.*taxable portion/);
const invoice = invoiceRecord({ order_id: 44, header: { InvoiceNumber: 'INV-44', OrderStatus: 'VOIDED', TotalPrice: 100, BalanceDue: 0 }, products: [] },
  { customer_id: 'customer', estimate_id: 'estimate', work_order_ids: [] },
  { payments: [{ Amount: 12 }], refunds: [{ Amount: -3 }] }, '2026-11-17T00:00:00Z');
assert.equal(invoice.status, 'void');
assert.equal(invoice.amount_paid, 9);
assert.equal(invoice.balance_due, 0);
assert.equal(invoice.due_date, '');
assert.equal(paymentRecord({ Id: 7, Amount: 5, Type: 'Visa' }, invoice, false, 500).status, 'refunded');
assert.equal(paymentRecord({ Id: 8, Amount: -5, Type: 'Visa' }, invoice, true).creation_request_key, 'cb:refund:8');
console.log('PASS sanitized archived estimate and synthetic invoice/payment mapping fixtures');

const customers = [
  { id: 'one', company_name: 'Acme, Inc.', company_phone: '555-000-1111' },
  { id: 'merged', company_name: 'Acme LLC', merged_into_customer_id: 'one' },
  { id: 'two', company_name: 'Other Co', company_phone: '555-000-2222' },
];
assert.equal(matchAccount({ company_name: 'Acme' }, customers).kind, 'linked');
assert.equal(matchAccount({ company_name: 'Unknown' }, customers).kind, 'new');
assert.equal(matchAccount({ company_name: 'Acme', company_phone: '555-000-2222' }, customers).kind, 'ambiguous');
assert.equal(matchLead('Acme, Inc.', customers).matches[0].id, 'one');
assert.equal(matchLead('', customers).kind, 'invalid');
console.log('PASS account and lead matching fixtures');

assert.deepEqual(extractJsonAfter('var orderObj = {"x":"}","nested":{"v":1}};', 'var orderObj = '), { x: '}', nested: { v: 1 } });
assert.deepEqual(scrub({ password: 'secret', nested: { ApiToken: 'secret', safe: 1 } }), { nested: { safe: 1 } });
assert.deepEqual(historyRows('<table><tr><td>Sent</td><td>date</td><td>user</td></tr></table>'), [{ event: 'Sent', at: 'date', user: 'user', extra: [] }]);
const requestPaths = [];
const session = { request: async (path, init) => {
  requestPaths.push(path);
  if (path.includes('/Order.aspx')) return new Response('<title>Order</title><script>var orderObj = {"Id":45,"AccountId":8,"OrderStatus":"ESTIMATE","CompanyName":"Synthetic"};</script>');
  if (path.includes('GetOrderProductsView')) return new Response(JSON.stringify({ OrderProducts: [{ Id: 1, Password: 'hidden' }] }));
  if (path.includes('DetailedOrderView')) return new Response('<div>Part details</div>');
  if (path.includes('GetOrderPayments2') || path.includes('GetOrderRefunds')) return new Response(JSON.stringify({ d: JSON.stringify({ ReportResults: [] }) }));
  if (path.includes('OrderNotes')) return new Response('<input id="hdnOrderNotes" value="Synthetic &amp; safe">');
  if (path.endsWith('PageIndex=')) return new Response('<table><tr><td>Sent</td><td>date</td><td>user</td></tr></table><a>Page$2</a>');
  if (path.endsWith('PageIndex=2')) return new Response('<table><tr><td>Viewed</td><td>date</td><td>user</td></tr></table>');
  throw new Error(`Unexpected path ${path}, method ${init?.method || 'GET'}`);
} };
const captured = await captureOrder(session, 45);
assert.equal(captured.history.length, 2);
assert.equal(captured.notes_text, 'Synthetic & safe');
assert.equal(captured.products[0].Password, undefined);
assert.equal(requestPaths.length, 8);
await assert.rejects(() => captureOrder({ request: async () => new Response(null, { status: 302, headers: { location: '/Login.aspx' } }) }, 45), /expired/);
assert.equal(await captureOrder({ request: async () => new Response('', { status: 500 }) }, 45), null);
console.log('PASS synthetic order capture, pagination, redaction and auth failure fixtures');
