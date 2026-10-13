import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { staleSalesRemotePutSnapshotIds } from '../base44/shared/smartsheetSalesConflictResolution.mjs';
import { buildSalesPullSnapshot } from '../base44/shared/smartsheetSyncFields.ts';
import { normalizeSheetRows } from '../base44/shared/smartsheetSyncUtils.ts';

// Execute the actual production prewrite and eligible-PUT selection section
// with synthetic local/remote evidence; never access a real Smartsheet sheet.
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const begin=backend.indexOf("  if (dataset === 'sales' && salesRemotePutPlans.size) {");
const end=backend.indexOf('\n  // Phase 2: Batch Smartsheet write.',begin);
assert.ok(begin>0 && end>begin,'Production ordinary remote prewrite block must be wired immediately before PUT.');
const snippet=backend.slice(begin,end).replaceAll(': any','').replaceAll(': string','');
const columnBindings={current_task_description:'111',estimate_amount:'222',current_task_assigned_to:'333'};
const sheetId='8702703019812740';
const columns=Object.values(columnBindings).map(id=>({id:Number(id)}));
const row=(id,task='Conduct Site Survey',amount=125,assignee='Brett')=>({
  id:Number(id),cells:[
    {columnId:111,value:task,displayValue:task},
    {columnId:222,value:amount,displayValue:String(amount)},
    {columnId:333,value:assignee,displayValue:assignee},
  ],
});
const planSnapshot=buildSalesPullSnapshot(normalizeSheetRows({rows:[row('90001')]})[0],columnBindings);
let checks=0;
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const yes=(v,label)=>{assert.ok(v,label);checks++};
async function fixture(modify=()=>{},options={}) {
  const plannedRows=[{id:'90001',cells:[]},{id:'90002',cells:[]},{id:'90003',cells:[]}];
  const plans=new Map([
    ['ordinary-a',{rowId:'90001',snapshot:planSnapshot}],
    ['ordinary-b',{rowId:'90002',snapshot:planSnapshot}],
    ['approved-c',{rowId:'90003',snapshot:planSnapshot}],
  ]);
  const approvedPlans=new Map([['approved-c',{id:'approved-c'}]]);
  const remote={id:sheetId,columns,rows:[row('90001'),row('90002')]};
  modify(remote,plans);
  let readCount=0,ownerCount=0,requested=[];
  const context={
    dataset:'sales',salesRemotePutPlans:plans,
    approvedSalesPlanSnapshots:approvedPlans,
    salesFailedRecordIds:new Set(options.failed || []),
    salesPrewriteUnverifiedRows:new Set(),
    deferredSalesVerification:new Map([
      ['ordinary-a',{rowId:'90001'}],['ordinary-b',{rowId:'90002'}],
      ['approved-c',{rowId:'90003'}],
    ]),
    deferredSmartsheetWrites:plannedRows,
    bindings:columnBindings,sheetId,token:'test-only',
    options:{assertRunOwnership: options.noOwner ? undefined : async()=>{ownerCount++;}},
    errors:[],
    smartsheetGet:async(path)=>{
      readCount++;
      const url=new URL(path,'https://example.test');
      requested=url.searchParams.get('rowIds').split(',');
      if(options.failRead)throw new Error('Synthetic Smartsheet outage');
      return {body:remote};
    },
    normalizeSheetRows,buildSalesPullSnapshot,staleSalesRemotePutSnapshotIds,URLSearchParams,Map,Set,
    cleanText:(value,max)=>String(value??'').trim().slice(0,max),
  };
  const result=await vm.runInNewContext(
    '(async()=>{'+snippet+'\nreturn {eligible:eligibleSmartsheetWrites.map(r=>String(r.id)),failed:[...salesFailedRecordIds],errors};})()',
    context);
  return {result:JSON.parse(JSON.stringify(result)),readCount,ownerCount,requested};
}
const clean=await fixture();
equal(clean.result.eligible,['90001','90002','90003'],'Unchanged ordinary rows and separately approved row remain eligible.');
equal(clean.requested,['90001','90002'],'Only ordinary rows are freshly read by new guard; approved review keeps its existing path.');
equal(clean.ownerCount,1,'Prewrite checks run ownership before remote read.');
const task=await fixture(remote=>{remote.rows[1]=row('90002','Lost')});
equal(task.result.eligible,['90001','90003'],'Concurrent Smartsheet task edit holds only affected ordinary row.');
equal(task.result.failed,['ordinary-b'],'Remote task edit cannot be counted as Sales success.');
yes(task.result.errors.some(e=>e.includes('ordinary-b')),'Held row exposes actionable error.');
const estimate=await fixture(remote=>{remote.rows[1]=row('90002','Conduct Site Survey',999)});
equal(estimate.result.eligible,['90001','90003'],'Changed estimate cannot be silently overwritten.');
const assignee=await fixture(remote=>{remote.rows[1]=row('90002','Conduct Site Survey',125,'Twyla')});
equal(assignee.result.eligible,['90001','90003'],'Concurrent employee reassignment cannot be silently overwritten.');
const absent=await fixture(remote=>{remote.rows.pop()});
equal(absent.result.eligible,['90001','90003'],'Missing permanent remote row fails closed without blocking a different row.');
const extra=await fixture(remote=>{remote.rows.push(row('99999'))});
equal(extra.result.eligible,['90003'],'Unexpected returned row identity fails closed for the affected read batch.');
const duplicate=await fixture(remote=>{remote.rows.push(row('90001'))});
equal(duplicate.result.eligible,['90003'],'Duplicate returned row identity fails closed for the batch.');
const wrongSheet=await fixture(remote=>{remote.id='other-sheet'});
equal(wrongSheet.result.eligible,['90003'],'Unexpected sheet identity cannot authorize ordinary PUT.');
const missingCols=await fixture(remote=>{remote.columns=[{id:111},{id:222}]});
equal(missingCols.result.eligible,['90003'],'Missing mapped column metadata cannot authorize ordinary PUT.');
const unavailable=await fixture(()=>{},{failRead:true});
equal(unavailable.result.eligible,['90003'],'Smartsheet timeout or outage holds ordinary PUTs.');
const missingOwner=await fixture(()=>{},{noOwner:true});
equal(missingOwner.result.eligible,['90003'],'Missing run coordinator holds ordinary PUTs.');
const preheld=await fixture(()=>{},{failed:['ordinary-b']});
equal(preheld.result.eligible,['90001','90003'],'Local prewrite failures remain held without extra remote reads.');
equal(preheld.requested,['90001'],'Only locally verified ordinary rows incur a fresh remote GET.');
const partial=await fixture((remote,plans)=>plans.set('ordinary-b',{rowId:'90002',snapshot:{}}));
equal(partial.result.eligible,['90001','90003'],'Incomplete planned remote snapshot fails closed.');
yes(backend.indexOf('staleSalesRemotePutSnapshotIds(batch, freshByRowId, assigneeColumnId)') <
  backend.indexOf('const eligibleSmartsheetWrites ='),'Remote safety check is before eligible write selection.');
yes(backend.indexOf('const eligibleSmartsheetWrites =') <
  backend.indexOf("'PUT', '/sheets/' + sheetId + '/rows', token, eligibleSmartsheetWrites"),
  'Filtered PUT executes only after remote prewrite gate.');
yes(backend.includes("const salesRemotePutPlans = new Map") &&
  backend.includes('snapshot: buildSalesPullSnapshot(currentRows[0], bindings)') &&
  backend.includes("!approvedSalesPlanSnapshots.has(id)"),'Production tracks original snapshots and respects separately approved decisions.');
console.log('Sales ordinary remote prewrite integration: '+checks+'/'+checks+' PASS.');
