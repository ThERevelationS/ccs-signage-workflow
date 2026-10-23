// Exercise the production Template Builder name/create/rename/duplicate
// handlers with controlled async persistence. No Base44 entities, network
// requests, or live records are accessed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/components/sips/TemplateBuilder.jsx', import.meta.url), 'utf8');
const names = [
  'catalogActionBlockedNotice', 'beginCatalogAction', 'cancelDropdownRename',
  'createSubTemplate', 'createProductType', 'createDropdownCondition',
  'renameSubTemplate', 'renameProductType', 'saveDropdownRename',
  'duplicateProductTypeTemplate', 'saveSubTemplateChecklist',
  'runConfirmedAction', 'blockNavigationWhileSaving',
  'saveDropdownConditionsCatalog', 'requestDeleteProductType', 'requestDeleteCondition',
];
const handlers = names.map(name => {
  const start = source.indexOf('  const ' + name + ' = ');
  assert.ok(start >= 0, name + ' exists');
  const end = source.indexOf('\n  };', start);
  assert.ok(end > start, name + ' is a block handler');
  return source.slice(start, end + 6);
}).join('\n') + '\nthis.actions = {' + names.join(',') + '}';

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(list) { // wait for the next staged request to be issued
  for (let i = 0; i < 100 && list.length === 0; i += 1) await tick();
  assert.ok(list.length > 0, 'expected a pending request');
}

function setup() {
  const state = {
    newSubTemplateName: '', newProductTypeName: '', newDropdownName: '',
    editingSubTemplateId: null, editingSubTemplateName: '',
    editingProductTypeName: null, editingProductTypeValue: '',
    editingDropdown: null, editingDropdownName: '',
    selectedProductType: null, selectedSubTemplate: null,
    subTemplateChecklistItems: [], subTemplateHasChanges: false,
    productTypeItems: [],
    subTemplateSaveStatus: 'idle', savingChecklist: null,
    noticeDialog: null, confirmDialog: null, isConfirming: false,
    persistenceError: '',
    subTemplates: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
    productTypes: ['Panels', 'Vinyl'],
    productTypeTemplates: { Panels: { items: [{ id: 'i1' }] } },
    dropdownConditions: [{ id: 'c1', name: 'Permit' }, { id: 'c2', name: 'Survey' }],
  };
  const calls = { createSub: [], updateSub: [], saveTypes: [], saveTemplates: [], saveDropdowns: [], saveSubEntry: [], loads: 0 };
  const renameDraftRef = { current: { subTemplateId: null, subTemplateName: '', productTypeId: null, productTypeName: '', conditionId: null, conditionName: '' } };
  const context = {
    ...state, renameDraftRef, JSON, Date, Math, ChecklistSubItem: {},
    catalogActionInFlightRef: { current: false },
    checklistSaveInFlight: { current: null },
    reloadInFlightRef: { current: false },
    subTemplateDraftRef: { current: { id: null, items: null } },
    console: { error: () => {} },
    invalidatePendingTemplateLoads: () => {},
    loadData: () => { calls.loads += 1; return Promise.resolve({}); },
    setPersistenceError: v => { state.persistenceError = v; },
    createChecklistSubItemIfAbsent: (...args) => { const d = deferred(); calls.createSub.push({ args, ...d }); return d.promise; },
    updateChecklistSubItemIfUnchanged: (...args) => { const d = deferred(); calls.updateSub.push({ args, ...d }); return d.promise; },
    saveProductTypes: (...args) => { const d = deferred(); calls.saveTypes.push({ args, ...d }); return d.promise; },
    saveProductTypeTemplates: (...args) => { const d = deferred(); calls.saveTemplates.push({ args, ...d }); return d.promise; },
    saveDropdownConditions: (...args) => { const d = deferred(); calls.saveDropdowns.push({ args, ...d }); return d.promise; },
    saveSubTemplateEntry: (...args) => { const d = deferred(); calls.saveSubEntry.push({ args, ...d }); return d.promise; },
  };
  const setter = key => v => {
    const next = typeof v === 'function' ? v(state[key]) : v;
    state[key] = next;
    context[key] = next;
  };
  for (const key of Object.keys(state)) context['set' + key[0].toUpperCase() + key.slice(1)] = setter(key);
  vm.createContext(context);
  vm.runInContext(handlers, context);
  // Mirror the component render: state first, then the ref reflects it.
  const syncRef = () => {
    renameDraftRef.current = {
      subTemplateId: state.editingSubTemplateId, subTemplateName: state.editingSubTemplateName,
      productTypeId: state.editingProductTypeName, productTypeName: state.editingProductTypeValue,
      conditionId: state.editingDropdown, conditionName: state.editingDropdownName,
    };
  };
  return {
    state, calls, context, renameDraftRef, syncRef, ...context.actions,
    // Direct input binding: edit both the tracked state and the render scope.
    type(key, value) { state[key] = value; context[key] = value; },
  };
}

