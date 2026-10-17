import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {
  SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
} from "../base44/shared/salesOpportunityHistory.mjs";
import {validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead} from "../base44/shared/salesHistorySnapshotGuard.mjs";
import {salesHistoryHasUnfinalizedMatchingAudit} from "../base44/shared/salesHistoryFinalizationSignal.mjs";

let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++};
const same=(a,b,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),b,label);checks++};
const record={id:"syntheticSalesHistory001",in_pipeline:true,sales_status:"follow_up",
  updated_date:"v2",sales_last_follow_up_completed_at:"2026-10-16T12:00:00.000Z",
  sales_last_follow_up_outcome:"Connected / Spoke with customer",
  follow_up_date:"2026-10-20"};
const audit=[
  {id:"audit-timestamp",entity_type:"WorkOrder",entity_id:record.id,
    field_name:"sales_last_follow_up_completed_at",status:"committed",
    old_value:"",new_value:record.sales_last_follow_up_completed_at,
    modified_at:"2026-10-16T12:00:00.000Z",actor_name:"Sales Operator",actor_email:"sales@example.invalid"},
  {id:"audit-outcome",entity_type:"WorkOrder",entity_id:record.id,
    field_name:"sales_last_follow_up_outcome",status:"committed",old_value:"Previous voicemail",
    new_value:record.sales_last_follow_up_outcome,modified_at:"2026-10-16T12:00:00.000Z",
    actor_name:"Sales Operator",actor_email:"sales@example.invalid"},
  {id:"audit-next",entity_type:"WorkOrder",entity_id:record.id,
    field_name:"follow_up_date",status:"committed",
    old_value:"2026-10-16",new_value:record.follow_up_date,
    modified_at:"2026-10-16T12:00:00.000Z",actor_name:"Sales Operator"},
  {id:"audit-pending",field_name:"sales_last_follow_up_outcome",status:"pending",
    new_value:"Did not save",modified_at:"2026-10-16T12:01:00.000Z"},
  {id:"audit-aborted",field_name:"sales_last_follow_up_outcome",status:"aborted",
    new_value:"Rejected",modified_at:"2026-10-16T12:02:00.000Z"},
  {id:"audit-cost",field_name:"actual_cost",status:"committed",new_value:"SECRET"},
  {id:"audit-margin",field_name:"profit_margin",status:"committed",new_value:"PRIVATE"},
  {id:"audit-notes",field_name:"work_notes",status:"committed",new_value:"PRIVATE"},
];
const legacy=[{id:"old-1",field_name:"follow_up_date",old_value:"2026-09-18",
  new_value:"2026-09-25",created_date:"2026-09-10T11:00:00.000Z",
  changed_by_name:"Older Sales Rep"},{id:"old-cost",field_name:"actual_cost",new_value:"SECRET"}];
const merged=mergeSalesOpportunityHistory(audit,legacy);
same(merged.map(e=>e.field_name).sort(),
  ["sales_last_follow_up_completed_at","sales_last_follow_up_outcome","follow_up_date","follow_up_date"].sort(),
  "Merged history includes verified outcome/timestamp/reschedule and legacy schedule, not private or pending fields.");
check(merged.every(e=>!String(e.new_value).includes("SECRET") && !String(e.new_value).includes("PRIVATE")),
  "Private costs, margins and notes are excluded from the response.");
check(merged.find(e=>e.field_name==="sales_last_follow_up_outcome").source==="Verified app save",
  "Committed follow-up outcome has verified source label.");
check(merged.find(e=>e.field_name==="sales_last_follow_up_outcome").actor_name==="Sales Operator",
  "Verified auditor name appears for regular users.");
check(merged.find(e=>e.id==="legacy:old-1").source==="Legacy CellHistory",
  "Legacy source distinguished from committed audit timestamp.");
check(merged[merged.length-1].id==="legacy:old-1","Historical record sorts below current verified follow-up.");
same(mergeSalesOpportunityHistory([...audit,audit[0]],legacy).length,merged.length,
  "Repeated same-row audit response cannot duplicate entries.");
check(!SALES_OPPORTUNITY_HISTORY_FIELDS.includes("actual_cost") &&
  !SALES_OPPORTUNITY_HISTORY_FIELDS.includes("profit_margin") &&
  !SALES_OPPORTUNITY_HISTORY_FIELDS.includes("work_notes"),
  "Regular Sales history allowlist excludes costing, margins and work notes.");
const many=Array.from({length:120},(_,i)=>({...audit[0],id:"synthetic-"+i}));
same(mergeSalesOpportunityHistory(many,[],75).length,75,"Server response caps history to 75 newest entries.");
same(mergeSalesOpportunityHistory(many,[],999).length,100,
  "Server history cap cannot be overridden by a client-supplied large limit.");
const source=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
const dialog=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
check(source.includes("body.action==='sales_history'") &&
  source.includes("type==='WorkOrder'"),"Only WorkOrder supports the Sales-specific read action.");
