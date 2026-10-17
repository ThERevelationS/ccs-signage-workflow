import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
  appendSalesOpportunityHistoryPages,
} from '../base44/shared/salesOpportunityHistory.mjs';
import {validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead} from '../base44/shared/salesHistorySnapshotGuard.mjs';
import {classifySalesHistoryPendingAudits} from '../base44/shared/salesHistoryFinalizationSignal.mjs';

let checks=0;
function ok(condition,description){assert.ok(condition,description);checks++}
function same(actual,expected,description){assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,description);checks++}
const id='syntheticSalesHistoryPage001';
const make=(kind,i)=>({
  id:kind+'-'+i,entity_type:'WorkOrder',entity_id:id,
  field_name:i%2?'sales_last_follow_up_outcome':'follow_up_date',
  ...(kind==='audit'?{
    status:'committed',
    modified_at:new Date(Date.UTC(2026,9,20,0,0,0)-i*1000).toISOString(),
    actor_name:'Sales Synthetic',
  }:{
    created_date:new Date(Date.UTC(2026,8,20,0,0,0)-i*1000).toISOString(),
    changed_by_name:'Legacy Synthetic',
  }),
  old_value:'',new_value:String(i),
});
const audits=Array.from({length:104},(_,i)=>make('audit',i));
const legacy=Array.from({length:42},(_,i)=>make('legacy',i));
audits.unshift({...make('audit',999),field_name:'actual_cost',new_value:'SECRET'});
legacy.unshift({...make('legacy',999),field_name:'profit_margin',new_value:'PRIVATE'});
audits.unshift({...make('audit',998),status:'aborted',new_value:'NEVER SAVED'});
const source=readFileSync('base44/functions/fieldHistoryAction/entry.ts','utf8');
const detail=readFileSync('src/components/sales/SalesOpportunityDialog.jsx','utf8');
const sdk={asServiceRole:{entities:{
  WorkOrder:{async get(wid){return wid===id?{id,updated_date:'v1'}:null;}},
  FieldAudit:{filter:(query,options)=>fetchPage('audit',query,options)},
  CellHistory:{filter:(query,options)=>fetchPage('legacy',query,options)},
}}};
const readCalls=[];
let unavailableCursors=false;
function fetchPage(kind,query,options){
  if(kind==='audit' && query.status==='pending')return Promise.resolve({items:[],has_more:false});
  readCalls.push({kind,query,options});
  const dataset=(kind==='audit'?audits:legacy).filter(row=>
    query.field_name.$in.includes(row.field_name) &&
    (kind==='legacy'||row.status===query.status));
  const start=options.cursor?Number(options.cursor.split(':')[1]):0;
  const items=dataset.slice(start,start+options.limit);
  const more=start+options.limit<dataset.length;
  return Promise.resolve({items,has_more:more,
    next_cursor:more&&!unavailableCursors?kind+':'+(start+items.length):''});
}
const ctx={
  createClientFromRequest:()=>sdk,
  measureSyncEntities:value=>value,
  authenticateSignShopSession:async()=>({role:'user',email:'sales@example.invalid'}),
  beginSyncTraceStorage:async()=>{},
  SALES_OPPORTUNITY_HISTORY_FIELDS,mergeSalesOpportunityHistory,
  validateSalesHistoryPageVersion,verifySalesHistoryPageVersionAfterRead,
  classifySalesHistoryPendingAudits,Response,
};
runInNewContext(source.replace(/^import .*;\s*$/gm,'')
  .replace('export default async function(req) {','async function simulatedDefault(req) {')
  +'\nglobalThis.syntheticHistoryHandler=fieldHistoryHandler;',ctx,{timeout:5000});
const request=page=>({
  json:async()=>({action:'sales_history',entity_type:'WorkOrder',
    entity_id:id,session_token:'synthetic',...(page?{history_page:page}:{})}),
});
const firstResponse=await ctx.syntheticHistoryHandler(request());
same(firstResponse.status,200,'First history page is available to an authenticated Sales user.');
let response=await firstResponse.json();
same(response.entries.length,70,'First page loads only 35 committed and 35 legacy entries.');
ok(response.pagination.has_more,'History exposes continuation while older events remain.');
same(readCalls.map(x=>x.options.limit),[35,35],
  'Initial history fetch uses two bounded queries, no archive-wide scan.');
