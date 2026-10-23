import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// The Order background-push lock was retired: Order Form sync is now
// configured the same way as Sales Pipeline — pull_enabled, push_enabled and
// create_smartsheet_from_base44 are all admin-controlled toggles. Scheduled
// Order push still writes ONLY Orders carrying the durable
// smartsheet_pending_local_sync marker (onlyPendingOrderRecords), so a
// scheduled run can never reinterpret preserved values as local edits.

assert.equal(existsSync('base44/shared/smartsheetOrderBackgroundPolicy.mjs'), false,
  'retired Order background lock module must not remain in backend shared code');
assert.equal(existsSync('src/shared/smartsheetOrderBackgroundPolicy.mjs'), false,
  'retired Order background lock module must not remain in frontend shared code');
assert.equal(existsSync('base44/functions/smartsheetSyncAction/base44/shared/smartsheetOrderBackgroundPolicy.mjs'), false,
  'retired Order background lock module must not remain in the deploy bundle');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const bundle = readFileSync('base44/functions/smartsheetSyncAction/base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const settings = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');
const orderWorkflow = readFileSync('base44/workflows/Smartsheet Scheduled Order Sync.jsonc', 'utf8');

for (const [label, source] of [['backend', backend], ['deploy bundle', bundle]]) {
  assert.ok(!source.includes('assertOrderBackgroundSyncPolicy'),
    `${label} must not re-assert the retired Order background lock`);
  assert.match(source, /const wantPush = action === 'push_dataset' \|\| \(isRunAction && profile\.push_enabled\)/,
    `${label} scheduled push must honor push_enabled for every dataset`);
  assert.doesNotMatch(source, /dataset !== 'orders' && profile\.push_enabled/,
    `${label} must not exclude Orders from scheduled push`);
  assert.match(source, /onlyPendingOrderRecords: isRunAction/,
    `${label} scheduled Order push must stay scoped to durable pending markers`);
}
console.log('PASS retired Order background lock is gone; scheduled Order push honors push_enabled via pending markers only');

assert.doesNotMatch(settings, /enforceOrderBackgroundSyncPolicy/,
  'admin settings must not force Order push/create toggles off on load or save');
assert.doesNotMatch(settings, /disabled=\{dataset === "orders"/,
  'Order Form sync toggles must be editable like Sales');
assert.match(settings, /Pushes durably-marked local Order edits on the schedule\./);
assert.match(settings, /Creates one linked sheet row per pending Order\./);
assert.match(settings, /config\.orders\.mirror_enabled && \(config\.orders\.pull_enabled \|\| config\.orders\.push_enabled\)/,
  'automatic-sync detection must count Order push as an enabled direction');
assert.match(settings, /Sales Pipeline and Order Form each follow their enabled pull\/push directions/);
console.log('PASS Admin settings exposes Order push/create toggles and counts them as automatic-sync directions');

assert.doesNotMatch(orderWorkflow, /locked OFF/);
assert.match(orderWorkflow, /Run scheduled Order Form sync/);
assert.match(orderWorkflow, /configured Order Form pull\/push directions/);
console.log('PASS scheduled Order workflow metadata describes pull/push, not pull-only');
