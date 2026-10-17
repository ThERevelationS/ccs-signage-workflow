import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory} from "../base44/shared/salesOpportunityHistory.mjs";
import {validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead} from "../base44/shared/salesHistorySnapshotGuard.mjs";
import {salesHistoryHasUnfinalizedMatchingAudit} from "../base44/shared/salesHistoryFinalizationSignal.mjs";

let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++};
const same=(a,b,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),b,label);checks++};
const record={id:"syntheticSalesAuditPending001",updated_date:"ver1",
 sales_last_follow_up_outcome:"Spoke with customer",follow_up_date:"2026-10-20",
 sales_last_follow_up_completed_at:"2026-10-16T19:00:00.000Z"};
const pending={id:"pending1",entity_type:"WorkOrder",entity_id:record.id,
 status:"pending",field_name:"sales_last_follow_up_outcome",
 old_value:"",new_value:record.sales_last_follow_up_outcome,
 created_date:"2026-10-16T19:00:00.000Z"};
const committed={...pending,id:"committed1",status:"committed"};
const orphan={...pending,id:"orphan",new_value:"A save that did not happen"};
const privatePending={...pending,id:"private",field_name:"actual_cost",new_value:"5000"};
ok(salesHistoryHasUnfinalizedMatchingAudit([pending],record),
 "Pending Sales audit matching the currently stored WorkOrder signals incomplete history.");
ok(!salesHistoryHasUnfinalizedMatchingAudit([orphan],record),
 "Abandoned pending attempts that do not match live data do not claim incompleteness.");
ok(!salesHistoryHasUnfinalizedMatchingAudit([privatePending],record),
 "Private costing audit cannot influence regular-user Sales history.");
ok(!salesHistoryHasUnfinalizedMatchingAudit([{...pending,preview_truncated:true}],record),
 "Truncated previews do not qualify as proof that current field matches pending intent.");
ok(!salesHistoryHasUnfinalizedMatchingAudit([{...pending,entity_id:"another-order"}],record),
 "Pending audit from another WorkOrder cannot affect this history.");
ok(!salesHistoryHasUnfinalizedMatchingAudit([{...pending,status:"aborted"}],record),
 "Aborted audit entries never imply an ongoing finalization.");
ok(!salesHistoryHasUnfinalizedMatchingAudit([{...pending,status:"committed"}],record),
 "Committed audit events do not trigger a false pending signal.");
same(salesHistoryHasUnfinalizedMatchingAudit(null,record),false,
 "Unusable audit page is never treated as verified positive evidence.");
const source=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
const ui=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
let pendingRows=[pending],committedRows=[],failPendingRead=false,recordGetCount=0;
const calls=[];
const sdk={asServiceRole:{entities:{
  WorkOrder:{async get(id){recordGetCount++;return id===record.id?record:null;}},
  FieldAudit:{async filter(query,options){
    calls.push({kind:"audit",query,options});
    if(query.status==="pending"){
      if(failPendingRead)throw new Error("History verification unavailable");
      return {items:pendingRows,has_more:false};
    }
    return {items:committedRows,has_more:false};
  }},
  CellHistory:{async filter(query,options){
    calls.push({kind:"legacy",query,options});
    return {items:[],has_more:false};
  }},
}}};
const ctx={
 createClientFromRequest:()=>sdk,measureSyncEntities:x=>x,
 authenticateSignShopSession:async()=>({role:"user",email:"synthetic@example.invalid"}),
 beginSyncTraceStorage:async()=>{},
 SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
 validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,
 salesHistoryHasUnfinalizedMatchingAudit,Response,
};
runInNewContext(source.replace(/^import .*;\s*$/gm,"")
 .replace("export default async function(req) {","async function simulatedDefault(req) {")
 +"\nglobalThis.testHandler=fieldHistoryHandler;",ctx,{timeout:3000});
const request=()=>({async json(){return {action:"sales_history",
  session_token:"synthetic",entity_type:"WorkOrder",entity_id:record.id};}});
let response=await ctx.testHandler(request());
same(response.status,200,"A saved WorkOrder with pending audit can still load older committed Sales history.");
let body=await response.json();
same(body.audit_verification_pending,true,
 "Backend sends warning that a matching Sales audit is not yet committed.");
same(body.entries.length,0,"Pending audit does not become fabricated completed activity.");
same(calls.map(c=>c.kind),["audit","legacy","audit"],
 "A page performs exactly two scoped history reads plus one bounded pending check.");
same(calls[2].query.status,"pending","Pending status is explicitly scoped by server.");
same(calls[2].options.limit,35,"Pending status probe has a fixed bounded row limit.");
same(calls[2].query.field_name.$in,SALES_OPPORTUNITY_HISTORY_FIELDS,
 "Pending probe cannot query private WorkOrder cost or notes fields.");
same(recordGetCount,2,"WorkOrder is checked before and after history collection reads.");
pendingRows=[];committedRows=[committed];calls.length=0;
response=await ctx.testHandler(request());body=await response.json();
same(body.audit_verification_pending,false,"After audit finalization the warning clears.");
same(body.entries.length,1,"Finalized audit becomes visible on a new history read.");
same(body.entries[0].new_value,record.sales_last_follow_up_outcome,
 "Only the verified committed outcome enters history.");
same(body.entries[0].source,"Verified app save","Committed outcome retains correct provenance.");
pendingRows=[orphan];committedRows=[];calls.length=0;
response=await ctx.testHandler(request());body=await response.json();
same(body.audit_verification_pending,false,
 "Nonmatching stale pending intents do not obstruct all legacy history.");
pendingRows=[privatePending];calls.length=0;
response=await ctx.testHandler(request());body=await response.json();
same(body.audit_verification_pending,false,
 "Pending costing rows do not cause false Sales verification warning.");
pendingRows=[];failPendingRead=true;calls.length=0;
response=await ctx.testHandler(request());
same(response.status,503,"Pending audit query failure fails closed, not a misleading verified history.");
same((await response.json()).success,false,"Unverified history request returns an explicit failure.");
failPendingRead=false;
ok(ui.includes("historyAuditPending") && ui.includes("Retry history verification") &&
  ui.includes("setHistoryReloadNonce((value) => value + 1)"),
  "Mobile/desktop Sales Activity offers explicit read-only retry for pending audits.");
ok(ui.includes('historyError && !historyNeedsRefresh ? "Retry Sales history"') &&
  ui.includes("(historyNeedsRefresh || historyAuditPending || historyError)"),
  "Generic initial load failures also expose retry without reopening Opportunity Detail.");
ok(ui.includes("historyNeedsRefresh || historyAuditPending || historyPageInFlightRef.current"),
  "Older pages cannot be appended while audit finalization is unverified.");
ok(ui.includes("setHistoryAuditPending(true)") && ui.includes("setHistoryNeedsRefresh(true)"),
  "If a pending audit appears during pagination, the page is blocked pending a fresh start.");
ok(ui.includes("pending changes are not shown as saved activity"),
  "UI does not claim unverified audit entries are completed saves.");
console.log("Sales Phase 6H audit-finalization and history retry: "+checks+"/"+checks+" PASS.");
