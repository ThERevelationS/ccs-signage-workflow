import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {validateSalesStageTimestampPatch} from "../base44/shared/salesStageTimestampGuard.mjs";

let count=0;
const check=(value,message)=>{assert.ok(value,message);count++;};
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);count++;};
const equivalent=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null)||
  (a==null||a==="")&&(b==null||b==="");

const start={id:"syntheticSales001",updated_date:"version1",in_pipeline:true,sales_status:"lead",
  sales_stage_changed_at:"",sales_last_activity_at:"",current_task_description:"Prospect Initiation",
  follow_up_date:"",smartsheet_sheet_id:"8702703019812740",smartsheet_row_id:"99887766"};
const original=structuredClone(start);
const stamp="2026-10-13T15:00:00.000Z";
const passes=(record,patch,label)=>{validateSalesStageTimestampPatch(record,patch,equivalent);count++;};
const blocked=(record,patch,status,label)=>{
  assert.throws(()=>validateSalesStageTimestampPatch(record,patch,equivalent),
    error=>error.status===status,label);count++;
};
passes(start,{sales_status:"quoted",sales_stage_changed_at:stamp},"Real stage change authorizes timing.");
passes(start,{current_task_description:"New task"},"Task-only change has no timing marker.");
passes(start,{sales_status:"lead"},"Unchanged status is allowed without timestamp rewrite.");
passes({...start,sales_stage_changed_at:stamp},
  {sales_stage_changed_at:stamp,follow_up_date:"2026-10-15"},
  "Already stored timestamp remains unchanged with other edits.");
blocked(start,{sales_stage_changed_at:stamp},409,"Standalone backfill rejected.");
blocked(start,{follow_up_date:"2026-10-15",sales_stage_changed_at:stamp},409,
  "Follow-up edit cannot reset stage aging clock.");
blocked(start,{sales_status:"lead",sales_stage_changed_at:stamp},409,
  "Redundant same-status value cannot falsely reset stage aging.");
blocked({...start,sales_status:"won",sales_stage_changed_at:stamp},
  {sales_status:"won",sales_stage_changed_at:""},409,
  "Quote or other task edits cannot erase Won stage history.");
blocked({...start,sales_status:"won",sales_stage_changed_at:stamp},
  {sales_status:"won",sales_stage_changed_at:"2026-10-12T09:00:00.000Z"},409,
  "A false earlier stage date cannot be backfilled on unchanged Won status.");
blocked(start,{sales_status:"quoted",sales_stage_changed_at:""},400,
  "Real status change does not authorize an invalid blank timestamp.");
blocked(start,{sales_status:"quoted",sales_stage_changed_at:"2026-10-13"},400,
  "Real status change requires a UTC ISO timestamp.");
blocked(start,{sales_status:"quoted",sales_stage_changed_at:"2026-13-13T15:00:00.000Z"},400,
  "Impossible month is rejected even during real transition.");
blocked(start,{sales_status:"quoted",sales_stage_changed_at:"2026-10-13T15:00:00Z"},400,
  "UTC time must include millisecond precision.");
blocked(start,{sales_status:"quoted",sales_stage_changed_at:0},400,
  "Nonstring dates cannot advance stage timing.");
passes(start,{sales_status:"won",sales_stage_changed_at:stamp},"Won transition records timing.");
passes({...start,sales_status:"lost"},{sales_status:"follow_up",sales_stage_changed_at:stamp},
  "Reopening Lost records can record real status change.");
eq(start,original,"Stage safety verifier does not mutate original WorkOrder.");
const backendSource=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
const salesSheet=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
const opportunity=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
const fieldAudit=readFileSync("base44/shared/fieldAudit.ts","utf8");
check(backendSource.includes("validateSalesStageTimestampPatch(record,patch,equivalent)") &&
  backendSource.indexOf("validateSalesStageTimestampPatch(record,patch,equivalent)") <
  backendSource.indexOf("trackedConditionalSave(base44,type,record,patch,actor)"),
  "Stage-time validator is called on the backend before tracked CAS write.");
