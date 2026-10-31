import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-pqm.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/productQueueModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  flattenQueueRows, filterQueueRows, sortQueueRows, parseLocalDate,
  duePresetMatch, parseQueueFilters, serializeQueueFilters,
  overdueDays, daysInStatus, DEFAULT_QUEUE_FILTERS,
} = await import(pathToFileURL(out).href);

const NOW = new Date(2026, 10, 10, 12, 0, 0); // Nov 10 2026, local noon

const wo = (over = {}, products = []) => ({
  id: 'wo1', title: 'WO-1', current_stage: 'production', products, ...over,
});

// Deleted and completed work orders never contribute rows.
{
  const rows = flattenQueueRows([
    wo({ deleted: true }, [{ id: 'a' }]),
    wo({ completed: true }, [{ id: 'b' }]),
    wo({}, [{ id: 'c' }]),
  ]);
  assert.deepEqual(rows.map((r) => r.productId), ['c']);
}
// Fulfilled products are skipped unless includeFulfilled.
{
  const orders = [wo({}, [
    { id: 'a', fulfillment_state: 'installed' },
    { id: 'b', fulfillment_state: 'awaiting_installation' },
    { id: 'c' },
  ])];
  assert.deepEqual(flattenQueueRows(orders).map((r) => r.productId), ['b', 'c']);
  assert.deepEqual(flattenQueueRows(orders, { includeFulfilled: true }).map((r) => r.productId), ['a', 'b', 'c']);
}
// Products without an id get a synthetic productId but are not editable.
{
  const [row] = flattenQueueRows([wo({ id: 'wo9' }, [{ description: 'No id' }])]);
  assert.equal(row.productId, 'wo9-0');
  assert.equal(row.editable, false);
  const [edit] = flattenQueueRows([wo({}, [{ id: 'x' }])]);
  assert.equal(edit.editable, true);
}

// YYYY-MM-DD parses as a LOCAL calendar date, not UTC midnight.
{
  const d = parseLocalDate('2026-11-05');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 5, 'local 5th, not UTC-shifted');
  assert.equal(parseLocalDate('bogus'), null);
  assert.equal(parseLocalDate(''), null);
}
// Due presets against a fixed now.
{
  const yesterday = '2026-11-09';
  const today = '2026-11-10';
  const tomorrow = '2026-11-11';
  assert.equal(duePresetMatch(yesterday, 'past_due', NOW), true);
  assert.equal(duePresetMatch(today, 'past_due', NOW), false);
  assert.equal(duePresetMatch(today, 'today', NOW), true);
  assert.equal(duePresetMatch(yesterday, 'past_due_today', NOW), true);
  assert.equal(duePresetMatch(tomorrow, 'past_due_tomorrow', NOW), true);
  assert.equal(duePresetMatch(tomorrow, 'today', NOW), false);
  assert.equal(duePresetMatch(tomorrow, 'tomorrow', NOW), true);
  assert.equal(duePresetMatch('', 'all', NOW), true);
  assert.equal(duePresetMatch('', 'today', NOW), false);
}
// Filter + sort.
{
  const rows = flattenQueueRows([wo({}, [
    { id: 'a', operational_status: 'in_design', designer: 'ann', queue_priority: 1, product_due_date: '2026-11-12' },
    { id: 'b', operational_status: 'in_production', designer: 'bob', queue_priority: 9, product_due_date: '2026-11-08' },
    { id: 'c', operational_status: 'in_design', designer: 'ann', queue_priority: 0 },
  ])]);
  const filtered = filterQueueRows(rows, { ...DEFAULT_QUEUE_FILTERS, status: 'in_design', designer: 'ann' }, NOW);
  assert.deepEqual(filtered.map((r) => r.productId).sort(), ['a', 'c']);
  const sorted = sortQueueRows(rows);
  assert.equal(sorted[0].productId, 'b', 'priority first');
  assert.equal(sorted[1].productId, 'a', 'then earliest due');
  assert.equal(sorted[2].productId, 'c', 'blank due last');
  const searched = filterQueueRows(rows, { ...DEFAULT_QUEUE_FILTERS, search: 'wo-1' }, NOW);
  assert.equal(searched.length, 3);
}
// URL filter parse/serialize round trip; invalid values ignored.
{
  const params = new URLSearchParams('status=in_design&designer=ann&due=past_due&q=sign&size=30&fulfilled=1&queue=production&bogus=x');
  const f = parseQueueFilters(params);
  assert.equal(f.status, 'in_design');
  assert.equal(f.designer, 'ann');
  assert.equal(f.duePreset, 'past_due');
  assert.equal(f.search, 'sign');
  assert.equal(f.pageSize, 30);
  assert.equal(f.includeFulfilled, true);
  const out = serializeQueueFilters(f);
  assert.deepEqual(out, { status: 'in_design', designer: 'ann', due: 'past_due', q: 'sign', size: '30', fulfilled: '1' });
  const round = parseQueueFilters(new URLSearchParams(out));
  assert.deepEqual(round, f);
  // Invalid pageSize and unknown due preset fall back to defaults.
  const bad = parseQueueFilters(new URLSearchParams('size=12&due=nonsense&status=all'));
  assert.equal(bad.pageSize, 50);
  assert.equal(bad.duePreset, 'all');
  assert.equal(bad.status, 'all');
  assert.deepEqual(serializeQueueFilters(DEFAULT_QUEUE_FILTERS), {});
}
// Overdue days and days-in-status.
{
  assert.equal(overdueDays({ due: '2026-11-05' }, NOW), 5);
  assert.equal(overdueDays({ due: '2026-11-10' }, NOW), 0);
  assert.equal(overdueDays({ due: '2026-11-20' }, NOW), 0);
  assert.equal(overdueDays({ due: '' }, NOW), 0);
  assert.equal(daysInStatus({ statusChangedAt: '2026-11-01T00:00:00' }, NOW), 9);
  assert.equal(daysInStatus({ statusChangedAt: '' }, NOW), null);
}

rmSync(out);
console.log('PASS product-queue-model');
