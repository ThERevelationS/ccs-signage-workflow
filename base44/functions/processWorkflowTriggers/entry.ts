import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

// Every event type the app can emit. Permit events verify the durable
// PermitLineItem fields below; order events carry an Order; the rest carry a
// Work Order the engine re-reads server-side before running any action.
const PERMIT_EVENTS = new Set(['permit_submitted', 'permit_received']);
const ORDER_EVENTS = new Set(['order_created', 'order_ordered', 'order_received']);
const WORK_ORDER_EVENTS = new Set([
  'work_order_created', 'work_order_completed', 'work_order_deleted',
  'rider_created',
  'stage_changed', 'stage_entered', 'stage_exited',
  'task_added', 'task_completed', 'task_deleted',
  'note_added', 'note_deleted',
  'image_uploaded',
  'asap_toggled_on', 'asap_toggled_off',
  'assigned_to_changed',
]);
const ALLOWED_EVENTS = new Set([...PERMIT_EVENTS, ...ORDER_EVENTS, ...WORK_ORDER_EVENTS]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, payload?.session_token);
    const changedBy = user.full_name || user.email || 'Authenticated User';

    const eventType = String(payload?.event_type || '').trim();
    if (!ALLOWED_EVENTS.has(eventType)) {
      throw Object.assign(new Error('Unsupported automation event type'), { status: 400 });
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
    const safeStatus = [400, 401, 404, 409, 503].includes(status) ? status : 500;
    console.error('Error processing workflow triggers:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Workflow automation could not be processed safely' : error.message,
    }, { status: safeStatus });
  }
});
