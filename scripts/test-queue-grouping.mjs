// Contract checks for masterplan item C-06 — queue prioritization:
// responsibility grouping headers + priority sort + group color.
//
//   GROUP_MODES       — none / responsibility / priority / due
//   groupQueueRows    — responsibility groups follow the canonical registry
//                       order (sort → alpha), unassigned → "(unassigned)" last;
//                       priority groups ascend CB 1-99 with "(no priority)"
//                       last; due groups follow the DUE_BUCKETS window order.
//   groupHeaderFor    — {label, color, count, collapsed_default:false}
//   flattenGroups     — interleaved header/row render list w/ collapse support
//   priorityRank      — priority flag → due proximity → created age, the
//                       B-05 "priority" sort convention (asc 1-99, unset last)
//
// Bundles queueGroupingModel.js directly (import-free) — same pattern as
// test-queue-rows.mjs.
//
// Run: node scripts/test-queue-grouping.mjs  →  prints "PASS queue-grouping"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outModel = resolve(here, '.tmp-qgroup-model.mjs');

buildSync({
  entryPoints: [resolve(here, '../src/components/queues/queueGroupingModel.js')],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent',
});

const {
  GROUP_MODES, DUE_BUCKETS, UNASSIGNED_LABEL, NO_PRIORITY_LABEL,
  DEFAULT_GROUP_COLOR, PRIORITY_GROUP_COLOR,
  groupQueueRows, groupHeaderFor, flattenGroups, priorityRank,
} = await import(pathToFileURL(outModel).href);

const NOW = new Date(2026, 10, 10, 12, 0, 0); // Nov 10 2026, local noon

// Minimal queue-row factory — the fields the grouping model reads.
const row = (over = {}) => ({
  workOrderId: 'wo1', productId: 'x', responsibility: '', priority: 0,
  due: '', ...over,
});

// --- GROUP_MODES + "none" ---------------------------------------------------

assert.deepEqual(GROUP_MODES, ['none', 'responsibility', 'priority', 'due'],
  'GROUP_MODES exposes the four modes in order');

{
  const rows = [row({ productId: 'a' }), row({ productId: 'b' })];
  const groups = groupQueueRows(rows, { mode: 'none' });
  assert.equal(groups.length, 1, 'none → single pass-through group');
  assert.equal(groups[0].key, 'all');
  assert.equal(groups[0].label, 'All');
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].rows.map((r) => r.productId), ['a', 'b'],
    'none preserves caller order (flat sort stands)');
  // No mode / unknown mode behave like none.
  assert.equal(groupQueueRows(rows).length, 1);
  assert.equal(groupQueueRows(rows, { mode: 'bogus' })[0].key, 'all',
    'unknown mode falls back to the single-group pass-through');
}

// --- responsibility mode ----------------------------------------------------

{
  const rows = [
    row({ productId: 'a', responsibility: 'Install' }),
    row({ productId: 'b', responsibility: 'design dept' }),
    row({ productId: 'c', responsibility: 'Design Dept' }), // case variant merges
    row({ productId: 'd' }),                                // unassigned
    row({ productId: 'e', responsibility: 'Permitting' }),
  ];
  const groups = groupQueueRows(rows, { mode: 'responsibility', now: NOW });
  // Alphabetical fallback (no order): design dept, Install, Permitting, (unassigned)
  assert.deepEqual(groups.map((g) => g.label),
    ['design dept', 'Install', 'Permitting', UNASSIGNED_LABEL],
    'alpha fallback order + unassigned last');
  assert.equal(groups[0].count, 2, 'case variants merge into one group');
  assert.equal(groups[0].key, 'design dept', 'group key is the lowercase name');
  assert.equal(groups.at(-1).key, '', 'unassigned key is the empty string');
  assert.equal(groups.at(-1).count, 1);

  // Rank via a plain string list — the array IS the order.
  const ranked = groupQueueRows(rows, {
    mode: 'responsibility', order: ['Permitting', 'Install'], now: NOW,
  });
  assert.deepEqual(ranked.map((g) => g.label),
    ['Permitting', 'Install', 'design dept', UNASSIGNED_LABEL],
    'explicit order first, unranked alpha after, unassigned last');
}