let passed = 0;
async function test(name, run) {
  await run();
  console.log('PASS ' + name);
  passed++;
}

await test('createSubTemplate clears the submitted name when the input is untouched', async () => {
  const s = setup();
  s.type('newSubTemplateName', 'Safety');
  const pending = s.createSubTemplate();
  s.calls.createSub[0].resolve({ record: { id: 's1' }, status: 'created' });
  await pending;
  assert.equal(s.state.newSubTemplateName, '');
});

await test('createSubTemplate keeps a newer name typed while the create was in flight', async () => {
  const s = setup();
  s.type('newSubTemplateName', 'Safety');
  const pending = s.createSubTemplate();
  // The input is never disabled, so the user types the next name now.
  s.context.setNewSubTemplateName('Second');
  s.calls.createSub[0].resolve({ record: { id: 's1' }, status: 'created' });
  await pending;
  assert.equal(s.state.newSubTemplateName, 'Second');
});

await test('createProductType keeps a newer name typed while the save was in flight', async () => {
  const s = setup();
  s.type('newProductTypeName', 'Awning');
  const pending = s.createProductType();
  s.context.setNewProductTypeName('Blade');
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await pending;
  assert.equal(s.state.newProductTypeName, 'Blade');
});

await test('createDropdownCondition keeps a newer name typed while the save was in flight', async () => {
  const s = setup();
  s.type('newDropdownName', 'Access');
  const pending = s.createDropdownCondition();
  s.context.setNewDropdownName('Depth');
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
  assert.equal(s.state.newDropdownName, 'Depth');
});

await test('renameSubTemplate closes the rename editor when its own draft is still open', async () => {
  const s = setup();
  s.type('editingSubTemplateId', 'a');
  s.type('editingSubTemplateName', 'Alpha2');
  s.syncRef();
  const pending = s.renameSubTemplate(s.state.subTemplates[0], 'Alpha2');
  s.calls.updateSub[0].resolve({ id: 'a', name: 'Alpha2', updated_date: '2' });
  assert.equal(await pending, true);
  assert.equal(s.state.editingSubTemplateId, null);
  assert.equal(s.state.editingSubTemplateName, '');
});

await test('renameSubTemplate completion never closes a newer rename session on another template', async () => {
  const s = setup();
  s.type('editingSubTemplateId', 'a');
  s.type('editingSubTemplateName', 'Alpha2');
  s.syncRef();
  const pending = s.renameSubTemplate(s.state.subTemplates[0], 'Alpha2');
  // User opened Beta's rename editor while Alpha's save was still in flight.
  s.context.setEditingSubTemplateId('b');
  s.context.setEditingSubTemplateName('Beta2');
  s.syncRef();
  s.calls.updateSub[0].resolve({ id: 'a', name: 'Alpha2', updated_date: '2' });
  assert.equal(await pending, true);
  assert.equal(s.state.editingSubTemplateId, 'b');
  assert.equal(s.state.editingSubTemplateName, 'Beta2');
  // The saved row still lands in the catalog.
  assert.equal(s.state.subTemplates[0].name, 'Alpha2');
});

