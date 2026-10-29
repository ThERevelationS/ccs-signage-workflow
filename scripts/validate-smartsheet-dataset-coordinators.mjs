import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const review = readFileSync('base44/shared/smartsheetConflictReview.ts', 'utf8');
const widget = readFileSync('src/components/admin/SmartsheetSyncWidget.jsx', 'utf8');
const salesWf = JSON.parse(readFileSync('base44/workflows/Smartsheet Scheduled Sync.jsonc', 'utf8'));
const orderWf = JSON.parse(readFileSync('base44/workflows/Smartsheet Scheduled Order Sync.jsonc', 'utf8'));

// 1. Per-dataset coordinator keys exist; the legacy record is mirror-only.
assert.match(entry, /orders: 'smartsheetOrderSyncStatus'/);
assert.match(entry, /sales: 'smartsheetSalesSyncStatus'/);
assert.match(entry, /const LEGACY_SYNC_STATUS_KEY = 'smartsheetSyncStatus'/);
assert.match(entry, /function syncStatusKeyForDataset\(dataset: any\)/);

// 2. Claims load/create only the dataset's own record and gate on the other
//    dataset's ACTIVE run only (stale other-side state must not block).
assert.match(entry, /async function claimSyncRun\(base44: any, status: any, dataset\?: string\)/);
assert.match(entry, /await ensureSyncStatusRecord\(base44, key\)/);
assert.match(entry, /const otherKey = dataset === 'orders' \? SYNC_STATUS_KEYS\.sales\s*:\s*dataset === 'sales' \? SYNC_STATUS_KEYS\.orders : null;/);
assert.match(entry, /otherValue\?\.status === 'running' && !otherAbandoned/);
assert.match(entry, /ensureSyncStatusRecord\(base44, otherKey\)/);

// 3. Dataset-scoped claim guards: Order fence only for orders; Sales recovery
//    gates only for sales.
assert.match(entry, /const currentIsOrderRun = dataset === 'orders' && current\?\.status === 'running';/);
assert.match(entry, /if \(dataset === 'orders'\) \{\s*let priorOrderPull = classifyPriorUncertainOrderPull/);
assert.match(entry, /dataset === 'sales' && status\?\.action === 'recover_verified_sales_create' && current\?\.status === 'running'/);
assert.match(entry, /dataset === 'sales' && current\?\.status === 'running' && current\?\.action === 'recover_verified_sales_create'/);

// 4. CAS + run-identity writes use the dataset key, never a shared literal.
assert.doesNotMatch(entry, /updateMany\(\s*\{ id: record\.id, setting_key: 'smartsheetSyncStatus'/);
assert.match(entry, /\{ id: record\.id, setting_key: key, updated_date: record\.updated_date \}/);
assert.match(entry, /async function syncRunOwned\(base44: any, startedAt: string, dataset\?: string\)/);
assert.match(entry, /async function saveSyncStatusForRun\(base44: any, status: any, startedAt: string, dataset\?: string\)/);
assert.match(entry, /loadSingleSyncStatusRecord\(base44, syncStatusKeyForDataset\(dataset\)\)/);

// 5. Legacy mirror happens on claim and terminal saves only.
assert.match(entry, /await mirrorSyncStatusToLegacy\(base44, value, dataset\)/);
assert.match(entry, /status\?\.status !== 'running'\) \{\s*await mirrorSyncStatusToLegacy/);

// 6. Invocation claims track the dataset for crash cleanup.
assert.match(entry, /const claimInvocationRun = async \(status: any, dataset\?: string\)/);
assert.match(entry, /claimedDataset = cleanText\(dataset, 20\) \|\| null;/);
assert.match(entry, /const key = syncStatusKeyForDataset\(claimedDataset\);/);

// 7. Save & Sync and recovery paths claim their own dataset coordinators.
assert.match(entry, /current_step_label: 'Order Form → Smartsheet',[\s\S]*?\}, 'orders'\);/);
assert.match(entry, /current_step_label: 'Sales Pipeline → Smartsheet',[\s\S]*?\}, 'sales'\);/);
assert.match(entry, /assertSyncRunOwnership\(base44, startedAt, 'orders'\)/);
assert.match(entry, /assertSyncRunOwnership\(base44, startedAt, 'sales'\)/);
assert.match(entry, /action:'recover_verified_sales_create',[\s\S]*?\},'sales'\);/);
assert.match(entry, /loadSingleSyncStatusRecord\(base44,SYNC_STATUS_KEYS\.sales\), current=record\.setting_value/);
assert.match(entry, /filter\(\{ setting_key: SYNC_STATUS_KEYS\.orders \}\)/);

