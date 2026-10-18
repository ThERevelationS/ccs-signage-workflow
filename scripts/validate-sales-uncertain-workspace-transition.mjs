import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

let checks=0;
const ok=(x,m)=>{assert.ok(x,m);checks++;};
const eq=(x,y,m)=>{assert.deepEqual(JSON.parse(JSON.stringify(x)),y,m);checks++;};
const source=readFileSync('src/components/sales/SalesPipelineSpreadsheet.jsx','utf8');
const slice=(start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0 && b>a,'Source loader blocks should exist: '+start);
 return source.slice(a,b);
};
const loadSource=slice('  const loadWorkOrders = async (','  const loadMoreArchive = async () => {');
const mergeSource=slice('  const mergeLoadedRows = (','  const loadWorkOrders = async (');
const id='synthetic-workspace-transition-1';
const lead={id,updated_date:'v1',sales_status:'lead',in_pipeline:true,is_rider:false,completed:false,created_date:'2026-10-01'};
const won={...lead,updated_date:'v2',sales_status:'won',close_date:'2026-10-18'};
let scope='current',loaded=[lead],pins={};
let dbActive=[lead],dbOutcomes=[],called=[];
let simulateScopeSwitch=false,simulateNewerRequest=false;
const refs={
 loadRequestRef:{current:0},activeRecordScopeRef:{current:'current'},
 archiveSkipRef:{current:0},liveEditPinsRef:{current:pins},
 pendingRecordScopesRef:{current:{}},pendingSameTaskRepairRef:{current:new Set()},
 pendingChangesRef:{current:{}},
};
const ctx={
 ...refs,recordScope:'current',sessionToken:'synthetic',ARCHIVE_PAGE_SIZE:35,
 LEGACY_CLOSED_QUERY:{},ALL_RECORDS_ACTIVE_QUERY:{},EXPLICIT_NEUTRAL_CLOSED_QUERY:{},
 WorkOrder:{},Date,Map,Set,Promise,Object,JSON,
 isLoading:false,setIsLoading:()=>{},
 setArchiveHasMore:()=>{},setUsers:()=>{},
 setWorkOrders(fn){loaded=fn(loaded);},
 loadSalesPersonRosterSafely:async()=>[],
 loadAllEntityRows:async({query})=>{
   called.push(query);
   if(simulateScopeSwitch) {
     refs.activeRecordScopeRef.current='outcomes';
     simulateScopeSwitch=false;
   }
   if(simulateNewerRequest) {
     refs.loadRequestRef.current+=1;
     simulateNewerRequest=false;
   }
   return query.sales_status?.$in ? dbOutcomes : dbActive;
 },
 readArchivePage:async()=>[],
 projectSalesRowForLiveView:(row)=>row,
 salesRecordBelongsToLoadedScope:(row,which)=>
   which==='current' ? row.in_pipeline===true && !['won','lost'].includes(row.sales_status):
   which==='outcomes' ? ['won','lost'].includes(row.sales_status) : true,
 console:{error:()=>{}},
};
runInNewContext(mergeSource+loadSource+'\nglobalThis.loadSales=loadWorkOrders;',ctx,{timeout:5000});
let result=await ctx.loadSales(false,'current',[id]);
eq(result,true,'Active WorkOrder is verifiably present in Current Pipeline.');
eq(loaded.map(r=>r.id),[id],'Confirmed active WorkOrder appears in the current workspace.');
eq(called.length,1,'Current scope performs one existing scoped query.');

dbActive=[];dbOutcomes=[won];
loaded=[lead];refs.liveEditPinsRef.current={[id]:{active:true}};
result=await ctx.loadSales(false,'current');
eq(result,true,'Routine background refresh keeps existing success result.');
eq(loaded.map(r=>r.id),[id],'Normal live-edit pin retains the row until user releases it.');
refs.liveEditPinsRef.current={};
result=await ctx.loadSales(false,'current',[id]);
eq(result,'missing_required','Explicit recovery refuses to confirm a moved-out WorkOrder.');
eq(loaded,[],'Explicit recovery drops the phantom pinned row instead of preserving a stale lead.');
eq(refs.activeRecordScopeRef.current,'current','Missing row does not silently switch the active workspace.');

refs.activeRecordScopeRef.current='outcomes';
result=await ctx.loadSales(false,'outcomes',[id]);
eq(result,true,'Outcome workspace can confirm the actual Won record.');
eq(loaded[0].sales_status,'won','Outcome workspace displays the authoritative terminal status.');
eq(loaded[0].updated_date,'v2','Outcome workspace returns the newer WorkOrder revision.');

refs.activeRecordScopeRef.current='current';
simulateScopeSwitch=true;
result=await ctx.loadSales(false,'current',[id]);
eq(result,false,'Workspace switching during fetch prevents stale result acceptance.');
eq(loaded[0].sales_status,'won','Superseded request does not replace the newer workspace state.');

refs.activeRecordScopeRef.current='current';
simulateNewerRequest=true;
result=await ctx.loadSales(false,'current',[id]);
eq(result,false,'A newer overlapping reload supersedes an old request.');
eq(loaded[0].sales_status,'won','Superseded loader does not rewrite the visible record.');
ok(loadSource.includes('return requiredIds.every((id) => rows.some((row) => row?.id === id))'),
 'The real loader checks every blocked WorkOrder for actual inclusion in the scoped result.');
ok(source.includes('liveEditPinsRef.current = {};') &&
 source.includes('reloaded !== "missing_required"'),
 'Explicit reload excludes stale pins and refuses to restore one missing from the authoritative workspace.');
console.log('Sales Phase 6O workspace presence and live pin reconciliation: '+checks+'/'+checks+' PASS.');
