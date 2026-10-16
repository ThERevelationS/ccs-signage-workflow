import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { equivalent, trackedConditionalSave } from '../../shared/fieldAudit.ts';
import { readRemoteFieldHistory } from '../../shared/smartsheetCellHistory.ts';
import { measuredSmartsheetFetch, measureSyncEntities, observeSmartsheetBody } from '../../shared/smartsheetTraceIO.ts';
import { tracedSyncRequest, beginSyncTraceStorage } from '../../shared/smartsheetTraceLifecycle.ts';
import { filterSalesColumnBindings } from '../../shared/smartsheetSalesSafety.mjs';
import { validateNeutralSalesCloseout } from '../../shared/salesNeutralCloseoutGuard.mjs';
import { validateSalesStageTimestampPatch } from '../../shared/salesStageTimestampGuard.mjs';
import { validateSalesActivityTimestampPatch } from '../../shared/salesActivityTimestampGuard.mjs';
import { SALES_OPPORTUNITY_HISTORY_FIELDS, mergeSalesOpportunityHistory } from '../../shared/salesOpportunityHistory.mjs';

const optionalFields = new Set(('title client_name customer_name customer_id work_order_id description quantity request_type requestor_email requestor_name date_needed date_needed_option date_ordered date_ordered_option vendor date_received receipt_option status row_number current_stage priority assigned_to notes work_notes follow_up due_date start_date is_rider parent_work_order_id rider_stage completed asap in_pipeline sales_status lead_source current_task_deadline current_task_assigned_to designer surveyor site_survey_date site_survey_time site_survey_am_pm project_manager estimator est_inv_at estimate_amount current_task_description date_initial_contact date_estimate_sent date_order_created project_install_date permit_submitted_date permit_receipt_confirmed_date permit_number permit_approved_date actual_cost profit_margin contact_name contact_email contact_phone representative additional_contact follow_up_date sales_last_follow_up_completed_at sales_last_follow_up_outcome close_date expected_close_date sales_last_activity_at sales_stage_changed_at sales_neutral_closed_at lost_reason project_type install_location address_line_2 billing_address billing_address_line_2 sales_rep permitting township_city county permit_code permit_class property_owner pud parcel_number electrical_ibi electrical_nkyei electrical_nec electrical_city electrical_county customer_is_building_owner customer_is_tenant customer_is_marketing_co business_co_coo_reminder business_co_coo_date install_yes install_no budget_less_than removal_yes removal_no service_repair origination patch paint color products product_1 product_2 product_3 product_4 product_5 product_6 cb_complete cf_complete cc_complete sms_complete production_type sip_checklist mmm_sip_checklist mmm_checklist sip_completed sip_revisit_date image_url files google_drive_folder_url google_drive_file_ids corbridge_invoice_number corbridge_link estimate_id milestones project_health health_override health_notes dependencies').split(' '));
function cincinnatiDateStamp(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDateStamp(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number), parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year && parsed.getUTCMonth()===month-1 && parsed.getUTCDate()===day;
}
// A configured SIPS/WIP task can be unassigned while its Work Order fields
// remain unchanged. Recheck current task eligibility on guarded checklist saves.
async function verifyGuardedSipsTaskEligibility(base44, record) {
  if (record.completed === true || record.is_rider === true) {
    throw Object.assign(new Error('This Work Order is no longer active for SIPS. Close the checklist and refresh the SIPS board. Nothing was saved.'), {status:409});
  }
  if (record.current_task_assigned_to === 'SIPs') return;
  const result = await base44.asServiceRole.entities.GlobalSettings.filter({setting_key:'salesTaskDescriptions'}, {limit:2});
  const rows = result?.items;
  if (!Array.isArray(rows) || rows.length > 1 || (rows.length === 1 && !Array.isArray(rows[0]?.setting_value?.items))) {
    throw Object.assign(new Error('SIPS task configuration could not be verified. No checklist changes were saved. Review task settings before retrying.'), {status:409});
  }
  const configured = (rows[0]?.setting_value?.items || []).some(item =>
    record.current_task_description && item?.text === record.current_task_description && (item.page === 'SIPs' || item.wip)
  );
  if (!configured) {
    throw Object.assign(new Error('This task is no longer configured for SIPS or WIP. Nothing was saved. Close the checklist and refresh the SIPS board.'), {status:409});
  }
}
async function fieldHistoryHandler(req) {
  try {
    const base44=measureSyncEntities(createClientFromRequest(req)), body=await req.json();
    const actor=body.session_token ? await authenticateSignShopSession(base44,body.session_token) : await base44.auth.me();
    if(!actor || !['admin','user'].includes(actor.role))return Response.json({error:'Sign in to access field history.'},{status:401});
    const type=body.entity_type;
    if(!['WorkOrder','Order'].includes(type) || !/^[A-Za-z0-9_-]{6,80}$/.test(String(body.entity_id||'')))return Response.json({error:'Invalid record.'},{status:400});
    await beginSyncTraceStorage(base44);
    const entity=base44.asServiceRole.entities[type], record=await entity.get(body.entity_id);
    if(!record)return Response.json({error:'Record not found.'},{status:404});
    if(type==='WorkOrder' && body.action==='sales_history') {
      // Bounded, independent source cursors. A 35-row page from each source
      // yields at most 70 merged entries, so none are lost to the 75-entry
      // merge cap. Never fetch the full legacy archive in a single request.
      const page=body.history_page ?? null;
      if(page!==null && (typeof page!=='object' || Array.isArray(page)))
        throw Object.assign(new Error('Invalid Sales history page.'),{status:400});
      const validCursor=value=>typeof value==='string' && value.length>0 && value.length<=4096;
      const auditDone=page?.audit_exhausted===true, legacyDone=page?.legacy_exhausted===true;
      if(page && ((!auditDone && !validCursor(page.audit_cursor)) ||
                  (!legacyDone && !validCursor(page.legacy_cursor))))
        throw Object.assign(new Error('Sales history page expired. Reload the history from the beginning.'),{status:400});
      const scope={entity_type:'WorkOrder',entity_id:record.id,
        field_name:{$in:SALES_OPPORTUNITY_HISTORY_FIELDS}};
      const empty={items:[],has_more:false};
      const [audit,legacy]=await Promise.all([
        auditDone ? empty : base44.asServiceRole.entities.FieldAudit.filter({...scope,status:'committed'},
          {sort:'-modified_at',limit:35,...(page?{cursor:page.audit_cursor}:{})}),
        legacyDone ? empty : base44.asServiceRole.entities.CellHistory.filter(scope,
          {sort:'-created_date',limit:35,...(page?{cursor:page.legacy_cursor}:{})}),
      ]);
      if(!Array.isArray(audit?.items) || !Array.isArray(legacy?.items))
        throw Object.assign(new Error('Sales history could not be verified. Reload and retry.'),{status:503});
      const nextAudit= !auditDone && audit.has_more===true;
      const nextLegacy= !legacyDone && legacy.has_more===true;
      if((nextAudit && !validCursor(audit.next_cursor)) ||
         (nextLegacy && !validCursor(legacy.next_cursor)))
        throw Object.assign(new Error('Sales history pagination could not be verified. Reload the history.'),{status:503});
      return Response.json({success:true,entries:mergeSalesOpportunityHistory(audit.items,legacy.items),
        pagination:{
          audit_cursor:nextAudit?audit.next_cursor:'',
          legacy_cursor:nextLegacy?legacy.next_cursor:'',
          audit_exhausted:!nextAudit,
          legacy_exhausted:!nextLegacy,
          has_more:nextAudit||nextLegacy,
        }});
    }
    if(body.action==='save') {
      const patch={...(body.next_fields||{})}, expected=body.expected_fields;
      if(!patch || !expected || !Object.keys(patch).length || Array.isArray(patch))throw Object.assign(new Error('A field update and its baseline are required.'),{status:400});
      if(record.deleted===true)throw Object.assign(new Error('This record is in Trash. Restore it first.'),{status:409});
      for(const [f,v] of Object.entries(patch)) {
        if(!optionalFields.has(f) && !(type==='Order' && f==='smartsheet_pending_local_sync' && v===true))throw Object.assign(new Error('This field cannot be edited through field history: '+f),{status:400});
        if(!Object.prototype.hasOwnProperty.call(expected,f))throw Object.assign(new Error('Missing loaded field baseline: '+f),{status:400});
        if(!equivalent(record[f],expected[f]) && !equivalent(record[f],v))throw Object.assign(new Error('This field changed in another session: '+f+'. Reload before saving.'),{status:409});
      }
      for(const [f,v] of Object.entries(body.guard_fields||{}))if(!equivalent(record[f],v))throw Object.assign(new Error('The record no longer matches its loaded state.'),{status:409});
      if(type==='WorkOrder') {
        validateNeutralSalesCloseout(record,patch,equivalent);
        // A stage clock may move only with an actual Sales status change.
        // This server-side guard applies to Sales quick edit, Opportunity
        // Detail, and any direct regular-user fieldHistory mutation.
        validateSalesStageTimestampPatch(record,patch,equivalent);
        // Independent server check: ordinary WorkOrder edits must not forge
        // the Sales-only activity clock used by stale-opportunity alerts.
        validateSalesActivityTimestampPatch(record,patch,equivalent);
      }
      if(type==='WorkOrder' && Object.prototype.hasOwnProperty.call(patch,'date_estimate_sent')) {
        const nextQuoteDate=String(patch.date_estimate_sent||'').slice(0,10);
        const today=cincinnatiDateStamp();
        if(nextQuoteDate && !validDateStamp(nextQuoteDate))throw Object.assign(new Error('Quote sent date must be a valid calendar date.'),{status:400});
        if(nextQuoteDate && nextQuoteDate>today)throw Object.assign(new Error('Quote sent date cannot be in the future.'),{status:400});
        patch.sales_quote_sent_verified_at=nextQuoteDate ? new Date().toISOString() : '';
      }
      if(Object.entries(patch).every(([f,v])=>equivalent(record[f],v)))return Response.json({success:true,record});
      if(body.expected_version && body.expected_version!==record.updated_date)throw Object.assign(new Error('The record changed. Reload before saving.'),{status:409});
      if(type==='Order')patch.smartsheet_pending_local_sync=true;
      // Read SIPS/WIP settings at the last available pre-write boundary.
      // Settings can change independently of Work Orders; this minimizes the
      // check-to-write interval but cannot atomically fence both entities.
      // Keep unrelated Order and Work Order saves on their existing path.
      if(type==='WorkOrder' && Object.prototype.hasOwnProperty.call(patch,'sip_checklist') &&
        ['current_task_assigned_to','current_task_description','sip_completed'].every(field =>
          Object.prototype.hasOwnProperty.call(body.guard_fields || {},field))) {
        await verifyGuardedSipsTaskEligibility(base44,record);
      }
      const saved=await trackedConditionalSave(base44,type,record,patch,actor);
      return Response.json({success:true,record:saved});
    }
    const field=String(body.field_name||'');
    if(!optionalFields.has(field) && field!=='notes_serialized')throw Object.assign(new Error('Unknown stored field.'),{status:400});
    const auditField=field==='notes_serialized'?'work_notes':field;
    const [audit,legacy]=await Promise.all([
      base44.asServiceRole.entities.FieldAudit.filter({entity_type:type,entity_id:record.id,field_name:auditField,status:'committed'},{sort:'-modified_at',limit:25,...(body.cursor?{cursor:body.cursor}:{})}),
      base44.asServiceRole.entities.CellHistory.filter({entity_type:type,entity_id:record.id,field_name:auditField},{sort:'-created_date',limit:25,...(body.legacy_cursor?{cursor:body.legacy_cursor}:{})}),
    ]);
    let remote=null, remoteError='';
    if(body.include_remote!==false && record.smartsheet_sheet_id && record.smartsheet_row_id) {
      const config=(await base44.asServiceRole.entities.GlobalSettings.filter({setting_key:'smartsheetSyncConfig'},{limit:2})).items;
      const profile=config.length===1?config[0].setting_value?.[type==='Order'?'orders':'sales']:null;
      const bindings=type==='WorkOrder'
        ? filterSalesColumnBindings(profile?.column_bindings || {})
        : (profile?.column_bindings || {});
      const column=bindings?.[field] || (type==='Order' ? bindings?.[({date_needed_option:'date_needed',date_ordered_option:'date_ordered',receipt_option:'date_received'})[field]] : null);
      if(column && String(profile.smartsheet_sheet_id)===record.smartsheet_sheet_id) {
        try {
          remote=await readRemoteFieldHistory(base44,async path=> {
            const r=await measuredSmartsheetFetch('https://api.smartsheet.com/2.0'+path,{headers:{Authorization:'Bearer '+secrets.get('SMARTSHEET_API_TOKEN')},signal:AbortSignal.timeout(15000)},0);
            if(!r.ok)throw new Error('Smartsheet field history is temporarily unavailable ('+r.status+').');
            const body = await r.json(); observeSmartsheetBody(body); return body;
          },record.smartsheet_sheet_id,record.smartsheet_row_id,String(column),Math.max(1,Number(body.remote_page)||1));
        }catch(error){remoteError=error.message;}
      }
    }
    return Response.json({success:true,audit,legacy,remote,remote_error:remoteError,current_value:record[field] ?? null});
  }catch(error){return Response.json({success:false,error:error.message},{status:error.status||500});}
}
export default async function(req) {
  return await tracedSyncRequest(req, 'fieldHistoryAction', fieldHistoryHandler);
}