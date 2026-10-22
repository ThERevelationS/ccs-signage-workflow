import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute the actual Order Form import handler with synthetic FileReader,
// backend result and reload. No real entity or Smartsheet calls.
const ui = readFileSync('src/components/orders/OrderSpreadsheet.jsx', 'utf8');
const start = ui.indexOf('  const importFromExcel = async (e) => {');
const end = ui.indexOf('\n  React.useImperativeHandle', start);
assert.ok(start > 0 && end > start, 'Import handler must be isolated');
const actualHandler = ui.slice(start, end);

const response = (changes = {}) => ({
  created: 2, updated: 1, skipped: 1, conflicts: 0, errors: 0, total: 4, issues: [],
  ...changes,
});

function fixture({ result = response(), reload = true, invokeError = null, readError = false } = {}) {
  let backendCalls = 0;
  let reloadCalls = 0;
  const progress = [];
  const errors = [];
  const locks = { importInFlightRef: { current: false }, manualPullInFlightRef: { current: false }, orderLoadGenerationRef: { current: 0 } };
  class SyntheticReader {
    readAsBinaryString() {
      if (readError) this.onerror(new Error('Synthetic file read failure'));
      else this.onload({ target: { result: 'synthetic-binary' } });
    }
  }
  const env = {
    ...locks, isPulling: false,
    startMultiImport: () => 'synthetic-progress-id',
    updateImport: () => {},
    finishImport: (...args) => progress.push(args),
    setTimeout: () => 1,
    clearTimeout: () => {},
    FileReader: SyntheticReader,
    btoa: () => 'synthetic-file-encoded',
    base44: { functions: { invoke: async (action) => {
      assert.equal(action, 'importOrders');
      backendCalls++;
      if (invokeError) throw invokeError;
      return { data: result };
    } } },
    loadData: async (showLoading, options) => {
      assert.equal(showLoading, false);
      assert.deepEqual(options, { importReload: true }, 'Only the import-owned verified reload may run during an import');
      assert.equal(locks.importInFlightRef.current, true);
      reloadCalls++;
      return await reload;
    },
    workOrderFilter: null,
    sessionToken: 'synthetic-only',
    setSaveError: value => errors.push(value),
    console: { error() {} },
  };
  const run = new Function('env',
    'const { ' + Object.keys(env).join(', ') + ' } = env;\n' +
    actualHandler + '\nreturn importFromExcel;')(env);
  return {
    run: () => run({ target: { files: [{ name: 'synthetic.xlsx' }], value: 'synthetic.xlsx' } }),
    progress, errors, locks,
    get backendCalls() { return backendCalls; },
    get reloadCalls() { return reloadCalls; },
  };
}

{
  let settle;
  const delayed = new Promise(resolve => { settle = resolve; });
  const test = fixture({ reload: delayed });
  const running = test.run();
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(test.backendCalls, 1);
  assert.equal(test.reloadCalls, 1);
  assert.equal(test.locks.orderLoadGenerationRef.current, 1, 'Import invalidates preexisting background refreshes');
  assert.equal(test.progress.length, 0, 'A server acknowledgment alone cannot mark import complete');
  assert.equal(test.locks.importInFlightRef.current, true, 'Import lock stays held throughout verification');
  settle(true);
  await running;
  assert.equal(test.progress.length, 1);
  assert.equal(test.progress[0][2], false);
  assert.match(test.progress[0][1], /2 created, 1 updated, 1 unchanged/);
  assert.equal(test.locks.importInFlightRef.current, false);
  console.log('PASS import success is reported only after complete authoritative Order reload');
}

{
  const test = fixture({ reload: false });
  await test.run();
  assert.equal(test.backendCalls, 1);
  assert.equal(test.reloadCalls, 1);
  assert.equal(test.progress.length, 1);
  assert.equal(test.progress[0][2], true);
  assert.match(test.progress[0][1], /could not be reloaded safely/);
  assert.match(test.progress[0][1], /some rows may already be saved/);
  assert.match(test.errors.at(-1), /review protected edits and reload Orders before importing again/i);
  assert.equal(test.locks.importInFlightRef.current, false);
  console.log('PASS failed or protected import reload never displays a green completion or suggests blind retry');
}

{
  const test = fixture({ reload: Promise.reject(new Error('Synthetic reload interruption')) });
  await test.run();
  assert.equal(test.progress.length, 1);
  assert.equal(test.progress[0][2], true);
  assert.match(test.errors.at(-1), /Some rows may already have been saved/);
  assert.equal(test.locks.importInFlightRef.current, false);
  console.log('PASS thrown reload retains uncertain-import warning and frees import lock');
}

for (const bad of [
  null, {}, response({ total: 5 }), response({ created: '2' }),
  response({ errors: -1 }), response({ skipped: Number.NaN }),
]) {
  const test = fixture({ result: bad });
  await test.run();
  assert.equal(test.backendCalls, 1);
  assert.equal(test.reloadCalls, 0, 'Malformed counts cannot drive claimed reconciled completion');
  assert.equal(test.progress.length, 1);
  assert.equal(test.progress[0][2], true);
  assert.match(test.errors.at(-1), /Some rows may already have been saved/);
  assert.equal(test.locks.importInFlightRef.current, false);
}
console.log('PASS malformed or unaccounted import counts preserve uncertain completion without claiming success');

{
  const test = fixture({ result: response({ created: 1, updated: 0, skipped: 1, conflicts: 1, errors: 1 }) });
  await test.run();
  assert.equal(test.progress.length, 1);
  assert.equal(test.progress[0][2], true, 'Verified partial import keeps conflict/error review visible');
  assert.match(test.progress[0][1], /1 import conflict/);
  assert.equal(test.reloadCalls, 1);
  console.log('PASS verified partial import still requires review of conflicts and failures');
}

{
  const test = fixture({ result: response({
    created: 0, updated: 0, skipped: 0, conflicts: 4,
    issues: [null, { row: -1, message: 'Invalid issue' },
      ...[1, 2, 3, 4].map(row => ({ row,
        message: 'Multiple existing Orders match this customer, description and item type.' }))],
  }) });
  await test.run();
  assert.equal(test.reloadCalls, 1);
  assert.equal(test.progress[0][2], true);
  assert.match(test.progress[0][1], /4 import conflicts/);
  assert.match(test.progress[0][1], /Import row 1: Multiple existing Orders/);
  assert.match(test.progress[0][1], /Import row 3:/);
  assert.doesNotMatch(test.progress[0][1], /Import row 4:|Invalid issue/);
  console.log('PASS ambiguous matching explains the first three affected import rows after verified reload');
}

{
  const test = fixture({ invokeError: new Error('Synthetic lost acknowledgement') });
  await test.run();
  assert.equal(test.backendCalls, 1);
  assert.equal(test.progress.length, 1);
  assert.equal(test.progress[0][2], true);
  assert.match(test.errors.at(-1), /Some rows may already have been saved/);
  console.log('PASS lost backend import acknowledgment is uncertain, not safe-to-resubmit');
}

{
  const test = fixture({ readError: true });
  await test.run();
  assert.equal(test.backendCalls, 0);
  assert.equal(test.progress[0][2], true);
  assert.match(test.errors.at(-1), /No Order import request was sent/);
  console.log('PASS pre-request file failure is distinguished from uncertain server-side writes');
}
