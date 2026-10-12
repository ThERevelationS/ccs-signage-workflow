import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const text=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const begin=text.indexOf('async function claimSyncRun(base44: any, status: any) {');
const end=text.indexOf('\nconst ALERT_SETTING_KEY',begin);
assert.ok(begin>=0&&end>begin,'Existing coordinator claim function must be present.');
// Execute the actual production claim function with synthetic coordinator
// records and mocked Base44 I/O; never touch a production setting.
const implementation=text.slice(begin,end).replace('base44: any, status: any','base44, status');
let checks=0;
const yes=(value,message)=>{assert.ok(value,message);checks++};
const same=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++};
const rejects=async(call,pattern)=>{await assert.rejects(call,pattern);checks++};
function fixture(initial={}) {
  const at='2026-10-12T13:00:00.000Z';
  let revision=1,writes=0;
  let record={id:'global-sync-singleton',updated_date:'rev-1',setting_key:'smartsheetSyncStatus',
    setting_value:{status:'completed',started_at:'old',updated_at:at,...initial}};
  const clone=()=>structuredClone(record);
  const entity={
    get:async(id)=>id===record.id?clone():null,
    updateMany:async(query,patch)=>{
      if(query.id!==record.id||query.setting_key!==record.setting_key||
        query.updated_date!==record.updated_date)return {updated:0};
      record={...record,setting_value:structuredClone(patch.$set.setting_value),updated_date:'rev-'+(++revision)};
      writes++;return {updated:1};
    },
  };
  const base44={asServiceRole:{entities:{GlobalSettings:entity}}};
  const sandbox={
    loadSingleSyncStatusRecord:async()=>clone(),
    classifyRecoverableStaleOrderSync:()=>({recoverable:false}),
    classifyPriorUncertainOrderPull:()=>({blocked:false}),
    assertNoUnresolvedOrderPullEvidence:async()=>{},
    checkAndSendSyncAlert:async()=>{},
    cleanText:(x,n)=>String(x??'').trim().slice(0,n),
    Date,Number,Object,Error,Boolean,String,
  };
  const claim=vm.runInNewContext(implementation+'\nclaimSyncRun',sandbox);
  return {claim,base44,current:()=>clone(),writes:()=>writes};
}
const recovery=()=>({status:'running',started_at:'2026-10-12T13:22:00.000Z',
  action:'recover_verified_sales_create',progress_dataset:'sales'});
const normal=()=>({status:'running',started_at:'2026-10-12T13:23:00.000Z',
  action:'run_sync',progress_dataset:'sales'});
const independent=fixture();
const acquired=await independent.claim(independent.base44,recovery());
same(acquired.setting_value.action,'recover_verified_sales_create',
  'Manual recovery claims the existing singleton run coordinator.');
same(independent.writes(),1,'Only one versioned shared coordinator CAS is made.');
await rejects(()=>independent.claim(independent.base44,{...recovery(),started_at:'another-run'}),
  /still owns the coordinator|already running/);
await rejects(()=>independent.claim(independent.base44,normal()),
  /permanent-row recovery still owns/);
same(independent.writes(),1,'Competing manual recovery and normal sync cannot overwrite an active claim.');
const staleRecovery=fixture({status:'running',
  action:'recover_verified_sales_create',started_at:'yesterday',
  updated_at:'2026-10-11T10:00:00.000Z'});
await rejects(()=>staleRecovery.claim(staleRecovery.base44,normal()),/permanent-row recovery still owns/);
same(staleRecovery.writes(),0,'Even a stale manual recovery is not auto-stolen by normal sync.');
const staleSync=fixture({status:'running',action:'run_sync',started_at:'yesterday',
  updated_at:'2026-10-11T10:00:00.000Z'});
await rejects(()=>staleSync.claim(staleSync.base44,recovery()),
  /Another Smartsheet sync still owns/);
same(staleSync.writes(),0,'Manual recovery cannot steal a quiet/stale Sales sync.');
const ordinary=fixture({status:'completed'});
await ordinary.claim(ordinary.base44,normal());
same(ordinary.writes(),1,'Normal sync can claim completed coordinator as before.');
const afterCompletion=fixture({status:'needs_review',action:'recover_verified_sales_create'});
await afterCompletion.claim(afterCompletion.base44,recovery());
same(afterCompletion.writes(),1,
  'A reviewed or completed recovery can be followed by another verified recovery.');
const lockMissing=fixture({status:'running',action:'push_saved_orders'});
await rejects(()=>lockMissing.claim(lockMissing.base44,recovery()),/Order Save & Sync already running/);
same(lockMissing.writes(),0,'Order Save & Sync lock remains intact.');
const backendRecovery=text.slice(text.indexOf("if (action === 'recover_verified_sales_create')"),
 text.indexOf("if (action === 'audit_sales_recovery_history'"));
yes(backendRecovery.includes('await claimInvocationRun({') &&
 backendRecovery.indexOf('await claimInvocationRun({') <
 backendRecovery.indexOf('await recoverVerifiedSalesCreateLink({'),
 'Manual recovery acquires shared coordinator BEFORE link attempt.');
yes(backendRecovery.includes('assertRunOwnership:()=>assertSyncRunOwnership(base44,recoveryRunStartedAt)'),
 'Manual recovery passes exact claim identity into its CAS guarded write.');
yes(backendRecovery.includes("status:'completed',needs_review:false,action") &&
 backendRecovery.includes("status:'needs_review',needs_review:true,action"),
 'Coordinated recovery terminates with an explicit success or review-required outcome.');
yes(text.includes('status?.action === \'recover_verified_sales_create\' && current?.status === \'running\'') &&
 text.includes('current?.action === \'recover_verified_sales_create\''),
 'Both manual-recovery-new-run and any-running-while-recovering are guarded.');
yes(text.includes("classifyRecoverableStaleSalesSync(current)") &&
 text.includes("action === 'recover_stale_sales_run'"),
 'Existing explicit stale Sales run recovery remains available.');
console.log('Sales manual recovery shared coordinator: '+checks+'/'+checks+' PASS.');
