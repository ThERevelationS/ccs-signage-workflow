import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { summarizeSalesCreateAttempts, classifySalesCreateReview } from '../base44/shared/smartsheetSalesCreateReview.mjs';

let n=0;
const same=(a,b,m)=>{assert.deepEqual(a,b,m);n++};
const yes=(v,m)=>{assert.ok(v,m);n++};
const fails=(f,p)=>{assert.throws(f,p);n++};
const sheet='8702703019812740', row='9001';
const bindings={current_task_description:'111',estimate_amount:'222'};
const expected={'111':'Conduct Site Survey','222':125};
const record={id:'wo-a',updated_date:'ver-a',in_pipeline:true,smartsheet_row_id:'',
  smartsheet_create_attempt:{status:'created_unlinked',sheet_id:sheet,row_id:row,
    attempt_id:'attempt-a',expected_snapshot:expected}};
const preview=(r=record,changes={})=>classifySalesCreateReview({
  record:r,sheetId:sheet,rowId:row,bindings,remoteSnapshot:expected,
  remoteVerified:true,...changes});
const clean=preview();
same(clean.classification,'verified_candidate','Only acknowledged exact row ID with verified mapped snapshot is candidate.');
yes(clean.read_only===true && clean.writes_attempted===false &&
  clean.eligible_for_future_guarded_recovery===true,'Positive result remains strictly read-only.');
same(clean.workorder_version,'ver-a','Version returned for later stale-review fencing.');
same(preview({...record,smartsheet_create_attempt:{...record.smartsheet_create_attempt,status:'reserved',row_id:''}}).classification,
  'uncertain_attempt','Matched values cannot prove an uncertain reserved POST owns the row.');
same(preview(record,{otherLinkedRecords:[{id:'wo-other'}]}).classification,
  'competing_claim','A competing linked WorkOrder wins over matching values.');
same(preview(record,{otherAttempts:[{id:'wo-second'}]}).classification,
  'competing_claim','Another attempt with the same permanent ID blocks evidence.');
same(preview(record,{rowId:'9002'}).classification,
  'recorded_id_mismatch','A manually entered row cannot replace an acknowledged permanent ID.');
same(preview(record,{remoteVerified:false}).classification,
  'remote_unverified','Unavailable remote row cannot prove success.');
same(preview(record,{remoteSnapshot:{'111':'Lost','222':125}}).classification,
  'values_mismatch','Changed remote task invalidates preflight.');
same(preview(record,{remoteSnapshot:{'111':'Conduct Site Survey','222':1250}}).classification,
  'values_mismatch','Changed remote estimate invalidates preflight.');
same(preview(record,{bindings:{...bindings,date_initial_contact:'333'}}).classification,
  'snapshot_incomplete','A newly mapped column missing from the saved baseline blocks verified candidate.');
same(preview(record,{remoteSnapshot:{'111':'Conduct Site Survey'}}).classification,
  'values_mismatch','Missing mapped Smartsheet cell blocks candidate.');
same(preview(record,{otherLinkedRecords:[{id:'wo-other'},{id:'wo-other'}],
  otherAttempts:[{id:'wo-third'}]}).competing_claim_count,2,'Competing WorkOrders are de-duplicated.');
for(const [label,change] of [
  ['soft deletion',{deleted:true}],['existing permanent row',{smartsheet_row_id:'123'}],
  ['wrong WorkOrder sheet',{smartsheet_sheet_id:'777777'}],
  ['missing create marker',{smartsheet_create_attempt:null}],
]){
  fails(()=>preview({...record,...change}),/Deleted|already|another|unresolved/,
    'Invalid evidence rejected: '+label);
}
fails(()=>preview(record,{sheetId:'wrong'}),/numeric sheet/,'Invalid sheet rejected.');
fails(()=>preview(record,{rowId:'wrong'}),/numeric sheet/,'Invalid row rejected.');
fails(()=>preview(record,{record:{...record,smartsheet_create_attempt:{...record.smartsheet_create_attempt,sheet_id:'777777'}}}),
  /different sheet/,'Wrong attempt sheet rejected.');
const reserved={...record,id:'wo-b',smartsheet_create_attempt:{...record.smartsheet_create_attempt,status:'reserved',row_id:undefined}};
const linked={...record,id:'wo-c',smartsheet_sheet_id:sheet,smartsheet_row_id:row,
  smartsheet_create_attempt:{...record.smartsheet_create_attempt,status:'linked'}};
const others={...record,id:'wo-d',smartsheet_create_attempt:{...record.smartsheet_create_attempt,sheet_id:'8888888'}};
const listed=summarizeSalesCreateAttempts([record,reserved,linked,others],sheet);
same(listed.count,2,'Audit lists unresolved attempts for configured sheet only.');
same(listed.cases.map(x=>x.workorder_id),['wo-a','wo-b'],'Audit returns minimal identifiers and statuses.');
yes(!JSON.stringify(listed).includes('expected_snapshot') &&
    !JSON.stringify(listed).includes('estimate_amount'),'Review summary never exposes mapped private business values.');
