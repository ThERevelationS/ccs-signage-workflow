import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { salesRunRequiresReview } from '../base44/shared/smartsheetSalesSafety.mjs';
import {
  classifySalesPullCreateAttemptRisks,
  readSalesPullCreateAttemptRisks,
  classifySalesPullLinkedRowRisks,
  readSalesPullLinkedRowRisks,
} from '../base44/shared/smartsheetSalesPullCreateRisk.mjs';

let checks = 0;
function yes(value, label) { assert.ok(value, label); checks++; }
function equal(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
const sheetId = '8702703019812740';
const alternateSheet = '8702703019812741';
const reserved = {id:'wo-reserved',updated_date:'r1',in_pipeline:true,
  smartsheet_create_attempt:{status:'reserved',sheet_id:sheetId,attempt_id:'attempt-1',
    expected_snapshot:{'111':'Owner'}}};
const acknowledged = {id:'wo-known-row',updated_date:'r2',
  smartsheet_create_attempt:{status:'created_unlinked',sheet_id:sheetId,
    attempt_id:'attempt-2',row_id:'90555',expected_snapshot:{'111':'Owner'}}};
const linked = {id:'wo-linked',smartsheet_sheet_id:sheetId,smartsheet_row_id:'90888',
  smartsheet_create_attempt:{status:'linked',sheet_id:sheetId,row_id:'90888'}};
const crossSheet = {id:'wo-other',smartsheet_create_attempt:{status:'reserved',sheet_id:alternateSheet}};
const invalidLinked = {id:'wo-incomplete-link',smartsheet_sheet_id:sheetId,smartsheet_row_id:'90000',
  smartsheet_create_attempt:{status:'linked',sheet_id:sheetId,row_id:'90001'}};
const unknownSheet = {id:'wo-unknown-sheet',smartsheet_create_attempt:{status:'reserved',
  sheet_id:'broken-sheet-id'}};
const deleted = {id:'wo-softdeleted',deleted:true,
  smartsheet_create_attempt:{status:'reserved',sheet_id:sheetId}};
const unknownBelongsElsewhere = {id:'wo-uncertain-but-other',smartsheet_sheet_id:alternateSheet,
  smartsheet_create_attempt:{status:'reserved'}};

let result = classifySalesPullCreateAttemptRisks([
  reserved,acknowledged,linked,crossSheet,invalidLinked,
  unknownSheet,deleted,unknownBelongsElsewhere,{id:'older-unlinked-no-marker'},
],sheetId);
equal(result.count,5,
  'Reserved, known-row-unlinked, malformed, inconsistent, and soft-deleted attempts require review.');
equal(result.workorder_ids,['wo-reserved','wo-known-row','wo-incomplete-link',
  'wo-unknown-sheet','wo-softdeleted'], 'Review identifies WorkOrders without guessing customer names.');
equal(result.attempt_states,{reserved:3,created_unlinked:1,linked:1},
  'Review summarizes durable attempt states, including inconsistent linked evidence.');
equal(result.known_permanent_row_ids,['90555','90001'],
  'Existing permanent IDs appear only as review evidence, not as inferred matches.');
equal(classifySalesPullCreateAttemptRisks([crossSheet,linked],sheetId).count,0,
  'A different-sheet attempt and exact completed link do not block this sheet.');
equal(classifySalesPullCreateAttemptRisks([unknownBelongsElsewhere],sheetId).count,0,
  'Missing attempt sheet ID with a trustworthy different-sheet link stays outside scope.');
equal(classifySalesPullCreateAttemptRisks([{id:'no-row',
  smartsheet_create_attempt:{status:'unexpected',sheet_id:sheetId}}],sheetId).count,1,
  'Unknown attempt state is held for review instead of automatically trusted.');
equal(classifySalesPullCreateAttemptRisks([],sheetId).count,0,
  'Empty reviewed attempt set permits normal import.');
assert.throws(()=>classifySalesPullCreateAttemptRisks([],'not-numeric'),/sheet ID/);
checks++;

const calls=[];
const entity={async filter(query,sort,limit,skip){
  calls.push({query,sort,limit,skip});
  return [
    ...Array.from({length:498},(_,i)=>({id:'linked-'+i,
      smartsheet_sheet_id:sheetId,smartsheet_row_id:String(70000+i),
      smartsheet_create_attempt:{status:'linked',sheet_id:sheetId,row_id:String(70000+i)}})),
    reserved,acknowledged,
    linked,crossSheet,invalidLinked,
  ].slice(skip,skip+limit);
}};
const paged=await readSalesPullCreateAttemptRisks(entity,sheetId);
equal(paged.count,3,'Paged durable marker scan spans the first 500 WorkOrders and the next page.');
yes(calls.length===2 && calls[0].skip===0 && calls[1].skip===500,
  'Production review uses bounded pagination, not an incomplete first 500 rows.');
equal(calls[0].query,{smartsheet_create_attempt:{$exists:true}},
  'Creation evidence is discovered by its marker, not a top-level Smartsheet link or all-history list.');
equal(calls[0].sort,'id','Durable attempt review pages through a stable sort.');
await assert.rejects(readSalesPullCreateAttemptRisks({async filter(){throw new Error('Query unavailable');}},sheetId),
  /Query unavailable/);
checks++;
await assert.rejects(readSalesPullCreateAttemptRisks({async filter(){return {items:[reserved]};}},sheetId),
  /could not be verified completely/);
checks++;

const planned=['90555','90556'];
const legacyLinked={id:'legacy-linked',smartsheet_row_id:'90555',smartsheet_sheet_id:''};
const malformedSheetLinked={id:'legacy-malformed',smartsheet_row_id:'90556',smartsheet_sheet_id:'unknown'};
const unrelatedSheetLinked={id:'other-sheet',smartsheet_row_id:'90555',smartsheet_sheet_id:alternateSheet};
const softDeletedLinked={id:'deleted-linked',smartsheet_row_id:'90555',deleted:true};
const linkRisks=classifySalesPullLinkedRowRisks([
  legacyLinked,malformedSheetLinked,unrelatedSheetLinked,softDeletedLinked,
  {id:'unrelated-row',smartsheet_row_id:'99999',smartsheet_sheet_id:sheetId},
],sheetId,planned);
equal(linkRisks.count,3,'Legacy, malformed-sheet, and deleted linked WorkOrders block duplicate Sales imports.');
equal(linkRisks.workorder_ids,['legacy-linked','legacy-malformed','deleted-linked'],
  'Linked claim review includes bounded permanent WorkOrder identities.');
equal(linkRisks.known_permanent_row_ids,planned,
  'Only exact planned permanent row IDs are reported.');
equal(classifySalesPullLinkedRowRisks([unrelatedSheetLinked],sheetId,['90555']).count,0,
  'A verified other-sheet row with the same numeric ID does not block this sheet.');
equal(classifySalesPullLinkedRowRisks([linked],sheetId,['90888']).count,1,
  'A matching configured-sheet link is never duplicated during import.');
equal(classifySalesPullLinkedRowRisks([],sheetId,planned).count,0,
  'Clean complete linked scan permits normal Sales import.');
assert.throws(()=>classifySalesPullLinkedRowRisks([{}],sheetId,['']),/exact permanent row IDs/);checks++;
assert.throws(()=>classifySalesPullLinkedRowRisks([{smartsheet_row_id:'123'}],sheetId,['123']),
  /Unidentified WorkOrder/);checks++;
equal(classifySalesPullLinkedRowRisks([{}],sheetId,['123']).count,0,
  'Unlinked records do not constitute permanent row claims.');
const linkedCalls=[];
const linkedEntity={async filter(query,sort,limit,skip){
  linkedCalls.push({query,sort,limit,skip});
  return [...Array.from({length:500},(_,i)=>({id:'other-'+i,smartsheet_row_id:String(80000+i)})),
    legacyLinked].slice(skip,skip+limit);
}};
const linkedPaged=await readSalesPullLinkedRowRisks(linkedEntity,sheetId,['90555']);
equal(linkedPaged.count,1,'Legacy permanent row on page two blocks import.');
yes(linkedCalls.length===2 && linkedCalls[1].skip===500,
  'Existing link scan requires all pages, not just the first 500 records.');
equal(linkedCalls[0].query,{smartsheet_row_id:{$exists:true}},
  'Linked owner scan includes missing-sheet legacy WorkOrders.');
await assert.rejects(readSalesPullLinkedRowRisks({async filter(){return {items:[]};}},sheetId,planned),
  /could not be verified completely/);checks++;
await assert.rejects(readSalesPullLinkedRowRisks({async filter(){throw Error('read unavailable');}},sheetId,planned),
  /read unavailable/);checks++;
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
yes(backend.includes('readSalesPullCreateAttemptRisks(base44.asServiceRole.entities.WorkOrder, sheetId)'),
  'Production pull reads unresolved Sales create markers independently of linked WorkOrders.');
const scanIndex=backend.indexOf('salesCreateAttemptReview = await readSalesPullCreateAttemptRisks');
const bulkCreateIndex=backend.indexOf('const result = await base44.asServiceRole.entities[entityName].bulkCreate(batch);',scanIndex);
const gateIndex=backend.indexOf('if (salesCreateAttemptReview.count > 0)',scanIndex);
yes(scanIndex>=0 && gateIndex>scanIndex && bulkCreateIndex>gateIndex,
  'Unresolved attempt review gates Sales bulkCreate before any new WorkOrder mutation.');
yes(backend.includes('if (i > 0) salesCreateAttemptReview = await readSalesPullCreateAttemptRisks'),
  'Later Sales create batches recheck durable markers rather than trusting one old preflight.');
yes(backend.includes('salesLinkedClaimReview = await readSalesPullLinkedRowRisks(') &&
  backend.indexOf('salesLinkedClaimReview = await readSalesPullLinkedRowRisks(') <
  backend.indexOf('bulkCreate(batch);',scanIndex),
  'Every Sales import batch independently verifies legacy-aware permanent row ownership before creating.');
yes(backend.includes('if (salesLinkedClaimReview.count > 0)') &&
  backend.includes('new_workorder_imports_held_for_link_review: salesImportLinkedCreatesHeld') &&
  backend.includes('existing_link_claim_workorder_ids: salesLinkedClaimReview.workorder_ids'),
  'Linked-row overlaps hold new imports and expose bounded exact-ID review evidence.');
yes(backend.includes('salesImportCreatesHeld = toCreate.length - i') &&
  backend.includes('new_workorder_imports_held_for_create_review: salesImportCreatesHeld'),
  'Blocked new Sales imports are counted and surfaced explicitly.');
yes(backend.includes('create_attempt_workorder_ids: salesCreateAttemptReview.workorder_ids') &&
  backend.includes('create_attempt_states: salesCreateAttemptReview.attempt_states') &&
  backend.includes('create_attempt_known_row_ids: salesCreateAttemptReview.known_permanent_row_ids'),
  'Pull result exposes bounded workorder, state, and permanent-ID review metadata.');
yes(backend.includes('automatic_create_relink_attempted: false'),
  'Pull never pretends to reconcile or auto-link uncertain Sales create attempts.');
yes(backend.includes('const toUpdate: any[] = []') &&
  backend.includes('for (let i = 0; i < toUpdate.length; i += bulkBatchSize)'),
  'Linked updates remain on their existing independent pull path.');
const orderGuard=backend.indexOf('if (dataset === \'orders\') {\n    const unresolved = existingRecords.filter(orderSmartsheetCreateNeedsReview)');
yes(orderGuard>=0,'Existing Order Form uncertainty protection is preserved.');
yes(salesRunRequiresReview([{dataset:'sales',direction:'pull',created:0,updated:3,
  create_attempts_need_review:1,new_workorder_imports_held_for_create_review:0,errors:0}]),
  'Even when no new imports were planned, an unresolved Sales creation attempt marks the run Needs Review.');
yes(salesRunRequiresReview([{dataset:'sales',direction:'pull',created:0,updated:3,
  create_attempts_need_review:1,new_workorder_imports_held_for_create_review:2,errors:1}]),
  'Partial linked updates plus held imports still report overall Sales sync as needing review.');
yes(salesRunRequiresReview([{dataset:'sales',direction:'pull',created:0,updated:3,
  existing_link_claims_need_review:1,new_workorder_imports_held_for_link_review:2,errors:0}]),
  'Overlapping legacy permanent links make the Sales pull require review.');
yes(!salesRunRequiresReview([{dataset:'sales',direction:'pull',created:0,updated:3,
  create_attempts_need_review:0,new_workorder_imports_held_for_create_review:0,errors:0}]),
  'A clean Sales pull is not mislabeled Needs Review by the new guard.');
const admin=readFileSync('src/components/admin/SmartsheetSyncSettings.jsx','utf8');
yes(admin.includes('r.direction === "pull" && Number(r.create_attempts_need_review) > 0') &&
  admin.includes('new_workorder_imports_held_for_create_review'),
  'Admin sync result displays held new-workorder count only for affected Sales pull.');
yes(admin.includes('create_attempt_workorder_ids.join(", ")') &&
  admin.includes('create_attempt_known_row_ids.join(", ")') &&
  admin.includes('Object.entries(r.create_attempt_states)'),
  'Admin result exposes bounded IDs and attempt states without guessing permanent ownership.');
yes(admin.includes('r.existing_link_claims_need_review') &&
  admin.includes('r.existing_link_claim_workorder_ids.join(", ")') &&
  admin.includes('r.existing_link_claim_row_ids.join(", ")'),
  'Admin Sales sync result displays permanent-row overlap without offering automatic relinking.');
console.log('Sales pull unresolved-create duplicate prevention: '+checks+'/'+checks+' PASS.');
