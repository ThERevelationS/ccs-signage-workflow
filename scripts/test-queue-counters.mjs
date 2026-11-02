// Contract checks for masterplan item C-04 — queue counters:
//   queueCounters(rows, {now})      CoreBridge home counters (awaiting proof,
//                                   past due, rush, unassigned) + by_status
//                                   over a flattened queue row set.
//   moduleCounters(workOrders, {})  per-module tile counts keyed by
//                                   module_key / project_type / order_type
//                                   (+ wo.module / wo.type fallbacks).
//   tileOrder(keys)                 CB counters lead in canonical order,
//                                   remaining keys alphabetical.
//   Every counter computes from the same feed rows the queue renders — no
//   entity reads live in this model.
//
// queueCountersModel.js imports only productQueueModel (itself import-free),
// so one esbuild bundle covers both.
//
// Run: node scripts/test-queue-counters.mjs  →  prints "PASS queue-counters"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outModel = resolve(here, '.tmp-qcounters-model.mjs');

buildSync({
  entryPoints: [resolve(here, '../src/components/queues/queueCountersModel.js')],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent',
});

const {
  queueCounters, moduleCounters, tileOrder,
  isAwaitingProofRow, isPastDueRow, isRushRow, isUnassignedRow, moduleKeyForRow,
  QUEUE_COUNTER_KEYS,
} = await import(pathToFileURL(outModel).href);

const NOW = new Date(2026, 10, 10, 12, 0, 0); // Nov 10 2026, local noon

const wo = (over = {}, products = []) => ({
  id: 'wo1', title: 'WO-1', current_stage: 'production', products, ...over,
});

// --- awaiting_proof truth table --------------------------------------------

{
  assert.equal(isAwaitingProofRow({ proof: 'sent' }), true, 'sent waits on customer');
  assert.equal(isAwaitingProofRow({ proof: 'awaiting_approval' }), true);
  assert.equal(
    isAwaitingProofRow({ proof: 'draft', status: 'awaiting_proof_approval' }),
    true, 'operational state alone flags it');
  assert.equal(
    isAwaitingProofRow({ proof: 'approved', proofVersion: 3, proofApprovedVersion: 1 }),
    true, 'stale approval needs a fresh one');
  assert.equal(
    isAwaitingProofRow({ proof: 'approved', proofVersion: 2, proofApprovedVersion: 2 }),
    false, 'current-version approval is settled');
  assert.equal(isAwaitingProofRow({ proof: 'revision_requested' }), false);
  assert.equal(isAwaitingProofRow({ proof: 'draft', proofVersion: 1 }), false);
  assert.equal(isAwaitingProofRow({ proof: 'none' }), false);
  assert.equal(isAwaitingProofRow({}), false);
  // snake_case field spellings read identically.
  assert.equal(
    isAwaitingProofRow({ proof_status: 'awaiting_approval' }), true, 'snake_case proof_status');
  assert.equal(
    isAwaitingProofRow({ operational_status: 'awaiting_proof_approval' }), true);
}

// --- past_due truth table ----------------------------------------------------

{
  assert.equal(isPastDueRow({ due: '2026-11-09' }, NOW), true, 'yesterday is past due');
  assert.equal(isPastDueRow({ due: '2026-11-10' }, NOW), false, 'due today is not past due');
  assert.equal(isPastDueRow({ due: '2026-11-11' }, NOW), false);
  assert.equal(isPastDueRow({}, NOW), false, 'undated is never past due');
  assert.equal(isPastDueRow({ due: 'not-a-date' }, NOW), false);
  assert.equal(
    isPastDueRow({ woDue: '2026-11-01' }, NOW), true, 'woDue fallback matches filterQueueRows');
  assert.equal(
    isPastDueRow({ due: '', woDue: '2026-11-01' }, NOW), true, 'blank due falls through to woDue');
}

// --- rush truth table --------------------------------------------------------

{
  assert.equal(isRushRow({ rush: true }), true, 'flattened flag');
  assert.equal(isRushRow({ is_rush: true }), true, 'raw flag spelling');
  assert.equal(isRushRow({ order_priority: 'Rush' }), true, 'WO priority label');
  assert.equal(isRushRow({ priorityLabel: 'rush' }), true);
  assert.equal(isRushRow({ substatus: 'Rush job' }), true, 'rush substatus');
  assert.equal(isRushRow({ quick_tags: ['shop', 'RUSH'] }), true, 'rush quick tag');
  assert.equal(isRushRow({ rush: false, substatus: 'normal' }), false);
  assert.equal(isRushRow({}), false);
}

