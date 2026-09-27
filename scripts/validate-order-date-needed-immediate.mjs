import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { remainingOrderPendingAfterImmediateSave } from '../src/components/orders/orderImmediatePending.mjs';

const old = { date_needed: '2026-10-02', date_needed_option: 'ASAP', description: 'Unrelated unsaved edit' };
const desired = { date_needed: '2026-10-05', date_needed_option: '' };
const replaceDate = ['date_needed', 'date_needed_option'];
assert.deepEqual(remainingOrderPendingAfterImmediateSave(old, old, desired, replaceDate),
  { description: 'Unrelated unsaved edit' });
console.log('PASS new Date Needed supersedes an older queued date and text option while preserving unrelated edits');

const newer = { date_needed: '2026-10-07', date_needed_option: 'Rush', description: 'Unrelated unsaved edit' };
assert.deepEqual(remainingOrderPendingAfterImmediateSave(newer, old, desired, replaceDate), newer);
assert.deepEqual(remainingOrderPendingAfterImmediateSave({
  date_needed: '2026-10-05', date_needed_option: '', quantity: '7',
}, old, desired, replaceDate), { quantity: '7' });
console.log('PASS edits made during an immediate save survive unless identical to the verified saved value');

assert.deepEqual(remainingOrderPendingAfterImmediateSave(old, old, desired), old);
assert.deepEqual(remainingOrderPendingAfterImmediateSave({}, {}, desired, replaceDate), {});
const orderedOld = { date_ordered: '2026-09-23', vendor: 'Other pending field' };
assert.deepEqual(remainingOrderPendingAfterImmediateSave(orderedOld, orderedOld,
  { date_ordered: '2026-09-25' }), orderedOld);
console.log('PASS unrelated immediate Order saves retain their prior pending-field behavior');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
assert.match(ui, /import \{ remainingOrderPendingAfterImmediateSave \} from/);
assert.match(ui, /dateNeededSaveInFlightRef = useRef\(false\)/);
assert.match(ui, /if \(saveInFlightRef\.current \|\| dateNeededSaveInFlightRef\.current\) return/);
assert.match(ui, /if \(dateNeededSaveInFlightRef\.current \|\| saveInFlightRef\.current\)/);
assert.match(ui, /remainingOrderPendingAfterImmediateSave\([\s\S]*?pendingAtStart, nextFields, supersedePendingFields/);
assert.match(ui, /persistImmediateOrderFields\([\s\S]*?supersedePendingFields: \['date_needed', 'date_needed_option'\]/);
assert.match(ui, /onSelect=\{async \(date\) => \{[\s\S]*?await persistDateNeeded\(/);
assert.match(ui, /clearDateConfirm\.field === 'date_needed'[\s\S]*?await persistDateNeeded\(clearDateConfirm\.orderId, '', 'Clear Date Needed'\)/);
assert.match(ui, /void trackChange\(orderId, 'date_needed'/);
assert.match(ui, /void trackChange\(orderId, 'date_needed_option'/);
assert.doesNotMatch(ui, /updateOrder\(order\.id, "date_needed", format\(date/);
console.log('PASS Date Needed selection/clear use one concurrency-checked pair write, preserve history and block overlapping autosave');