check(backendSource.includes("!optionalFields.has(f)") &&
  !backendSource.slice(backendSource.indexOf("const optionalFields"),backendSource.indexOf("function cincinnatiDateStamp")).includes("smartsheet_row_id"),
  "FieldHistory regular-user writes do not allow Smartsheet permanent row identity.");
check(salesSheet.includes("guardFields: untouchedSalesTransitionGuards(") &&
  salesSheet.includes("expectedFields,") && salesSheet.includes("nextFields: changes,"),
  "Sales table forwards field baselines and transition guards to conflict-safe backend.");
check(opportunity.includes("const update = (changes) => onUpdateFields?.(workOrder.id, changes)"),
  "Opportunity Detail uses the same quick-edit save path.");
check(fieldAudit.includes("updated_date: record.updated_date") &&
  fieldAudit.includes("result?.updated !== 1"),
  "Tracked saves retain exact WorkOrder-version CAS.");

let row=structuredClone(start);
let writes=0;
const base44={asServiceRole:{entities:{WorkOrder:{async get(){return structuredClone(row);}}}}};
const ctx={
  createClientFromRequest:()=>base44,
  measureSyncEntities:value=>value,
  authenticateSignShopSession:async()=>({role:"user",email:"operator@example.com"}),
  beginSyncTraceStorage:async()=>{},
  equivalent,
  validateNeutralSalesCloseout:()=>{},
  validateSalesStageTimestampPatch,
  tracedSyncRequest:async(req,name,callback)=>callback(req),
  trackedConditionalSave:async(_sdk,type,record,patch)=>{
    assert.equal(type,"WorkOrder");
    assert.equal(record.updated_date,row.updated_date);
    writes++;
    row={...row,...patch,updated_date:"version"+(writes+1)};
    return structuredClone(row);
  },
  Response,
};
const code=backendSource.replace(/^import .*;\s*$/gm,"")
  .replace("export default async function(req) {","async function wrappedDefault(req) {")
  + "\nglobalThis.testHandler = fieldHistoryHandler;";
runInNewContext(code,ctx,{timeout:3000});
const request=patch=>({
  async json(){return {action:"save",session_token:"synthetic-only",entity_type:"WorkOrder",
    entity_id:row.id,next_fields:patch,
    expected_fields:Object.fromEntries(Object.keys(patch).map(key=>[key,row[key]??null]))};}
});
const invoke=async patch=>{
  const response=await ctx.testHandler(request(patch));
  return {status:response.status,body:await response.json()};
};
let result=await invoke({sales_stage_changed_at:stamp});
eq(result.status,409,"Actual backend rejects a fabricated timestamp-only stage change.");
check(writes===0,"Rejected stage aging rewrite does not reach WorkOrder persistence.");
result=await invoke({follow_up_date:"2026-10-15"});
check(result.status===200 && result.body.record.follow_up_date==="2026-10-15",
  "Ordinary follow-up changes still save.");
check(writes===1,"Follow-up save commits exactly one tracked write.");
result=await invoke({sales_stage_changed_at:stamp,sales_status:"lead"});
eq(result.status,409,"Actual backend rejects same-stage stamp rewrite with redundant status.");
check(writes===1,"Same-stage rejection creates no additional write.");
result=await invoke({sales_status:"quoted",sales_stage_changed_at:stamp});
check(result.status===200 && result.body.record.sales_status==="quoted" &&
  result.body.record.sales_stage_changed_at===stamp,"Real transition commits with stage timing.");
check(writes===2,"Confirmed stage change has one tracked write.");
result=await invoke({smartsheet_row_id:"999999999999"});
eq(result.status,400,"Regular-user backend refuses protected Smartsheet row mutation.");
check(row.smartsheet_row_id==="99887766" && writes===2,
  "Protected ownership remains intact with no unauthorized write.");
result=await invoke({sales_status:"quoted",follow_up_date:"2026-10-17"});
check(result.status===200 && result.body.record.follow_up_date==="2026-10-17",
  "Unchanged stage status with independent follow-up edit preserves existing stage stamp.");
eq(row.sales_stage_changed_at,stamp,"Normal nonstage saves preserve trustworthy stage clock.");

console.log("Sales Phase 5Z fieldHistory stage-timing and quick-edit safety: "+count+"/"+count+" PASS.");
