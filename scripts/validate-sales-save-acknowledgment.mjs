import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { verifySalesSaveAcknowledgment } from '../base44/shared/salesSaveAcknowledgmentGuard.mjs';

let checks=0;
function eq(a,b,msg){assert.deepEqual(JSON.parse(JSON.stringify(a)),b,msg);checks++;}
function ok(v,msg){assert.ok(v,msg);checks++;}
function rejects(fn,msg){assert.throws(fn,e=>e.code==='SALES_SAVE_ACK_UNVERIFIED' &&
 /Do not repeat the save/.test(e.message),msg);checks++;}
const id='sales-synthetic-ack-001';
const fields={sales_status:'follow_up',current_task_description:'Call customer',follow_up_date:'2026-10-23'};
const actual={id,updated_date:'rev-2',...fields};
eq(verifySalesSaveAcknowledgment('WorkOrder',id,fields,actual),actual,'Matching work order and all Sales fields are accepted.');
for(const row of [null,[],{}, {...actual,id:'other-record'},
 {...actual,sales_status:'won'}, {...actual,follow_up_date:'2026-10-24'},
 {...actual,current_task_description:undefined}, (()=>{const x={...actual};delete x.follow_up_date;return x;})()]){
 rejects(()=>verifySalesSaveAcknowledgment('WorkOrder',id,fields,row),'Contradictory or malformed Sales acknowledgment fails closed.');
}
eq(verifySalesSaveAcknowledgment('WorkOrder',id,{follow_up_date:''},
 {id,follow_up_date:null}),{id,follow_up_date:null},
 'The existing null/empty normalization is preserved.');
eq(verifySalesSaveAcknowledgment('WorkOrder',id,{work_notes:'notes'}, {id:'unrelated'}),
 {id:'unrelated'},'Unrelated WorkOrder-only changes preserve existing behavior.');
eq(verifySalesSaveAcknowledgment('Order',id,{sales_status:'won'}, {id:'unrelated'}),
 {id:'unrelated'},'Order callers retain their preexisting response contract.');
const mixed={...fields,work_notes:'new notes'};
rejects(()=>verifySalesSaveAcknowledgment('WorkOrder',id,mixed,{...actual,work_notes:'different'}),
 'All fields in a mixed Sales save must match, not only the Sales subset.');

const source=readFileSync('src/components/shared/trackedFieldPersistence.js','utf8');
const code=source.slice(source.indexOf('export async function saveTrackedFields(')).replace(/^export /,'');
let requests=0, responseData={success:true,record:actual};
const ctx={base44:{functions:{invoke:async(action,body)=>{
  requests++;eq(action,'fieldHistoryAction','Original save endpoint remains unchanged.');
  eq(body.next_fields,fields,'Requested Sales patch is unchanged in transport.');
  return {data:responseData};
}}},localStorage:{getItem:()=>''},verifySalesSaveAcknowledgment};
runInNewContext(code+'\nglobalThis.callSave=saveTrackedFields;',ctx,{timeout:3000});
const invoke=()=>ctx.callSave({entityType:'WorkOrder',id,expectedFields:{},nextFields:fields});
eq(await invoke(),actual,'Original save call returns the verified WorkOrder.');
eq(requests,1,'Successful save invokes backend exactly once.');
responseData={success:true,record:{...actual,sales_status:'lost'}};
await assert.rejects(invoke(),e=>e.code==='SALES_SAVE_ACK_UNVERIFIED');checks++;
eq(requests,2,'Contradictory response does not invoke an automatic retry.');
responseData={success:false,error:'Conflict'};
await assert.rejects(invoke(),/Conflict/);checks++;
eq(requests,3,'Explicit server failure remains rejected without a second save.');
ok(!code.includes('updateMany(')&&!code.includes('bulkCreate('),
 'Acknowledgment guard does not write additional records.');
ok(source.includes('verifySalesSaveAcknowledgment(entityType,id,nextFields,data.record)'),
 'Shared persistence verifies successful Sales acknowledgments before returning.');
console.log('Sales Phase 6M successful-acknowledgment consistency: '+checks+'/'+checks+' PASS.');
