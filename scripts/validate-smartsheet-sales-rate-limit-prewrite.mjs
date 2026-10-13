import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {retrySmartsheetCall} from '../base44/shared/smartsheetLegacyTransport.ts';
import {staleSalesRemotePutPlans,staleSalesRemotePutSnapshotIds} from '../base44/shared/smartsheetSalesConflictResolution.mjs';
import {normalizeSheetRows} from '../base44/shared/smartsheetSyncUtils.ts';
import {buildSalesPullSnapshot} from '../base44/shared/smartsheetSyncFields.ts';

let checks=0;
const same=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const yes=(a,msg)=>{assert.ok(a,msg);checks++;};
const fails=async (fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const source=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const transport=readFileSync('base44/shared/smartsheetLegacyTransport.ts','utf8');
const start=source.indexOf('  const revalidateSalesRateLimitedPut = async () => {');
const end=source.indexOf('\n  // Phase 2: Batch Smartsheet write.',start);
yes(start>0 && end>start,'The real production post-429 prewrite guard is installed.');
const runnable=transformSync(source.slice(start,end)+'\nrevalidateSalesRateLimitedPut',{loader:'ts'}).code;
const sheetId='8702703019812740';
const bindings={current_task_description:'111',estimate_amount:'222',current_task_assigned_to:'333'};
const remoteRow=(id,task='Conduct Site Survey',amount=125,assignee='Brett')=>({
  id:Number(id),cells:[
    {columnId:111,value:task,displayValue:task},
    {columnId:222,value:amount,displayValue:String(amount)},
    {columnId:333,value:assignee,displayValue:assignee},
  ],
});
const columns=[111,222,333].map(id=>({id}));
const snapshot=buildSalesPullSnapshot(normalizeSheetRows({rows:[remoteRow('90001')]})[0],bindings);
function fixture(count=2) {
  const records=Array.from({length:count},(_,index)=>({
    id:'wo-'+index,updated_date:'revision-a',sales_status:'lead',
    current_task_description:'Conduct Site Survey',smartsheet_sheet_id:sheetId,
    smartsheet_row_id:String(90001+index),in_pipeline:true,
  }));
  const mutable=records.map(item=>structuredClone(item));
  const remote={id:sheetId,columns:structuredClone(columns),
    rows:records.map((record)=>remoteRow(record.smartsheet_row_id))};
  let calls=0,localReads=0,remoteReads=0,ownerCalls=0,remoteError=false,localError=false;
  const eligible=records.map(record=>({id:record.smartsheet_row_id,cells:[{columnId:111,value:'Estimate Sent'}]}));
  const verification=new Map(records.map(record=>[record.id,{rowId:record.smartsheet_row_id,originalUpdatedDate:record.updated_date}]));
  const planMap=new Map(records.map(record=>[record.id,{rowId:record.smartsheet_row_id,snapshot}]));
  const context={
    dataset:'sales',
    options:{assertRunOwnership:async()=>{ownerCalls++;}},
    eligibleSmartsheetWrites:eligible,
    deferredSalesVerification:verification,
    salesRemotePutPlans:planMap,
    pendingRecords:records,
    bindings,sheetId,token:'synthetic',
    base44:{asServiceRole:{entities:{WorkOrder:{}}}},
    loadAllEntityRows:async({query})=>{
      localReads++;
      if(localError)throw new Error('Synthetic local read outage');
      return mutable.filter(record=>query.id.$in.includes(record.id)).map(item=>structuredClone(item));
    },
    smartsheetGet:async(path)=>{
      remoteReads++;
      if(remoteError)throw new Error('Synthetic remote GET outage');
      const url=new URL(path,'https://example.test');
      const requested=url.searchParams.get('rowIds').split(',');
      return {body:{...remote,rows:remote.rows.filter(row=>requested.includes(String(row.id)))}};
    },
    cleanText:(value,max)=>String(value??'').trim().slice(0,max),
    normalizeSheetRows,buildSalesPullSnapshot,staleSalesRemotePutPlans,staleSalesRemotePutSnapshotIds,
    URLSearchParams,Map,Set,Object,Array,String,Number,Error,
  };
  const guard=vm.runInNewContext(runnable,context);
  const block=()=>{throw Object.assign(new Error('rate limited'),{upstreamStatus:429,retryAfter:0.001});};
  const mutation=async()=>{calls++;if(calls===1)block();return {status:200,body:{message:'SUCCESS'}};};
  const retry=()=>retrySmartsheetCall(mutation,{
    retryTimeout:false,maxRateLimitRetries:1,maxRateLimitWaitSeconds:1,
    beforeRateLimitRetry:guard,
  });
  return {guard,retry,remote,mutable,eligible,verification,planMap,context,
    calls:()=>calls,localReads:()=>localReads,remoteReads:()=>remoteReads,ownerCalls:()=>ownerCalls,
    remoteOutage:()=>remoteError=true,localOutage:()=>localError=true,
    replaceMutation:fn=>{context._mutation=fn}};
}
const clean=fixture();
same((await clean.retry()).status,200,'A 429 can retry once if BOTH local and remote evidence still match.');
same(clean.calls(),2,'One verified retry sends exactly one additional PUT.');
same(clean.localReads(),1,'Safe retry freshly checks original Base44 revisions.');
same(clean.remoteReads(),1,'Safe retry freshly checks remote row snapshots.');
yes(clean.ownerCalls()>=3,'Coordinator checked before, during, and after retry verification.');
const drift=fixture();
drift.remote.rows[1]=remoteRow('90002','Lost');
await fails(()=>drift.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(drift.calls(),1,'Concurrent remote Lost task blocks retry before second PUT.');
const local=fixture();
local.mutable[0].updated_date='revision-b';
await fails(()=>local.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(local.calls(),1,'Concurrent local WorkOrder edit blocks retry.');
same(local.remoteReads(),0,'Local drift fails closed before attempting remote verification.');
const removed=fixture();
removed.remote.rows.pop();
await fails(()=>removed.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(removed.calls(),1,'Deleted remote row prevents retry.');
const wrongSheet=fixture();
wrongSheet.remote.id='other';
await fails(()=>wrongSheet.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(wrongSheet.calls(),1,'Wrong remote sheet identity prevents retry.');
const missingColumn=fixture();
missingColumn.remote.columns.pop();
await fails(()=>missingColumn.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(missingColumn.calls(),1,'Incomplete mapped column metadata prevents retry.');
const noOwner=fixture();
noOwner.context.options.assertRunOwnership=undefined;
await fails(()=>noOwner.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(noOwner.calls(),1,'Missing run ownership prevents retry.');
const missingPlan=fixture();
missingPlan.planMap.delete('wo-1');
await fails(()=>missingPlan.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(missingPlan.calls(),1,'Unattributable row cannot be retried.');
const duplicateRow=fixture();
duplicateRow.eligible[1].id='90001';
await fails(()=>duplicateRow.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(duplicateRow.calls(),1,'Duplicate permanent row in PUT fails closed.');
const remoteOutage=fixture();
remoteOutage.remoteOutage();
await fails(()=>remoteOutage.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(remoteOutage.calls(),1,'Remote read outage cannot authorize resend.');
const localOutage=fixture();
localOutage.localOutage();
await fails(()=>localOutage.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(localOutage.calls(),1,'Local read outage cannot authorize resend.');
const large=fixture(101);
same((await large.retry()).status,200,'101 stable rows can be retried after complete bounded verification.');
same(large.localReads(),2,'101 rows require two bounded local read batches.');
same(large.remoteReads(),2,'101 rows require two bounded remote read batches.');
const lateBatch=fixture(101);
lateBatch.remote.rows[100]=remoteRow('90101','Lost');
await fails(()=>lateBatch.retry(),error=>error.salesRateLimitRecheckBlocked===true);
same(lateBatch.calls(),1,'Late drift in second batch aborts entire original PUT.');
let attempts=0,gateCalls=0;
await fails(()=>retrySmartsheetCall(async()=>{
  attempts++;throw Object.assign(new Error('429'),{upstreamStatus:429,retryAfter:0.001});
},{maxRateLimitRetries:1,beforeRateLimitRetry:async()=>{gateCalls++;throw new Error('stale');}}),/stale/);
same(attempts,1,'Transport propagates a retry preflight failure instead of swallowing it.');
same(gateCalls,1,'Critical retry callback runs once after Retry-After.');
let timeoutWrites=0;
await fails(()=>retrySmartsheetCall(async()=>{
  timeoutWrites++;throw Object.assign(new Error('timeout'),{timedOut:true});
},{retryTimeout:false,beforeRateLimitRetry:async()=>{throw new Error('should not run');}}),/timeout/);
same(timeoutWrites,1,'Ambiguous timeout still never retries.');
yes(transport.includes('beforeRateLimitRetry: options?.beforeRateLimitRetry') &&
  transport.includes('await beforeRateLimitRetry({ attempt: rateLimitRetries, waitSeconds: backoffSeconds });'),
 'The strict hook passes through existing no-timeout-retry transport.');
yes(source.includes('beforeRateLimitRetry: revalidateSalesRateLimitedPut') &&
  source.includes('err?.salesRateLimitRecheckBlocked') &&
  source.includes('salesFailedRecordIds.add(recordId)'),
 'Sales PUT wires guard and prevents held rows from claiming metadata success.');
yes(source.includes('onRateLimitRetry: async ({ attempt }: any) => reportOrderProgress(') &&
  source.includes('}] : [{beforeRateLimitRetry: revalidateSalesRateLimitedPut}]'),
 'Order rate-limit retry progress and original write policy stay separate.');
console.log('Sales post-429 rate-limit revalidation: '+checks+'/'+checks+' PASS.');
