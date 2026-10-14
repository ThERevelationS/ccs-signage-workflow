import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validateSalesActivityTimestampPatch} from '../base44/shared/salesActivityTimestampGuard.mjs';
import {validateSalesStageTimestampPatch} from '../base44/shared/salesStageTimestampGuard.mjs';

let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++};
const equivalent=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null)||
  (a==null||a==='')&&(b==null||b==='');
const now = new Date('2026-10-13T20:45:30.000Z');
const stamp='2026-10-13T20:45:00.000Z';
const base={
  id:'testSalesRecord', updated_date:'v1', deleted:false, in_pipeline:true,
  sales_status:'lead', sales_last_activity_at:'2026-10-01T12:00:00.000Z',
  sales_stage_changed_at:'', follow_up_date:'2026-10-16',
  sales_rep:'Brett Heinlein', client_name:'Test Signs',
  title:'Sign Installation', sales_quote_sent_verified_at:'', date_estimate_sent:'2026-10-10',
  smartsheet_sheet_id:'8702703019812740',smartsheet_row_id:'99887766',
};
const original=structuredClone(base);
const validate=(record,patch)=>validateSalesActivityTimestampPatch(record,patch,equivalent,now);
const allowed=(record,patch,label)=>{validate(record,patch);checks++};
const blocked=(record,patch,status,label)=>{assert.throws(()=>validate(record,patch),
  error=>error.status===status,label);checks++};

allowed(base,{notes:[{text:'Shop note'}]},'No activity stamp: unrelated WorkOrder note save works.');
allowed(base,{notes:[{text:'Shop note'}],sales_last_activity_at:base.sales_last_activity_at},
  'Unchanged activity timestamp cannot refresh staleness.');
blocked(base,{sales_last_activity_at:stamp},409,'Standalone activity timestamp blocked.');
blocked(base,{sales_last_activity_at:stamp,title:'Updated sign project'},409,
  'Generic WorkOrder title change does not create verified sales activity.');
blocked(base,{sales_last_activity_at:stamp,notes:[{text:'Added shop note'}]},409,
  'Ordinary notes cannot forge verified sales activity.');
blocked(base,{sales_last_activity_at:stamp,updated_date:'tomorrow'},409,
  'Generic WorkOrder modified date is not Sales-specific activity.');
blocked(base,{sales_last_activity_at:stamp,sales_rep:'Brett Heinlein'},409,
  'Unchanged Sales field is not proof of a new activity.');
allowed(base,{sales_last_activity_at:stamp,sales_rep:'Twyla Heinlein'},
  'Changed Sales representative is verified Sales activity.');
allowed(base,{sales_last_activity_at:stamp,follow_up_date:'2026-10-20'},
  'Rescheduling Sales follow-up is Sales activity.');
allowed(base,{sales_last_activity_at:stamp,current_task_description:'Send Revised Quote'},
  'Updating a Sales task is verified activity.');
allowed(base,{sales_last_activity_at:stamp,sales_last_follow_up_outcome:'Customer requested callback'},
  'Logged follow-up outcome counts as Sales activity.');
allowed(base,{sales_last_activity_at:stamp,sales_status:'quoted',sales_stage_changed_at:stamp},
  'Real stage transition counts as Sales activity.');
allowed(base,{sales_last_activity_at:stamp,in_pipeline:false},
  'Explicit Sales membership removal counts as Sales activity.');
allowed(base,{sales_last_activity_at:stamp,date_estimate_sent:base.date_estimate_sent},
  'Explicit first confirmation of existing quote date counts as activity.');
blocked({...base,sales_quote_sent_verified_at:'2026-10-12T12:00:00.000Z'},
  {sales_last_activity_at:stamp,date_estimate_sent:base.date_estimate_sent},409,
  'Repeat unchanged quote confirmation does not refresh activity.');
allowed(base,{sales_last_activity_at:stamp,date_estimate_sent:'2026-10-12'},
  'Real change to quote-sent date counts as activity.');
allowed({...base,estimate_id:'estimate-one'},
  {sales_last_activity_at:stamp,estimate_id:'estimate-one',title:'Updated approved estimate'},
  'Estimate-linked change to project data retains estimator synchronization.');
allowed({...base,estimate_id:'estimate-one',sales_status:'won'},
  {sales_last_activity_at:stamp,estimate_id:'estimate-one',products:[{id:'approved-product'}]},
  'Estimate-linked approved product update can refresh activity.');
allowed(base,{sales_last_activity_at:stamp,estimate_id:'new-approved-estimate'},
  'Establishing estimate link can count as a Sales update.');
blocked(base,{sales_last_activity_at:stamp,estimate_id:'',title:'Generic job edit'},409,
  'Blank estimate identity cannot authorize generic title activity.');
blocked({...base,in_pipeline:false},
  {sales_last_activity_at:stamp,estimate_id:'estimate-one',title:'Back-office rename'},409,
  'Unrelated nonpipeline WorkOrder edit cannot masquerade as estimator Sales activity.');
blocked(base,{sales_last_activity_at:'2026-10-14T11:00:00.000Z',sales_rep:'Kyle Heinlein'},400,
  'Future-dated activity cannot make the opportunity look fresh prematurely.');
