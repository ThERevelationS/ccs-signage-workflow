import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditSalesPermanentRowOwners} from '../base44/shared/smartsheetSalesPermanentOwnershipAudit.mjs';

let n=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++};
const yes=(v,m)=>{assert.ok(v,m);n++};
const fail=(cb,pattern)=>{assert.throws(cb,pattern);n++};
const sheet='8702703019812740';
const linked=(id,row,s=sheet,extra={})=>({id,smartsheet_row_id:row,smartsheet_sheet_id:s,...extra});
const attempt=(id,row,s=sheet,status='created_unlinked',extra={})=>({
  id,smartsheet_create_attempt:{sheet_id:s,row_id:row,status,attempt_id:'a-'+id,...extra}
});
const clean=auditSalesPermanentRowOwners([linked('one','100')],[attempt('one','100')],sheet);
eq(clean.review_count,0,'Linked record and its own matching marker count as ONE owner.');
eq(clean.permanent_rows_examined,1,'One permanent row is inspected.');
eq(clean.linked_records_examined,1,'Complete linked scan count reported.');
eq(clean.attempt_records_examined,1,'Complete marker scan count reported.');
yes(clean.read_only && clean.writes_attempted===false && clean.unique_constraint_verified===false,
  'Audit never claims writes or database enforced uniqueness.');
let report=auditSalesPermanentRowOwners([
  linked('a','100'),linked('b','100'),
  linked('c','200',''),linked('d','300',sheet,{smartsheet_create_attempt:{row_id:'444',sheet_id:sheet}}),
  linked('different-sheet','100','456789'),linked('e','400',sheet),
],[
  attempt('a','100'),attempt('q','100'),attempt('c','200',''),
  attempt('d','300',sheet),attempt('e','400',sheet),
  attempt('other','700','123456'),
],sheet);
eq(report.review_count,3,'Colliding, missing-sheet, and inconsistent-marker rows need review.');
eq(report.competing_row_count,1,'Distinct WorkOrder owners for the same permanent row are flagged.');
eq(report.missing_sheet_count,1,'Legacy missing sheet identity is highlighted.');
eq(report.marker_mismatch_count,1,'Mismatched linked create marker is flagged.');
eq(report.cases[0].owner_count,3,'Linked and durable marker claims combine by distinct WorkOrder IDs.');
eq(report.cases[0].workorder_ids,['a','b','q'],'Review identifies exact competing WorkOrders.');
eq(report.cases[0].types,['competing_workorders'],'A true collision is distinct from marker mismatch.');
eq(report.cases[1].types,['missing_sheet_identity'],'Unknown sheet is review only, not automatically relinked.');
eq(report.cases[2].types,['inconsistent_create_marker'],'Mismatched marker is review only.');
eq(report.permanent_rows_examined,4,'Configured-sheet clean and conflicted identities are counted.');
eq(report.linked_records_examined,6,'Different-sheet links are scanned but not mislabeled collisions.');
eq(report.attempt_records_examined,6,'Other-sheet attempts do not trigger a false positive.');
const shared=auditSalesPermanentRowOwners(
 [linked('a','100'),linked('b','100','')],
 [],sheet);
eq(shared.competing_row_count,1,'Unknown-sheet legacy row with matching permanent ID is treated conservatively.');
eq(shared.missing_sheet_count,1,'Incomplete legacy sheet gets a separate warning.');
eq(auditSalesPermanentRowOwners([],[attempt('a','900'),attempt('b','900')],sheet).competing_row_count,
  1,'Two create reservations with same permanent ID are detected before linked IDs exist.');
eq(auditSalesPermanentRowOwners([linked('a','555')],[attempt('a','555')],sheet).review_count,0,
  'Correctly self-linked durable attempt produces no duplicate warning.');
eq(auditSalesPermanentRowOwners([linked('a','555')],[attempt('a','666')],sheet).marker_mismatch_count,
  1,'WorkOrder marker and top-level linked identity disagreement is flagged.');
eq(auditSalesPermanentRowOwners([linked('a','555')],[attempt('a','666')],sheet).review_count,
  1,'Linked ID inconsistency is reported at the linked identity.');
const splitMismatch=auditSalesPermanentRowOwners(
  [linked('a','555')],[attempt('a','666')],sheet);
eq(splitMismatch.cases[0].row_id,'555',
  'Mismatch from separate linked/attempt scans is attached to the authoritative linked row.');
