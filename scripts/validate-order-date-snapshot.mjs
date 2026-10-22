import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['base44/shared/smartsheetSyncFields.ts'],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const fieldTranslator = await import('data:text/javascript;base64,' +
  Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const { buildOrderPullSnapshot, buildSnapshot } = fieldTranslator;

const mergeCompiled = await build({
  entryPoints: ['base44/shared/smartsheetFieldMerge.ts'],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const fieldMerge = await import('data:text/javascript;base64,' +
  Buffer.from(mergeCompiled.outputFiles[0].text).toString('base64'));
const { planFieldPush } = fieldMerge;

const dateColumn = '1971664343852932';
const bindings = { date_ordered: dateColumn };

// Smartsheet DATE cells omit display_value: the snapshot must record the real
// 'YYYY-MM-DD' cell value, not the missing display string.
{
  const row = { id: '2522093596835716', cells: [{ column_id: dateColumn, value: '2026-08-10', display_value: '' }] };
  assert.equal(buildOrderPullSnapshot(row, bindings)[dateColumn], '2026-08-10');
  assert.equal(buildOrderPullSnapshot(row, bindings)[dateColumn],
    buildSnapshot({ date_ordered: '2026-08-10' }, bindings, 'orders')[dateColumn],
    'pull snapshot and record snapshot must represent the date identically');
}
// A text choice still records its display/value text; a truly blank cell stays ''.
{
  const row = { id: '2', cells: [{ column_id: dateColumn, value: 'Stock' }] };
  assert.equal(buildOrderPullSnapshot(row, bindings)[dateColumn], 'Stock');
  assert.equal(buildOrderPullSnapshot(row, bindings)[dateColumn],
    buildSnapshot({ date_ordered_option: 'Stock' }, bindings, 'orders')[dateColumn]);
  const blank = { id: '3', cells: [{ column_id: dateColumn, value: '' }] };
  assert.equal(buildOrderPullSnapshot(blank, bindings)[dateColumn], '');
}
console.log('PASS Order pull snapshots keep real DATE values instead of recording every date as blank');

// Legacy baseline ('' or absent) + both sides nonblank and different on a date
// column: no auto-winner; the field routes to conflict review.
{
  const upserts = [];
  const base44 = {
    asServiceRole: { entities: {
      FieldAudit: { filter: async () => ({ items: [] }) },
      SyncConflict: {
        filter: async () => ({ items: [] }),
        updateMany: async () => ({}),
        upsert: async (rows) => { upserts.push(...rows); return rows; },
      },
    } },
  };
  const remoteRow = { id: 'r1', modified_at: '2026-08-20T00:00:00Z',
    cells: [{ column_id: dateColumn, value: '2026-08-11' }] };
  const rawSheet = { columns: [{ id: dateColumn }],
    rows: [{ id: 'r1', cells: [{ columnId: dateColumn, value: '2026-08-11' }] }] };
  const plan = await planFieldPush({
    base44,
    record: { id: 'o1', customer_name: 'Acme', date_ordered: '2026-08-10',
      smartsheet_sheet_id: 's1', smartsheet_row_id: 'r1',
      smartsheet_sync_snapshot: { [dateColumn]: '' } },
    dataset: 'orders', bindings, remoteRow, rawSheet, get: async () => ({}),
    cells: [{ columnId: dateColumn, value: '2026-08-11' }],
  });
  assert.deepEqual(plan.incoming, {}, 'a legacy-baseline date conflict must not auto-pick Smartsheet');
  assert.deepEqual(plan.outgoing, []);
  assert.ok(plan.unresolved.includes('date_ordered'), 'the date field must go to conflict review');
  assert.equal(upserts.length, 1);
  assert.match(upserts[0].reason, /baseline predates date tracking/);
  console.log('PASS a date differing from a legacy-blank baseline is held for review, not silently overwritten');
}

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const fields = readFileSync('base44/shared/smartsheetSyncFields.ts', 'utf8');
assert.match(fields, /const value = \(display != null && display !== ''\) \? display : cell\?\.value;/);
assert.match(backend, /const ORDER_PULL_SNAPSHOT_ONLY_LIMIT = 300;/);
assert.match(backend, /orderSnapshotOnlyUpdates\.push\(\{[\s\S]*?smartsheet_sync_snapshot: expectedOrderSnapshot/,
  'stale-snapshot Orders must queue a metadata-only baseline heal');
assert.match(backend, /orderSnapshotOnlyUpdates\.length < ORDER_PULL_SNAPSHOT_ONLY_LIMIT/,
  'snapshot-only heals are capped at 300 per run');
// Snapshot-only heals are metadata writes, never Order business batches.
assert.doesNotMatch(backend, /batch: orderSnapshotOnlyUpdates/,
  'snapshot-only heals must never enter the Order business batch evidence');
assert.match(backend, /stage: 'the next Order snapshot-only metadata batch'[\s\S]*?\} catch \{\s*break;/,
  'a short pull budget must skip remaining snapshot-only heals instead of failing');
console.log('PASS stale Order snapshots heal via capped metadata-only writes outside batch evidence');
