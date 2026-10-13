import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const client = readFileSync('src/components/orders/orderSaveSync.js', 'utf8');

assert.match(backend, /const orderFailedRecordIds = new Set<string>\(\)/);
assert.match(backend, /const deferredOrderVerification = new Map<string/);
assert.match(backend, /requiresRemoteWrite: fieldPlan\.outgoing\.length > 0/);
assert.match(backend, /orderRemoteVerifiedIds/);
assert.match(backend, /did not read back with the expected values\. The Order remains queued/);
assert.match(backend, /detectConflict\(freshRow\.cells, verification\.expectedSnapshot, bindings, 'orders'\)/);
assert.match(backend, /updated_date: verification\.originalUpdatedDate, smartsheet_pending_local_sync: true/);
assert.match(backend, /findUnverifiedSyncMetadata\(\[expected\], record \? \[record\] : \[\]\)/);
assert.match(backend, /smartsheet_pending_local_sync !== false/);
assert.match(backend, /smartsheet_pending_local_sync: true/);
console.log('PASS Order batch writes require fresh remote read-back and version-CAS Base44 confirmation before completion');

const phase2 = backend.slice(
  backend.indexOf('// Phase 2: Batch Smartsheet write'),
  backend.indexOf('// Phase 5: Resolve conflict decisions'),
);
assert.match(phase2, /if \(dataset === 'orders'\) orderBatchWriteError/);
assert.match(phase2, /if \(dataset === 'orders'\) \{/);
assert.match(phase2, /const verifiedSalesUpdates = deferredBase44Updates\.filter/);
// Shared Sales now protects ordinary and approved WorkOrder metadata by revision.
// Order's own versioned reconciliation remains unchanged.
assert.match(phase2, /for \(const update of ordinaryUpdates\) \{/);
assert.match(phase2, /await commitVerifiedSalesMetadata\(\{/);
assert.doesNotMatch(phase2, /bulkUpdate\(ordinaryUpdates\)/);
assert.match(phase2, /const approvedUpdates = verifiedSalesUpdates\.filter/);
assert.match(phase2, /await base44\.asServiceRole\.entities\.WorkOrder\.updateMany\(/);
assert.doesNotMatch(
  phase2.slice(phase2.indexOf("if (dataset === 'orders')"), phase2.indexOf('} else {', phase2.indexOf("if (dataset === 'orders')"))),
  /bulkUpdate\(deferredBase44Updates\)/
);
console.log('PASS Order partial-sync safety does not alter the shared Sales batch update path');

assert.match(backend, /successful_record_ids: successfulOrderRecordIds\.slice\(0, 100\)/);
assert.match(backend, /unresolved_record_ids: unresolvedOrderRecordIds\.slice\(0, 100\)/);
assert.match(backend, /errors: dataset === 'orders' \? orderFailedRecordIds\.size : errors\.length/);
assert.match(backend, /successfulDecisionIds[\s\S]*successfulOrderUpdates\.has\(recordId\)/);
assert.match(backend, /entity_id:\{\$in:\[\.\.\.successfulOrderUpdates\]\}/);
console.log('PASS result counts and conflict resolution include only independently verified Order outcomes');

assert.match(ui, /const unresolvedTargets = syncTargets\.filter\(\(\{ id \}\) => pendingSyncIdsRef\.current\.has\(id\)\)/);
assert.match(ui, /const completedCount = syncTargets\.length - unresolvedTargets\.length/);
assert.match(ui, /synced successfully; \$\{unresolvedTargets\.length\} remain queued for Retry Sync/);
assert.match(ui, /const verificationLoaded = await loadData\(false\)/);
assert.match(client, /summarizeSavedOrderSync\(result/);
console.log('PASS client reloads durable markers after a partial result and reports only unresolved Orders for Retry Sync');
