import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

// Every event type the app can emit. Permit events verify the durable
// PermitLineItem fields below; order events carry an Order; the rest carry a
// Work Order the engine re-reads server-side before running any action.
const PERMIT_EVENTS = new Set(['permit_submitted', 'permit_received']);
const ORDER_EVENTS = new Set([
  'order_created', 'order_ordered', 'order_received', 'order_cancelled',
  'order_customer_name_changed', 'order_request_type_changed',
  'order_description_changed', 'order_quantity_changed',
  'order_requestor_changed', 'order_date_needed_changed',
  'order_date_ordered_changed', 'order_vendor_changed',
  'order_date_received_changed',
]);
const WORK_ORDER_EVENTS = new Set([
  'work_order_created', 'work_order_completed', 'work_order_deleted',
  'work_order_updated', 'work_order_restored',
  'work_order_client_changed', 'work_order_description_changed',
  'work_order_title_changed', 'work_order_estimate_changed',
  'work_order_contact_changed', 'work_order_install_location_changed',
  'work_order_permit_number_set', 'work_order_permit_approved',
  'work_order_permit_submitted', 'work_order_est_inv_set',
  'work_order_install_date_set', 'work_order_project_health_changed',
  'work_order_production_type_changed', 'work_order_file_uploaded',
  'stage_estimating_entered', 'stage_sales_entered',
  'stage_permitting_entered', 'stage_design_entered',
  'stage_production_entered', 'stage_fabrication_entered',
  'stage_installation_entered', 'stage_completed_entered',
  'project_health_on_track', 'project_health_at_risk',
  'project_health_delayed', 'project_health_blocked',
  'due_date_set', 'due_date_cleared', 'start_date_set',
  'site_survey_scheduled', 'google_drive_linked', 'file_attached',
  'permit_approved', 'permit_receipt_confirmed',
  'priority_changed',
  'task_uncompleted', 'task_edited',
  'task_due_date_set', 'task_assigned', 'all_tasks_completed',
  'sub_note_added', 'sub_note_deleted',
  'note_completed', 'follow_up_added', 'follow_up_completed',
  'designer_assigned', 'surveyor_assigned',
  'project_manager_assigned', 'estimator_assigned',
  'sip_item_completed', 'mmm_item_completed', 'sip_item_revisit_set',
  'rider_completed', 'rider_all_tasks_completed', 'rider_deleted',
  'rider_stage_changed', 'rider_assigned_to_changed',
  'rider_created',
  'stage_changed', 'stage_entered', 'stage_exited',
  'task_added', 'task_completed', 'task_deleted',
  'note_added', 'note_deleted',
  'image_uploaded',
  'asap_toggled_on', 'asap_toggled_off',
  'assigned_to_changed',
  'proof_sent', 'proof_approved', 'product_transition',
]);
// Time Clock / PTO events emitted by timeClockAction after verified writes.
const TIME_CLOCK_EVENTS = new Set([
  'time_clock_in', 'time_clock_out', 'time_clock_in_late', 'time_clock_out_early',
  'time_entry_long_shift', 'time_entry_no_clock_out', 'time_entry_notes_updated',
  'time_off_requested', 'time_off_updated', 'time_off_approved', 'time_off_denied',
  'time_off_cancelled', 'job_allocation_added', 'pto_balance_low',
]);
// Other record-context events — emitted by manageFeatureReports,
// onboardingAccountAction, issuePasswordReset, detectSalesDuplicates,
// monitorJurisdictionChanges, and client-side jurisdiction/user funnels
// after verified writes. The engine resolves each record's entity from its
// RECORD_CONTEXT_EVENTS map and re-reads it by id server-side.
const RECORD_EVENTS = new Set([
  'pending_import_created', 'duplicate_detected',
  'feature_report_submitted', 'feature_report_status_changed',
  'feature_report_completed',
  'user_registered', 'user_password_reset', 'user_face_enrolled',
  'user_role_changed',
  'jurisdiction_profile_created', 'jurisdiction_profile_updated',
  'regulation_alert_created',
  'crm_event_completed',
  'po_received', 'po_backordered', 'recon_variance',
  'invoice_overdue',
]);
const ALLOWED_EVENTS = new Set([...PERMIT_EVENTS, ...ORDER_EVENTS, ...WORK_ORDER_EVENTS, ...TIME_CLOCK_EVENTS, ...RECORD_EVENTS]);

