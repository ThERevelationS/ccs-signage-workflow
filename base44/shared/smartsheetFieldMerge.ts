import { buildSnapshot, buildSalesPullSnapshot, buildOrderPullSnapshot, parseRowToFields } from './smartsheetSyncFields.ts';
import { valueHash, verifiedLocalFieldTime, trackedConditionalSave, preview } from './fieldAudit.ts';
import { readRemoteFieldHistory } from './smartsheetCellHistory.ts';
import { canonicalBase44SalesAssignee } from './smartsheetSalesAssigneeTranslation.mjs';
import { latestVerifiedOrderColumnEditTime, orderPreservedRemoteBlankNeedsReview } from './smartsheetOrderBlankSafety.mjs';

const text = v=>String(v ?? '').trim();
function same(a,b) { return text(a)===text(b) || a!=null && b!=null && text(a)!=='' && text(b)!=='' && Number.isFinite(Number(a)) && Number(a)===Number(b); }
function historyValue(event, field) { return ['estimate_amount','est_inv_at'].includes(field)?event.value ?? event.displayValue:event.displayValue ?? event.value; }
export async function planFieldPush({base44, record, dataset, bindings, remoteRow, rawSheet, get, cells, salesReviews, queueSalesReview}) {
  const type=dataset==='sales'?'WorkOrder':'Order';
  const remote=dataset==='sales'?buildSalesPullSnapshot(remoteRow,bindings):buildOrderPullSnapshot(remoteRow,bindings);
  const local=buildSnapshot(record,bindings,dataset), prior=record.smartsheet_sync_snapshot || {};
  const outgoing=[], incoming={}, timestamps={}, decisions=[], unresolved=[];
  const parsed=parseRowToFields(remoteRow,bindings,dataset);
  for(const cell of cells) {
    const column=String(cell.columnId), fields=Object.keys(bindings).filter(f=>String(bindings[f])===column), field=fields[0];
    if(!field)throw new Error('Field mapping could not be verified.');
    if(!rawSheet.columns?.some(c=>String(c.id)===column))throw new Error('Mapped column metadata is missing; no row was written.');
    let a=local[column]; const b=remote[column], known=Object.prototype.hasOwnProperty.call(prior,column);
    if(same(a,b))continue;
    if(field==='notes_serialized' && record.work_notes?.length===1 && record.work_notes[0].text===String(b ?? '')) {
      const audit=(await base44.asServiceRole.entities.FieldAudit.filter({entity_type:type,entity_id:record.id,field_name:'work_notes',status:'committed'},{sort:'-created_date',limit:1})).items[0];
      if(audit?.source==='smartsheet' && audit.value_hash===await valueHash(record.work_notes))a=b;
    }
    if(same(a,b))continue;
    const localChanged=!known || !same(a,prior[column]), remoteChanged=!known || !same(b,prior[column]);
    let winner='', localAt='', remoteAt='', reason='';
    const rawCell=rawSheet.rows?.find(r=>String(r.id)===remoteRow.id)?.cells?.find(c=>String(c.columnId)===column);
    if([rawCell?.value,rawCell?.displayValue].some(v=>typeof v==='string' && v.length>4000))throw new Error('A remote cell exceeds the safe sync length. Neither version was truncated or overwritten.');
    let preservedBlankNeedsReview=false;
    if(dataset==='orders' && known && text(a) && !text(b) && !text(prior[column])) {
      const fieldTimes=[];
      for(const candidateField of fields) fieldTimes.push(await verifiedLocalFieldTime(base44,type,record,candidateField));
      localAt=latestVerifiedOrderColumnEditTime(fieldTimes);
      preservedBlankNeedsReview=orderPreservedRemoteBlankNeedsReview({
        localValue:a,
        remoteValue:b,
        priorValue:prior[column],
        lastSyncedAt:record.smartsheet_last_synced_at,
        localEditedAt:localAt,
      });
      if(preservedBlankNeedsReview) {
        reason='Smartsheet is blank while Base44 retains an older nonblank value. That Base44 field has no verified edit after the blank was observed, so Save & Sync will not repopulate Smartsheet without review.';
      }
    }
    // Order snapshots written before remote DATE cells were captured stored ''
    // for every date column. A blank baseline with both sides nonblank cannot
    // prove which side changed, so the date must go to conflict review.
    const legacyOrderDateBaselineNeedsReview=dataset==='orders' &&
      ['date_needed','date_ordered','date_received'].includes(field) &&
      !text(prior[column]) && text(a) && text(b) && !same(a,b);
    if(legacyOrderDateBaselineNeedsReview) {
      reason='The saved sync baseline predates date tracking, so it cannot prove which side changed this date. Choose the correct value.';
    }
    if(preservedBlankNeedsReview || legacyOrderDateBaselineNeedsReview) {
      // Deliberately leave winner empty so the normal conflict/review path below
      // preserves both values. An approved review can still choose either side.
    } else if(known && !remoteChanged)winner='app';
    else {
      // Smartsheet is the primary source of truth and wins all conflicts.
      // When the baseline is missing/unknown (fresh import), adopt the
      // Smartsheet value and update the baseline. When both local and remote
      // changed from a known baseline, Smartsheet still wins. No SyncConflict
      // record is created in either case.
      winner='smartsheet';
    }
    const identity=dataset==='sales'?[dataset,record.id,column,a,b]:[dataset,record.id,column,record.updated_date,remoteRow.modified_at,a,b];
    const key=await valueHash(identity);
    const approvals=dataset==='sales' && salesReviews ? salesReviews.filter(r=>r.entity_id===record.id && r.column_id===column && r.local_value===preview(a??'') && r.remote_value===preview(b??'')) : (await base44.asServiceRole.entities.SyncConflict.filter({conflict_key:key},{limit:2})).items;
    if(approvals.length>1)throw new Error('Duplicate field reviews require admin attention.');
    if(approvals[0]?.status==='approved') { winner=approvals[0].decision; decisions.push(approvals[0].id); }
    if(!winner) {
      if(dataset==='sales' && queueSalesReview) {
        queueSalesReview({conflict_key:key,dataset,entity_id:record.id,record_label:record.client_name||record.title||record.id,field_name:field,field_label:field.replace(/_/g,' '),sheet_id:record.smartsheet_sheet_id,row_id:record.smartsheet_row_id,column_id:column,local_value:preview(a??''),remote_value:preview(b??''),baseline_value:known?preview(prior[column]??''):'Unknown',local_modified_at:localAt,remote_modified_at:remoteAt,local_version:record.updated_date,remote_version:remoteRow.modified_at||'',reason:reason||'Both versions differ; choose which value to keep.',status:'open'});
        unresolved.push(field); continue;
      }
      await base44.asServiceRole.entities.SyncConflict.updateMany({dataset,entity_id:record.id,column_id:column,status:{$in:['open','approved']},conflict_key:{$ne:key}},{$set:{status:'superseded'}});
      if(!approvals.length)await base44.asServiceRole.entities.SyncConflict.upsert([{conflict_key:key,dataset,entity_id:record.id,record_label:record.client_name||record.customer_name||record.title||record.id,
        field_name:field,field_label:field.replace(/_/g,' '),sheet_id:record.smartsheet_sheet_id,row_id:record.smartsheet_row_id,column_id:column,
        local_value:preview(a??''),remote_value:preview(b??''),baseline_value:known?preview(prior[column]??''):'Unknown',local_modified_at:localAt,remote_modified_at:remoteAt,
        local_version:record.updated_date,remote_version:remoteRow.modified_at||'',reason,status:'open'}],{key:'conflict_key'});
      unresolved.push(field); continue;
    }
    if(winner==='app') { if(rawCell?.formula)throw new Error('This Smartsheet cell contains a formula. Remove or change it in Smartsheet before choosing the app value.'); outgoing.push(cell); }
    else if(field==='notes_serialized') {
      // Preserve original text losslessly; do not invent note authors or dates.
      incoming.work_notes=text(b)?[{id:crypto.randomUUID(),type:'other',text:String(b),sub_tasks:[]}]:[];
      if(remoteAt)timestamps.work_notes=remoteAt;
    } else {
      for(const f of fields)incoming[f]=Object.prototype.hasOwnProperty.call(parsed,f)?parsed[f]:f==='estimate_amount'?null:'';
      if(dataset==='sales' && field==='current_task_assigned_to' && text(b)) {
        const users=(await base44.asServiceRole.entities.AuthorizedEmail.filter({sales_roles:{$in:['Task Assigned']}},{limit:100,fields:['full_name','email','sales_roles']})).items;
        const resolved=canonicalBase44SalesAssignee(b,users);
        if(!resolved.name){delete incoming.current_task_assigned_to;continue;}
        incoming.current_task_assigned_to=resolved.name;
      }
      if(dataset==='orders') {
        const pair=({date_needed:'date_needed_option',date_ordered:'date_ordered_option',date_received:'receipt_option'})[field];
        if(pair)incoming[pair]=parsed[pair]||'';
      }
      for(const f of Object.keys(incoming))if(remoteAt)timestamps[f]=remoteAt;
    }
  }
  return {outgoing,incoming,timestamps,decisions,unresolved,remote};
}
export async function recordFieldPullHolds({base44,record,dataset,bindings,remoteRow}) {
  // Smartsheet is the primary source of truth and wins all conflicts.
  // Pending local edits are preserved during pull (the caller skips the
  // update), and the push step reconciles them with the Smartsheet-wins
  // policy. No SyncConflict records are created for baseline-unknown or
  // both-changed fields.
}
export async function applyMergedLocalFields(base44,dataset,record,plan) {
  if(!Object.keys(plan.incoming).length)return record;
  return trackedConditionalSave(base44,dataset==='sales'?'WorkOrder':'Order',record,plan.incoming,{full_name:'Smartsheet field reconciliation'},'smartsheet',plan.timestamps);
}