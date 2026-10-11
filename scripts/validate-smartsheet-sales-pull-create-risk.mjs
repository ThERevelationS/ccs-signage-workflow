import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { salesRunRequiresReview } from '../base44/shared/smartsheetSalesSafety.mjs';
import {
  classifySalesPullCreateAttemptRisks,
  readSalesPullCreateAttemptRisks,
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
console.log('Sales pull unresolved-create duplicate prevention: '+checks+'/'+checks+' PASS.');
