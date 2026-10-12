import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderSaveSyncStatus } from "../src/components/orders/orderSaveSyncStatus.mjs";
import { canCommitOrderReload } from "../src/components/orders/orderReloadSafety.mjs";

const page = readFileSync("src/pages/OrderForm.jsx", "utf8");
const grid = readFileSync("src/components/orders/OrderSpreadsheet.jsx", "utf8");
const helper = readFileSync("src/components/orders/orderSaveSync.js", "utf8");
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");

assert.match(page, /hasLocalOrderChanges = saveStatus\.hasUnsavedChanges \|\| saveStatus\.pendingSyncCount > 0/);
assert.match(page, /hasLocalOrderChanges\s*\? spreadsheetRef\.current\?\.saveAndSync\?\.\(\)\s*: spreadsheetRef\.current\?\.pullFromSmartsheet\?\.\(\)/);
assert.match(page, /hasLocalOrderChanges \? "Save & Sync" : "Sync"/);
assert.match(page, /saveStatus\.isLoading/);
assert.match(grid, /const pullFromSmartsheet = async \(\) =>/);
assert.match(grid, /Object\.keys\(pendingChangesRef\.current\)\.length \|\| pendingSyncIdsRef\.current\.size/);
assert.match(grid, /const pull = await pullOrdersFromSmartsheet\(\{ sessionToken \}\)/);
assert.match(grid, /const reloaded = await loadData\(false, \{ manualPullReload: true \}\)/);
assert.match(grid, /syncInFlightRef\.current = true/);
assert.match(grid, /pullFromSmartsheet,\s*exportToExcel/);
assert.match(grid, /const hasActiveOrderEdits = \(\) => Boolean\(/);
assert.match(grid, /if \(\(manualPullInFlightRef\.current && !manualPullReload\) \|\| hasActiveOrderEdits\(\)\) return false/);
assert.match(grid, /localEditInProgress: hasActiveOrderEdits\(\)/);
console.log("PASS Order button swaps modes based on unsaved or durable pending changes; pull guards in-flight data");

// A timer/focus refresh may begin before Sync and finish after it. The older
// response must not overwrite the remote changes pulled by the newer request.
assert.equal(canCommitOrderReload({ requestGeneration: 4, latestGeneration: 5 }), false);
assert.equal(canCommitOrderReload({ requestGeneration: 5, latestGeneration: 5 }), true);
assert.equal(canCommitOrderReload({ requestGeneration: 5, latestGeneration: 5, manualPullInFlight: true }), false);
assert.equal(canCommitOrderReload({ requestGeneration: 5, latestGeneration: 5, manualPullInFlight: true, manualPullReload: true }), true);
assert.equal(canCommitOrderReload({ requestGeneration: 4, latestGeneration: 5, manualPullInFlight: true, manualPullReload: true }), false);
assert.equal(canCommitOrderReload({ requestGeneration: undefined, latestGeneration: 5 }), false);
assert.match(grid, /const orderLoadGenerationRef = useRef\(0\)/);
assert.match(grid, /const manualPullInFlightRef = useRef\(false\)/);
assert.match(grid, /const requestGeneration = \+\+orderLoadGenerationRef\.current/);
assert.match(grid, /orderLoadGenerationRef\.current \+= 1/);
assert.match(grid, /if \(\(manualPullInFlightRef\.current && !manualPullReload\) \|\| hasActiveOrderEdits\(\)\) return false/);
assert.match(grid, /loadData\(false, \{ manualPullReload: true \}\)/);
assert.match(grid, /if \(!canCommitOrderReload\(\{/);
assert.match(grid, /manualPullInFlightRef\.current = false/);
console.log("PASS old refresh discarded, manual Sync reload accepted, and concurrent timer refresh blocked");

assert.match(helper, /action: "pull_dataset",\s*dataset: "orders"/);
assert.match(helper, /retryRateLimit: false/);
assert.match(helper, /results\.length !== 1 \|\| results\[0\]\?\.dataset !== "orders"/);
assert.match(helper, /results\[0\]\?\.direction !== "pull"/);
assert.match(helper, /if \(results\[0\]\?\.skipped\)/);
assert.match(backend, /allowedOrderManualPull = action === 'pull_dataset' && body\?\.dataset === 'orders' && Boolean\(actor\?\.id\)/);
assert.match(backend, /action === 'pull_dataset' \|\| \(action === 'run_sync' && profile\.pull_enabled\)/);
assert.match(backend, /dataset !== 'orders' && profile\.push_enabled/);
console.log("PASS authorized manual Order pull uses existing permanent-ID pull and cannot trigger Sales or Order push");

assert.equal(orderSaveSyncStatus({ isSyncing: true, isPulling: true }).text, "Checking Smartsheet…");
assert.equal(orderSaveSyncStatus({ lastSynced: new Date(), lastSyncDirection: "pull" }).text, "Smartsheet checked");
assert.equal(orderSaveSyncStatus({ lastSynced: new Date(), lastSyncDirection: "push" }).text, "Saved & synced");
assert.equal(orderSaveSyncStatus({ saveError: "Smartsheet pull needs review." }).text, "Smartsheet pull needs attention");
assert.match(page, /md:hidden/);
assert.match(grid, /if \(!isRegistered \|\| readError \|\| addInFlightRef\.current \|\| isPulling\) return/);
assert.match(grid, /if \(!target \|\| deleteInFlightRef\.current \|\| isPulling\) return/);
assert.equal(orderSaveSyncStatus({ pendingSyncCount: 1 }).kind, "pending");
assert.equal(orderSaveSyncStatus({ hasUnsavedChanges: true }).kind, "unsaved");
console.log("PASS pull vs push states and remaining durable pending queue are distinct");
