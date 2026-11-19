// Contract checks for masterplan item C-08 — full queue filter state in the
// URL. Every productQueueModel filter key round-trips through query params:
//
//   parse(serialize(f)) === f   for every key at a non-default value
//
// Conventions pinned here:
//   * only non-default values serialize (serialize(defaults) === {});
//   * multi-value keys use comma lists AND accept repeated params — closed
//     enums only (status/fulfillment/proof), so free-select keys never split
//     a "Last, First" name;
//   * entered_by is a read alias for enteredBy (camelCase param is written);
//   * ?view= and ?assigned=me are preserved pass-through tokens; ?queue= is
//     page-owned (ProductQueues tab) and is never consumed by the model;
//   * enum-invalid values fall back to defaults — never throw, never leak
//     junk into filter state;
//   * sort/due/size/fulfilled behavior is byte-identical to the w-51 build
//     (regression-pinned below).
//
// Bundles productQueueModel.js directly (import-free), like the other queue
// model tests.
//
// Run: node scripts/test-queue-url-state.mjs  →  prints "PASS queue-url-state"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-qurl.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/productQueueModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  parseQueueFilters, serializeQueueFilters, filterQueueRows,
  DEFAULT_QUEUE_FILTERS, DUE_PRESETS, PAGE_SIZES,
} = await import(pathToFileURL(out).href);

const parse = (qs) => parseQueueFilters(new URLSearchParams(qs));
const round = (f) => parseQueueFilters(new URLSearchParams(serializeQueueFilters(f)));

// ── 1. every key round-trips: parse(serialize(f)) deep-equals f ──────────
// (extension keys join the parsed object only when non-default — the same
// "absent === all" rule filterQueueRows applies.)
const cases = [
  ['search', { search: 'banner' }],
  ['search-symbols', { search: 'INV-14022 · 3/3' }],
  ['status', { status: 'in_design' }],
  ['status-multi', { status: 'in_design,proof_approved' }],
  ['substatus', { substatus: 'rev 2' }],
  ['designer', { designer: 'Ann Lee' }],
  ['responsibility', { responsibility: 'Design dept' }],
  ['assignedTo', { assignedTo: 'sam@shop.test' }],
  ['category', { category: 'channel_letters' }],
  ['moduleKey', { moduleKey: 'laser' }],
  ['machine', { machine: 'latex-1' }],
  ['part', { part: '3/4 alum panel' }],
  ['salesperson', { salesperson: 'lee@shop.test' }],
  ['enteredBy', { enteredBy: 'b@shop.test' }],
  ['duePreset', { duePreset: 'past_due_today' }],
  ['duePreset-rush', { duePreset: 'rush' }],
  ['fulfillment', { fulfillment: 'shipped' }],
  ['fulfillment-multi', { fulfillment: 'picked_up,shipped' }],
  ['proof', { proof: 'approved' }],
  ['proof-multi', { proof: 'draft,awaiting_approval' }],
  ['rush', { rush: true }],
  ['assigned', { assigned: 'me' }],
  ['view', { view: 'Rush jobs' }],
  ['sort-priority', { sort: 'priority' }],
  ['sort-due', { sort: 'due' }],
  ['sort-default', { sort: 'default' }],
  ['pageSize', { pageSize: 250 }],
  ['includeFulfilled', { includeFulfilled: true }],
];
for (const [label, ext] of cases) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...ext };
  assert.deepEqual(round(f), f, `${label} round-trips through the URL`);
}
// Every due preset and page size round-trips too.
for (const d of DUE_PRESETS.filter((d) => d.key !== 'all')) {
  const f = { ...DEFAULT_QUEUE_FILTERS, duePreset: d.key };
  assert.deepEqual(round(f), f, `duePreset ${d.key} round-trips`);
}
for (const n of PAGE_SIZES.filter((n) => n !== DEFAULT_QUEUE_FILTERS.pageSize)) {
  const f = { ...DEFAULT_QUEUE_FILTERS, pageSize: n };
  assert.deepEqual(round(f), f, `pageSize ${n} round-trips`);
}
// A fully-loaded state serializes to the expected param map verbatim.
{
  const f = {
    ...DEFAULT_QUEUE_FILTERS,
    status: 'in_design', substatus: 'rev', designer: 'ann',
    responsibility: 'design', assignedTo: 'sam@x', category: 'vinyl',
    moduleKey: 'cnc', machine: 'latex-1', part: 'banner', salesperson: 'lee@x',
    enteredBy: 'b@x', duePreset: 'this_week', fulfillment: 'shipped',
    proof: 'approved', rush: true, assigned: 'me', view: 'Saved A',
    sort: 'priority', search: 'acme', pageSize: 100, includeFulfilled: true,
  };
  assert.deepEqual(serializeQueueFilters(f), {
    status: 'in_design', substatus: 'rev', designer: 'ann',
    responsibility: 'design', assignedTo: 'sam@x', category: 'vinyl',
    moduleKey: 'cnc', machine: 'latex-1', part: 'banner', salesperson: 'lee@x',
    enteredBy: 'b@x', due: 'this_week', fulfillment: 'shipped',
    proof: 'approved', rush: '1', sort: 'priority', q: 'acme', size: '100',
    fulfilled: '1', assigned: 'me', view: 'Saved A',
  }, 'full filter state → complete param map');
}

