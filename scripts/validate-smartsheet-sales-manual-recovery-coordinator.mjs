import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const text=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const begin=text.indexOf('async function claimSyncRun(base44: any, status: any, dataset?: string) {');
const end=text.indexOf('\nconst ALERT_SETTING_KEY',begin);
assert.ok(begin>=0&&end>begin,'Existing coordinator claim function must be present.');
// Execute the actual production claim function with synthetic coordinator
// records and mocked Base44 I/O; never touch a production setting.
const implementation=text.slice(begin,end).replace('base44: any, status: any, dataset?: string','base44, status, dataset');
let checks=0;
const yes=(value,message)=>{assert.ok(value,message);checks++};
const same=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++};
const rejects=async(call,pattern)=>{await assert.rejects(call,pattern);checks++};
function fixture(initial={}, otherDataset='orders', otherInitial={}) {
  const at='2026-10-12T13:00:00.000Z';
  const KEYS={orders:'smartsheetOrderSyncStatus',sales:'smartsheetSalesSyncStatus'};
  const dataset=initial!==null?'sales':null;
  const records=new Map();
  let writes=0,revisions=0;
  const make=(key,value)=>({id:'rec-'+key,updated_date:'rev-1',setting_key:key,
    setting_value:{status:'completed',started_at:'old',updated_at:at,...value}});
  records.set(KEYS.sales,make(KEYS.sales,initial||{}));
  records.set(KEYS[otherDataset]||otherDataset,make(KEYS[otherDataset]||otherDataset,otherInitial));
  const clone=rec=>structuredClone(rec);
  const list=key=>{const rec=records.get(key);return rec?[clone(rec)]:[];};
  const entity={
    filter:async(query)=>list(query.setting_key),
    create:async(doc)=>{const rec={id:'rec-'+doc.setting_key,updated_date:'rev-1',...doc};records.set(doc.setting_key,rec);return clone(rec);},
    get:async(id)=>{for(const rec of records.values())if(rec.id===id)return clone(rec);return null;},
    updateMany:async(query,patch)=>{
      const rec=records.get(query.setting_key);
      if(!rec||query.id!==rec.id||query.updated_date!==rec.updated_date)return {updated:0};
      const next={...rec,setting_value:structuredClone(patch.$set.setting_value),updated_date:'rev-'+(++revisions)};
      records.set(query.setting_key,next);writes++;return {updated:1};
    },
  };
  const base44={asServiceRole:{entities:{GlobalSettings:entity}}};
  const sandbox={
    SYNC_STATUS_KEYS:KEYS,
    LEGACY_SYNC_STATUS_KEY:'smartsheetSyncStatus',
    syncStatusKeyForDataset:d=>KEYS[d]||'smartsheetSyncStatus',
    loadSingleSyncStatusRecord:async(_b44,key='smartsheetSyncStatus')=>{
      const matches=list(key);
      if(matches.length!==1)throw Object.assign(new Error('missing'),{status:409});
      return matches[0];
    },
    ensureSyncStatusRecord:async(_b44,key)=>{
      const matches=list(key);
      if(matches.length>1)throw Object.assign(new Error('duplicate'),{status:409});
      if(matches.length===1)return matches[0];
      await entity.create({setting_key:key,setting_value:{}});
      const after=list(key);
      if(after.length!==1)throw Object.assign(new Error('init'),{status:409});
      return after[0];
    },
    mirrorSyncStatusToLegacy:async()=>{},
    readOrderPullEvidenceStore:async()=>null,
    classifyRecoverableStaleOrderSync:()=>({recoverable:false}),
    classifyPriorUncertainOrderPull:()=>({blocked:false}),
    assertNoUnresolvedOrderPullEvidence:async()=>{},
    checkAndSendSyncAlert:async()=>{},
    cleanText:(x,n)=>String(x??'').trim().slice(0,n),
    Date,Number,Object,Error,Boolean,String,Promise,
  };
  const claim=vm.runInNewContext(implementation+'\nclaimSyncRun',sandbox);
  return {claim,base44,records,writes:()=>writes};
}
const recovery=()=>({status:'running',started_at:'2026-10-12T13:22:00.000Z',
  action:'recover_verified_sales_create',progress_dataset:'sales'});
const normal=()=>({status:'running',started_at:'2026-10-12T13:23:00.000Z',
  action:'run_sales_sync',progress_dataset:'sales'});
