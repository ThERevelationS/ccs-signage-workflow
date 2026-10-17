import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { SALES_OPPORTUNITY_HISTORY_FIELDS, mergeSalesOpportunityHistory } from "../base44/shared/salesOpportunityHistory.mjs";
import { validateSalesHistoryPageVersion, verifySalesHistoryPageVersionAfterRead } from "../base44/shared/salesHistorySnapshotGuard.mjs";
import { classifySalesHistoryPendingAudits, SALES_AUDIT_REVIEW_AFTER_MS } from "../base44/shared/salesHistoryFinalizationSignal.mjs";

let checks = 0;
function same(actual,expected,label){assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,label);checks++;}
function check(value,label){assert.ok(value,label);checks++;}
const now = Date.now();
const id = "syntheticSalesHistory6I";
const row = {id,updated_date:"v1",sales_last_follow_up_outcome:"Contacted",follow_up_date:"2026-10-20"};
const make = (ageMs,more={})=>({
  id:"pending-1",entity_type:"WorkOrder",entity_id:id,status:"pending",
  field_name:"sales_last_follow_up_outcome",new_value:row.sales_last_follow_up_outcome,
  created_date:new Date(now-ageMs).toISOString(),...more,
});
const recent=make(SALES_AUDIT_REVIEW_AFTER_MS-1);
const aged=make(SALES_AUDIT_REVIEW_AFTER_MS);
same(SALES_AUDIT_REVIEW_AFTER_MS,900000,"Review threshold is 15 minutes.");
same(classifySalesHistoryPendingAudits([recent],row,{now}),"pending","Recent matching audit stays retryable.");
same(classifySalesHistoryPendingAudits([aged],row,{now}),"needs_review","15-minute boundary triggers administrator review.");
same(classifySalesHistoryPendingAudits([make(3600000)],row,{now}),"needs_review","Hour-old matching audit never loops only as retryable.");
same(classifySalesHistoryPendingAudits([make(1000,{created_date:""})],row,{now}),"needs_review","Missing creation timestamp requires review.");
same(classifySalesHistoryPendingAudits([make(1000,{created_date:"not a timestamp"})],row,{now}),"needs_review","Malformed timestamp requires review.");
same(classifySalesHistoryPendingAudits([make(-1000)],row,{now}),"needs_review","Future timestamps require review.");
same(classifySalesHistoryPendingAudits([make(1000,{field_name:"actual_cost"})],row,{now}),"none","Private fields cannot trigger warnings.");
same(classifySalesHistoryPendingAudits([make(1000,{entity_id:"someone-else"})],row,{now}),"none","Other WorkOrders cannot trigger warnings.");
same(classifySalesHistoryPendingAudits([make(1000,{status:"aborted"})],row,{now}),"none","Aborted events do not trigger review.");
same(classifySalesHistoryPendingAudits([make(1000,{status:"committed"})],row,{now}),"none","Committed events are not pending.");
same(classifySalesHistoryPendingAudits([make(1000,{new_value:"different"})],row,{now}),"none","Unmatched old intents do not trigger review.");
same(classifySalesHistoryPendingAudits([make(1000,{preview_truncated:true})],row,{now}),"none","Truncated evidence cannot prove a match.");
same(classifySalesHistoryPendingAudits([make(1000,{field_name:"follow_up_date",new_value:row.follow_up_date})],row,{now}),"pending","Other eligible Sales fields are classified.");
same(classifySalesHistoryPendingAudits([recent,aged],row,{now}),"needs_review","An older matching event takes precedence over a recent one.");
same(classifySalesHistoryPendingAudits([{...recent,new_value:"unmatched"}],row,{now,hasMore:true}),"needs_review","Unread pending rows trigger coverage review.");
same(classifySalesHistoryPendingAudits([],row,{now,hasMore:true}),"needs_review","Pending pagination overflow cannot be declared clean.");
same(classifySalesHistoryPendingAudits([],row,{now}),"none","No pending events means verified as far as inspected.");
same(classifySalesHistoryPendingAudits(null,row,{now}),"unverified","Unknown pending query state does not imply a clean audit.");
let pending=[aged],more=false,reads=[],writes=0;
const sdk={asServiceRole:{entities:{
  WorkOrder:{get:async key=>key===id?row:null},
  FieldAudit:{filter:async(query,options)=>{
    reads.push({kind:"audit",query,options});
    if(query.status==="pending")return {items:pending,has_more:more};
    return {items:[],has_more:false};
  },bulkUpdate:async()=>{writes++;throw Error("No mutations allowed");}},
  CellHistory:{filter:async(query,options)=>{reads.push({kind:"legacy",query,options});return {items:[],has_more:false};}},
}}};
const source=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
const ui=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
const ctx={
 createClientFromRequest:()=>sdk,measureSyncEntities:v=>v,
 authenticateSignShopSession:async()=>({role:"user"}),
 beginSyncTraceStorage:async()=>{},
 SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
 validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,
 classifySalesHistoryPendingAudits,Response,
};
runInNewContext(source.replace(/^import .*;\s*$/gm,"")
  .replace("export default async function(req) {","async function mockDefault(req) {")
  +"\nglobalThis.handler=fieldHistoryHandler;",ctx,{timeout:4000});
