import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { staleOrderRetryPrewriteIds } from '../base44/shared/smartsheetOrderRetryPrewriteSafety.mjs';

const backend = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
const head = backend.indexOf('  const revalidateOrderRateLimitedPut = async () => {');
const tail = backend.indexOf("\n  let salesBatchWriteError = '';", head);
assert.ok(head > 0 && tail > head, 'Expected the production Order 429 pre-retry function');
const extracted = backend.slice(head, tail);
const script = `
import { staleOrderRetryPrewriteIds } from "../base44/shared/smartsheetOrderRetryPrewriteSafety.mjs";
import { buildOrderPullSnapshot } from "../base44/shared/smartsheetSyncFields.ts";
export async function revalidateSynthetic(env) {
 const { dataset, options, eligibleSmartsheetWrites, deferredOrderVerification,
   pendingRecords, base44, loadAllEntityRows, bindings, sheetId, smartsheetGet,
   token, normalizeSheetRows } = env;
${extracted}
 return revalidateOrderRateLimitedPut();
}
`;
const compiled = await build({
  stdin:{contents:script,sourcefile:'scripts/synthetic-order-429-guard.ts',
    resolveDir:process.cwd()+'/scripts',loader:'ts'},
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
});
const { revalidateSynthetic } = await import('data:text/javascript;base64,' +
  Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const sheet='4963691473987460', rowId='7700110099', colId='1684354771511172';
const bindings = {customer_name:colId};
const order = {
  id:'order-rate-limit-001', updated_date:'2026-10-14T15:00:00.000Z',
  smartsheet_sheet_id:sheet,smartsheet_row_id:rowId,
  smartsheet_pending_local_sync:true, customer_name:'Before',
};
const snapshot={[colId]:'Before'};
const remote = {
  id:sheet,
  columns:[{id:colId}],
  rows:[{id:rowId,cells:[{column_id:colId,value:'Before'}]}],
};
const makeEnv=(changes={})=>{
  const counts={ownership:0,local:0,remote:0};
  const opts={
    dataset:'orders',sheetId,token:'synthetic-not-a-token', bindings,
    eligibleSmartsheetWrites:[{id:rowId,cells:[{columnId:colId,value:'New'}]}],
    deferredOrderVerification:new Map([[order.id,{
      rowId,originalUpdatedDate:order.updated_date,plannedRemoteSnapshot:snapshot,
      expectedSnapshot:{[colId]:'New'},requiresRemoteWrite:true,
    }]]),
    pendingRecords:[order],
    base44:{asServiceRole:{entities:{Order:{}}}},
    options:{assertRunOwnership:async()=>{counts.ownership++;}},
    loadAllEntityRows:async()=>{counts.local++;return [{...order}];},
    smartsheetGet:async()=>{counts.remote++;return {body:remote};},
    normalizeSheetRows:body=>body.rows,
  };
  return [{...opts,...changes},counts];
};
let [env, counts]=makeEnv();
await revalidateSynthetic(env);
assert.equal(counts.local,1);
assert.equal(counts.remote,1);
assert.equal(counts.ownership,3);
console.log('PASS actual production Order retry guard re-reads local revision, configured Smartsheet row and run ownership');
for (const overrides of [
  {loadAllEntityRows:async()=>[{...order,updated_date:'2026-10-14T15:05:00.000Z'}]},
  {loadAllEntityRows:async()=>[]},
  {loadAllEntityRows:async()=>[order,order]},
  {loadAllEntityRows:async()=>[{...order,smartsheet_pending_local_sync:false}]},
  {smartsheetGet:async()=>({body:{...remote,rows:[{id:rowId,cells:[{column_id:colId,value:'Employee updated'}]}]}})},
  {smartsheetGet:async()=>({body:{...remote,rows:[]}})},
  {smartsheetGet:async()=>({body:{...remote,rows:[...remote.rows, ...remote.rows]}})},
  {smartsheetGet:async()=>({body:{...remote,columns:[]}})},
  {smartsheetGet:async()=>({body:{...remote,id:'wrong-sheet'}})},
  {smartsheetGet:async()=>({body:{...remote,rows:[{id:'9999',cells:remote.rows[0].cells}]}})},
  {deferredOrderVerification:new Map()},
  {eligibleSmartsheetWrites:[{id:rowId},{id:rowId}]},
  {options:{assertRunOwnership:async()=>{throw Error('Lost run ownership');}}},
  {options:{}},
]) {
  [env]=makeEnv(overrides);
  await assert.rejects(revalidateSynthetic(env),error=>
    error?.orderRateLimitRecheckBlocked === true &&
    /rate-limit retry held/.test(error?.message||''));
}
console.log('PASS changed/missing/duplicated/unowned Base44 and Smartsheet evidence fail closed during actual Order pre-retry callback');

// Exercise the actual rate-limit transport callback sequence. Retry-After is
// 1 ms here; no HTTP requests occur. A callback failure must propagate,
// unlike best-effort progress callbacks.
const transport=await build({
  entryPoints:['base44/shared/smartsheetLegacyTransport.ts'],
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
  plugins:[{name:'offline-retry-harness',setup(b){
    b.onResolve({filter:/smartsheetTraceIO\.ts$/},()=>({path:'offline-trace-io',namespace:'test'}));
    b.onResolve({filter:/smartsheetTraceContext\.ts$/},()=>({path:'offline-trace-context',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},args=>({
      contents:args.path==='offline-trace-io'
        ? 'export async function measuredSmartsheetFetch(){throw Error("network forbidden");} export function observeSmartsheetBody(){}'
        : 'export function traceDelay(){}',loader:'js',
    }));
  }}],
});
const { retrySmartsheetCall }=await import('data:text/javascript;base64,'+
  Buffer.from(transport.outputFiles[0].text).toString('base64'));
const rateLimited=()=>Object.assign(Error('Synthetic 429'),{upstreamStatus:429,retryAfter:0.001});
let calls=0, verifies=0, orderOfEvents=[];
const success=await retrySmartsheetCall(async()=>{
  calls++;orderOfEvents.push('put-'+calls);
  if(calls===1)throw rateLimited();
  return 'synthetic-success';
},{
  retryTimeout:false,maxRateLimitRetries:1,maxRateLimitWaitSeconds:1,
  onRateLimitRetry:async()=>orderOfEvents.push('progress'),
  beforeRateLimitRetry:async()=>{
    verifies++;orderOfEvents.push('verify');
    const [fresh]=makeEnv();
    await revalidateSynthetic(fresh);
  },
});
assert.equal(success,'synthetic-success');
assert.deepEqual(orderOfEvents,['put-1','progress','verify','put-2']);
assert.equal(verifies,1);
console.log('PASS real retry transport verifies after 429 wait and before second PUT when source records are unchanged');

calls=0;verifies=0;
await assert.rejects(retrySmartsheetCall(async()=>{
  calls++;throw rateLimited();
},{
  retryTimeout:false,maxRateLimitRetries:1,maxRateLimitWaitSeconds:1,
  beforeRateLimitRetry:async()=>{
    verifies++;
    const [bad]=makeEnv({smartsheetGet:async()=>({body:{...remote,rows:[]}})});
    await revalidateSynthetic(bad);
  },
}),err=>err.orderRateLimitRecheckBlocked===true);
assert.equal(calls,1);
assert.equal(verifies,1);
console.log('PASS real retry transport does NOT send a second PUT after unsafe 429 pre-retry verification');

const section=backend.slice(backend.indexOf('  const revalidateOrderRateLimitedPut = async () => {'),
  backend.indexOf('  const salesRemoteVerifiedIds = new Set<string>()'));
assert.match(section,/beforeRateLimitRetry: revalidateOrderRateLimitedPut/);
assert.match(section,/orderRateLimitRecheckBlocked: true/);
assert.match(section,/err\?\.orderRateLimitRecheckBlocked \|\| err\?\.upstreamStatus === 429/);
assert.match(section,/orderFailedRecordIds\.add\(recordId\)/);
assert.match(section,/orderVerificationReviews\.set\(recordId/);
assert.match(section,/staleOrderRetryPrewriteIds\(plans, plannedById, latestById, freshByRowId, sheetId\)/);
assert.match(backend,/!orderRemoteVerifiedIds\.has\(recordId\) \|\| orderFailedRecordIds\.has\(recordId\)/);
assert.match(readFileSync('base44/shared/smartsheetLegacyTransport.ts','utf8'),/await beforeRateLimitRetry\(\{ attempt: rateLimitRetries, waitSeconds: backoffSeconds \}\)/);
console.log('PASS source contracts preserve durable pending markers after definitive 429 or cancelled revalidation');
