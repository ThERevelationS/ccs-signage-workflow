import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync('src/pages/OrderForm.jsx', 'utf8');
const sheet = fs.readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');

assert.match(sheet, /React\.useImperativeHandle\(ref,[\s\S]*?saveAndSync,/, 'OrderSpreadsheet must expose saveAndSync through its page ref');
assert.match(page, /onClick=\{\(\) => spreadsheetRef\.current\?\.saveAndSync\?\.\(\)\}/, 'Save & Sync button must invoke the guarded flow');
assert.match(page, /saveStatus\.isSyncing \? \"Syncing\.\.\.\" : saveStatus\.isSaving \? \"Saving\.\.\.\" : \"Save & Sync\"/, 'Save button must show progress');
assert.match(page, /disabled=\{saveStatus\.isSaving \|\| saveStatus\.isSyncing\}/, 'Save button must prevent duplicate clicks');
assert.match(page, /onSaveStatusChange=\{setSaveStatus\}/, 'Order Form must consume authoritative save status');
assert.match(sheet, /const saveResult = await saveAllChanges\(\);[\s\S]*?if \(!saveResult\?\.complete\) \{[\s\S]*?return false;[\s\S]*?pushSavedOrdersToSmartsheet/, 'Smartsheet push must happen only after Base44 save completes');
const saveAndSyncBody = sheet.slice(sheet.indexOf('const saveAndSync = async () =>'), sheet.indexOf('// Existing internal/manual callers'));
assert.ok(saveAndSyncBody.indexOf('syncInFlightRef.current = true') < saveAndSyncBody.indexOf('await saveAllChanges()'), 'Save & Sync must reserve its single-flight guard before the first await');

console.log('Order Save & Sync button validation PASS');
