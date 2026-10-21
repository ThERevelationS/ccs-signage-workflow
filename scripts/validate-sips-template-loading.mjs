// Deterministic out-of-order read/write checks using the real Template Builder
// handlers and synthetic in-memory settings. No Base44 SDK, network, or records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../src/components/sips/TemplateBuilder.jsx', import.meta.url), 'utf8');
const extract = name => {
  const start = src.indexOf('  const ' + name + ' = ');
  const end = src.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start, 'Production handler exists: ' + name);
  return src.slice(start, end + 6);
};
const invalidation = src.match(/  const invalidatePendingTemplateLoads = .*?; \};/);
assert.ok(invalidation, 'Production invalidation helper exists');
const names = ['loadData','saveWholeSetting','saveSubTemplateEntry','saveProductTypeTemplateEntry'];
const program = invalidation[0] + '\n' + names.map(extract).join('\n') +
  '\nthis.actions = {loadData,saveWholeSetting,saveSubTemplateEntry,saveProductTypeTemplateEntry};';

function fixture() {
  const state = {
    subTemplates: [], productTypes: [], productTypeTemplates: {}, subTemplateItems: {},
    dropdownConditions: [], settingRecords: {}, persistenceError: '',
  };
  const catalogReads = [];
  const errors = [];
  let current = 'old';
  const snapshots = {
    old: {
      productTypes: {items:['Old cabinet']},
      productTypeTemplates: {'Old cabinet': {items:[{id:'old',text:'Old item'}]}},
      subTemplateItems: {safety:{items:[{id:'old',text:'Old safety'}]}},
      dropdownConditions: {items:[{id:'old',name:'Old condition'}]},
    },
    new: {
      productTypes: {items:['New cabinet']},
      productTypeTemplates: {'New cabinet': {items:[{id:'new',text:'New item'}]}},
      subTemplateItems: {safety:{items:[{id:'new',text:'New safety'}]}},
      dropdownConditions: {items:[{id:'new',name:'New condition'}]},
    },
  };
  const ctx = {
    ...state,
    templateLoadSequenceRef: {current:0},
    ChecklistSubItem: {},
    GlobalSettings: {},
    console: { error: (...args) => errors.push(args.join(' ')) },
    loadAllEntityRows: () => new Promise((resolve,reject)=>catalogReads.push({resolve,reject})),
    loadSingleGlobalSetting: ({settingKey}) => Promise.resolve({
      id: settingKey, setting_value:structuredClone(snapshots[current][settingKey]),
    }),
    saveGlobalSettingValueIfUnchanged: async ({loadedRecord,settingKey,nextValue}) =>
      ({...(loadedRecord || {}),id:settingKey,setting_value:nextValue}),
    saveSettingMapEntryIfUnchanged: async ({settingRecord,entryKey,nextEntry}) =>
      ({...settingRecord,setting_value:{...(settingRecord?.setting_value||{}),[entryKey]:nextEntry}}),
    setPersistenceError: value => {state.persistenceError=value;ctx.persistenceError=value;},
  };
  for (const key of Object.keys(state)) {
    if (key === 'persistenceError') continue;
    ctx['set'+key[0].toUpperCase()+key.slice(1)] = value => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
      ctx[key] = state[key];
    };
  }
  vm.createContext(ctx);
  vm.runInContext(program,ctx);
  const settle = (index,version,fail) => {
    const pending=catalogReads[index];
    assert.ok(pending,'Requested catalog read exists: '+index);
    if(fail) pending.reject(new Error(fail));
    else pending.resolve([{id:'option-'+version,name:version+' option',order:0}]);
  };
  return {
    state, ctx, errors, catalogReads, snapshots, settle,
    useVersion:v=>{current=v;},
    ...ctx.actions,
  };
}
let passed=0;
async function test(name,fn) {await fn();passed++;console.log('PASS '+name);}

await test('newer successful read wins if older successful read finishes last',async()=>{
  const f=fixture();
  const old=f.loadData();
  f.useVersion('new');
  const fresh=f.loadData();
  f.settle(1,'new');
  assert.equal((await fresh).productTypes[0],'New cabinet');
  f.settle(0,'old');
  assert.equal(await old,null);
  assert.equal(f.state.productTypes[0],'New cabinet');
  assert.equal(f.state.subTemplates[0].name,'new option');
  assert.equal(f.state.subTemplateItems.safety.items[0].text,'New safety');
  assert.equal(f.state.settingRecords.productTypes.setting_value.items[0],'New cabinet');
});

await test('older failed read cannot replace successful newer state with stale error',async()=>{
  const f=fixture();
  const old=f.loadData();
  f.useVersion('new');
  const fresh=f.loadData();
  f.settle(1,'new'); await fresh;
  f.settle(0,'old','Old request failed');
  assert.equal(await old,null);
  assert.equal(f.state.persistenceError,'');
  assert.equal(f.state.productTypes[0],'New cabinet');
  assert.equal(f.errors.length,0);
});

await test('latest failed read stays authoritative and older success does not clear error',async()=>{
  const f=fixture();
  const old=f.loadData();
  f.useVersion('new');
  const fresh=f.loadData();
  f.settle(1,'new','Newest request failed');
  assert.equal(await fresh,null);
  assert.match(f.state.persistenceError,/Newest request failed/);
  f.settle(0,'old');
  assert.equal(await old,null);
  assert.deepEqual(f.state.productTypes,[]);
  assert.match(f.state.persistenceError,/Newest request failed/);
});

await test('a confirmed product type setting write invalidates an older pending read',async()=>{
  const f=fixture();
  const old=f.loadData();
  const saved=await f.saveWholeSetting('productTypes',{items:['Saved later']},
    'Synthetic type save',value=>f.ctx.setProductTypes(value.items));
  assert.equal(saved.setting_value.items[0],'Saved later');
  f.settle(0,'old');
  assert.equal(await old,null);
  assert.deepEqual(f.state.productTypes,['Saved later']);
  assert.equal(f.state.settingRecords.productTypes.setting_value.items[0],'Saved later');
});

await test('saving a reusable checklist option prevents a pending load from restoring older items',async()=>{
  const f=fixture();
  f.ctx.setSettingRecords({subTemplateItems:{id:'subTemplateItems',setting_value:{
    safety:{items:[{id:'prev',text:'Before save'}]}
  }}});
  f.ctx.setSubTemplateItems({safety:{items:[{id:'prev',text:'Before save'}]}});
  const old=f.loadData();
  await f.saveSubTemplateEntry('safety',{items:[{id:'saved',text:'Saved option item'}]});
  f.settle(0,'old');
  assert.equal(await old,null);
  assert.equal(f.state.subTemplateItems.safety.items[0].text,'Saved option item');
});

await test('saving a product checklist prevents a pending load from restoring older rows',async()=>{
  const f=fixture();
  f.ctx.setSettingRecords({productTypeTemplates:{id:'productTypeTemplates',setting_value:{
    'Old cabinet':{items:[{id:'prev',text:'Before save'}]}
  }}});
  f.ctx.setProductTypeTemplates({'Old cabinet':{items:[{id:'prev',text:'Before save'}]}});
  const old=f.loadData();
  await f.saveProductTypeTemplateEntry('Old cabinet',{items:[{id:'saved',text:'Saved product item'}]});
  f.settle(0,'old');
  assert.equal(await old,null);
  assert.equal(f.state.productTypeTemplates['Old cabinet'].items[0].text,'Saved product item');
});

console.log(passed+'/'+passed+' SIPS Template Builder read/write ordering checks passed');
