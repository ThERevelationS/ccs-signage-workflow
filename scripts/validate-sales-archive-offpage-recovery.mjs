import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {recoverRequiredSalesArchiveRows,SALES_ARCHIVE_RECOVERY_LOOKUP_LIMIT} from
 "../src/components/sales/salesArchiveRecovery.mjs";
import {isLegacyClosedSalesRecord,isTrustedSalesOutcome,isExplicitNeutralSalesClosure}
 from "../src/components/sales/salesRecordScopes.js";

let n=0;
const yes=(value,msg)=>{assert.ok(value,msg);n++;};
const same=(a,b,msg)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),b,msg);n++;};
const id="sales-archive-far-older-01";
const row={id,updated_date:"newer-v2",created_date:"2021-03-14",
 is_rider:false,completed:false,deleted:false,in_pipeline:false,
 current_task_description:"Closed - legacy"};
const first=[{...row,id:"page-1"},{...row,id:"page-2"}];
const index=new Map([[id,row]]);
const belongs=(wo,scope)=>{
 if(!wo||wo.deleted===true||wo.is_rider===true)return false;
 if(scope==="history")return isLegacyClosedSalesRecord(wo);
 if(scope==="all")return wo.completed===false||isTrustedSalesOutcome(wo)||
   (wo.completed===true&&isLegacyClosedSalesRecord(wo));
 return false;
};
let reads=0;
const get=async key=>{reads++;return index.get(key)??null;};
const find=(scope,ids,rows=first)=>recoverRequiredSalesArchiveRows({
 scope,rows,requiredIds:ids,getWorkOrder:get,belongsToScope:belongs,
});
same((await find("history",[id])).map(x=>x.id),["page-1","page-2",id],
 "Off-page legacy history row is added by exact ID, without loading all archive rows.");
same(reads,1,"One missing ID requires one targeted read.");
same((await find("all",[id])).map(x=>x.id),["page-1","page-2",id],
 "All Records can verify a matching off-page legacy record.");
same(reads,2,"All Records does not fan out into archive queries.");
same((await find("history",[id], [...first,row])).length,3,
 "Already loaded target is not fetched or duplicated.");
same(reads,2,"No extra WorkOrder.get for records already present in page.");
same((await find("history",[id,id])).length,3,"Repeated target IDs are deduplicated.");
same(reads,3,"Repeated IDs generate only one direct read.");
const old={...row,updated_date:"old-v1"};
index.set(id,{...row,deleted:true});
same((await find("history",[id])).length,2,"Deleted target must not be resurrected.");
index.set(id,{...row,is_rider:true});
same((await find("all",[id])).length,2,"Rider rows stay out of Sales.");
index.set(id,{...row,current_task_description:"Conduct Site Survey"});
same((await find("history",[id])).length,2,"Nonterminal record cannot enter Legacy History.");
index.set(id,{...row,in_pipeline:true,sales_status:"won",current_task_description:"Completed Sale",completed:true});
same((await find("history",[id])).length,2,"Explicit modern Won outcome is not treated as legacy history.");
same((await find("all",[id])).length,3,"Modern Won outcome belongs to All Records.");
index.set(id,{...row,completed:true,current_task_description:"Closed - legacy"});
same((await find("all",[id])).length,3,"Completed legacy row can be verified off-page in All Records.");
index.set(id,{...row,completed:true,current_task_description:"Work in progress"});
same((await find("all",[id])).length,2,"Completed non-legacy row cannot be included in All Records by recovery.");
index.set(id,{...row,completed:true,current_task_description:"Work in progress",sales_neutral_closed_at:"2026-10-16T12:00:00.000Z"});
same((await find("all",[id])).length,3,"Explicit neutral closure stays in All Records.");
index.set(id,{...row,id:"wrong"});
same((await find("history",[id])).length,2,"Wrong ID cannot satisfy targeted recovery.");
index.set(id,old);
same((await find("current",[id])).length,2,"Non-archive workspace does not use fallback.");
const beforeInvalid=reads;
same((await find("history",[""])).length,2,"Empty ID cannot be looked up.");
same(reads,beforeInvalid,"Invalid identifiers cause zero direct lookups.");
same((await find("history",Array.from({length:SALES_ARCHIVE_RECOVERY_LOOKUP_LIMIT+1},(_,i)=>"key-"+i))).length,2,
 "Oversized pending recovery fails closed without expanding query coverage.");
