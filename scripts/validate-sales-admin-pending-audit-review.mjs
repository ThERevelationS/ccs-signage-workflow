import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory} from "../base44/shared/salesOpportunityHistory.mjs";
import {validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead} from "../base44/shared/salesHistorySnapshotGuard.mjs";
import {classifySalesHistoryPendingAudits} from "../base44/shared/salesHistoryFinalizationSignal.mjs";
import {projectPendingSalesAuditForAdmin} from "../base44/shared/salesAuditAdminReview.mjs";

let tests=0;
function check(value,label){assert.ok(value,label);tests++;}
function equal(actual,expected,label){assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,label);tests++;}
const id="syntheticSalesAdminReview0001";
const now=Date.now();
const row={id,updated_date:"v1",sales_last_follow_up_outcome:"Contacted",
  follow_up_date:"2026-10-17",actual_cost:9500,profit_margin:0.6,
  work_notes:"PRIVATE-NOTES"};
const pending=[
  {id:"audit-a",event_key:"event-a",entity_type:"WorkOrder",entity_id:id,
    status:"pending",field_name:"sales_last_follow_up_outcome",old_value:"PRIVATE-OLD",
    new_value:"Contacted",value_hash:"PRIVATE-HASH",created_date:new Date(now-20*60000).toISOString(),
    source:"app",actor_name:"Sales Rep"},
  {id:"audit-b",event_key:"event-b",entity_type:"WorkOrder",entity_id:id,
    status:"pending",field_name:"follow_up_date",old_value:"OLD-DATE",new_value:"2030-01-01",
    created_date:new Date(now-2000).toISOString(),source:"admin"},
  {id:"audit-cost",event_key:"private-cost",entity_type:"WorkOrder",entity_id:id,
    status:"pending",field_name:"actual_cost",old_value:"9000",new_value:"9500",
    created_date:new Date(now-2000).toISOString()},
  {id:"audit-note",event_key:"private-note",entity_type:"WorkOrder",entity_id:id,
    status:"pending",field_name:"work_notes",new_value:"PRIVATE-NOTES",
    created_date:new Date(now-2000).toISOString()},
  {id:"audit-other",event_key:"other-record",entity_type:"WorkOrder",entity_id:"otherid",
    status:"pending",field_name:"follow_up_date",new_value:"2026-10-17"},
  {id:"audit-committed",event_key:"past",entity_type:"WorkOrder",entity_id:id,
    status:"committed",field_name:"follow_up_date",new_value:"2026-10-17"},
];
const snapshot=projectPendingSalesAuditForAdmin(pending,row,{now,hasMore:true});
equal(snapshot.entries.length,2,"Only pending audit entries for the selected WorkOrder and allowed Sales fields are projected.");
equal(snapshot.entries[0].field_name,"sales_last_follow_up_outcome","Matching follow-up outcome identified.");
equal(snapshot.entries[0].timing,"aged","Older pending audit classifies as aged.");
equal(snapshot.entries[0].matching_current_value,true,"Current value agreement is identified without claiming successful save.");
equal(snapshot.entries[1].matching_current_value,false,"Mismatching proposed value remains explicitly uncertain.");
equal(snapshot.entries[1].timing,"recent","Recently created audit marked recent.");
equal(snapshot.has_more,true,"Projection conveys incomplete read coverage.");
equal(snapshot.read_only,true,"Review is expressly read-only.");
check(!JSON.stringify(snapshot).includes("PRIVATE-"),"Old/new audit values, notes, and hashes are absent.");
check(!JSON.stringify(snapshot).includes("actual_cost")&&!JSON.stringify(snapshot).includes("profit_margin"),"Private costs and margin fields are excluded.");
check(snapshot.entries.every(e=>!Object.keys(e).some(k=>k==="new_value"||k==="old_value"||k==="value_hash")),
  "Projection cannot expose raw values or fingerprints.");
equal(projectPendingSalesAuditForAdmin([],row,{now}).entries.length,0,"Empty evidence stays empty; no synthetic saved history invented.");
equal(projectPendingSalesAuditForAdmin([{...pending[0],created_date:"invalid"}],row,{now}).entries[0].timing,
 "unknown","Malformed audit times remain uncertain.");
equal(projectPendingSalesAuditForAdmin([{...pending[0],created_date:new Date(now+300000).toISOString()}],row,{now}).entries[0].timing,
 "future","Future audit timestamp requires investigation.");
equal(projectPendingSalesAuditForAdmin([...pending,...Array(45).fill(pending[0])],row,{now}).entries.length,
 35,"Projection remains capped even with malformed upstream fetch.");

