// Exercise the production checklist-save handlers with controlled async persistence.
// No Base44 entities, network requests, or live records are accessed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/components/sips/TemplateBuilder.jsx', import.meta.url), 'utf8');
const names = ['saveSubTemplateChecklist', 'saveProductTypeTemplate'];
const handlers = names.map(name => {
  const start = source.indexOf('  const ' + name + ' = ');
  assert.ok(start >= 0, name + ' exists');
  const end = source.indexOf('\n  };', start);
  assert.ok(end > start, name + ' is a block handler');
  return source.slice(start, end + 6);
}).join('\n') + '\nthis.actions = {saveSubTemplateChecklist, saveProductTypeTemplate}';

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function setup() {
  const state = {
    selectedSubTemplate: 'sub1', selectedProductType: 'prod1',
    subTemplateChecklistItems: ['sub draft'], productTypeItems: ['product draft'],
    subTemplateHasChanges: true, productTypeHasChanges: true,
    subTemplateSaveStatus: 'idle', productTypeSaveStatus: 'idle', savingChecklist: null,
  };
  const calls = [];
  const checklistSaveInFlight = { current: null };
  const subTemplateDraftRef = { current: { id: state.selectedSubTemplate, items: state.subTemplateChecklistItems } };
  const productTypeDraftRef = { current: { id: state.selectedProductType, items: state.productTypeItems } };
  const context = {
    ...state, checklistSaveInFlight, subTemplateDraftRef, productTypeDraftRef,
    subTemplates: [{ id: 'sub1', name: 'Saved option' }],
    console: { error: () => {} },
    saveSubTemplateEntry: (...args) => {
      const pending = deferred();
      calls.push({ kind: 'subTemplate', args, ...pending });
      return pending.promise;
    },
    saveProductTypeTemplateEntry: (...args) => {
      const pending = deferred();
      calls.push({ kind: 'productType', args, ...pending });
      return pending.promise;
    },
  };
  for (const key of Object.keys(state)) {
    context['set' + key[0].toUpperCase() + key.slice(1)] = value => {
      state[key] = value;
      context[key] = value;
    };
  }
  vm.createContext(context);
  vm.runInContext(handlers, context);
  return {
    state, calls, context, checklistSaveInFlight, subTemplateDraftRef, productTypeDraftRef,
    ...context.actions,
    editSub(items) {
      context.subTemplateChecklistItems = items;
      state.subTemplateChecklistItems = items;
      subTemplateDraftRef.current = { id: state.selectedSubTemplate, items };
      context.setSubTemplateHasChanges(true);
      context.setSubTemplateSaveStatus('idle');
    },
    editProduct(items) {
      context.productTypeItems = items;
      state.productTypeItems = items;
      productTypeDraftRef.current = { id: state.selectedProductType, items };
      context.setProductTypeHasChanges(true);
      context.setProductTypeSaveStatus('idle');
    },
  };
}
let passed = 0;
async function test(name, run) {
  await run();
  console.log('PASS ' + name);
  passed++;
}
await test('unchanged sub-template save clears dirty flag only after success', async () => {
  const s = setup();
  const save = s.saveSubTemplateChecklist();
  assert.equal(s.state.savingChecklist, 'subTemplate');
  assert.equal(s.state.subTemplateHasChanges, true);
  assert.equal(s.calls[0].args[0], 'sub1');
  s.calls[0].resolve();
  await save;
  assert.equal(s.state.subTemplateHasChanges, false);
  assert.equal(s.state.subTemplateSaveStatus, 'saved');
  assert.equal(s.checklistSaveInFlight.current, null);
});
await test('edits during sub-template save remain unsaved after earlier save', async () => {
  const s = setup();
  const first = s.saveSubTemplateChecklist();
  s.editSub(['newer edits']);
  s.calls[0].resolve();
  await first;
  assert.equal(s.state.subTemplateHasChanges, true);
  assert.equal(s.state.subTemplateSaveStatus, 'idle');
  const second = s.saveSubTemplateChecklist();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].args[1].items[0], 'newer edits');
  s.calls[1].resolve();
  await second;
  assert.equal(s.state.subTemplateHasChanges, false);
});
await test('rapid duplicate save submits only one request', async () => {
  const s = setup();
  const first = s.saveProductTypeTemplate();
  await s.saveProductTypeTemplate();
  assert.equal(s.calls.length, 1);
  s.calls[0].resolve();
  await first;
  assert.equal(s.state.productTypeSaveStatus, 'saved');
});
await test('different checklist save cannot overlap an existing save', async () => {
  const s = setup();
  const first = s.saveSubTemplateChecklist();
  await s.saveProductTypeTemplate();
  assert.equal(s.calls.length, 1);
  s.calls[0].resolve();
  await first;
});
await test('edits during product checklist save remain unsaved', async () => {
  const s = setup();
  const save = s.saveProductTypeTemplate();
  s.editProduct(['newer product edits']);
  s.calls[0].resolve();
  await save;
  assert.equal(s.state.productTypeHasChanges, true);
  assert.equal(s.state.productTypeSaveStatus, 'idle');
});
await test('failed save keeps edits dirty and releases lock for retry', async () => {
  const s = setup();
  const first = s.saveSubTemplateChecklist();
  s.calls[0].reject(new Error('simulated conflict'));
  await first;
  assert.equal(s.state.subTemplateHasChanges, true);
  assert.equal(s.state.subTemplateSaveStatus, 'idle');
  assert.equal(s.checklistSaveInFlight.current, null);
  const retry = s.saveSubTemplateChecklist();
  assert.equal(s.calls.length, 2);
  s.calls[1].resolve();
  await retry;
  assert.equal(s.state.subTemplateSaveStatus, 'saved');
});
await test('stale selection never clears newer editor dirty flag', async () => {
  const s = setup();
  const save = s.saveSubTemplateChecklist();
  s.subTemplateDraftRef.current = { id: 'different-subtemplate', items: ['other draft'] };
  s.calls[0].resolve();
  await save;
  assert.equal(s.state.subTemplateHasChanges, true);
  assert.equal(s.state.subTemplateSaveStatus, 'idle');
});
console.log(passed + '/' + passed + ' SIPS async checklist-save checks passed');