const independent=fixture();
const acquired=await independent.claim(independent.base44,recovery(),'sales');
same(acquired.setting_value.action,'recover_verified_sales_create',
  'Manual recovery claims the Sales dataset coordinator.');
same(independent.writes(),1,'Only one versioned Sales coordinator CAS is made.');
await rejects(()=>independent.claim(independent.base44,{...recovery(),started_at:'another-run'},'sales'),
  /still owns the Sales coordinator|already running/);
await rejects(()=>independent.claim(independent.base44,normal(),'sales'),
  /permanent-row recovery still owns the Sales coordinator/);
same(independent.writes(),1,'Competing manual recovery and normal sync cannot overwrite an active claim.');
const staleRecovery=fixture({status:'running',
  action:'recover_verified_sales_create',started_at:'yesterday',
  updated_at:'2026-10-11T10:00:00.000Z'});
await rejects(()=>staleRecovery.claim(staleRecovery.base44,normal(),'sales'),/permanent-row recovery still owns the Sales coordinator/);
same(staleRecovery.writes(),0,'Even a stale manual recovery is not auto-stolen by normal sync.');
const staleSync=fixture({status:'running',action:'run_sales_sync',started_at:'yesterday',
  updated_at:'2026-10-11T10:00:00.000Z'});
await rejects(()=>staleSync.claim(staleSync.base44,recovery(),'sales'),
  /still owns the Sales coordinator/);
same(staleSync.writes(),0,'Manual recovery cannot steal a quiet/stale Sales sync.');
const ordinary=fixture({status:'completed'});
await ordinary.claim(ordinary.base44,normal(),'sales');
same(ordinary.writes(),1,'Normal sync can claim completed Sales coordinator as before.');
const afterCompletion=fixture({status:'needs_review',action:'recover_verified_sales_create'});
await afterCompletion.claim(afterCompletion.base44,recovery(),'sales');
same(afterCompletion.writes(),1,
  'A reviewed or completed recovery can be followed by another verified recovery.');
const activeOrder=fixture({status:'completed'},'orders',{status:'running',
  action:'push_saved_orders',started_at:'2026-10-12T13:20:00.000Z',
  updated_at:new Date().toISOString()});
await rejects(()=>activeOrder.claim(activeOrder.base44,recovery(),'sales'),/already running/);
same(activeOrder.writes(),0,'An active Order run still serializes a Sales recovery claim.');
const staleOrder=fixture({status:'completed'},'orders',{status:'running',
  action:'push_saved_orders',started_at:'yesterday',
  updated_at:'2026-10-11T10:00:00.000Z'});
await staleOrder.claim(staleOrder.base44,normal(),'sales');
same(staleOrder.writes(),1,'A stale Order-side record never blocks a Sales claim; Order recovery owns its cleanup.');
const backendRecovery=text.slice(text.indexOf("if (action === 'recover_verified_sales_create')"),
 text.indexOf("if (action === 'audit_sales_recovery_history'"));
yes(backendRecovery.includes("await claimInvocationRun({") &&
 backendRecovery.indexOf('await claimInvocationRun({') <
 backendRecovery.indexOf('await recoverVerifiedSalesCreateLink({'),
 'Manual recovery acquires shared coordinator BEFORE link attempt.');
yes(backendRecovery.includes("},'sales');"),
 'Manual recovery claims the Sales dataset coordinator explicitly.');
yes(backendRecovery.includes("assertRunOwnership:()=>assertSyncRunOwnership(base44,recoveryRunStartedAt,'sales')"),
 'Manual recovery passes exact claim identity and dataset into its CAS guarded write.');
yes(backendRecovery.includes("status:'completed',needs_review:false,action") &&
 backendRecovery.includes("status:'needs_review',needs_review:true,action"),
 'Coordinated recovery terminates with an explicit success or review-required outcome.');
yes(text.includes("dataset === 'sales' && status?.action === 'recover_verified_sales_create' && current?.status === 'running'") &&
 text.includes("dataset === 'sales' && current?.status === 'running' && current?.action === 'recover_verified_sales_create'"),
 'Both manual-recovery-new-run and any-running-while-recovering are guarded on the Sales coordinator.');
yes(text.includes("classifyRecoverableStaleSalesSync(current)") &&
 text.includes("action === 'recover_stale_sales_run'") &&
 text.includes('loadSingleSyncStatusRecord(base44,SYNC_STATUS_KEYS.sales)'),
 'Existing explicit stale Sales run recovery remains available on the Sales record.');
console.log('Sales manual recovery dataset coordinator: '+checks+'/'+checks+' PASS.');