const source=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
const dialog=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
const spreadsheet=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
let role="user",getCalls=0,historyCalls=0,pendingCalls=0,writeCalls=0,mutateVersionMidRead=false,
 pendingResult={items:pending.filter(e=>e.status==="pending"),has_more:true};
const sdk={asServiceRole:{entities:{
 WorkOrder:{async get(key){getCalls++;return key===id?{...row}:null;}},
 FieldAudit:{async filter(query,options){
   pendingCalls++;
   if(mutateVersionMidRead)row.updated_date="v2";
   check(query.status==="pending","Admin evidence query is limited to pending audits.");
   check(query.entity_id===id&&query.entity_type==="WorkOrder","Admin evidence query is scoped to one WorkOrder.");
   equal(query.field_name.$in,SALES_OPPORTUNITY_HISTORY_FIELDS,"Server filters to allowed Sales fields.");
   equal(options.limit,35,"Admin evidence request remains bounded.");
   return pendingResult;
 }},
 CellHistory:{async filter(){historyCalls++;return {items:[]};}},
}}};
const ctx={createClientFromRequest:()=>sdk,measureSyncEntities:x=>x,
 authenticateSignShopSession:async()=>({role,email:"test@example.invalid"}),
 beginSyncTraceStorage:async()=>{},
 SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
 validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,
 classifySalesHistoryPendingAudits,projectPendingSalesAuditForAdmin,Response,
};
runInNewContext(source.replace(/^import .*;\s*$/gm,"")
 .replace("export default async function(req) {","async function testDefault(req) {")
 +"\nglobalThis.reviewHandler=fieldHistoryHandler;",ctx,{timeout:5000});
const request=(type="WorkOrder",action="sales_audit_review")=>({
 json:async()=>({action,entity_type:type,entity_id:id,session_token:"synthetic-token"}),
});
let response=await ctx.reviewHandler(request());
equal(response.status,403,"Normal Sales user is denied admin audit investigation.");
equal(getCalls,0,"Regular user is denied before service-role WorkOrder read.");
equal(pendingCalls,0,"Regular user cannot cause any privileged audit query.");
role="admin";
response=await ctx.reviewHandler(request());
equal(response.status,200,"Authenticated admin can inspect pending Sales metadata.");
const result=await response.json();
equal(result.success,true,"Admin read returns success.");
equal(result.entries.length,2,"Server projection excludes private/unrelated evidence.");
equal(result.has_more,true,"Admin is told evidence beyond the first page exists.");
equal(result.work_order_version,"v1","Admin read returns verified WorkOrder version.");
equal(getCalls,2,"Admin read double-checks WorkOrder version around query.");
equal(pendingCalls,1,"Admin review performs only a single pending audit query.");
equal(historyCalls,0,"Admin review does not scan legacy archives.");
equal(writeCalls,0,"Admin review never writes any WorkOrders or audit rows.");
check(!JSON.stringify(result).includes("PRIVATE-"),"Server returns no secret audit values.");
response=await ctx.reviewHandler(request("Order"));
equal(response.status,400,"Audit review cannot be used against Order records.");
equal(pendingCalls,1,"Invalid entity cannot trigger audit query.");
mutateVersionMidRead=true;
response=await ctx.reviewHandler(request());
equal(response.status,409,"Concurrent WorkOrder edit invalidates stale admin evidence.");
equal((await response.json()).code,"SALES_HISTORY_STALE","Version conflict is explicitly labeled.");
equal(writeCalls,0,"Concurrency check never mutates audit data.");
check(spreadsheet.includes("isAdmin={isAdmin}"),"Sales user role is passed from existing auth context to Opportunity Detail.");
check(dialog.includes('action: "sales_audit_review"') &&
 dialog.includes("isAdmin && historyAuditNeedsReview"),"Admin review is an explicit privileged UI interaction.");
check(dialog.includes("historyRevisionRef.current") &&
 dialog.includes("historyReviewInFlightRef.current"),"Late responses and double-tap reads are fenced.");
check(dialog.includes("A matching value does not prove the write completed"),"Interface does not equate value agreement with verified save.");
check(dialog.includes("historyReview.has_more"),"Admin sees a clear warning if the bounded review is incomplete.");
check(!dialog.includes('base44.entities.FieldAudit'),"No direct client access to admin-only FieldAudit entity.");
console.log("Sales Phase 6J admin pending-audit review security and provenance: "+tests+"/"+tests+" PASS.");