check(source.includes("field_name:{$in:SALES_OPPORTUNITY_HISTORY_FIELDS}") &&
  source.includes("status:'committed'"),
  "Backend restricts the queried audit rows to committed allowlisted Sales fields.");
check(source.includes("mergeSalesOpportunityHistory(audit.items,legacy.items)"),
  "Service-role results are projected before leaving the server.");
check(dialog.includes('base44.functions.invoke("fieldHistoryAction"') &&
  dialog.includes('action: "sales_history"') && !dialog.includes("entity: CellHistory"),
  "Opportunity Detail uses authenticated combined Sales history rather than direct CellHistory-only reads.");
check(dialog.includes("[workOrder?.id, workOrder?.updated_date, historyReloadNonce]"),
  "Opening and verified save/reload revisions trigger history refresh.");
check(dialog.includes("entry.actor_name || entry.actor_email") &&
  dialog.includes("Legacy record time"),
  "History renders verified editor identity and distinguishes legacy recorded timestamps.");
const serverCode=source.replace(/^import .*;\s*$/gm,"")
  .replace("export default async function(req) {","async function simulatedDefault(req) {")+
  "\nglobalThis.salesHistoryHandler=fieldHistoryHandler;";
let auditFilters=[],legacyFilters=[],readCounts={audit:0,legacy:0},writes=0;
let authed=true;
let activeAudit=structuredClone(audit);
const collection=(kind,sourceRows)=>({
  async filter(query,options){
    if(kind==='audit' && query.status==='pending')return {items:[],has_more:false};
    readCounts[kind]++;
    (kind==="audit"?auditFilters:legacyFilters).push({query,options});
    return {items:sourceRows()
      .filter(row=>query.field_name.$in.includes(row.field_name) &&
        (kind==="legacy" || row.status===query.status)),has_more:false};
  },
});
const sdk={asServiceRole:{entities:{
  WorkOrder:{async get(id){return id===record.id?record:null;}},
  FieldAudit:collection("audit",()=>activeAudit),
  CellHistory:collection("legacy",()=>legacy),
}}};
const ctx={
  createClientFromRequest:()=>sdk,
  measureSyncEntities:x=>x,
  authenticateSignShopSession:async()=>authed?{role:"user",email:"sales@example.invalid"}:null,
  beginSyncTraceStorage:async()=>{},
  SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
  validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,
  salesHistoryHasUnfinalizedMatchingAudit,Response,
};
runInNewContext(serverCode,ctx,{timeout:3000});
const request=(action="sales_history",entityType="WorkOrder",id=record.id)=>({
  async json(){return {action,session_token:"synthetic-only",
    entity_type:entityType,entity_id:id,include_remote:false};},
});
let response=await ctx.salesHistoryHandler(request());
same(response.status,200,"Authenticated Sales employee can load combined history.");
const payload=await response.json();
check(payload.success===true && Array.isArray(payload.entries),
  "Sales history response is a verified list.");
same(payload.entries.length,4,"Service-role read includes both modern and legacy Sales history.");
same(readCounts,{audit:1,legacy:1},"One read per history entity; no N+1 fetches.");
check(auditFilters[0].query.status==="committed" &&
  auditFilters[0].query.field_name.$in.length===SALES_OPPORTUNITY_HISTORY_FIELDS.length &&
  legacyFilters[0].query.entity_id===record.id,
  "Server scopes history to one WorkOrder and only approved fields.");
check(payload.entries.some(e=>e.new_value===record.sales_last_follow_up_outcome) &&
  payload.entries.some(e=>e.new_value===record.sales_last_follow_up_completed_at),
  "Follow-up outcome and timestamp survive read/reload.");
check(!payload.entries.some(e=>String(e.new_value).includes("SECRET")),
  "Nothing from unrelated accounting fields reaches the client.");
const before=JSON.stringify(payload.entries);
response=await ctx.salesHistoryHandler(request());
same((await response.json()).entries,payload.entries,
  "Repeated reload returns stable history without introducing entries.");
same(writes,0,"History read never mutates real or synthetic WorkOrders.");
activeAudit=[...activeAudit,{id:"audit-lost-ack-recovery",
  field_name:"sales_last_follow_up_outcome",status:"committed",
  modified_at:"2026-10-16T13:00:00.000Z",new_value:"Recovered verified follow-up"}];
response=await ctx.salesHistoryHandler(request());
check((await response.json()).entries.some(e=>e.new_value==="Recovered verified follow-up"),
  "Saved outcome remains visible after a lost client acknowledgment followed by reload.");
authed=false;
response=await ctx.salesHistoryHandler(request());
same(response.status,401,"Unauthenticated caller cannot access service-role Sales history.");
response=await ctx.salesHistoryHandler(request("sales_history","Order"));
check(response.status!==200,"Order history cannot use Sales-specific read action.");
same(JSON.stringify(payload.entries),before,"Prior trusted history remains unchanged after requests.");
console.log("Sales Phase 6E regular-user committed history: "+checks+"/"+checks+" PASS.");