await test('renameSubTemplate keeps extra text typed into the same rename draft', async () => {
  const s = setup();
  s.type('editingSubTemplateId', 'a');
  s.type('editingSubTemplateName', 'Alpha2');
  s.syncRef();
  const pending = s.renameSubTemplate(s.state.subTemplates[0], 'Alpha2');
  s.context.setEditingSubTemplateName('Alpha2 final');
  s.syncRef();
  s.calls.updateSub[0].resolve({ id: 'a', name: 'Alpha2', updated_date: '2' });
  await pending;
  assert.equal(s.state.editingSubTemplateId, 'a');
  assert.equal(s.state.editingSubTemplateName, 'Alpha2 final');
});

await test('renameSubTemplate failure leaves the open rename draft and reloads', async () => {
  const s = setup();
  s.type('editingSubTemplateId', 'a');
  s.type('editingSubTemplateName', 'Alpha2');
  s.syncRef();
  const pending = s.renameSubTemplate(s.state.subTemplates[0], 'Alpha2');
  s.calls.updateSub[0].reject(new Error('simulated conflict'));
  assert.equal(await pending, false);
  assert.equal(s.state.editingSubTemplateId, 'a');
  assert.equal(s.state.editingSubTemplateName, 'Alpha2');
  assert.equal(s.calls.loads, 1);
  assert.ok(s.state.persistenceError.length > 0);
});

await test('saveDropdownRename never closes a newer condition rename session', async () => {
  const s = setup();
  s.type('editingDropdown', 'c1');
  s.type('editingDropdownName', 'Permit Required');
  s.syncRef();
  const pending = s.saveDropdownRename(s.state.dropdownConditions[0]);
  s.context.setEditingDropdown('c2');
  s.context.setEditingDropdownName('Survey2');
  s.syncRef();
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
  assert.equal(s.state.editingDropdown, 'c2');
  assert.equal(s.state.editingDropdownName, 'Survey2');
});

await test('saveDropdownRename closes its own unchanged rename session', async () => {
  const s = setup();
  s.type('editingDropdown', 'c1');
  s.type('editingDropdownName', 'Permit Required');
  s.syncRef();
  const pending = s.saveDropdownRename(s.state.dropdownConditions[0]);
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
  assert.equal(s.state.editingDropdown, null);
  assert.equal(s.state.editingDropdownName, '');
});

await test('renameProductType retargets the open editor when it still shows the renamed checklist', async () => {
  const s = setup();
  s.type('editingProductTypeName', 'Panels');
  s.type('editingProductTypeValue', 'Wall Panels');
  s.type('selectedProductType', 'Panels');
  s.syncRef();
  const pending = s.renameProductType('Panels', 'Wall Panels');
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await until(s.calls.saveTemplates);
  s.calls.saveTemplates[0].resolve({ id: 'r2' });
  await pending;
  assert.equal(s.state.selectedProductType, 'Wall Panels');
  assert.equal(s.state.editingProductTypeName, null);
  assert.equal(s.state.editingProductTypeValue, '');
  assert.deepEqual(s.calls.saveTypes[0].args[0], ['Wall Panels', 'Vinyl']);
  assert.ok(s.calls.saveTemplates[0].args[0]['Wall Panels']);
  assert.equal(s.calls.saveTemplates[0].args[0]['Panels'], undefined);
});

await test('renameProductType does not steal a different checklist opened during the save', async () => {
  const s = setup();
  s.type('editingProductTypeName', 'Panels');
  s.type('editingProductTypeValue', 'Wall Panels');
  s.type('selectedProductType', 'Panels');
  s.syncRef();
  const pending = s.renameProductType('Panels', 'Wall Panels');
  // User opened the Vinyl checklist editor while the rename was in flight.
  s.context.setSelectedProductType('Vinyl');
  s.context.setEditingProductTypeName('Vinyl');
  s.context.setEditingProductTypeValue('Vinyl');
  s.syncRef();
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await until(s.calls.saveTemplates);
  s.calls.saveTemplates[0].resolve({ id: 'r2' });
  await pending;
  assert.equal(s.state.selectedProductType, 'Vinyl');
  assert.equal(s.state.editingProductTypeName, 'Vinyl');
  assert.equal(s.state.editingProductTypeValue, 'Vinyl');
});

