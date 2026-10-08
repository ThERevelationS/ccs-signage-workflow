import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORDER_PULL_DIRECT_READBACK_LIMIT, loadOrderPullReadbackRows } from '../base44/shared/smartsheetOrderReadbackRows.mjs';
import { classifyOrderPullBusinessReadback } from '../base44/shared/smartsheetOrderPullSafety.mjs';
import { findUnverifiedSyncMetadata } from '../base44/shared/smartsheetOrderMetadataVerification.mjs';

assert.equal(ORDER_PULL_DIRECT_READBACK_LIMIT, 3);
let gets = [];
let scans = 0;
const entity = { async get(id) { gets.push(id); return { id, smartsheet_sheet_id: '4963691473987460', smartsheet_row_id: id === 'a' ? '12345' : '98765', description: 'New', smartsheet_sync_snapshot: { col: 'New' }, smartsheet_last_synced_at: '2026-10-08T12:00:00Z' }; } };
const scan = async () => { scans++; return [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]; };
const sheetId = '4963691473987460';

assert.deepEqual(await loadOrderPullReadbackRows({ entity, ids: [], readLinkedOrders: scan }), []);
assert.equal(gets.length, 0);
assert.equal(scans, 0);
const small = await loadOrderPullReadbackRows({ entity, ids: ['a', 'b'], sheetId, readLinkedOrders: scan });
assert.deepEqual(gets, ['a', 'b']);
assert.equal(scans, 0);
assert.deepEqual(small.map(r => r.id), ['a', 'b']);
const order = { id: 'a', sheetId: '4963691473987460', rowId: '12345', fields: { description: 'New' } };
assert.deepEqual(classifyOrderPullBusinessReadback([order], small).failures, []);
assert.deepEqual(findUnverifiedSyncMetadata([{ id: 'a', smartsheet_sync_snapshot: { col: 'New' }, smartsheet_last_synced_at: '2026-10-08T12:00:00Z' }], small), []);

gets = []; scans = 0;
const exactlyThree = await loadOrderPullReadbackRows({ entity, ids: ['a', 'a', 'b', 'c'], sheetId, readLinkedOrders: scan });
assert.deepEqual(exactlyThree.map(row => row.id), ['a', 'b', 'c']);
assert.equal(gets.length, 3);
assert.equal(scans, 0);
gets = []; scans = 0;
const large = await loadOrderPullReadbackRows({ entity, ids: ['a', 'b', 'c', 'd'], sheetId, readLinkedOrders: scan });
assert.deepEqual(large.map(row => row.id), ['a', 'b', 'c', 'd']);
assert.equal(gets.length, 0);
assert.equal(scans, 1);
console.log('PASS small Order verification reads only exact IDs; larger batches preserve the complete paginated scan');

await assert.rejects(() => loadOrderPullReadbackRows({ entity, ids: ['a', ''], sheetId, readLinkedOrders: scan }), /missing a permanent/);
await assert.rejects(() => loadOrderPullReadbackRows({ entity: { get: async () => ({ id: 'not-requested' }) }, ids: ['a'], sheetId, readLinkedOrders: scan }), /did not confirm/);
await assert.rejects(() => loadOrderPullReadbackRows({ entity: { get: async () => null }, ids: ['a'], sheetId, readLinkedOrders: scan }), /did not confirm/);
await assert.rejects(() => loadOrderPullReadbackRows({ entity: { get: async () => { throw new Error('Base44 read failed'); } }, ids: ['a'], sheetId, readLinkedOrders: scan }), /Base44 read failed/);
await assert.rejects(() => loadOrderPullReadbackRows({ entity, ids: ['a', 'b', 'c', 'd'], sheetId }), /Complete Order read-back is unavailable/);
await assert.rejects(() => loadOrderPullReadbackRows({ entity, ids: ['a'], sheetId: '222222222', readLinkedOrders: scan }), /configured Smartsheet sheet/);
await assert.rejects(() => loadOrderPullReadbackRows({ entity, ids: ['a'], sheetId: '', readLinkedOrders: scan }), /missing the configured/);
assert.equal(scans, 1, 'Failed exact read must not fall back to an unplanned full scan');
console.log('PASS missing IDs, mismatched reads, and Base44 errors fail closed without promoting snapshots');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const pull = backend.slice(backend.indexOf('async function pullDataset('), backend.indexOf('async function loadSyncConfig('));
assert.match(pull, /const actualRows = await loadOrderPullReadbackRows\(\{/);
assert.match(pull, /ids: eligible\.map\(item => item\.id\),\s*sheetId/);
assert.match(pull, /const metadataRows = dataset === 'orders'[\s\S]*?loadOrderPullReadbackRows\(\{/);
assert.match(pull, /ids: verifiedMetadataExpected\.map\(item => item\.id\),\s*sheetId/);
assert.match(pull, /: await readCompleteMetadata\(\)/);
assert.match(pull, /classifyOrderPullBusinessReadback\(eligible, actualRows\)/);
assert.match(pull, /findUnverifiedSyncMetadata\(/);
console.log('PASS both Order read-back passes use exact-ID optimization; Sales path and verification gates remain unchanged');
