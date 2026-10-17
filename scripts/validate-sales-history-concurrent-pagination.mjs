import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory} from "../base44/shared/salesOpportunityHistory.mjs";
import {validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,SALES_HISTORY_STALE_CODE} from "../base44/shared/salesHistorySnapshotGuard.mjs";
import {salesHistoryHasUnfinalizedMatchingAudit} from "../base44/shared/salesHistoryFinalizationSignal.mjs";

let checks=0;
const ok=(v,l)=>{assert.ok(v,l);checks++};
const eq=(a,b,l)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),b,l);checks++};
const id="syntheticSalesHistoryRace001";
let version="v1", reads=0, writes=0, filterCalls=[],injectEditDuringRead=false;
const event={id:"newest",field_name:"sales_last_follow_up_outcome",
 status:"committed",modified_at:"2026-10-16T11:00:00.000Z",
 actor_name:"Sales",new_value:"Called customer",old_value:""};
const makeEntity=(kind)=>({
 async filter(query,options){
   if(kind==="audit" && query.status==="pending")return {items:[],has_more:false};
   filterCalls.push({kind,query,options});
   if(injectEditDuringRead && kind==="legacy") version="v2";
   const row={...event,id:kind==="audit"?"audit-1":"legacy-1"};
   if(kind==="legacy") {delete row.status;row.created_date=row.modified_at;delete row.modified_at;}
   const isStart=!options.cursor;
   return {items:isStart?[row]:[],has_more:isStart,next_cursor:isStart?kind+":offset":""};
 },
});
const WorkOrder={get:async(wid)=>{reads++;return wid===id?{id,updated_date:version}:null}};
const sdk={asServiceRole:{entities:{
 WorkOrder,
 FieldAudit:makeEntity("audit"),
 CellHistory:makeEntity("legacy"),
}}};
const code=readFileSync("base44/functions/fieldHistoryAction/entry.ts","utf8");
const ui=readFileSync("src/components/sales/SalesOpportunityDialog.jsx","utf8");
const ctx={
 createClientFromRequest:()=>sdk,measureSyncEntities:x=>x,
 authenticateSignShopSession:async()=>({role:"user",email:"user@example.invalid"}),
 beginSyncTraceStorage:async()=>{},
 SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
 validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,
 salesHistoryHasUnfinalizedMatchingAudit,Response,
};
runInNewContext(code.replace(/^import .*;\s*$/gm,"")
 .replace("export default async function(req) {","async function testDefault(req) {")
 +"\nglobalThis.syntheticHandler=fieldHistoryHandler;",ctx,{timeout:4000});
const request=page=>({
 async json(){return {action:"sales_history",entity_type:"WorkOrder",
 entity_id:id,session_token:"synthetic",...(page?{history_page:page}:{})};},
});
let response=await ctx.syntheticHandler(request());
eq(response.status,200,"Initial page with stable WorkOrder version is accepted.");
let data=await response.json();
eq(data.pagination.work_order_version,"v1","Server returns WorkOrder history version with cursors.");
eq(reads,2,"Initial page checks WorkOrder before and after history queries.");
const loaded=data.pagination;
version="v2";filterCalls=[];
response=await ctx.syntheticHandler(request(loaded));
eq(response.status,409,"New edit before continuation rejects stale Sales-history cursor.");
data=await response.json();
eq(data.code,SALES_HISTORY_STALE_CODE,"Stale version provides a stable recovery code.");
eq(filterCalls.length,0,"Stale cursor blocked before querying either history collection.");
eq(writes,0,"History verification never mutates WorkOrders.");
version="v1";filterCalls=[];
response=await ctx.syntheticHandler(request(loaded));
eq(response.status,200,"Unchanged record can continue with original cursors.");
eq(filterCalls.length,2,"Both active history sources fetched only when version still matches.");
injectEditDuringRead=true;
filterCalls=[];
response=await ctx.syntheticHandler(request(loaded));
eq(response.status,409,"Edit DURING history reads invalidates the fetched page.");
eq((await response.json()).code,SALES_HISTORY_STALE_CODE,
 "In-flight concurrent edit provides refresh guidance, not mixed history.");
eq(filterCalls.length,2,"Race is detected after both bounded read requests.");
injectEditDuringRead=false;
filterCalls=[];reads=0;
response=await ctx.syntheticHandler(request());
eq(response.status,200,"Refreshing from first page succeeds after concurrent edit.");
eq((await response.json()).pagination.work_order_version,"v2",
  "New first page carries the latest WorkOrder version.");
eq(reads,2,"Refresh revalidates both ends of history read.");
eq(filterCalls.length,2,"Refresh reads only two scoped history collections.");
version="v3";filterCalls=[];
response=await ctx.syntheticHandler(request({ ...loaded,work_order_version:"v3" }));
eq(response.status,200,"A fully matching reloaded record version permits continuation.");
eq(filterCalls.length,2,"Valid continuation remains bounded.");
response=await ctx.syntheticHandler(request({ ...loaded,work_order_version:"v1" }));
eq(response.status,409,"Older cursor metadata never revalidates against a newer record.");
response=await ctx.syntheticHandler(request({ ...loaded,work_order_version:null }));
eq(response.status,409,"Missing version fails closed instead of replaying the first page.");
for(const record of [{}, {updated_date:""}, {updated_date:12}]){
 assert.throws(()=>validateSalesHistoryPageVersion(record,null),e=>e.status===409);
 checks++;
}
ok(ui.includes("data.pagination.work_order_version !== historyPagination.work_order_version"),
  "Client independently checks same-version page before append.");
ok(ui.includes("historyNeedsRefresh") &&
  ui.includes("Refresh Sales history") &&
  ui.includes("setHistoryReloadNonce((value) => value + 1)"),
  "Visible user-triggered refresh resets old paging instead of retrying stale cursors.");
ok(ui.includes('error?.response?.data?.code === "SALES_HISTORY_STALE"'),
  "Client recognizes authoritative 409 stale-history responses.");
ok(ui.includes("!historyNeedsRefresh") &&
  ui.includes("historyRevisionRef.current"),
  "Stale pages cannot be loaded again or applied after switching opportunities.");
ok(code.includes("await verifySalesHistoryPageVersionAfterRead(entity,record.id,openedVersion)") &&
  code.includes("work_order_version:openedVersion"),
  "Backend verifies version after reads and returns same WorkOrder revision.");
console.log("Sales Phase 6G concurrent history-version fencing: "+checks+"/"+checks+" PASS.");
