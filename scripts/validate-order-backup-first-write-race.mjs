import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { orderBackupStillMatchesSheetBeforeFirstWrite as matches } from '../base44/shared/smartsheetOrderBackupFirstWriteSafety.mjs';

const sheetId='4963691473987460';
const backup={sheet_id:sheetId,version:42,row_count:3,drive_file_id:'verified-drive-file-123456'};
const sheet={id:Number(sheetId),version:42,totalRowCount:3};
assert.equal(matches(backup,sheet,sheetId),true);
for(const [badBackup,badSheet,badId] of [
 [{...backup,version:41},sheet,sheetId],
 [backup,{...sheet,version:43},sheetId],
 [backup,{...sheet,totalRowCount:4},sheetId],
 [backup,{...sheet,id:99999},sheetId],
 [backup,{...sheet,version:null},sheetId],
 [backup,{...sheet,totalRowCount:null},sheetId],
 [backup,{...sheet,version:'42'},sheetId],
 [{...backup,drive_file_id:''},sheet,sheetId],
 [{...backup,row_count:undefined},sheet,sheetId],
 [{...backup,version:-1},sheet,sheetId],
 [backup,sheet,'not-a-sheet'],
 [null,sheet,sheetId],
 [backup,null,sheetId],
]) assert.equal(matches(badBackup,badSheet,badId),false);
console.log('PASS backup/Smartsheet permanent sheet identity, exact revision, row count, and persisted artifact must all agree');

const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const guardStart=backend.indexOf('  const verifyOrderBackupBeforeFirstWrite = async (');
const guardEnd=backend.indexOf('\n  const created: string[] = [];',guardStart);
assert.ok(guardStart>0 && guardEnd>guardStart);
const captured=backend.slice(guardStart,guardEnd);
const synthetic=`
import { orderBackupStillMatchesSheetBeforeFirstWrite } from '../base44/shared/smartsheetOrderBackupFirstWriteSafety.mjs';
export function buildGuard(env) {
 let {dataset,globalConfig,verifiedOrderBackup,options,smartsheetGet,sheetId,token}=env;
 let firstOrderWriteAttempted=false,firstOrderWriteConfirmed=false;
 ${captured}
 return {
  check: verifyOrderBackupBeforeFirstWrite,
  markAttempt:()=>{firstOrderWriteAttempted=true;},
  markConfirmed:()=>{firstOrderWriteConfirmed=true;},
 };
}
`;
const compiled=await build({stdin:{
 contents:synthetic,sourcefile:'scripts/order-backup-first-write-harness.ts',
 resolveDir:process.cwd()+'/scripts',loader:'ts',
},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {buildGuard}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const setup=(options={})=>{
 const calls=[];
 const environment={
  dataset:'orders',sheetId,token:'synthetic-token-not-live',
  globalConfig:{backup_before_write:true},
  verifiedOrderBackup:backup,
  options:{assertRunOwnership:async()=>{calls.push('ownership');}},
  smartsheetGet:async path=>{calls.push('read:'+path);return {body:sheet};},
  ...options,
 };
 return {guard:buildGuard(environment),calls};
};
const requiredPath=`/sheets/${sheetId}?page=1&pageSize=1`;
let {guard,calls}=setup();
await guard.check();
assert.deepEqual(calls,['ownership','read:'+requiredPath,'ownership']);
await guard.check();
assert.equal(calls.filter(v=>v.startsWith('read:')).length,2);
guard.markAttempt();
await assert.rejects(guard.check(),err=>err?.orderBackupFirstWriteBlocked===true);
await guard.check({definitive429Retry:true});
guard.markConfirmed();
const before=calls.length;
await guard.check();
assert.equal(calls.length,before);
console.log('PASS actual backend guard verifies directly before first write, permits fresh definitive-429 recheck, and skips prior version after confirmed write');

for(const change of [
 {smartsheetGet:async()=>({body:{...sheet,version:43}})},
 {smartsheetGet:async()=>({body:{...sheet,totalRowCount:4}})},
 {smartsheetGet:async()=>({body:{...sheet,id:333}})},
 {smartsheetGet:async()=>{throw Error('remote unavailable');}},
 {options:{assertRunOwnership:async()=>{throw Error('lost coordinator lease');}}},
 {verifiedOrderBackup:null},
]){
 const {guard:unsafe}=setup(change);
 await assert.rejects(unsafe.check(),err=>err?.orderBackupFirstWriteBlocked===true &&
   /fresh verified backup/.test(err.message));
}
const disabled=setup({globalConfig:{backup_before_write:false}});
await disabled.guard.check();
assert.equal(disabled.calls.length,0);
const sales=setup({dataset:'sales'});
await sales.guard.check();
assert.equal(sales.calls.length,0);
console.log('PASS stale, missing, changed, inaccessible or unowned first-write evidence fails closed; backup-off and Sales behavior remain unchanged');

const orderBranch=backend.slice(backend.indexOf("if (existingRowId && /^\\d+$/.test(existingRowId)"), backend.indexOf("  // Phase 2: Batch Smartsheet write"));
assert.ok(orderBranch.indexOf('await verifyOrderBackupBeforeFirstWrite();') <
 orderBranch.indexOf('createOrderSmartsheetRowWithGuard({'));
const postStart=orderBranch.indexOf('postRow: async (freshOrder: any) => {');
const postWrite=orderBranch.indexOf("smartsheetWriteNoTimeoutRetry('POST'",postStart);
assert.ok(postStart>0 && postWrite>postStart);
assert.ok(orderBranch.slice(postStart,postWrite).includes('await verifyOrderBackupBeforeFirstWrite();'));
assert.match(orderBranch,/firstOrderWriteAttempted = true;\s*const result = await smartsheetWriteNoTimeoutRetry\('POST'/);
assert.match(orderBranch,/beforeRateLimitRetry: async \(\) => verifyOrderBackupBeforeFirstWrite\(\{ definitive429Retry: true \}\)/);
const putArea=backend.slice(backend.indexOf('  // Phase 2: Batch Smartsheet write'),backend.indexOf('  const salesRemoteVerifiedIds = new Set<string>()'));
assert.match(putArea,/await verifyOrderBackupBeforeFirstWrite\(\);\s*if \(dataset === 'orders'\) firstOrderWriteAttempted = true;\s*await smartsheetWriteNoTimeoutRetry\(/);
assert.match(putArea,/await verifyOrderBackupBeforeFirstWrite\(\{ definitive429Retry: true \}\);\s*await revalidateOrderRateLimitedPut\(\)/);
assert.match(putArea,/if \(dataset === 'orders'\) firstOrderWriteConfirmed = true/);
assert.match(putArea,/err\?\.orderBackupFirstWriteBlocked/);
assert.match(putArea,/orderFailedRecordIds\.add\(recordId\)/);
assert.match(backend,/!orderRemoteVerifiedIds\.has\(recordId\) \|\| orderFailedRecordIds\.has\(recordId\)/);
assert.match(backend,/const verifiedBackup = await createVerifiedOrderSheetBackup\(/);
assert.match(backend,/if \(dataset === 'orders'\) verifiedOrderBackup = verifiedBackup/);
console.log('PASS actual Order POST/PUT entry points and 429 retries enforce the captured backup; blocked batch writes retain pending markers');
