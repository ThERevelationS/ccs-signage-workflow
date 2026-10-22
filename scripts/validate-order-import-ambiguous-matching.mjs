import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as matching from '../base44/shared/orderImportMatching.mjs';
import * as persistence from '../base44/shared/orderImportPersistence.mjs';

// Execute the actual backend handler with in-memory entities and workbook rows.
// This file makes no Base44, Smartsheet, or other network requests.
const entry = readFileSync('base44/functions/importOrders/entry.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const clone = value => structuredClone(value);
const baseline = (id, extra = {}) => ({
  id, updated_date: 'version-1', customer_name: 'Acme', description: 'Panel',
  request_type: 'Vinyl', quantity: '1', status: 'pending', deleted: false,
  work_order_id: 'job-a', smartsheet_sheet_id: '123456', smartsheet_row_id: id + '-row',
  smartsheet_pending_local_sync: false, ...extra,
});
const sourceRow = (extra = {}) => ({
  Customer: 'Acme', Description: 'Panel', Type: 'Vinyl', Quantity: '9', ...extra,
});

function fixture({ orders = [], rows = [], workOrderFilter = '', onIdentityRead, actor = { role: 'admin' } } = {}) {
  const records = new Map(orders.map(order => [order.id, clone(order)]));
  const writes = [];
  let reads = 0;
  let handler;
  const entity = {
    async get(id) { return records.has(id) ? clone(records.get(id)) : null; },
    async updateMany(query, change) {
      const current = records.get(query.id);
      if (!current || current.updated_date !== query.updated_date) return { updated: 0 };
      writes.push({ operation: 'update', id: query.id, fields: clone(change.$set) });
      records.set(query.id, { ...current, ...clone(change.$set), updated_date: 'saved-' + writes.length });
      return { updated: 1 };
    },
    async create(data) {
      const record = { ...clone(data), id: 'synthetic-new-' + writes.length, updated_date: 'created-version' };
      writes.push({ operation: 'create', fields: clone(data) });
      records.set(record.id, record);
      return clone(record);
    },
  };
  const env = {
    ...matching, ...persistence,
    Deno: { serve(fn) { handler = fn; } },
    createClientFromRequest: () => ({ asServiceRole: { entities: { Order: entity } } }),
    authenticateSignShopSession: async (_base44, token) => {
      assert.equal(token, 'synthetic-only');
      return actor;
    },
    XLSX: {
      read: () => ({ SheetNames: ['Orders'], Sheets: { Orders: {} } }),
      utils: { sheet_to_json: () => clone(rows) },
    },
    format: date => new Date(date).toISOString().slice(0, 10),
    loadAllEntityRows: async ({ query }) => {
      reads++;
      if (Object.hasOwn(query, 'customer_name') && onIdentityRead) onIdentityRead(records);
      return [...records.values()].filter(record =>
        Object.entries(query).every(([key, value]) =>
          key === 'deleted' ? record.deleted !== true : record[key] === value)).map(clone);
    },
    Response, Uint8Array, atob,
    setTimeout: callback => { callback(); return 0; },
    console: { log() {}, error() {} },
  };
  vm.runInNewContext(entry, env, { filename: 'actual-importOrders-entry.ts' });
  assert.equal(typeof handler, 'function');
  return {
    records, writes,
    get reads() { return reads; },
    async run() {
      const response = await handler(new Request('https://synthetic.invalid/importOrders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: 'synthetic-only', fileData: btoa('fixture'), workOrderFilter }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

{
  const first = baseline('order-first');
  const second = baseline('order-second', { work_order_id: 'job-b', quantity: '2' });
  const test = fixture({ orders: [first, second], rows: [sourceRow()] });
  const { status, body } = await test.run();
  assert.equal(status, 200);
  assert.equal(body.conflicts, 1);
  assert.equal(body.updated + body.created + body.skipped + body.errors, 0);
  assert.match(body.issues[0].message, /Multiple existing Orders/);
  assert.equal(test.writes.length, 0);
  assert.deepEqual(test.records.get(first.id), first);
  assert.deepEqual(test.records.get(second.id), second);
  console.log('PASS ambiguous existing matches across jobs do not update, create, or queue either Order');
}

{
  const first = baseline('order-first');
  const second = baseline('order-second', { work_order_id: 'job-b', quantity: '2' });
  const test = fixture({ orders: [first, second], rows: [sourceRow()], workOrderFilter: 'job-a' });
  const { body } = await test.run();
  assert.equal(body.updated, 1);
  assert.equal(body.conflicts, 0);
  assert.equal(test.writes.length, 1);
  const saved = test.records.get(first.id);
  assert.equal(saved.quantity, '9');
  assert.equal(saved.smartsheet_pending_local_sync, true);
  for (const key of ['id', 'work_order_id', 'smartsheet_sheet_id', 'smartsheet_row_id']) {
    assert.equal(saved[key], first[key]);
  }
  assert.deepEqual(test.records.get(second.id), second);
  console.log('PASS a unique match inside the selected job updates atomically and preserves permanent identities');
}

{
  const active = baseline('order-active');
  const deleted = baseline('order-deleted', { deleted: true });
  const test = fixture({ orders: [active, deleted], rows: [sourceRow({ Quantity: '1' })] });
  const { body } = await test.run();
  assert.equal(body.skipped, 1);
  assert.equal(body.conflicts, 0);
  assert.equal(test.writes.length, 0);
  assert.equal(test.records.get(active.id).smartsheet_pending_local_sync, false);
  assert.deepEqual(test.records.get(deleted.id), deleted);
  console.log('PASS unique unchanged import preserves its marker and leaves Order Trash untouched');
}

{
  const repeated = baseline('order-repeated');
  const unique = baseline('order-unique', { description: 'Unique panel' });
  const test = fixture({
    orders: [repeated, unique],
    rows: [sourceRow(), sourceRow({ Customer: ' ACME ', Quantity: '12' }),
      sourceRow({ Description: 'Unique panel', Quantity: '5' })],
  });
  const { body } = await test.run();
  assert.equal(body.conflicts, 2);
  assert.equal(body.updated, 1);
  assert.equal(body.total, 3);
  assert.deepEqual(body.issues.map(issue => issue.row), [1, 2]);
  assert.ok(body.issues.every(issue => /Multiple rows in this file/.test(issue.message)));
  assert.deepEqual(test.records.get(repeated.id), repeated);
  assert.equal(test.records.get(unique.id).quantity, '5');
  assert.equal(test.writes.length, 1);
  console.log('PASS all repeated workbook identities are held before their first write while unrelated unique rows import');
}

{
  const test = fixture({ rows: [sourceRow({ Type: '' }), sourceRow({ Type: 'Other' })] });
  const { body } = await test.run();
  assert.equal(body.conflicts, 2);
  assert.equal(body.created, 0);
  assert.equal(test.writes.length, 0);
  console.log('PASS blank and explicit Other item types cannot bypass repeated-source protection');
}

{
  const first = baseline('order-first', { customer_name: ' Acme ' });
  const second = baseline('order-second', { customer_name: 'ACME', request_type: 'vinyl' });
  const test = fixture({ orders: [first, second], rows: [sourceRow()] });
  const { body } = await test.run();
  assert.equal(body.conflicts, 1);
  assert.equal(test.writes.length, 0);
  console.log('PASS case and surrounding whitespace cannot hide multiple existing matches');
}

{
  const first = baseline('order-first', { customer_name: 'A|B', description: 'C' });
  const second = baseline('order-second', { customer_name: 'A', description: 'B|C' });
  const test = fixture({
    orders: [first, second],
    rows: [sourceRow({ Customer: 'A|B', Description: 'C', Quantity: '3' }),
      sourceRow({ Customer: 'A', Description: 'B|C', Quantity: '4' })],
  });
  const { body } = await test.run();
  assert.equal(body.updated, 2);
  assert.equal(body.conflicts, 0);
  assert.equal(test.records.get(first.id).quantity, '3');
  assert.equal(test.records.get(second.id).quantity, '4');
  console.log('PASS delimiter text in customer names and descriptions cannot collide into one import target');
}

{
  const test = fixture({ rows: [sourceRow({ Type: '' })] });
  const { body } = await test.run();
  assert.equal(body.created, 1);
  assert.equal(body.conflicts, 0);
  assert.equal(test.writes.length, 1);
  assert.equal(test.writes[0].fields.request_type, 'Other');
  assert.equal(test.writes[0].fields.smartsheet_pending_local_sync, true);
  console.log('PASS an unambiguous new Order still creates with its durable pending marker');
}

{
  const concurrent = baseline('order-concurrent');
  const test = fixture({ rows: [sourceRow()], onIdentityRead(records) {
    records.set(concurrent.id, clone(concurrent));
  } });
  const { body } = await test.run();
  assert.equal(body.updated, 1);
  assert.equal(body.created, 0);
  assert.equal(test.writes.length, 1);
  assert.equal(test.writes[0].id, concurrent.id);
  assert.equal(test.records.get(concurrent.id).smartsheet_pending_local_sync, true);
  console.log('PASS a unique concurrent create match retains the guarded update and durable queue behavior');
}

{
  const test = fixture({ rows: [sourceRow()], onIdentityRead(records) {
    records.set('order-one', baseline('order-one'));
    records.set('order-two', baseline('order-two'));
  } });
  const { body } = await test.run();
  assert.equal(body.conflicts, 1);
  assert.equal(test.writes.length, 0);
  console.log('PASS multiple matches discovered during create preflight do not create or overwrite a record');
}

{
  const test = fixture({ rows: [sourceRow()], actor: { role: 'user', can_import_export: false } });
  const { status } = await test.run();
  assert.equal(status, 403);
  assert.equal(test.reads, 0);
  assert.equal(test.writes.length, 0);
  console.log('PASS Order import permission remains enforced before entity reads or writes');
}