// ── 2. defaults never serialize ──────────────────────────────────────────
assert.deepEqual(serializeQueueFilters(DEFAULT_QUEUE_FILTERS), {}, 'defaults → empty params');
assert.deepEqual(
  serializeQueueFilters({
    ...DEFAULT_QUEUE_FILTERS,
    machine: 'all', part: 'all', salesperson: 'all', enteredBy: 'all',
    fulfillment: 'all', proof: 'all', rush: false, assigned: '', view: '',
  }),
  {}, 'extension keys at default → omitted',
);
assert.deepEqual(
  serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, duePreset: 'all', sort: 'default', pageSize: 50 }),
  {}, 'enum/page defaults → omitted',
);
assert.deepEqual(parse(''), { ...DEFAULT_QUEUE_FILTERS }, 'empty params → plain defaults');

// ── 3. invalid values fall back safe ─────────────────────────────────────
assert.equal(parse('due=nonsense').duePreset, 'all', 'unknown due preset → all');
assert.equal(parse('sort=nonsense').sort, 'default', 'unknown sort → default');
assert.equal(parse('size=12').pageSize, 50, 'unknown size → default');
assert.equal(parse('size=abc').pageSize, 50, 'non-numeric size → default');
assert.equal(parse('fulfillment=bogus').fulfillment, undefined, 'unknown fulfillment → absent (all)');
assert.equal(parse('proof=zzz').proof, undefined, 'unknown proof → absent (all)');
assert.equal(parse('assigned=someone').assigned, undefined, 'only "me" survives assigned');
assert.equal(parse('rush=yes').rush, undefined, 'non-flag rush → absent');
assert.equal(parse('view=%20').view, undefined, 'blank view token → absent');
assert.equal(parse('enteredBy=').enteredBy, undefined, 'empty enteredBy → absent');
assert.equal(parse('status=all,bogus').status, 'all', '"all" anywhere wins the wildcard');
assert.equal(parse('fulfillment=shipped,bogus').fulfillment, 'shipped', 'known tokens kept, junk dropped');
assert.equal(parse('status=').status, 'all', 'blank status → all');

// ── 4. multi-value encoding (comma lists + repeated params) ──────────────
assert.equal(parse('status=in_design,proof_approved').status, 'in_design,proof_approved', 'comma list parses');
assert.equal(
  parse(new URLSearchParams([['status', 'in_design'], ['status', 'vended']])).status,
  'in_design,vended', 'repeated params merge',
);
assert.equal(parse('status=in_design,,in_design,').status, 'in_design', 'empties dropped + deduped');
assert.equal(
  serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, fulfillment: 'picked_up,shipped' }).fulfillment,
  'picked_up,shipped', 'comma list serializes',
);
assert.equal(parse('proof=draft,draft,approved').proof, 'draft,approved', 'dedupe keeps first-seen order');
// Multi-value OR-matching reaches the rows.
{
  const rows = [
    { productId: 'a', status: 'in_design', fulfillment: 'shipped', proof: 'draft' },
    { productId: 'b', status: 'vended', fulfillment: 'installed', proof: 'approved' },
    { productId: 'c', status: 'proof_approved', fulfillment: 'delivered', proof: 'sent' },
  ];
  assert.deepEqual(
    filterQueueRows(rows, { ...DEFAULT_QUEUE_FILTERS, status: 'in_design,vended' }).map((r) => r.productId).sort(),
    ['a', 'b'], 'status list OR-matches',
  );
  assert.deepEqual(
    filterQueueRows(rows, { ...DEFAULT_QUEUE_FILTERS, fulfillment: 'shipped,delivered' }).map((r) => r.productId).sort(),
    ['a', 'c'], 'fulfillment list OR-matches',
  );
  assert.deepEqual(
    filterQueueRows(rows, { ...DEFAULT_QUEUE_FILTERS, proof: 'approved' }).map((r) => r.productId),
    ['b'], 'proof scalar filter',
  );
  const rushRows = [{ productId: 'a', rush: true }, { productId: 'b', rush: false }];
  assert.deepEqual(
    filterQueueRows(rushRows, { ...DEFAULT_QUEUE_FILTERS, rush: true }).map((r) => r.productId),
    ['a'], 'standalone rush flag filters',
  );
  assert.deepEqual(
    filterQueueRows(rushRows, { ...DEFAULT_QUEUE_FILTERS, duePreset: 'rush' }).map((r) => r.productId),
    ['a'], 'due=rush preset still filters (regression)',
  );
  assert.deepEqual(
    filterQueueRows(
      [{ productId: 'a', rush: true, due: '2026-11-20' }, { productId: 'b', rush: true }],
      { ...DEFAULT_QUEUE_FILTERS, rush: true, duePreset: 'past_due' },
      new Date(2026, 10, 10, 12),
    ).map((r) => r.productId),
    [], 'rush flag ANDs with due presets',
  );
}
// Free-select keys stay scalar — a comma inside a value is never split.
{
  assert.equal(parse('designer=Lee%2C%20Ann').designer, 'Lee, Ann', 'comma in a name survives');
  assert.equal(parse('designer=Lee,%20Ann').designer, 'Lee, Ann', 'unencoded comma is literal too');
}