// These events originate inside verified backend writes and call the engine
// directly. A browser must not manufacture account or report transitions.
const SERVER_RECORD_EVENTS = new Set([
  'pending_import_created', 'duplicate_detected',
  'feature_report_submitted', 'feature_report_status_changed', 'feature_report_completed',
  'user_registered', 'user_password_reset', 'regulation_alert_created',
]);

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const payload = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, payload?.session_token);
    const changedBy = user.full_name || user.email || 'Authenticated User';

    const eventType = String(payload?.event_type || '').trim();
    if (!ALLOWED_EVENTS.has(eventType)) {
      throw Object.assign(new Error('Unsupported automation event type'), { status: 400 });
    }
    if (SERVER_RECORD_EVENTS.has(eventType)) {
      throw Object.assign(new Error('This automation event requires a verified backend write.'), { status: 403 });
    }
    if (['user_role_changed', 'user_face_enrolled'].includes(eventType) && user.role !== 'admin') {
      throw Object.assign(new Error('An administrator is required for account automation events.'), { status: 403 });
    }

    if (PERMIT_EVENTS.has(eventType)) {
      const permitLineItemId = String(payload?.permit_line_item_id || '').trim();
      if (!permitLineItemId) {
        throw Object.assign(new Error('Missing permit_line_item_id'), { status: 400 });
      }

      const permitLine = await base44.asServiceRole.entities.PermitLineItem.get(permitLineItemId).catch(() => null);
      if (!permitLine?.id) throw Object.assign(new Error('Permit line item not found'), { status: 404 });

      const workOrderId = String(permitLine.work_order_id || '').trim();
      if (!workOrderId) throw Object.assign(new Error('Permit line item is not linked to a Work Order'), { status: 409 });

      if (eventType === 'permit_submitted' && !permitLine.submitted_date) {
        throw Object.assign(new Error('Permit submitted event is not durable on the Permit line item'), { status: 409 });
      }
      if (eventType === 'permit_received' && !permitLine.permit_received_date) {
        throw Object.assign(new Error('Permit received event is not durable on the Permit line item'), { status: 409 });
      }

      const result = await processWorkflowTriggerEvent({
        base44,
        payload: {
          event_type: eventType,
          work_order: {
            id: workOrderId,
            locality_name: permitLine.locality_name,
            office_type: permitLine.office_type,
            row_name: permitLine.row_name,
            submitted_date: permitLine.submitted_date,
            next_followup_date: permitLine.next_followup_date,
            permit_received_date: permitLine.permit_received_date,
          },
          old_data: {},
        },
        changedByOverride: changedBy,
      });
      return Response.json(result);
    }

    if (ORDER_EVENTS.has(eventType)) {
      const orderId = String(payload?.order?.id || payload?.order_id || '').trim();
      if (!orderId) throw Object.assign(new Error('Missing order id'), { status: 400 });
      const result = await processWorkflowTriggerEvent({
        base44,
        payload: {
          event_type: eventType,
          order: { id: orderId },
          extras: payload?.extras,
        },
        changedByOverride: changedBy,
      });
      return Response.json(result);
    }

    if (RECORD_EVENTS.has(eventType) || TIME_CLOCK_EVENTS.has(eventType)) {
      const recordId = String(payload?.record?.id || payload?.record_id || '').trim();
      if (!recordId) throw Object.assign(new Error('Missing record id'), { status: 400 });
      const result = await processWorkflowTriggerEvent({
        base44,
        payload: {
          event_type: eventType,
          record: { id: recordId },
          extras: payload?.extras,
        },
        changedByOverride: changedBy,
      });
      return Response.json(result);
    }

    // Work-order events: the engine re-reads the record server-side, so the
    // client only supplies the id plus event extras (stage/task/note details).
    const workOrderId = String(payload?.work_order?.id || payload?.work_order_id || '').trim();
    if (!workOrderId) throw Object.assign(new Error('Missing work_order id'), { status: 400 });

    const result = await processWorkflowTriggerEvent({
      base44,
      payload: {
        event_type: eventType,
        work_order: { id: workOrderId },
        extras: payload?.extras,
        old_data: payload?.old_data,
      },
      changedByOverride: changedBy,
    });
    return Response.json(result);
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('Error processing workflow triggers:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Workflow automation could not be processed safely' : error.message,
    }, { status: safeStatus });
  }
});
