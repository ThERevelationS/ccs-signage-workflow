import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderSaveRecoveryAction as action } from '../src/components/orders/orderSaveRecoveryAction.mjs';

const remoteFailure = 'Saved in Base44, but Smartsheet sync needs attention: partial remote verification';
const localFailure = '0 Order rows were saved before the save stopped.';
assert.equal(action({}), null);
assert.deepEqual(action({ saveError: remoteFailure }), {
  kind: 'retry_sync', label: 'Retry Sync', disabled: false, guidance: '',
});
assert.deepEqual(action({ saveError: remoteFailure, busy: true }), {
  kind: 'retry_sync', label: 'Retry Sync', disabled: true, guidance: '',
});
assert.equal(action({ saveError: remoteFailure, readError: 'Could not verify Orders' }).kind, 'reload');
assert.equal(action({ saveError: localFailure }).label, 'Reload Orders');
assert.equal(action({ saveError: localFailure, busy: true }).disabled, true);
for (const failure of [localFailure, remoteFailure]) {
  const protectedEdits = action({ saveError: failure, hasProtectedDrafts: true });
  assert.equal(protectedEdits.kind, 'protected_edits');
  assert.equal(protectedEdits.disabled, true);
  assert.equal(protectedEdits.label, '');
  assert.match(protectedEdits.guidance, /Unsaved Order edits are protected/);
  assert.match(protectedEdits.guidance, /Save & Sync/);
}
assert.equal(action({
  saveError: remoteFailure, hasProtectedDrafts: true, readError: 'Incomplete read',
}).kind, 'protected_edits');
console.log('PASS Order recovery distinguishes remote retry, safe reload and protected drafts without offering a no-op reload');

const sheet = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const page = readFileSync('src/pages/OrderForm.jsx', 'utf8');
assert.match(sheet, /import \{ orderSaveRecoveryAction \} from/);
assert.match(sheet, /const saveRecovery = orderSaveRecoveryAction\(\{[\s\S]*?hasProtectedDrafts: hasUnsavedChanges \|\| hasActiveOrderEdits\(\),[\s\S]*?busy: isLoading \|\| isSaving \|\| isSyncing/);
assert.match(sheet, /saveRecovery\?\.kind === 'protected_edits'/);
assert.match(sheet, /\{saveRecovery\.guidance\}/);
assert.match(sheet, /disabled=\{saveRecovery\.disabled\}/);
assert.match(sheet, /onClick=\{\(\) => saveRecovery\.kind === 'retry_sync' \? saveAndSync\(\) : loadData\(true\)\}/);
assert.doesNotMatch(sheet, /onClick=\{\(\) => saveError\.startsWith\('Saved in Base44/);
console.log('PASS desktop recovery never advertises a blocked reload and disables recovery during a save or sync');

const mobileStart = sheet.indexOf('  // Mobile card view');
const mobileEnd = sheet.indexOf('\n  return (\n    <div ', mobileStart);
assert.ok(mobileStart > 0 && mobileEnd > mobileStart, 'Actual mobile-card return is present');
const mobile = sheet.slice(mobileStart, mobileEnd);
assert.match(mobile, /if \(isMobile\) \{/);
assert.doesNotMatch(mobile, /\{saveError &&/);
assert.match(page, /\{\(saveStatus\.saveError \|\|/);
assert.match(page, /role=\{saveStatus\.saveError \? 'alert' : 'status'\}/);
assert.match(page, /md:hidden/);
assert.match(page, /max-w-full break-words/);
assert.match(page, /saveStatus\.saveError && saveStatus\.hasUnsavedChanges/);
assert.match(page, /Unsaved edits are protected/);
assert.match(page, /hasLocalOrderChanges \? "Save & Sync" : "Sync"/);
assert.match(page, /disabled=\{saveStatus\.isSaving \|\| saveStatus\.isSyncing \|\| saveStatus\.isLoading \|\| Boolean\(saveStatus\.readError\)\}/);
console.log('PASS mobile toolbar displays every Order save/sync error without losing long-text wrapping or disabling normal Save & Sync protections');