eq(splitMismatch.cases[0].types,['inconsistent_create_marker'],
  'Separate scans with one owner do not manufacture a competing-WorkOrders collision.');
eq(auditSalesPermanentRowOwners(
  [linked('a','555')],[attempt('a','555',sheet)],sheet).review_count,0,
  'Matching split-projection identities do not produce false positives.');
eq(auditSalesPermanentRowOwners(
  [linked('a','555','')],[attempt('a','555','')],sheet).cases[0].types,
  ['missing_sheet_identity'],
  'Two legacy missing-sheet projections are a missing identity, not a marker disagreement.');
eq(auditSalesPermanentRowOwners(
  [linked('a','555')],[attempt('a','555','999')],sheet).cases[0].types,
  ['inconsistent_create_marker'],
  'Wrong-sheet durable marker is detected even if its row is filtered from configured-sheet groups.');
eq(auditSalesPermanentRowOwners(
  [linked('a','555','')],[attempt('a','555',sheet)],sheet).cases[0].types,
  ['missing_sheet_identity'],
  'A known marker sheet does not falsely contradict an unknown legacy link sheet.');
eq(auditSalesPermanentRowOwners([], [attempt('m','100','')],sheet).missing_sheet_count,
  1,'Missing marker sheet identity is visible even without a linked WorkOrder.');
const all=Array.from({length:45},(_,i)=>linked('owner-'+i,'99'));
eq(auditSalesPermanentRowOwners(all,[],sheet).cases[0].workorder_ids.length,20,
  'Exposed WorkOrder ID samples are bounded.');
yes(auditSalesPermanentRowOwners(all,[],sheet).cases[0].owners_truncated,
  'Truncated owner identity list is labeled.');
const findings=Array.from({length:35},(_,i)=>linked('owner-'+i,'99'+String(i),''));
const limited=auditSalesPermanentRowOwners(findings,[],sheet);
eq(limited.review_count,35,'Complete review total preserves all 35 findings.');
eq(limited.cases.length,30,'Admin display contains bounded case page.');
yes(limited.cases_truncated,'Case truncation disclosed explicitly.');
for(const entry of [null,{},'text'])fail(()=>auditSalesPermanentRowOwners(entry,[],sheet),/Complete linked/);
for(const badId of ['',0,'abc'])fail(()=>auditSalesPermanentRowOwners([],[],badId),/numeric/);
fail(()=>auditSalesPermanentRowOwners([{smartsheet_row_id:'99'}],[],sheet),/Unidentified/);
fail(()=>auditSalesPermanentRowOwners([],[{smartsheet_create_attempt:{row_id:'99'}}],sheet),/Unidentified/);
const source=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
const persistence=readFileSync('src/components/admin/smartsheetSyncPersistence.js','utf8');
const ui=readFileSync('src/components/sales/SalesCreateAttemptReview.jsx','utf8');
const action=source.slice(source.indexOf("if (action === 'audit_sales_permanent_ownership')"),
  source.indexOf("if (action === 'audit_sales_create_attempts'"));
yes(action.includes("!hasSessionToken || adminActor?.role !== 'admin'"),
  'Only authenticated administrators may run the complete read-only audit.');
yes(action.includes("query:{smartsheet_row_id:{$exists:true}}") &&
  action.includes("query:{smartsheet_create_attempt:{$exists:true}}"),
  'Backend scans only linked and create-marker populations, not full legacy archives.');
yes(action.includes('loadAllEntityRows({entity,query:') &&
  action.includes('auditSalesPermanentRowOwners(links,attempts,sheetId)'),
  'Bounded pagination must finish before classifying ownership.');
yes(!action.includes('updateMany(') && !action.includes('bulkCreate(') &&
  !action.includes('smartsheetWrite('),'Audit cannot mutate WorkOrders or Smartsheet.');
yes(persistence.includes('audit_sales_permanent_ownership') &&
  persistence.includes('result.unique_constraint_verified!==false'),
  'Client requires read-only evidence and explicitly unverified uniqueness.');
yes(ui.includes('Audit permanent row ownership') && ui.includes('No uniqueness constraint has been verified.'),
  'Admin UI labels the audit as evidence rather than a uniqueness guarantee.');
console.log('Sales permanent row ownership full-coverage audit: '+n+'/'+n+' PASS.');