blocked(base,{sales_last_activity_at:'yesterday',sales_rep:'Kyle Heinlein'},400,
  'Non ISO activity stamp rejected.');
blocked(base,{sales_last_activity_at:'2026-09-30T14:00:00.000Z',sales_rep:'Kyle Heinlein'},409,
  'Old timestamp cannot rewind verified Sales activity.');
blocked(base,{sales_last_activity_at:'',sales_rep:'Kyle Heinlein'},400,
  'Clearing activity timestamp cannot erase trustworthy history.');
equal(base,original,'Validation does not mutate an existing WorkOrder.');

const backend=readFileSync('base44/functions/fieldHistoryAction/entry.ts','utf8');
const sheet=readFileSync('src/components/sales/SalesPipelineSpreadsheet.jsx','utf8');
const conversion=readFileSync('src/components/estimator/ConvertToWorkOrder.jsx','utf8');
const estimator=readFileSync('src/components/estimator/customerSync.js','utf8');
check(backend.includes('validateSalesActivityTimestampPatch(record,patch,equivalent)') &&
  backend.indexOf('validateSalesActivityTimestampPatch(record,patch,equivalent)')<
  backend.indexOf('trackedConditionalSave(base44,type,record,patch,actor)'),
  'Sales activity check runs on service-role backend before CAS write and audit.');
check(sheet.includes('const salesActivityChanged = quoteDateVerificationRequested ||') &&
  sheet.includes('SALES_ACTIVITY_FIELDS.has(changedField)'),
  'Sales quick edit computes activity from the actual proposed Sales fields.');
check(conversion.includes('const hasConversionSalesActivity = !existing ||') &&
  conversion.includes('...(hasConversionSalesActivity ? { sales_last_activity_at: conversionActivityStamp } : {})'),
  'Repeat no-op Won estimator conversion does not always advance Sales activity.');
check(estimator.includes('if (salesActivityChanged) {') &&
  estimator.includes('fields.sales_last_activity_at = activityStamp'),
  'Estimate to Pipeline synchronization still stamps only when its mapped Sales fields change.');

let row=structuredClone({...base,sales_last_activity_at:''});
let writes=0;
const entity={
  async get(id){return id===row.id?structuredClone(row):null;},
};
const sdk={asServiceRole:{entities:{WorkOrder:entity}}};
const context={
  createClientFromRequest:()=>sdk,
  measureSyncEntities:x=>x,
  authenticateSignShopSession:async()=>({role:'user',email:'test@example.com'}),
  beginSyncTraceStorage:async()=>{},
  equivalent,
  validateNeutralSalesCloseout:()=>{},
  validateSalesStageTimestampPatch,
  validateSalesActivityTimestampPatch,
  trackedConditionalSave:async(_sdk,type,record,patch)=>{
    assert.equal(type,'WorkOrder');
    assert.equal(row.updated_date,record.updated_date);
    writes++;
    row={...row,...patch,updated_date:'v'+(writes+1)};
    return structuredClone(row);
  },
  Response,
};
runInNewContext(backend.replace(/^import .*;\s*$/gm,'')
  .replace('export default async function(req) {','async function wrapper(req) {')+
  '\nglobalThis.runHandler = fieldHistoryHandler;',context,{timeout:3000});
const save=async(patch)=>{
  const req={async json(){return {action:'save',session_token:'synthetic-token',
    entity_type:'WorkOrder',entity_id:row.id,next_fields:patch,
    expected_fields:Object.fromEntries(Object.keys(patch).map(key=>[key,row[key]??null]))};}};
  const result=await context.runHandler(req);
  return {status:result.status,data:await result.json()};
};
const currentStamp=new Date().toISOString();
let response=await save({sales_last_activity_at:currentStamp});
equal(response.status,409,'Real fieldHistory handler blocks standalone activity stamp.');
equal(writes,0,'Rejected activity timestamp causes zero persistence writes.');
response=await save({title:'New construction sign',sales_last_activity_at:currentStamp});
equal(response.status,409,'Real backend blocks generic WorkOrder rename as Sales activity.');
equal(writes,0,'Generic rename does not forge activity or audit.');
response=await save({notes:[{text:'Material ordered'}]});
check(response.status===200 && writes===1 && row.sales_last_activity_at==='',
  'Ordinary WorkOrder notes still save without artificial Sales activity.');
response=await save({follow_up_date:'2026-10-20',sales_last_activity_at:currentStamp});
check(response.status===200 && writes===2 && row.sales_last_activity_at===currentStamp,
  'Genuine Sales follow-up reschedule commits its activity timestamp once.');
response=await save({sales_last_activity_at:new Date(Date.now()+3600_000).toISOString(),
  sales_rep:'Twyla Heinlein'});
equal(response.status,400,'Real backend rejects future Sales activity.');
equal(writes,2,'Future activity is blocked before any WorkOrder write.');
response=await save({smartsheet_row_id:'11111111'});
equal(response.status,400,'Existing Smartsheet row ownership remains protected.');
check(writes===2 && row.smartsheet_row_id==='99887766',
  'Identity injection does not touch permanent Smartsheet ownership.');

console.log('Sales Phase 6A genuine-activity save protection: '+checks+'/'+checks+' PASS.');