same(reads,beforeInvalid,"Oversized recovery makes no WorkOrder.get calls.");
same(SALES_ARCHIVE_RECOVERY_LOOKUP_LIMIT,8,"Bounded recovery cap stays explicit.");
const badGet=()=>{throw new Error("unavailable");};
await assert.rejects(recoverRequiredSalesArchiveRows({
 scope:"history",rows:first,requiredIds:[id],getWorkOrder:badGet,belongsToScope:belongs,
}),/unavailable/);n++;
yes(!first.some(x=>x.id===id),"Synthetic tests did not mutate first-page archive source.");
const frontend=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
yes(frontend.includes("recoverRequiredSalesArchiveRows")&&
 frontend.includes("getWorkOrder: (id) => WorkOrder.get(id)"),"Real Sales loader uses existing read-only entity.get.");
yes(frontend.includes("archiveSkipRef.current = pagedCount"),"Archive paging offset is computed only from the real archive page.");
yes(frontend.includes("return requiredIds.every((id) => rows.some((row) => row?.id === id))"),
 "Safety fence is released only after every blocked ID is actually observed in-scope.");

const slice=(begin,end)=>{const x=frontend.indexOf(begin),y=frontend.indexOf(end,x);
 assert(x>=0&&y>x);return frontend.slice(x,y);};
const loader=slice("  const loadWorkOrders = async (","  const loadMoreArchive = async () => {");
const merger=slice("  const mergeLoadedRows = (","  const loadWorkOrders = async (");
const requiredId=id;
let visible=[],offset=0,hasMore=false,queries=[],directReads=0,activeScope="history";
const initial=first.map((r,i)=>({...r,current_task_description:"Closed",created_date:"2026-01-0"+(i+1)}));
const ctx={
 loadRequestRef:{current:0},activeRecordScopeRef:{current:activeScope},
 archiveSkipRef:{current:0},liveEditPinsRef:{current:{}},
 pendingRecordScopesRef:{current:{}},pendingSameTaskRepairRef:{current:new Set()},pendingChangesRef:{current:{}},
 ARCHIVE_PAGE_SIZE:2,LEGACY_CLOSED_QUERY:{status:"historical"},ALL_RECORDS_ACTIVE_QUERY:{status:"all-active"},
 EXPLICIT_NEUTRAL_CLOSED_QUERY:{status:"neutral"},Date,Set,Map,Object,JSON,Promise,
 recordScope:"history",sessionToken:"synthetic",
 WorkOrder:{async get(key){directReads++;return index.get(key);}},
 readArchivePage:async(query,skip)=>{queries.push({query,skip});return initial;},
 loadSalesPersonRosterSafely:async()=>[],
 loadAllEntityRows:async()=>[],
 recoverRequiredSalesArchiveRows,
 salesRecordBelongsToLoadedScope:belongs,
 setArchiveHasMore:v=>{hasMore=v;},setIsLoading:()=>{},setUsers:()=>{},
 setWorkOrders:fn=>{visible=fn(visible);},
 projectSalesRowForLiveView:x=>x,
 console:{error:()=>{}},
};
runInNewContext(merger+loader+"\nglobalThis.loadArchive=loadWorkOrders;",ctx,{timeout:5000});
const history=await ctx.loadArchive(false,"history",[requiredId]);
same(history,true,"Actual Sales loader recognizes verified off-page history record.");
same(visible.length,3,"Loader includes target alongside the bounded first page.");
same(visible.find(x=>x.id===id)?.updated_date,"old-v1","Recovered target shows authoritative direct-read version.");
same(ctx.archiveSkipRef.current,2,"Recovered row does not increase the archive pagination offset.");
same(hasMore,true,"Full initial page still shows Load older Sales history.");
same(queries.map(x=>x.skip),[0],"Exact recovery needs only the normal first-page archive query.");
same(directReads,1,"Loader uses one direct WorkOrder read for a missing blocked ID.");
// Switch to a later archive where the current record is not in the selected scope.
index.set(id,{...row,deleted:true});
const missing=await ctx.loadArchive(false,"history",[id]);
same(missing,"missing_required","Deleted or missing record cannot clear the blocked save.");
same(visible.length,2,"Deleted recovered row is not left visible after refresh.");
same(ctx.archiveSkipRef.current,2,"Failed recovery does not corrupt paging state.");
index.set(id,old);
ctx.activeRecordScopeRef.current="all";
const allResult=await ctx.loadArchive(false,"all",[id]);
same(allResult,true,"All Records can recover an out-of-first-page active/legacy record.");
same(ctx.archiveSkipRef.current,2,"All Records paging offset remains tied to page length.");
same(visible.some(x=>x.id===id),true,"Recovered record is visible in All Records.");
console.log("Sales Phase 6P bounded off-page archive recovery: "+n+"/"+n+" PASS.");
