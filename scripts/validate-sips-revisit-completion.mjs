import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { verifySalesSaveAcknowledgment } from '../base44/shared/salesSaveAcknowledgmentGuard.mjs';

// Exercise the actual SIPS completion field builder and shared conditional-write
// helper with a simulated Work Order. Never connect to production or mutate data.
const dialog = readFileSync(new URL('../src/components/sips/ProductChecklistDialog.jsx', import.meta.url), 'utf8');
const persistence = readFileSync(new URL('../src/components/workflow/workOrderPersistence.js', import.meta.url), 'utf8');
const trackedPersistence = readFileSync(new URL('../src/components/shared/trackedFieldPersistence.js', import.meta.url), 'utf8');
function block(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, 'Expected source block exists: ' + startText);
  return source.slice(start, end);
}
const parseDateFn = block(dialog, 'const parseDateOnly = ', '\n};') + '\n};';
const futureFn = block(dialog, 'const isFutureRevisitDate = ', '\n};') + '\n};';
const saveBody = block(dialog, '      const expectedFields = {', '\n      setSaveError("");');
const fieldBuilder = parseDateFn + '\n' + futureFn + '\n' + saveBody + '\nthis.fields={expectedFields,nextFields}';
const saveTrackedFieldsFn = trackedPersistence
  .slice(trackedPersistence.indexOf('export async function saveTrackedFields('))
  .replace(/^export /, '');
const replaceFn = block(persistence, 'export async function replaceWorkOrderFieldsIfUnchanged(', '\nexport async function transitionWorkOrderFromLoadedSnapshot').replace(/^export /, '');
const today = (() => {
  const d = new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
})();
function makeFields({ loadedDate, revisitDate, markComplete = true } = {}) {
  const ctx = {
    loadedChecklistSnapshot: [{ id: 'old' }],
    loadedProductsSnapshot: [{ id: 'product' }],
    resolvedChecklist: [{ id: 'saved' }],
    products: [{ id: 'product' }],
    loadedRevisitDateSnapshot: loadedDate,
    loadedSipCompletedSnapshot: false,
    revisitDate, markComplete, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(fieldBuilder, ctx);
  return ctx.fields;
}
function simulatedStore(record) {
  const current = structuredClone(record);
  let updates = 0;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const functions = {
    invoke: async (name, args) => {
      assert.equal(name, 'fieldHistoryAction');
      assert.equal(args.action, 'save');
      assert.equal(args.entity_type, 'WorkOrder');
      assert.equal(args.entity_id, current.id);
      const unchanged = Object.entries(args.expected_fields || {}).every(([field, expected]) => same(current[field], expected));
      if (!unchanged) {
        return { data: { success: false, error: 'Work Order changed in another session. Reload before saving.' } };
      }
      Object.assign(current, structuredClone(args.next_fields || {}));
      current.updated_date = String(Number(current.updated_date) + 1);
      updates++;
      return { data: { success: true, record: structuredClone(current) } };
    },
  };
  const ctx = {
    base44: { functions },
    localStorage: { getItem: () => '' },
    verifySalesSaveAcknowledgment,
    Number, JSON, Math, String, Error, Object, Array,
  };
  vm.createContext(ctx);
  vm.runInContext(saveTrackedFieldsFn + '\n' + replaceFn + '\nthis.replace=replaceWorkOrderFieldsIfUnchanged', ctx);
  return { current, get updates() { return updates; }, replace: ctx.replace };
}
function buildRecord(revisit) {
  const record = {
    id:'test-only',updated_date:'1',deleted:false,
    sip_checklist:[{id:'old'}],products:[{id:'product'}],sip_completed:false,
  };
  if(revisit !== undefined) record.sip_revisit_date=revisit;
  return record;
}
async function persist(store, fields) {
  return store.replace({workOrderId:'test-only',expectedFields:fields.expectedFields,nextFields:fields.nextFields,label:'SIPS regression'});
}
let passed=0;
async function check(label,run){await run();console.log('PASS '+label);passed++;}
await check('future revisit clears atomically on completion', async()=>{
  const fields=makeFields({loadedDate:'2099-12-15'});
  assert.equal(fields.expectedFields.sip_revisit_date,'2099-12-15');
  assert.equal(fields.nextFields.sip_revisit_date,'');
  const store=simulatedStore(buildRecord('2099-12-15'));
  await persist(store,fields);
  assert.equal(store.current.sip_completed,true);
  assert.equal(store.current.sip_revisit_date,'');
  assert.equal(store.updates,1);
});
await check('past revisit remains unchanged on completion',async()=>{
  const fields=makeFields({loadedDate:'2020-02-03'});
  const store=simulatedStore(buildRecord('2020-02-03'));
  await persist(store,fields);
  assert.equal(store.current.sip_revisit_date,'2020-02-03');
  assert.equal(store.current.sip_completed,true);
});
await check('today revisit remains in active queue on completion',async()=>{
  const fields=makeFields({loadedDate:today});
  assert.equal(fields.nextFields.sip_revisit_date,today);
  const store=simulatedStore(buildRecord(today));
  await persist(store,fields);
  assert.equal(store.current.sip_revisit_date,today);
});
await check('no revisit is guarded even if missing from loaded record',async()=>{
  const fields=makeFields({loadedDate:undefined});
  assert.equal(fields.nextFields.sip_revisit_date,'');
  const store=simulatedStore(buildRecord(undefined));
  await persist(store,fields);
  assert.equal(store.current.sip_revisit_date,'');
  assert.equal(store.current.sip_completed,true);
});
await check('concurrent future revisit rejects stale no-date completion',async()=>{
  const fields=makeFields({loadedDate:undefined});
  const store=simulatedStore(buildRecord('2099-12-15'));
  await assert.rejects(()=>persist(store,fields),/another session/);
  assert.equal(store.updates,0);
  assert.equal(store.current.sip_completed,false);
  assert.equal(store.current.sip_revisit_date,'2099-12-15');
});
await check('concurrent future revisit change rejects stale future-date completion',async()=>{
  const fields=makeFields({loadedDate:'2099-12-15'});
  const store=simulatedStore(buildRecord('2099-12-16'));
  await assert.rejects(()=>persist(store,fields),/another session/);
  assert.equal(store.updates,0);
  assert.equal(store.current.sip_revisit_date,'2099-12-16');
});
await check('unrelated Work Order updates do not block completion',async()=>{
  const fields=makeFields({loadedDate:'2099-12-15'});
  const record=buildRecord('2099-12-15');
  record.project_manager='another session';
  record.updated_date='3';
  const store=simulatedStore(record);
  await persist(store,fields);
  assert.equal(store.current.project_manager,'another session');
  assert.equal(store.current.sip_revisit_date,'');
  assert.equal(store.current.sip_completed,true);
});
await check('Save & Revisit still saves explicit future date without completing',async()=>{
  const fields=makeFields({loadedDate:undefined,revisitDate:'2099-12-15',markComplete:false});
  const store=simulatedStore(buildRecord(undefined));
  await persist(store,fields);
  assert.equal(store.current.sip_revisit_date,'2099-12-15');
  assert.equal(store.current.sip_completed,false);
});
await check('Save & Revisit can clear date and leave job active',async()=>{
  const fields=makeFields({loadedDate:'2099-12-15',revisitDate:null,markComplete:false});
  const store=simulatedStore(buildRecord('2099-12-15'));
  await persist(store,fields);
  assert.equal(store.current.sip_revisit_date,'');
  assert.equal(store.current.sip_completed,false);
});
console.log(passed+'/'+passed+' SIPS Revisit/completion regression checks passed');