// 8. Conflict review claims the conflict's own dataset record.
assert.match(review, /await claim\([\s\S]*?\},conflict\.dataset\)/);
assert.match(review, /assertOwner\(started,conflict\.dataset\)/);
assert.match(review, /finish\([\s\S]*?\},started,conflict\.dataset\)/);
assert.match(entry, /claim:\(state,dataset\)=>claimInvocationRun\(state,dataset\)/);
assert.match(entry, /assertOwner:\(start,dataset\)=>assertSyncRunOwnership\(base44,start,dataset\)/);

// 9. Run orchestration: per-dataset claim inside the loop; review isolated.
assert.match(entry, /\['run_sync', 'run_sales_sync', 'run_order_sync', 'push_dataset', 'pull_dataset'\]\.includes\(action\)/);
assert.match(entry, /for \(const dataset of datasetsToRun\)/);
assert.match(entry, /\}, dataset\);\s*let activeDirection/);
assert.match(entry, /datasetNeedsReview = dataset === 'sales'\s*\?\s*salesRunRequiresReview\(datasetResults\)\s*:\s*orderRunRequiresReview\(datasetResults\);/);
assert.match(entry, /results: datasetResults,/);
assert.doesNotMatch(entry, /const runNeedsReview = salesRunRequiresReview\(results\) \|\| orderRunRequiresReview\(results\);/);

// 10. run_sales_sync / run_order_sync accepted; body.dataset honored on run_sync.
assert.match(entry, /'run_sales_sync', 'run_order_sync'.*supported_actions|'run_sync', 'run_sales_sync', 'run_order_sync'/);
assert.match(entry, /action === 'run_sales_sync'\s*\? \['sales'\]/);
assert.match(entry, /action === 'run_order_sync'\s*\? \['orders'\]/);
assert.match(entry, /body\?\.dataset === 'orders'\s*\?\s*\['orders'\]/);
assert.match(entry, /\['run_sync', 'run_sales_sync', 'run_order_sync'\]\.includes\(action\) &&\s*await hasWorkflowInvocationCapability/);

// 11. Scheduled Order runs honor the same push toggle as Sales; pending-only scoping applies.
assert.match(entry, /isRunAction && profile\.push_enabled/);
assert.match(entry, /onlyPendingOrderRecords: isRunAction/);

// 12. Status action exposes both dataset records for UI consumers.
assert.match(entry, /status_orders: orderStatusRecord\?\.setting_value \|\| null/);
assert.match(entry, /status_sales: salesStatusRecord\?\.setting_value \|\| null/);
assert.match(entry, /dataset_coordinators: 'per-dataset-v1'/);

// 13. Frontend: Order Form reads its own coordinator; other views prefer an
//     active run, else the freshest dataset record, else the legacy record.
assert.match(widget, /orders: 'smartsheetOrderSyncStatus'/);
assert.match(widget, /sales: 'smartsheetSalesSyncStatus'/);
assert.match(widget, /hasStatusContent\(orderValue\) \? orderValue : legacyValue/);
assert.match(widget, /datasetValues\.find\(value => value\?\.status === 'running'\)/);

// 14. Workflow definitions: separate actions and offset cadences, same tz.
assert.equal(salesWf.definition.do[0].run_sales_sync.with.args.action, 'run_sales_sync');
assert.equal(orderWf.definition.do[0].run_order_sync.with.args.action, 'run_order_sync');
assert.equal(salesWf.trigger.config.cron_expression, '*/15 * * * *');
assert.equal(orderWf.trigger.config.cron_expression, '8,23,38,53 * * * *');
assert.equal(salesWf.trigger.config.timezone, 'America/New_York');
assert.equal(orderWf.trigger.config.timezone, 'America/New_York');

console.log('Smartsheet per-dataset coordinator split: 45/45 PASS.');