let entries=[];
let pages=0,prevCount=0;
let page=null;
do {
  if(pages>0) {
    const res=await ctx.syntheticHistoryHandler(request(page));
    same(res.status,200,'Continued history page is accepted.');
    response=await res.json();
  }
  const prior=entries;
  entries=appendSalesOpportunityHistoryPages(entries,response.entries);
  ok(entries.length>=prior.length,'History pagination never discards a previously loaded row.');
  same(new Set(entries.map(e=>e.id)).size,entries.length,
    'Each paging merge preserves distinct audit/legacy event IDs.');
  prevCount=entries.length;
  page=response.pagination;
  pages++;
  ok(pages<12,'Pagination reaches exhaustion with bounded number of requests.');
}while(page.has_more);
same(entries.length,146,'Every committed Sales audit and legacy history row remains accessible.');
same(entries.filter(e=>e.source==='Verified app save').length,104,
  'All 104 committed FieldAudit rows remain visible.');
same(entries.filter(e=>e.source==='Legacy CellHistory').length,42,
  'All 42 legacy Sales rows remain visible.');
same(entries[0].id,'audit:audit-0','Merged historical view remains in global reverse-chronological order.');
same(entries[entries.length-1].id,'legacy:legacy-41','Older legacy history remains reachable.');
ok(entries.every(e=>!['SECRET','PRIVATE','NEVER SAVED'].includes(e.new_value)),
  'Sensitive fields and aborted writes never appear on any page.');
const auditReads=readCalls.filter(call=>call.kind==='audit');
const legacyReads=readCalls.filter(call=>call.kind==='legacy');
same(auditReads.length,3,'After audit source exhausts, it is never fetched again.');
same(legacyReads.length,2,'After legacy source exhausts, it is never fetched again.');
ok(readCalls.every(call=>call.query.entity_id===id &&
  call.query.field_name.$in.length===SALES_OPPORTUNITY_HISTORY_FIELDS.length),
  'All queries scope to exactly this record and allowed Sales fields.');
same(appendSalesOpportunityHistoryPages(entries,entries).length,entries.length,
  'Overlapping cursor responses cannot duplicate history.');
same(appendSalesOpportunityHistoryPages(entries,[{id:'audit:secret',field_name:'actual_cost'}]).length,
  entries.length,'Client-side pagination rejects non-Sales fields.');
same(appendSalesOpportunityHistoryPages(entries,[]).map(e=>e.id),
  entries.map(e=>e.id),'Empty history page does not corrupt ordering.');
const replay=await ctx.syntheticHistoryHandler(request(page));
same((await replay.json()).pagination.has_more,false,
  'Exhausted history page remains exhausted without issuing repeated source queries.');
const badPage=await ctx.syntheticHistoryHandler(request({
  work_order_version:'v1',audit_exhausted:false,legacy_exhausted:true,audit_cursor:'',
}));
same(badPage.status,400,'Invalid missing cursor is rejected rather than replaying page one.');
unavailableCursors=true;
const broken=await ctx.syntheticHistoryHandler(request());
same(broken.status,503,'Missing continuation token fails closed rather than hiding older history.');
unavailableCursors=false;
ok(detail.includes('Load older Sales history') &&
  detail.includes('historyPagination?.has_more') &&
  detail.includes('disabled={historyLoadingMore}'),
  'Opportunity Detail has one explicit responsive load-more control.');
ok(detail.includes('historyPageInFlightRef.current') &&
  detail.includes('revision !== historyRevisionRef.current'),
  'UI fences rapid taps and ignores stale responses after switching opportunities.');
ok(detail.includes('setHistory((current) => appendSalesOpportunityHistoryPages(current, data.entries))'),
  'UI appends verified pages with stable, deduplicated chronological merge.');
ok(detail.includes('setHistoryPagination(null)') &&
  detail.includes('historyRevisionRef.current += 1'),
  'Changing opportunity or reloading resets history cursors and invalidates older pending results.');
ok(detail.includes('setHistoryPageError') &&
  detail.includes('role="alert"'),
  'Failed page fetch offers visible feedback instead of losing loaded history.');
ok(source.includes('auditDone ? empty') && source.includes('legacyDone ? empty'),
  'Backend skips exhausted sources on subsequent pages.');
console.log('Sales Phase 6F Sales-history cursor pagination: '+checks+'/'+checks+' PASS.');