// ── 5. enteredBy alias + token preservation ──────────────────────────────
assert.equal(parse('entered_by=sam@shop.test').enteredBy, 'sam@shop.test', 'snake alias reads');
assert.equal(parse('enteredBy=a@x&entered_by=b@x').enteredBy, 'a@x', 'camelCase wins over the alias');
assert.equal(serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, enteredBy: 'a@x' }).enteredBy, 'a@x', 'canonical param written');
assert.ok(!('entered_by' in serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, enteredBy: 'a@x' })), 'snake alias never written');
assert.equal(parse('assigned=ME').assigned, 'me', 'assigned token canonicalized');
assert.equal(parse('view=Saved%20A').view, 'Saved A', 'view token reads verbatim');
// Page-owned + unknown params survive a real serialize+merge write cycle
// (the ProductQueue.jsx pattern: parse prev → serialize next → set()).
{
  const prev = new URLSearchParams('queue=production&status=in_design&bogus=keep');
  const f = parseQueueFilters(prev);
  const next = new URLSearchParams(prev);
  for (const [k, v] of Object.entries(serializeQueueFilters({ ...f, search: 'x' }))) next.set(k, v);
  assert.equal(next.get('queue'), 'production', 'page-owned ?queue= survives a filter write');
  assert.equal(next.get('bogus'), 'keep', 'unknown params preserved (back-safe)');
  assert.equal(next.get('q'), 'x', 'new filter lands beside them');
  assert.equal(next.get('status'), 'in_design');
}
{
  const prev = new URLSearchParams('view=Saved%20A&assigned=me&queue=all');
  const f = parseQueueFilters(prev);
  const next = new URLSearchParams(prev);
  for (const [k, v] of Object.entries(serializeQueueFilters(f))) next.set(k, v);
  assert.equal(next.get('view'), 'Saved A', '?view= token preserved through an edit');
  assert.equal(next.get('assigned'), 'me', '?assigned=me preserved through an edit');
  assert.equal(next.get('queue'), 'all', '?queue= untouched by the model');
}
// ?assigned=me parses into the marker myQueueModel's isMyQueueFilters reads.
assert.equal(parse('assigned=me').assigned, 'me', 'my-queue marker parses');

// ── 6. sort regression — identical to the w-51 build ─────────────────────
assert.equal(parse('sort=priority').sort, 'priority');
assert.equal(parse('sort=due').sort, 'due');
assert.equal(parse('sort=default').sort, 'default');
assert.equal(parse('sort=nonsense').sort, 'default');
assert.equal(parse('sort=').sort, 'default');
assert.equal(serializeQueueFilters({ ...DEFAULT_QUEUE_FILTERS, sort: 'priority' }).sort, 'priority');
assert.equal('sort' in serializeQueueFilters(DEFAULT_QUEUE_FILTERS), false, 'default sort stays out of the URL');
// w-51 golden set — serializes byte-identical to the pre-C-08 build.
{
  const f = parse('status=in_design&designer=ann&due=past_due&q=sign&size=30&fulfilled=1&queue=production&bogus=x');
  assert.deepEqual(serializeQueueFilters(f), {
    status: 'in_design', designer: 'ann', due: 'past_due',
    q: 'sign', size: '30', fulfilled: '1',
  }, 'legacy param set → byte-identical serialization');
}

rmSync(out);
console.log('PASS queue-url-state');
