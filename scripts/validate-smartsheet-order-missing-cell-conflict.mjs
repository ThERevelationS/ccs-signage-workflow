import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderMissingBoundCellConflicts } from '../base44/shared/smartsheetOrderConflictSafety.mjs';

const snapshot = { '11': 'Acme', '12': '2', '13': '' };
const bound = new Set(['11', '12', '13']);

assert.equal(orderMissingBoundCellConflicts(snapshot, bound, new Set(['11', '12', '13'])), false);
assert.equal(orderMissingBoundCellConflicts(snapshot, bound, new Set(['11', '13'])), true);
assert.equal(orderMissingBoundCellConflicts(snapshot, bound, new Set(['11', '12'])), false);
assert.equal(orderMissingBoundCellConflicts({ '11': 'Acme' }, bound, new Set(['11'])), false);
assert.equal(orderMissingBoundCellConflicts(null, bound, new Set()), false);
console.log('PASS omitted Order cell conflicts only when a previously verified nonblank bound value disappears');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(backend, /const seenBoundColumnIds = new Set<string>\(\)/);
assert.match(backend, /seenBoundColumnIds\.add\(colId\)/);
assert.match(backend, /dataset === 'orders' && orderMissingBoundCellConflicts\(snapshot, bindingColumnIds, seenBoundColumnIds\)/);
console.log('PASS Order push conflict detection checks Smartsheet-omitted bound cells without changing Sales behavior');