const request=()=>({json:async()=>({action:"sales_history",entity_type:"WorkOrder",entity_id:id,session_token:"synthetic"})});
async function load(){const response=await ctx.handler(request());check(response.status===200,"Authenticated history read succeeds.");return response.json();}
let result=await load();
same(result.audit_verification_status,"needs_review","Backend marks persistent pending audit for review.");
same(result.audit_verification_pending,true,"Existing Boolean warning remains backward-compatible.");
same(result.entries.length,0,"Pending outcome is never promoted into visible history.");
same(reads.map(x=>x.kind),["audit","legacy","audit"],"History is bounded to three source calls.");
same(reads[2].options.limit,35,"Pending check remains bounded.");
check(!Object.keys(result).some(key=>/pending_values|uncommitted_rows/.test(key)),"API exposes no pending audit values.");
pending=[make(1000)];reads=[];
result=await load();
same(result.audit_verification_status,"pending","Backend distinguishes a recent in-flight write.");
pending=[{...aged,new_value:"unmatched"}];reads=[];
result=await load();
same(result.audit_verification_status,"none","Stale nonmatching intents do not block Sales history.");
more=true;reads=[];
result=await load();
same(result.audit_verification_status,"needs_review","Unread pending audit coverage escalates without scanning whole archive.");
more=false;pending=[];reads=[];
result=await load();
same(result.audit_verification_status,"none","Clean follow-up history clears the review warning.");
same(result.audit_verification_pending,false,"Boolean pending marker clears after resolution.");
same(writes,0,"No synthetic or real FieldAudit mutation used for repair.");
check(ui.includes('setHistoryAuditNeedsReview(data.audit_verification_status === "needs_review")'),
  "UI classifies backend review state in initial and continued history.");
check(ui.includes("historyAuditNeedsReview") && ui.includes("administrator review") &&
  ui.includes("Do not log the follow-up again"),"Persistent warnings direct users to manual review, not a duplicate write.");
check(ui.includes("Recheck pending Sales history") &&
  ui.includes("setHistoryReloadNonce((value) => value + 1)"),
  "Manual recheck only restarts the read-only request.");
check(ui.includes("historyAuditPending && (") &&
  ui.includes('role="status"'),"Review remains visible even if paging also reported an error.");
check(ui.includes("!historyAuditPending") &&
  ui.includes("historyNeedsRefresh || historyAuditPending"),"Unverified pending state blocks older cursor append.");
console.log("Sales Phase 6I long-lived pending audit review: "+checks+"/"+checks+" PASS.");
