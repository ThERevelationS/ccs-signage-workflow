import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute actual Order action entry points against synthetic refs only.
// No Base44 entity, import backend or real Smartsheet requests are contacted.
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');

function isolate(start, end, identifier, env) {
  const a = ui.indexOf(start);
  const b = ui.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Missing Order action ' + identifier);
  return new Function('env',
    'const { ' + Object.keys(env).join(', ') + ' } = env;\n' +
    ui.slice(a, b) + '\nreturn ' + identifier + ';')(env);
}

function runBlocked({ ref, rendered }) {
  const calls = { create: 0, remove: 0, import: 0, errors: [] };
  const manualPullInFlightRef = { current: ref };
  const addInFlightRef = { current: false };
  const deleteInFlightRef = { current: false };
  const importInFlightRef = { current: false };
  const target = { id: 'order-synthetic-123', customer_name: 'Synthetic only' };
  const env = {
    isPulling: rendered, manualPullInFlightRef, addInFlightRef, deleteInFlightRef, importInFlightRef,
    isRegistered: true, readError: '', deleteConfirm: target,
    Order: {}, orders: [target], currentUser: { email: 'synthetic@example.invalid' },
    originalOrdersRef: { current: { [target.id]: target } },
    setSaveError: message => calls.errors.push(message),
    createOrderWithRecovery: async () => { calls.create++; throw Error('Create must be fenced'); },
    softDeleteOrderFromLoadedSnapshot: async () => { calls.remove++; throw Error('Delete must be fenced'); },
    startMultiImport: () => { calls.import++; throw Error('Import must be fenced'); },
  };
  const add = isolate('  const addNewRow = async () => {',
    '\n  const validateOrderForDateNeeded', 'addNewRow', env);
  const remove = isolate('  const confirmDelete = async () => {',
    '\n  const getFilteredWorkOrders', 'confirmDelete', env);
  const importFile = isolate('  const importFromExcel = async (e) => {',
    '\n  React.useImperativeHandle', 'importFromExcel', env);
  const event = { target: { files: [{ name: 'synthetic-not-read.xlsx' }], value: 'synthetic-not-read.xlsx' } };
  return Promise.all([add(), remove(), importFile(event)]).then(() => {
    assert.equal(calls.create, 0, 'No local Order should be created');
    assert.equal(calls.remove, 0, 'No local Order should be deleted');
    assert.equal(calls.import, 0, 'No import operation should start');
    assert.equal(calls.errors.length, 0, 'Blocked actions should not obscure the active pull status');
    assert.equal(addInFlightRef.current, false);
    assert.equal(deleteInFlightRef.current, false);
    assert.equal(importInFlightRef.current, false);
    assert.equal(event.target.value, '', 'Discard blocked file selection so user can reselect later');
  });
}

await runBlocked({ ref: true, rendered: false });
await runBlocked({ ref: false, rendered: true });
await runBlocked({ ref: true, rendered: true });
console.log('PASS Add, Delete and Excel import all reject same-tick and rendered manual pulls before any entity or backend write');

// Test the file-dialog entry point independently; the exposed action must not
// open a picker for a user whose manual pull has already acquired its lock.
const expose = ui.slice(ui.indexOf('  React.useImperativeHandle(ref, () => ({'),
  ui.indexOf('  const handleSort = useCallback(', ui.indexOf('  React.useImperativeHandle(ref, () => ({')));
assert.match(expose, /importFromExcel: \(\) => \{\s*if \(manualPullInFlightRef\.current \|\| isPulling \|\| importInFlightRef\.current\) return;\s*fileInputRef\.current\?\.click\(\);/);
const picker = expose.match(/importFromExcel: \(\) => \{([\s\S]*?)\n    \},\n    canImportExport/);
assert.ok(picker, 'Expected isolated Order import-picker action');
for (const ref of [true, false]) {
  let pickerClicks = 0;
  const test = new Function('manualPullInFlightRef', 'isPulling', 'importInFlightRef', 'fileInputRef',
    'return () => {' + picker[1] + '\n};')(
    { current: ref }, !ref, { current: false }, { current: { click() { pickerClicks++; } } });
  test();
  assert.equal(pickerClicks, 0);
}
console.log('PASS import picker cannot open during the active pull, including the synchronous pre-render window');

assert.match(ui, /onClick=\{\(\) => deleteOrder\(order\)\}\s*disabled=\{isPulling\}/);
assert.match(ui, /<AlertDialogAction onClick=\{confirmDelete\} disabled=\{isPulling \|\| deleteInFlightRef\.current\}/);
assert.match(ui, /const pullFromSmartsheet = async \(\) => \{[\s\S]*?addInFlightRef\.current \|\|[\s\S]*?deleteInFlightRef\.current \|\| importInFlightRef\.current/);
console.log('PASS visible Delete actions disable during pulls and existing pull-start action serialization remains intact');