fails(()=>summarizeSalesCreateAttempts([],'not-a-sheet'),/numeric/,'Invalid configured sheet fails closed.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const ui=readFileSync('src/components/sales/SalesCreateAttemptReview.jsx','utf8');
const settings=readFileSync('src/components/admin/SmartsheetSyncSettings.jsx','utf8');
const persistence=readFileSync('src/components/admin/smartsheetSyncPersistence.js','utf8');
yes(backend.includes("if (action === 'audit_sales_create_attempts' || action === 'review_sales_create_candidate')") &&
  backend.includes("!hasSessionToken || adminActor?.role !== 'admin'"),
  'Both review actions demand authenticated administrator session.');
yes(backend.includes("query:{smartsheet_create_attempt:{$exists:true}}") &&
  backend.includes('query:{smartsheet_row_id:rowId}') &&
  backend.includes('await readSalesCreateRowClaims(base44, sheetId, rowId)') &&
  backend.includes('const readCompetingClaims = async () => readSalesCreateRowClaims(base44, sheetId, rowId)'),
  'Read-only review and guarded recovery share automatic creation’s legacy-aware permanent-row claim lookup.');
const helperStart=backend.indexOf('async function readSalesCreateRowClaims(');
const helperEnd=backend.indexOf('\nasync function pushDataset(',helperStart);
yes(helperStart>=0 && helperEnd>helperStart,'Production permanent-row claims helper can be exercised directly.');
const helper=backend.slice(helperStart,helperEnd)
  .replace('base44: any, sheetId: string, rowId: string','base44, sheetId, rowId')
  .replace('(candidate: any)','(candidate)');
const claimQueries=[];
const competingLinks=[{id:'legacy-other',smartsheet_sheet_id:'',smartsheet_row_id:row}];
const durableClaims=[
  {id:'legacy-attempt',smartsheet_create_attempt:{row_id:row}},
  {id:'same-sheet-attempt',smartsheet_create_attempt:{sheet_id:sheet,row_id:row}},
  {id:'different-sheet-attempt',smartsheet_create_attempt:{sheet_id:'1119',row_id:row}},
  {id:'different-row-attempt',smartsheet_create_attempt:{sheet_id:sheet,row_id:'9191'}},
];
const syntheticRead=vm.runInNewContext(helper+'\nreadSalesCreateRowClaims',{
  loadAllEntityRows:async ({query})=>{
    claimQueries.push(query);
    if(Object.hasOwn(query,'smartsheet_row_id')) return competingLinks;
    return durableClaims;
  },
});
const foundClaims=await syntheticRead({asServiceRole:{entities:{WorkOrder:{}}}},sheet,row);
same(foundClaims.linked.map(r=>r.id),['legacy-other'],
  'Legacy permanent row link without a saved sheet ID remains visible to administrator review.');
same(foundClaims.attempts.map(r=>r.id),['legacy-attempt','same-sheet-attempt'],
  'Legacy/same-sheet durable claims are retained without accepting another sheet or row.');
yes(claimQueries.length===2 && claimQueries.every(q=>!Object.hasOwn(q,'smartsheet_sheet_id')) &&
  claimQueries.some(q=>q.smartsheet_row_id===row),
  'Permanent link ownership is queried by exact row ID without excluding missing sheet IDs.');
same(preview(record,{otherLinkedRecords:foundClaims.linked,
  otherAttempts:foundClaims.attempts}).classification,'competing_claim',
  'Read-only manual preflight reports a competing legacy row owner instead of permitting recovery.');
const incompleteRead=vm.runInNewContext(helper+'\nreadSalesCreateRowClaims',{
  loadAllEntityRows:async ()=>{throw new Error('incomplete paged ownership read');},
});
await assert.rejects(()=>incompleteRead({asServiceRole:{entities:{WorkOrder:{}}}},sheet,row),
  /incomplete paged ownership read/);
n++;
yes(backend.includes("const remote = await smartsheetGet('/sheets/'+sheetId+'?'+params.toString(),token)") &&
  backend.includes('remote.body?.columns') &&
  backend.includes('normalizeSheetRows(remote.body)'),
  'Configured sheet, bound columns and exact returned row are validated.');
yes(backend.includes('classifySalesCreateReview({') &&
  backend.includes('read_only:true,writes_attempted:false'),
  'Backend uses tested evidence classification and explicit read-only summary.');
yes(ui.includes('Inspect exact row (no changes)') &&
  ui.includes('No changes occur unless you explicitly confirm recovery.') &&
  ui.includes('result?.classification === "verified_candidate"'),
  'Read-only inspection remains separate from explicitly confirmed guarded recovery.');
yes(settings.includes('<SalesCreateAttemptReview sessionToken={sessionToken} />') &&
  persistence.includes('result.writes_attempted !== false'),
  'Admin panel renders reviewer and client rejects non-read-only responses.');
console.log('Sales manual creation reconciliation read-only preflight: '+n+'/'+n+' PASS.');