// --- unassigned truth table --------------------------------------------------

{
  assert.equal(isUnassignedRow({}), true, 'empty row is unassigned');
  assert.equal(isUnassignedRow({ assignedTo: '  ', designer: '' }), true, 'blank reads unassigned');
  assert.equal(isUnassignedRow({ responsibility: 'Design dept' }), true,
    'responsibility alone is routing, not an assignee');
  assert.equal(isUnassignedRow({ assignedTo: 'kim@shop.com' }), false);
  assert.equal(isUnassignedRow({ assigned_to: 'kim@shop.com' }), false, 'snake spelling');
  assert.equal(isUnassignedRow({ designer: 'Kim' }), false, 'a designer owns the row');
  assert.equal(isUnassignedRow({ assignedTo: '', assigned_to: 'kim' }), false,
    'empty camelCase does not shadow a set snake_case value');
}

// --- queueCounters -----------------------------------------------------------

{
  const c = queueCounters([], { now: NOW });
  assert.deepEqual(c, {
    total: 0, awaiting_proof: 0, past_due: 0, rush: 0, unassigned: 0, by_status: {},
  }, 'empty input → zeroed counter set');
}

{
  const rows = [
    { status: 'in_design', proof: 'awaiting_approval', due: '2026-11-05', rush: true },   // all four
    { status: 'in_design', proof: 'approved', proofVersion: 1, proofApprovedVersion: 1,
      assignedTo: 'kim' },                                                                // none
    { status: 'in_production', due: '2026-11-20', designer: 'Kim' },                      // none
    { status: 'none', proof: 'sent', assignedTo: 'kim' },                                 // awaiting only
    { status: 'order_review', due: '2026-10-01', assignedTo: 'kim', designer: 'Kim' },    // past_due only
    null,                                                                               // skipped
    { status: '', proof: 'none' },                                                      // unassigned only
  ];
  const c = queueCounters(rows, { now: NOW });
  assert.equal(c.total, 6, 'null rows skipped, everything else counted');
  assert.equal(c.awaiting_proof, 2, 'awaiting_approval + sent');
  assert.equal(c.past_due, 2, 'Nov 5 + Oct 1 both precede Nov 10');
  assert.equal(c.rush, 1);
  assert.equal(c.unassigned, 2, 'rows 1 and 7 have no owner');
  assert.deepEqual(c.by_status, {
    in_design: 2, in_production: 1, none: 2, order_review: 1,
  }, 'by_status buckets every row, blank → none');
}

// A row can be past due AND awaiting proof AND rush AND unassigned — counters
// are independent signals, not a partition.
{
  const c = queueCounters(
    [{ proof: 'sent', due: '2026-11-01', rush: true, status: 'awaiting_proof_approval' }],
    { now: NOW },
  );
  assert.equal(c.total, 1);
  assert.equal(c.awaiting_proof + c.past_due + c.rush + c.unassigned, 4,
    'one row feeds all four counters');
}

// Counts equal what the queue's own filter would produce for the due lens.
{
  const rows = [
    { due: '2026-11-01' }, { due: '2026-11-10' }, { due: '2026-12-01' }, {},
  ];
  const c = queueCounters(rows, { now: NOW });
  assert.equal(c.past_due, 1, 'past_due mirrors the Past Due preset, today excluded');
}

// --- moduleCounters ----------------------------------------------------------

{
  const c = moduleCounters([
    wo({ id: 'w1', project_type: 'vinyl' }, [
      { id: 'a', proof_status: 'awaiting_approval', assigned_to: 'kim' },
      { id: 'b', product_due_date: '2026-11-01' },
    ]),
    wo({ id: 'w2', order_type: 'cnc' }, [
      { id: 'c', is_rush: true, designer: 'Kim' },
    ]),
    wo({ id: 'w3', title: 'No module' }, [{ id: 'd' }]), // no key → skipped
  ], { now: NOW });
  assert.equal(Object.keys(c).sort().join(','), 'cnc,vinyl', 'only keyed modules appear');
  assert.equal(c.vinyl.total, 2);
  assert.equal(c.vinyl.awaiting_proof, 1);
  assert.equal(c.vinyl.past_due, 1, 'product_due Nov 1 < Nov 10');
  assert.equal(c.vinyl.unassigned, 1, 'product b has no owner');
  assert.equal(c.vinyl.rush, 0);
  assert.equal(c.cnc.total, 1);
  assert.equal(c.cnc.rush, 1, 'WO rush flag flattens onto the row');
  assert.equal(c.cnc.unassigned, 0, 'designer counts as owner');
}

