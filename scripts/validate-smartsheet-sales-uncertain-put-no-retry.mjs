import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retrySmartsheetCall } from '../base44/shared/smartsheetLegacyTransport.ts';

let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label); checks++;};
const check=(ok,label)=>{assert.ok(ok,label);checks++;};

const timeout=()=>Object.assign(new Error('Smartsheet write timed out.'),{status:502,timedOut:true});
// An upstream request can commit and still time out while returning the response.
let writes=0, remote='old';
const uncertainWrite=async()=>{writes++; remote='approved'; throw timeout();};
await assert.rejects(
  retrySmartsheetCall(uncertainWrite,{retryTimeout:false}),
  error=>error.timedOut===true
);
checks++;
eq(writes,1,'An ambiguous Sales PUT is never sent a second time.');
eq(remote,'approved','Timed-out write may have committed remotely despite failure response.');
const retryReadBack=async()=>remote;
eq(await retryReadBack(),'approved','Fresh remote read-back can independently verify a timed-out success.');
let defaultAttempts=0;
const defaultCall=await retrySmartsheetCall(async()=>{
  defaultAttempts++; if(defaultAttempts===1)throw timeout(); return 'returned';
});
eq(defaultCall,'returned','Legacy default transport retries a timed-out write.');
eq(defaultAttempts,2,'The old transport can resend the same ambiguous mutation.');
let failAttempts=0;
await assert.rejects(retrySmartsheetCall(async()=>{failAttempts++;throw timeout();},
  {retryTimeout:false}), error=>error.timedOut===true);
checks++;
eq(failAttempts,1,'A timeout with no retry does not trigger a second outbound mutation.');
let otherAttempts=0;
await assert.rejects(retrySmartsheetCall(async()=>{
  otherAttempts++;throw Object.assign(new Error('permission denied'),{upstreamStatus:403});
},{retryTimeout:false}), /permission denied/);
checks++;
eq(otherAttempts,1,'Definitive non-retryable errors remain single-attempt.');
let successCalls=0;
eq(await retrySmartsheetCall(async()=>{successCalls++;return {status:200};},{retryTimeout:false}),
 {status:200},'Successful write still returns normally.');
eq(successCalls,1,'Successful write sends once.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const transport=readFileSync('base44/shared/smartsheetLegacyTransport.ts','utf8');
check(/await smartsheetWriteNoTimeoutRetry\(\s*'PUT', '\/sheets\/'.*?eligibleSmartsheetWrites/s.test(backend),
  'Production Sales and Order batch PUTs both use existing no-timeout-retry transport.');
check(!backend.includes("await (dataset === 'orders' ? smartsheetWriteNoTimeoutRetry : smartsheetWrite)("),
  'The old auto-resend branch is removed from the Sales batch write.');
check(/export const smartsheetWriteNoTimeoutRetry[\s\S]*?retryTimeout: false/.test(transport),
  'No-timeout-retry transport must explicitly disable ambiguous retry.');
check(backend.includes('const salesRemoteVerifiedIds = new Set<string>()') &&
  backend.includes('salesSnapshotsEqual(verification.expectedSnapshot, actualSnapshot, assigneeColumnId)'),
  'An uncertain PUT must be followed by independent fresh remote value verification.');
check(backend.includes('salesRemoteVerifiedIds.has(String(update.id)) && !salesFailedRecordIds.has(String(update.id))') &&
  backend.includes('verifiedWorkOrderIds: updated'),
  'Failed verification cannot advance Base44 metadata or resolve an approved conflict.');
check(backend.includes('recoverCompletedApprovedSalesTaskDecisionIds(') &&
  backend.includes('approvedSalesRemoteSnapshotStillCurrent('),
  'Previously approved task recovery and remote prewrite protection remain in place.');
console.log('Sales ambiguous Smartsheet PUT no-replay regression: '+checks+'/'+checks+' PASS.');