// Registry-like objects carry the canonical order: sort asc → name alpha.
{
  const rows = [
    row({ productId: 'a', responsibility: 'Beta' }),
    row({ productId: 'b', responsibility: 'Alpha' }),
    row({ productId: 'c', responsibility: 'Gamma' }),
  ];
  const registry = [
    { name: 'Alpha', sort: 2 },
    { name: 'Gamma', sort: 1, color: '#FF0080' },
    { name: 'Beta', sort: 2 }, // sort tie → alpha: Alpha before Beta
  ];
  const groups = groupQueueRows(rows, { mode: 'responsibility', order: registry, now: NOW });
  assert.deepEqual(groups.map((g) => g.label), ['Gamma', 'Alpha', 'Beta'],
    'registry sort asc, ties alphabetical');
  assert.equal(groups[0].color, '#ff0080', 'registry color lands on the group');
  assert.equal(groups[1].color, DEFAULT_GROUP_COLOR, 'no color source → slate default');
}

// Row responsibility_color snapshot feeds the group color when order gives none.
{
  const rows = [
    row({ productId: 'a', responsibility: 'Install', responsibilityColor: '#123ABC' }),
    row({ productId: 'b', responsibility: 'Install' }),
  ];
  const [g] = groupQueueRows(rows, { mode: 'responsibility', now: NOW });
  assert.equal(g.color, '#123abc', 'first row color snapshot becomes the group color');
}

// --- priority mode ----------------------------------------------------------

{
  const rows = [
    row({ productId: 'a', priority: 9 }),
    row({ productId: 'b', priority: 1 }),
    row({ productId: 'c', priority: 9 }),
    row({ productId: 'd' }),                    // unset
    row({ productId: 'e', queuePriority: 3 }),  // legacy fallback
  ];
  const groups = groupQueueRows(rows, { mode: 'priority', now: NOW });
  assert.deepEqual(groups.map((g) => g.key), ['p1', 'p3', 'p9', ''],
    'priority groups ascend; unset bucket last');
  assert.deepEqual(groups.map((g) => g.label),
    ['Priority 1', 'Priority 3', 'Priority 9', NO_PRIORITY_LABEL]);
  assert.equal(groups[0].color, PRIORITY_GROUP_COLOR, 'indigo priority color');
  assert.equal(groups[2].count, 2, 'equal priorities share a bucket');
  assert.equal(groups.at(-1).count, 1);
}

// --- due mode ---------------------------------------------------------------

{
  const rows = [
    row({ productId: 'a', due: '2026-11-05' }), // past due (NOW = Nov 10)
    row({ productId: 'b', due: '2026-11-10' }), // today
    row({ productId: 'c', due: '2026-11-11' }), // tomorrow
    row({ productId: 'd', due: '2026-11-14' }), // this week (Sat, ≤ Sun eow)
    row({ productId: 'e', due: '2026-12-25' }), // later
    row({ productId: 'f' }),                    // undated
    row({ productId: 'g', woDue: '2026-11-10' }), // woDue fallback → today
  ];
  const groups = groupQueueRows(rows, { mode: 'due', now: NOW });
  assert.deepEqual(groups.map((g) => g.key),
    ['past_due', 'today', 'tomorrow', 'this_week', 'later', 'no_due'],
    'due buckets in window order');
  assert.equal(groups[1].count, 2, 'woDue fallback joins "today"');
  // Bucket colors exist and track the DUE_BUCKETS ramp.
  assert.equal(groups[0].color, DUE_BUCKETS[0].color);
  // Empty buckets are dropped entirely.
  const sparse = groupQueueRows([row({ productId: 'a' })], { mode: 'due', now: NOW });
  assert.deepEqual(sparse.map((g) => g.key), ['no_due'], 'empty due buckets dropped');
}

// --- within-group priority sort ---------------------------------------------

{
  const rows = [
    row({ productId: 'a', responsibility: 'R', priority: 5 }),
    row({ productId: 'b', responsibility: 'R', priority: 2, due: '2026-12-01' }),
    row({ productId: 'c', responsibility: 'R', due: '2026-11-01' }), // unset, overdue
    row({ productId: 'd', responsibility: 'R', priority: 2, due: '2026-11-15' }),
  ];
  const [g] = groupQueueRows(rows, { mode: 'responsibility', order: ['R'], now: NOW });
  assert.deepEqual(g.rows.map((r) => r.productId), ['d', 'b', 'a', 'c'],
    'within group: priority asc → due asc; unset last regardless of due');
}