// Per-product module_key beats the order-level fields — combined orders split
// across tiles instead of collapsing into one.
{
  const c = moduleCounters([
    wo({ id: 'w1', project_type: 'signage' }, [
      { id: 'a', module_key: 'vinyl' },
      { id: 'b', module_key: 'cnc' },
      { id: 'c' }, // inherits the order-level key
    ]),
  ], { now: NOW });
  assert.equal(c.vinyl.total, 1, 'product module_key wins over project_type');
  assert.equal(c.cnc.total, 1);
  assert.equal(c.signage.total, 1, 'keyless product inherits project_type');
}

// Key precedence: module_key → project_type → order_type → module → type.
{
  const cases = [
    [{ module_key: 'a', project_type: 'b', order_type: 'c', module: 'd', type: 'e' }, 'a'],
    [{ project_type: 'b', order_type: 'c', module: 'd', type: 'e' }, 'b'],
    [{ order_type: 'c', module: 'd', type: 'e' }, 'c'],
    [{ module: 'd', type: 'e' }, 'd'],
    [{ type: 'e' }, 'e'],
    [{}, ''],
  ];
  for (const [fields, expected] of cases) {
    assert.equal(moduleKeyForRow({}, fields), expected, `key precedence → "${expected}"`);
  }
}

// Row-level module_key also reads snake_case / blank-shadowed spellings.
{
  assert.equal(moduleKeyForRow({ moduleKey: '', module_key: 'metal' }, {}), 'metal');
  assert.equal(moduleKeyForRow({ moduleKey: '  Vinyl  ' }, { project_type: 'x' }), 'vinyl',
    'row key normalized');
}

// Deleted/completed orders and fulfilled products contribute nothing.
{
  const c = moduleCounters([
    wo({ id: 'w1', project_type: 'vinyl', deleted: true }, [{ id: 'a', module_key: 'vinyl' }]),
    wo({ id: 'w2', project_type: 'vinyl', completed: true }, [{ id: 'b', module_key: 'vinyl' }]),
    wo({ id: 'w3', project_type: 'vinyl' }, [
      { id: 'c', module_key: 'vinyl', fulfillment_state: 'installed' },
      { id: 'd', module_key: 'vinyl' },
    ]),
  ], { now: NOW });
  assert.equal(c.vinyl.total, 1, 'flattenQueueRows exclusions carry into the counters');
}

// Empty / malformed input never throws.
{
  assert.deepEqual(moduleCounters([], { now: NOW }), {});
  assert.deepEqual(moduleCounters(null, { now: NOW }), {});
  assert.deepEqual(moduleCounters([{ products: 'oops' }, null], { now: NOW }), {});
}

// --- tileOrder ---------------------------------------------------------------

{
  assert.deepEqual(QUEUE_COUNTER_KEYS, ['awaiting_proof', 'past_due', 'rush', 'unassigned']);
  assert.deepEqual(
    tileOrder(['total', 'rush', 'by_status', 'awaiting_proof', 'past_due', 'unassigned']),
    ['awaiting_proof', 'past_due', 'rush', 'unassigned', 'by_status', 'total'],
    'named counters lead in canonical order, rest alphabetical');
  assert.deepEqual(tileOrder(['vinyl', 'cnc']), ['cnc', 'vinyl'], 'unknown keys sort alpha');
  assert.deepEqual(tileOrder(['rush', 'rush', 'total']), ['rush', 'total'], 'dupes collapse');
  assert.deepEqual(tileOrder([]), []);
  assert.deepEqual(tileOrder(null), []);
  // Missing named keys simply don't appear — order stays stable.
  assert.deepEqual(tileOrder(['total', 'past_due']), ['past_due', 'total']);
}

rmSync(outModel);
console.log('PASS queue-counters');
