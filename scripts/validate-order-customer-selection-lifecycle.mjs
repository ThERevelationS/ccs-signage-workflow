import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyActiveOrderCustomerJob } from '../src/components/orders/orderCustomerJobPicker.mjs';
import { canCommitOrderReload } from '../src/components/orders/orderReloadSafety.mjs';

const eligibleJob = {
  id: 'job-live', client_name: 'Selected Customer', sales_status: 'won',
  current_stage: 'production', completed: false, deleted: false,
};

// Simulate the live picker preserving input focus during a deferred job lookup.
// A successful verified choice queues the exact pair, then releases only its
// draft latch. Pending edits continue blocking reloads until Base44 save.
const lifecycle = async ({editWhileVerifying = false, invalidJob = false} = {}) => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const chosen = { orderId: 'order-1', currentName: 'Typed name', draftId: 'order-1',
    generation: 7, pending: {}, saved: false };
  const startGeneration = ++chosen.generation;
  const jobEntity = { get: async () => {
    await waiting;
    return invalidJob ? { ...eligibleJob, completed: true } : eligibleJob;
  }};
  const action = (async () => {
    const {latest, eligible} = await verifyActiveOrderCustomerJob(jobEntity, 'job-live');
    if (chosen.generation !== startGeneration || !eligible) return false;
    chosen.currentName = latest.client_name;
    chosen.pending.customer_name = latest.client_name;
    chosen.pending.work_order_id = latest.id;
    if (chosen.draftId === chosen.orderId) chosen.draftId = null;
    return true;
  })();
  if (editWhileVerifying) {
    chosen.generation++;
    chosen.currentName = 'Newer typed name';
  }
  release();
  return {chosen, accepted: await action};
};

const success = await lifecycle();
assert.equal(success.accepted, true);
assert.equal(success.chosen.draftId, null);
assert.deepEqual(success.chosen.pending, {
  customer_name: 'Selected Customer', work_order_id: 'job-live',
});
assert.equal(canCommitOrderReload({
  requestGeneration: 1, latestGeneration: 1, localEditInProgress: Object.keys(success.chosen.pending).length > 0,
}), false);
success.chosen.pending = {}; // mocked successful Base44 autosave
assert.equal(canCommitOrderReload({ requestGeneration: 1, latestGeneration: 1, localEditInProgress: false }), true);
console.log('PASS verified job selection releases its draft latch only after both association fields are queued; refresh resumes after save');

const stale = await lifecycle({editWhileVerifying: true});
assert.equal(stale.accepted, false);
assert.equal(stale.chosen.currentName, 'Newer typed name');
assert.equal(stale.chosen.draftId, 'order-1');
assert.deepEqual(stale.chosen.pending, {});
const ineligible = await lifecycle({invalidJob: true});
assert.equal(ineligible.accepted, false);
assert.equal(ineligible.chosen.draftId, 'order-1');
console.log('PASS newer typing and inactive job results retain the draft without overwriting a name or saving a stale Work Order ID');

const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const segment = ui.slice(
  ui.indexOf('{/* Customer Name with Work Order Link */}'),
  ui.indexOf('{/* Request Type */}'),
);
const selection = segment.slice(segment.indexOf('onClick={async () => {'));
const start = selection.indexOf('const selectionEditGeneration = ++orderLocalEditGenerationRef.current');
const verify = selection.indexOf('await verifyActiveOrderCustomerJob(WorkOrder, wo.id)');
const staleCheck = selection.indexOf('orderLocalEditGenerationRef.current !== selectionEditGeneration');
const eligibleCheck = selection.indexOf('if (!eligible)');
const writePending = selection.indexOf('pendingChangesRef.current[order.id] = {');
const name = selection.indexOf('customer_name: latest.client_name', writePending);
const workId = selection.indexOf('work_order_id: latest.id', writePending);
const setUnsaved = selection.indexOf('setHasUnsavedChanges(true)', workId);
const releaseDraft = selection.indexOf('if (customerNameDraftOrderRef.current === order.id)', setUnsaved);
const close = selection.indexOf('setShowCustomerDropdown(null)', releaseDraft);
assert.ok(start >= 0 && verify > start && staleCheck > verify && eligibleCheck > staleCheck &&
  writePending > eligibleCheck && name > writePending && workId > name && setUnsaved > workId &&
  releaseDraft > setUnsaved && close > releaseDraft);
assert.match(selection, /customerNameDraftOrderRef.current = null/);
assert.match(selection, /finally \{\s*customerSelectionInFlightRef.current = false/);
assert.match(segment, /onMouseDown=\{\(event\) => event.preventDefault\(\)\}/);
assert.match(segment, /onBlur=\{\(event\) => \{[\s\S]*?customerNameDraftOrderRef.current === order.id\) customerNameDraftOrderRef.current = null/);
assert.match(ui, /const hasActiveOrderEdits = \(\) => Boolean\([\s\S]*?customerNameDraftOrderRef.current \|\| customerSelectionInFlightRef.current/);
console.log('PASS source guards async association, queues both fields before releasing only its own draft, and leaves blur-based edit protection intact');
