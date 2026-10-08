import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_BACKGROUND_SYNC_POLICY,
  orderBackgroundSyncPolicyViolations,
  enforceOrderBackgroundSyncPolicy,
  assertOrderBackgroundSyncPolicy,
} from '../base44/shared/smartsheetOrderBackgroundPolicy.mjs';

assert.deepEqual(ORDER_BACKGROUND_SYNC_POLICY, {
  push_enabled: false,
  create_base44_from_smartsheet: false,
  create_smartsheet_from_base44: false,
});

const safe = {
  mirror_enabled: true,
  pull_enabled: true,
  push_enabled: false,
  create_base44_from_smartsheet: false,
  create_smartsheet_from_base44: false,
};
assert.deepEqual(orderBackgroundSyncPolicyViolations(safe), []);
assert.deepEqual(orderBackgroundSyncPolicyViolations({
  ...safe,
  push_enabled: true,
  create_smartsheet_from_base44: true,
}), ['push_enabled', 'create_smartsheet_from_base44']);

assert.deepEqual(enforceOrderBackgroundSyncPolicy({
  mirror_enabled: false,
  pull_enabled: false,
  push_enabled: true,
  create_base44_from_smartsheet: true,
  create_smartsheet_from_base44: true,
}), {
  mirror_enabled: false,
  pull_enabled: false,
  push_enabled: false,
  create_base44_from_smartsheet: false,
  create_smartsheet_from_base44: false,
});
assert.equal(assertOrderBackgroundSyncPolicy(safe), safe);
assert.throws(() => assertOrderBackgroundSyncPolicy({
  ...safe, create_base44_from_smartsheet: true,
}), /background push and automatic record creation are locked OFF/i);
console.log('PASS Order background policy locks only write/create automation and leaves mirror/pull controllable');

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const settings = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');
const workflow = readFileSync('base44/workflows/Smartsheet Scheduled Sync.jsonc', 'utf8');

assert.match(backend, /assertOrderBackgroundSyncPolicy\(nextValue\?\.orders \|\| \{\}\)/);
const scheduledOrderPushGuards = backend.match(/action === 'run_sync' && dataset !== 'orders' && profile\.push_enabled/g) || [];
assert.equal(scheduledOrderPushGuards.length, 2);
assert.doesNotMatch(backend, /action === 'run_sync' && profile\.push_enabled/);
assert.match(settings, /merged\.orders = enforceOrderBackgroundSyncPolicy\(merged\.orders\)/);
assert.match(settings, /Order Form background push is locked OFF\. Use Save & Sync for explicit writes/);
assert.match(settings, /Order Form automatic creation is locked OFF; unlinked rows are flagged for review/);
assert.match(settings, /Order Form automatic creation is locked OFF\. Save & Sync can explicitly create a row for a new Order/);
assert.match(settings, /disabled=\{dataset === "orders" && \["push_enabled", "create_base44_from_smartsheet", "create_smartsheet_from_base44"\]\.includes\(key\)\}/);
assert.doesNotMatch(settings, /dataset === "sales" && \["push_enabled"/);
assert.match(settings, /Sales Pipeline follows its enabled pull\/push directions/);
assert.match(settings, /Order Form can pull automatically when enabled; background push and automatic record creation are locked OFF, so Order writes use Save & Sync/);
assert.doesNotMatch(settings, /Both directions \(pull and push\) run for every dataset/);
assert.match(settings, /title: "Automatic sync is off\."/);
assert.match(settings, /title: "Automatic sync is paused\."/);
assert.match(settings, /title: "Automatic sync has no enabled directions\."/);
assert.match(settings, /title: "Automatic sync is active\."/);
assert.match(settings, /scheduledOrderPullEnabled = Boolean\(\s*config\.orders\.mirror_enabled && config\.orders\.pull_enabled\s*\)/);
assert.match(settings, /config\.orders\.mirror_enabled && config\.orders\.pull_enabled\)\)\s*\), \[config\]\);/);
assert.doesNotMatch(settings, /config\.orders\.mirror_enabled && \(config\.orders\.pull_enabled \|\| config\.orders\.push_enabled\)/);
assert.match(settings, /<strong>\{automaticSyncBanner\.title\}<\/strong> \{automaticSyncBanner\.detail\}/);
console.log('PASS Admin settings cannot re-enable or misdescribe Order background writes, and all four automatic-sync banner states are rendered from current config');

assert.match(workflow, /Run scheduled Smartsheet sync/);
assert.match(workflow, /configured Sales Pipeline pull\/push directions and Order Form pull only/);
assert.match(workflow, /Order Form background push is locked OFF; use explicit Save & Sync/);
assert.match(workflow, /Order Form can pull automatically when enabled, but background push and automatic record creation are locked OFF/);
assert.doesNotMatch(workflow, /both directions \(push and pull\) for Sales Pipeline and Order Form/);
console.log('PASS scheduled workflow metadata describes Sales directions separately from Order pull-only background behavior');

assert.match(backend, /allowExplicitOrderCreate: true/);
assert.match(backend, /if \(action === 'push_saved_orders'\)/);
console.log('PASS explicit Save & Sync path remains separate from background policy');