await test('renameProductType keeps a newer rename draft in the same editor', async () => {
  const s = setup();
  s.type('editingProductTypeName', 'Panels');
  s.type('editingProductTypeValue', 'Wall Panels');
  s.syncRef();
  const pending = s.renameProductType('Panels', 'Wall Panels');
  s.context.setEditingProductTypeValue('Wall Panels v2');
  s.syncRef();
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await until(s.calls.saveTemplates);
  s.calls.saveTemplates[0].resolve({ id: 'r2' });
  await pending;
  assert.equal(s.state.editingProductTypeName, 'Panels');
  assert.equal(s.state.editingProductTypeValue, 'Wall Panels v2');
});

await test('duplicateProductTypeTemplate picks a unique copy name instead of colliding', async () => {
  const s = setup();
  s.state.productTypes = ['Panels', 'Panels (Copy)'];
  s.context.productTypes = s.state.productTypes;
  const pending = s.duplicateProductTypeTemplate('Panels');
  assert.ok(s.calls.saveTemplates[0].args[0]['Panels (Copy 2)'], 'items saved under the unique copy name');
  s.calls.saveTemplates[0].resolve({ id: 'r2' });
  await until(s.calls.saveTypes);
  assert.equal(JSON.stringify(s.calls.saveTypes[0].args[0]), JSON.stringify(['Panels', 'Panels (Copy)', 'Panels (Copy 2)']));
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await pending;
});

await test('duplicateProductTypeTemplate failure is caught, not an unhandled rejection', async () => {
  const s = setup();
  const pending = s.duplicateProductTypeTemplate('Panels');
  s.calls.saveTemplates[0].resolve({ id: 'r2' });
  await until(s.calls.saveTypes);
  s.calls.saveTypes[0].reject(new Error('simulated conflict'));
  await pending; // resolves normally; the error is logged internally
  assert.equal(s.state.productTypes.join(','), 'Panels,Vinyl');
});

// Catalog-action serialization: a second mutation must never double-submit or
// race the same optimistic-concurrency record while another write is in flight.

await test('a second create while the first is still in flight is blocked with a notice', async () => {
  const s = setup();
  s.type('newSubTemplateName', 'Safety');
  const pending = s.createSubTemplate();
  await until(s.calls.createSub);
  s.type('newSubTemplateName', 'Second');
  await s.createSubTemplate();
  assert.equal(s.calls.createSub.length, 1, 'no duplicate create request');
  assert.ok(s.state.noticeDialog?.title);
  s.calls.createSub[0].resolve({ record: { id: 's1' }, status: 'created' });
  await pending;
});

await test('a rename cannot start while another catalog action is in flight', async () => {
  const s = setup();
  s.type('newDropdownName', 'Access');
  const pending = s.createDropdownCondition();
  await until(s.calls.saveDropdowns);
  const renamed = await s.renameSubTemplate(s.state.subTemplates[0], 'Alpha2');
  assert.equal(renamed, false);
  assert.equal(s.calls.updateSub.length, 0);
  assert.ok(s.state.noticeDialog);
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
});

await test('the catalog lock releases after a failure so the next action can proceed', async () => {
  const s = setup();
  s.type('newProductTypeName', 'Awning');
  const pending = s.createProductType();
  await until(s.calls.saveTypes);
  s.calls.saveTypes[0].reject(new Error('simulated conflict'));
  await pending;
  s.type('editingSubTemplateId', 'a');
  s.type('editingSubTemplateName', 'Alpha2');
  s.syncRef();
  const renamed = s.renameSubTemplate(s.state.subTemplates[0], 'Alpha2');
  await until(s.calls.updateSub);
  s.calls.updateSub[0].resolve({ id: 'a', name: 'Alpha2', updated_date: '2' });
  assert.equal(await renamed, true);
});

await test('a checklist save cannot start while a catalog action is in flight', async () => {
  const s = setup();
  s.type('selectedSubTemplate', 'a');
  const pending = s.duplicateProductTypeTemplate('Panels');
  await until(s.calls.saveTemplates);
  await s.saveSubTemplateChecklist();
  assert.equal(s.calls.saveSubEntry.length, 0);
  assert.ok(s.state.noticeDialog);
  s.calls.saveTemplates[0].resolve({ id: 'r2' });
  await until(s.calls.saveTypes);
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await pending;
});

