import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { equivalent, trackedConditionalSave } from '../../shared/fieldAudit.ts';
import { readRemoteFieldHistory } from '../../shared/smartsheetCellHistory.ts';
import { measuredSmartsheetFetch, measureSyncEntities, observeSmartsheetBody } from '../../shared/smartsheetTraceIO.ts';
import { tracedSyncRequest, beginSyncTraceStorage } from '../../shared/smartsheetTraceLifecycle.ts';
import { filterSalesColumnBindings } from '../../shared/smartsheetSalesSafety.mjs';

const optionalFields = new Set(('title client_name customer_name customer_id work_order_id description quantity request_type requestor_email requestor_name date_needed date_needed_option date_ordered date_ordered_option vendor date_received receipt_option status row_number current_stage priority assigned_to notes work_notes follow_up due_date start_date is_rider parent_work_order_id rider_stage completed asap in_pipeline sales_status lead_source current_task_deadline current_task_assigned_to designer surveyor site_survey_date site_survey_time site_survey_am_pm project_manager estimator est_inv_at estimate_amount current_task_description date_initial_contact date_estimate_sent date_order_created project_install_date permit_submitted_date permit_receipt_confirmed_date permit_number permit_approved_date actual_cost profit_margin contact_name contact_email contact_phone representative additional_contact follow_up_date sales_last_follow_up_completed_at sales_last_follow_up_outcome close_date expected_close_date sales_last_activity_at sales_stage_changed_at lost_reason project_type install_location address_line_2 billing_address billing_address_line_2 sales_rep permitting township_city county permit_code permit_class property_owner pud parcel_number electrical_ibi electrical_nkyei electrical_nec electrical_city electrical_county customer_is_building_owner customer_is_tenant customer_is_marketing_co business_co_coo_reminder business_co_coo_date install_yes install_no budget_less_than removal_yes removal_no service_repair origination patch paint color products product_1 product_2 product_3 product_4 product_5 product_6 cb_complete cf_complete cc_complete sms_complete production_type sip_checklist mmm_sip_checklist mmm_checklist sip_completed sip_revisit_date image_url files google_drive_folder_url google_drive_file_ids corbridge_invoice_number corbridge_link estimate_id milestones project_health health_override health_notes dependencies').split(' '));
function cincinnatiDateStamp(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDateStamp(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number), parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year && parsed.getUTCMonth()===month-1 && parsed.getUTCDate()===day;
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