// --- priorityRank -----------------------------------------------------------

{
  const set = row({ priority: 50, due: '2026-12-01' });
  const unset = row({ due: '2026-10-01' }); // way overdue but no priority
  assert.ok(priorityRank(set, NOW) < priorityRank(unset, NOW),
    'set priority always outranks unset');
  // Due proximity within equal priority.
  const near = row({ priority: 5, due: '2026-11-11' });
  const far = row({ priority: 5, due: '2026-11-20' });
  assert.ok(priorityRank(near, NOW) < priorityRank(far, NOW),
    'earlier due ranks ahead at equal priority');
  // Created age breaks the last tie — older first.
  const older = row({ priority: 5, due: '2026-11-11', created_date: '2026-10-01' });
  const newer = row({ priority: 5, due: '2026-11-11', created_date: '2026-11-09' });
  assert.ok(priorityRank(older, NOW) < priorityRank(newer, NOW),
    'older created work ranks ahead at equal priority+due');
  // Determinism: same input + clock → identical rank.
  assert.equal(priorityRank(set, NOW), priorityRank({ ...set }, NOW),
    'rank is deterministic');
  // Bare products read through the same fallbacks.
  const bare = { priority: 1, product_due_date: '2026-11-12' };
  assert.ok(Number.isFinite(priorityRank(bare, NOW)), 'bare product ranks');
  assert.ok(priorityRank(bare, NOW) < priorityRank({ priority: 2, product_due_date: '2026-11-12' }, NOW));
}

// --- groupHeaderFor ---------------------------------------------------------

{
  const [g] = groupQueueRows(
    [row({ productId: 'a', responsibility: 'Install', responsibilityColor: '#112233' })],
    { mode: 'responsibility', now: NOW });
  const h = groupHeaderFor(g);
  assert.deepEqual(h, {
    key: 'install', label: 'Install', color: '#112233',
    count: 1, collapsed_default: false,
  }, 'header descriptor carries label/color/count + collapsed_default:false');
  // Defensive: bare group, no color.
  const bare = groupHeaderFor({ key: 'k', label: 'K', rows: [1, 2, 3] });
  assert.equal(bare.count, 3, 'count derived from rows when absent');
  assert.equal(bare.color, null);
  assert.equal(bare.collapsed_default, false);
}

// --- flattenGroups ----------------------------------------------------------

{
  const rows = [
    row({ productId: 'a', responsibility: 'Install', priority: 1 }),
    row({ productId: 'b', responsibility: 'Design' }),
    row({ productId: 'c' }),
  ];
  const groups = groupQueueRows(rows, {
    mode: 'responsibility', order: ['Install', 'Design'], now: NOW,
  });
  const flat = flattenGroups(groups);
  assert.deepEqual(flat.map((i) => i.type),
    ['header', 'row', 'header', 'row', 'header', 'row'],
    'interleaved header → rows per group');
  assert.equal(flat[0].label, 'Install');
  assert.equal(flat[0].count, 1);
  assert.equal(flat[0].collapsed, false);
  assert.equal(flat[1].group_key, 'install', 'row item points back at its group');
  assert.equal(flat[1].row.productId, 'a');
  // Unique render keys across the whole list.
  assert.equal(new Set(flat.map((i) => i.key)).size, flat.length, 'render keys unique');

  // Collapse a group: header stays (collapsed:true), its rows vanish.
  const collapsed = flattenGroups(groups, { collapsed_keys: ['install'] });
  assert.deepEqual(collapsed.map((i) => i.type),
    ['header', 'header', 'row', 'header', 'row'],
    'collapsed group emits header only');
  assert.equal(collapsed[0].collapsed, true);
  assert.equal(collapsed[0].count, 1, 'collapsed header still shows the count');
  // Set form works too.
  const collapsedSet = flattenGroups(groups, { collapsed_keys: new Set(['']) });
  assert.equal(collapsedSet.filter((i) => i.type === 'row').length, 2,
    'unassigned group collapses by its empty-string key');
}

rmSync(outModel);
console.log('PASS queue-grouping');