await test('a catalog action cannot start while a checklist save is in flight', async () => {
  const s = setup();
  s.type('selectedSubTemplate', 'a');
  const pending = s.saveSubTemplateChecklist();
  await until(s.calls.saveSubEntry);
  s.type('newSubTemplateName', 'Late');
  await s.createSubTemplate();
  assert.equal(s.calls.createSub.length, 0);
  assert.ok(s.state.noticeDialog);
  s.calls.saveSubEntry[0].resolve({ id: 'r1' });
  await pending;
});

await test('a confirmed action does not fire while another catalog action is in flight', async () => {
  const s = setup();
  s.type('newDropdownName', 'Access');
  const pending = s.createDropdownCondition();
  await until(s.calls.saveDropdowns);
  let confirmed = 0;
  s.type('confirmDialog', { title: 'x', onConfirm: () => { confirmed += 1; return Promise.resolve(); } });
  await s.runConfirmedAction();
  assert.equal(confirmed, 0, 'onConfirm must not fire');
  assert.ok(s.state.confirmDialog, 'the confirmation stays open for a retry');
  assert.ok(s.state.noticeDialog);
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
});

await test('editor switching and closing are blocked while a catalog action is in flight', async () => {
  const s = setup();
  s.type('newDropdownName', 'Access');
  const pending = s.createDropdownCondition();
  await until(s.calls.saveDropdowns);
  assert.equal(s.blockNavigationWhileSaving(), true);
  assert.ok(s.state.noticeDialog);
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
  s.state.noticeDialog = null; s.context.noticeDialog = null;
  assert.equal(s.blockNavigationWhileSaving(), false);
});

await test('the condition reorder/move helper holds the catalog lock until the write settles', async () => {
  const s = setup();
  s.saveDropdownConditionsCatalog([{ id: 'c1' }], 'reorder');
  await until(s.calls.saveDropdowns);
  assert.equal(s.context.catalogActionInFlightRef.current, true);
  assert.equal(s.beginCatalogAction(), false, 'a second catalog action stays blocked');
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await tick(); await tick();
  assert.equal(s.context.catalogActionInFlightRef.current, false);
});

await test('the condition helper releases the lock after a failed write', async () => {
  const s = setup();
  s.saveDropdownConditionsCatalog([{ id: 'c1' }], 'reorder');
  await until(s.calls.saveDropdowns);
  s.calls.saveDropdowns[0].reject(new Error('blocked'));
  await tick(); await tick();
  assert.equal(s.context.catalogActionInFlightRef.current, false);
});

await test('the condition helper cannot overlap an in-flight checklist save', async () => {
  const s = setup();
  s.context.checklistSaveInFlight.current = { kind: 'productType', id: 'x', items: [] };
  s.saveDropdownConditionsCatalog([{ id: 'c1' }], 'reorder');
  assert.equal(s.calls.saveDropdowns.length, 0, 'no write may start during a checklist save');
  assert.ok(s.state.noticeDialog);
});

await test('the product-type removal confirm holds the catalog lock during its write', async () => {
  const s = setup();
  s.type('selectedProductType', 'Vinyl');
  s.requestDeleteProductType('Vinyl', 1);
  const pending = s.state.confirmDialog.onConfirm();
  await until(s.calls.saveTypes);
  assert.equal(s.beginCatalogAction(), false, 'a second catalog action cannot overlap the confirmed removal');
  s.calls.saveTypes[0].resolve({ id: 'r1' });
  await pending;
  assert.equal(s.context.catalogActionInFlightRef.current, false);
  assert.equal(s.state.selectedProductType, null, 'the open editor is cleared after removal');
  assert.equal(s.state.productTypeItems.length, 0);
});

await test('the condition delete confirm holds the catalog lock during its write', async () => {
  const s = setup();
  s.requestDeleteCondition({ id: 'c2', name: 'Survey' });
  const pending = s.state.confirmDialog.onConfirm();
  await until(s.calls.saveDropdowns);
  assert.equal(s.beginCatalogAction(), false);
  s.calls.saveDropdowns[0].resolve({ id: 'r1' });
  await pending;
  assert.equal(s.context.catalogActionInFlightRef.current, false);
});

console.log(passed + '/' + passed + ' SIPS template name-action checks passed');
