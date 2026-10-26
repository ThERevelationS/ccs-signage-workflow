import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from './workOrderFieldPersistence.mjs';
import { loadAllEntityRows } from './pagedEntityRows.ts';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const PERMIT_CONTEXT_FIELDS = [
  'locality_name',
  'office_type',
  'row_name',
  'submitted_date',
  'next_followup_date',
  'permit_received_date',
];

const STAGE_LABELS: Record<string, string> = {
  estimating: 'Estimating',
  sales: 'Sales',
  permitting: 'Permitting',
  design: 'Design',
  production: 'Production',
  fabrication: 'Fabrication',
  installation: 'Installation',
  completed: 'Completed',
};
const formatStage = (s: unknown) => STAGE_LABELS[String(s || '')] || String(s || '');

// rider_stage excludes 'completed' — the enum stops at installation.
const RIDER_STAGES = new Set(['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation']);

// Event vocabularies that carry a business record other than a Work Order
// or Order. The engine resolves the record server-side by entity+id; only
// send_email can execute for them (the mutating actions all target WOs).
const RECORD_CONTEXT_EVENTS: Record<string, string> = {
  sales_lead_created: 'Opportunity',
  sales_status_changed: 'Opportunity',
  sales_status_won: 'Opportunity',
  sales_status_lost: 'Opportunity',
  sales_status_on_hold: 'Opportunity',
  sales_rep_changed: 'Opportunity',
  sales_follow_up_date_approaching: 'Opportunity',
  sales_follow_up_date_passed: 'Opportunity',
  sales_close_date_approaching: 'Opportunity',
};

// Named events arrive with event_type === the UI's trigger vocabulary; the
// legacy 'create'/'update' vocabulary is still honored for field-diff checks.
function matchesTrigger(trigger: any, eventType: string, workOrder: any, oldData: any, extra: any, order?: any) {
  const condition = trigger?.trigger_condition || {};

  switch (trigger?.trigger_type) {
    case 'work_order_created':
      if (eventType !== 'create' && eventType !== 'work_order_created') return false;
      break;
    case 'work_order_completed':
      if (eventType === 'work_order_completed') break;
      if (eventType !== 'update' || !workOrder?.completed) return false;
      if (oldData?.completed === true) return false;
      break;
    case 'stage_changed':
      if (eventType === 'stage_changed') {
        if (condition.from_stage && extra?.previousStage !== condition.from_stage) return false;
        if (condition.to_stage && extra?.newStage !== condition.to_stage) return false;
        break;
      }
      if (eventType !== 'update') return false;
      if (oldData?.current_stage === workOrder?.current_stage) return false;
      if (condition.from_stage && oldData?.current_stage !== condition.from_stage) return false;
      if (condition.to_stage && workOrder?.current_stage !== condition.to_stage) return false;
      break;
    case 'stage_entered':
      if (eventType === 'stage_entered') {
        if (condition.stage && extra?.newStage !== condition.stage) return false;
        break;
      }
      if (eventType !== 'update') return false;
      if (oldData?.current_stage === workOrder?.current_stage) return false;
      if (condition.stage && workOrder?.current_stage !== condition.stage) return false;
      break;
    case 'stage_exited':
      if (eventType === 'stage_exited') {
        if (condition.stage && extra?.previousStage !== condition.stage) return false;
        break;
      }
      if (eventType !== 'update') return false;
      if (oldData?.current_stage === workOrder?.current_stage) return false;
      if (condition.stage && oldData?.current_stage !== condition.stage) return false;
      break;
    case 'asap_toggled_on':
      if (eventType === 'asap_toggled_on') break;
      if (eventType !== 'update') return false;
      if (!workOrder?.asap || oldData?.asap === true) return false;
      break;
    case 'asap_toggled_off':
      if (eventType === 'asap_toggled_off') break;
      if (eventType !== 'update') return false;
      if (workOrder?.asap || oldData?.asap !== true) return false;
      break;
    case 'assigned_to_changed':
      if (eventType === 'assigned_to_changed') break;
      if (eventType !== 'update') return false;
      if (oldData?.assigned_to === workOrder?.assigned_to) return false;
      break;
    case 'work_order_deleted':
    case 'work_order_updated':
    case 'work_order_restored':
    case 'work_order_client_changed':
    case 'work_order_description_changed':
    case 'work_order_title_changed':
    case 'work_order_estimate_changed':
    case 'work_order_contact_changed':
    case 'work_order_install_location_changed':
    case 'work_order_permit_number_set':
    case 'work_order_permit_approved':
    case 'work_order_permit_submitted':
    case 'work_order_est_inv_set':
    case 'work_order_install_date_set':
    case 'work_order_install_date_approaching':
    case 'work_order_install_date_passed':
    case 'work_order_project_health_changed':
    case 'work_order_production_type_changed':
    case 'work_order_file_uploaded':
    case 'stage_estimating_entered':
    case 'stage_sales_entered':
    case 'stage_permitting_entered':
    case 'stage_design_entered':
    case 'stage_production_entered':
    case 'stage_fabrication_entered':
    case 'stage_installation_entered':
    case 'stage_completed_entered':
    case 'project_health_on_track':
    case 'project_health_at_risk':
    case 'project_health_delayed':
    case 'project_health_blocked':
    case 'due_date_set':
    case 'due_date_cleared':
    case 'start_date_set':
    case 'site_survey_scheduled':
    case 'google_drive_linked':
    case 'file_attached':
    case 'permit_approved':
    case 'permit_receipt_confirmed':
    case 'rider_created':
    case 'task_added':
    case 'task_completed':
    case 'task_uncompleted':
    case 'task_edited':
    case 'task_due_date_set':
    case 'task_assigned':
    case 'all_tasks_completed':
    case 'task_deleted':
    case 'note_added':
    case 'note_deleted':
    case 'sub_note_added':
    case 'sub_note_deleted':
    case 'note_completed':
    case 'follow_up_added':
    case 'follow_up_completed':
    case 'rider_completed':
    case 'rider_all_tasks_completed':
    case 'rider_deleted':
    case 'rider_stage_changed':
    case 'rider_assigned_to_changed':
    case 'image_uploaded':
    case 'priority_changed':
    case 'order_created':
    case 'order_ordered':
    case 'order_received':
    case 'order_cancelled':
    case 'order_overdue':
    case 'order_customer_name_changed':
    case 'order_request_type_changed':
    case 'order_description_changed':
    case 'order_quantity_changed':
    case 'order_requestor_changed':
    case 'order_date_needed_changed':
    case 'order_date_ordered_changed':
    case 'order_vendor_changed':
    case 'order_date_received_changed':
    case 'order_date_needed_approaching':
    case 'order_date_needed_passed':
    case 'sales_lead_created':
    case 'sales_status_changed':
    case 'sales_status_won':
    case 'sales_status_lost':
    case 'sales_status_on_hold':
    case 'sales_rep_changed':
    case 'sales_follow_up_date_approaching':
    case 'sales_follow_up_date_passed':
    case 'sales_close_date_approaching':
    case 'permit_submitted':
    case 'permit_received':
    case 'permit_followup_due':
    case 'permit_followup_overdue':
      if (eventType !== trigger.trigger_type) return false;
      break;
    default:
      return false;
  }

  // Generic conditions shared by every trigger type. Order events carry no
  // Work Order, so WO-bound conditions simply cannot match there.
  if (condition.is_asap === true && !workOrder?.asap) return false;
  if (condition.is_rider === true && !workOrder?.is_rider) return false;
  if (condition.is_rider === false && workOrder?.is_rider) return false;
  if (condition.assigned_to && workOrder?.assigned_to !== condition.assigned_to) return false;
  if (condition.stage && trigger?.trigger_type !== 'stage_entered' && trigger?.trigger_type !== 'stage_exited'
      && workOrder?.current_stage !== condition.stage) return false;

  // Order filters the builder collects for order_* triggers. A filter that
  // does not match the incoming order's current value rejects the trigger.
  if (order && String(trigger?.trigger_type || '').startsWith('order_')) {
    if (condition.request_type && String(order.request_type || '') !== condition.request_type) return false;
    if (condition.vendor && String(order.vendor || '') !== condition.vendor) return false;
    if (condition.requestor && String(order.requestor_name || order.requestor || '') !== condition.requestor) return false;
    if (condition.min_quantity != null && !(Number(order.quantity) >= Number(condition.min_quantity))) return false;
    if (condition.max_quantity != null && !(Number(order.quantity) <= Number(condition.max_quantity))) return false;
  }
  return true;
}

async function sendEmailAction(base44: any, config: any, context: any, changedBy: string) {
  const workOrder = context?.workOrder || {};
  const order = context?.order;
  const extra = context?.extras || {};
  const recipients: string[] = [];

  for (const recipient of (config.recipients || [])) {
    switch (recipient.type) {
      case 'email':
        if (recipient.value) recipients.push(recipient.value);
        break;
      case 'assigned_user':
        if (workOrder.assigned_to) {
          const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ full_name: workOrder.assigned_to });
          if (!Array.isArray(users)) throw new Error('Workflow assigned-user recipient lookup could not be verified.');
          if (users.length > 1) throw new Error(`Workflow assigned-user recipient is ambiguous for ${workOrder.assigned_to}.`);
          if (users[0]?.email) recipients.push(users[0].email);
        }
        break;
      case 'creator':
        if (workOrder.created_by) recipients.push(workOrder.created_by);
        break;
      case 'all_admins': {
        const admins = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.AuthorizedEmail,
          query: { role: 'admin' },
          sort: null,
          label: 'Workflow automation admin recipients',
        });
        admins.forEach((admin: any) => admin.email && recipients.push(admin.email));
        break;
      }
      case 'custom_list':
        if (recipient.value) {
          for (const email of String(recipient.value).split(',')) {
            const trimmed = email.trim();
            if (trimmed) recipients.push(trimmed);
          }
        }
        break;
      case 'email_group':
        if (recipient.value) {
          const groups = await base44.asServiceRole.entities.EmailGroup.filter({ id: recipient.value });
          if (!Array.isArray(groups)) throw new Error('Workflow email-group recipient lookup could not be verified.');
          if (groups.length > 1) throw new Error('Workflow email-group recipient identity is ambiguous.');
          if (groups[0]?.emails) recipients.push(...groups[0].emails);
        }
        break;
    }
  }

  if (recipients.length === 0) return { skipped: true, reason: 'No recipients' };

  const record = context?.record;
  let subject = config.subject || (order ? 'Order Update' : record ? 'Opportunity Update' : 'Work Order Update');
  let body = config.body || '';
  // HTML-escape all record-derived values before substituting into
  // subject/body templates to prevent injected markup from rendering.
  const vars: Record<string, string> = {
    '{{title}}': esc(workOrder.title),
    '{{client_name}}': esc(workOrder.client_name),
    '{{description}}': esc(order?.description || workOrder.description),
    '{{current_stage}}': esc(formatStage(workOrder.current_stage)),
    '{{assigned_to}}': esc(workOrder.assigned_to),
    '{{due_date}}': esc(workOrder.due_date),
    '{{created_by}}': esc(workOrder.created_by),
    '{{is_rider}}': workOrder.is_rider ? 'Yes' : 'No',
    '{{is_asap}}': workOrder.asap ? 'Yes' : 'No',
    '{{previous_stage}}': esc(formatStage(extra.previousStage)),
    '{{new_stage}}': esc(formatStage(extra.newStage)),
    '{{task_text}}': esc(extra.taskText),
    '{{note_text}}': esc(extra.noteText),
    '{{note_type}}': esc(extra.noteType),
    '{{work_order_id}}': esc(workOrder.id),
    '{{changed_by}}': esc(changedBy || 'System'),
    '{{timestamp}}': new Date().toLocaleString(),
    '{{locality_name}}': esc(workOrder.locality_name),
    '{{office_type}}': esc(workOrder.office_type),
    '{{row_name}}': esc(workOrder.row_name),
    '{{submitted_date}}': esc(workOrder.submitted_date),
    '{{next_followup_date}}': esc(workOrder.next_followup_date),
    '{{permit_received_date}}': esc(workOrder.permit_received_date),
    // Order context for order_* events.
    '{{customer_name}}': esc(order?.customer_name),
    '{{request_type}}': esc(order?.request_type),
    '{{quantity}}': esc(order?.quantity),
    '{{requestor_name}}': esc(order?.requestor_name),
    '{{requestor_email}}': esc(order?.requestor_email),
    '{{date_needed}}': esc(order?.date_needed),
    '{{date_ordered}}': esc(order?.date_ordered),
    '{{date_received}}': esc(order?.date_received),
    '{{vendor}}': esc(order?.vendor),
    '{{status}}': esc(order?.status),
    // Record context (Opportunity events today; extends cleanly to other
    // record-bearing domains later).
    '{{opportunity_title}}': esc(record?.title),
    '{{opportunity_stage}}': esc(record?.stage),
    '{{customer_display_name}}': esc(record?.customer_display_name),
    '{{salesperson}}': esc(record?.salesperson),
    '{{budget_amount}}': esc(record?.budget_amount),
    '{{lost_reason}}': esc(record?.lost_reason),
    '{{lead_source}}': esc(record?.lead_source),
    '{{next_action}}': esc(record?.next_action),
    '{{next_action_due}}': esc(record?.next_action_due),
    '{{desired_completion_date}}': esc(record?.desired_completion_date),
  };
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  if (config.use_ai) {
    const recordContext = order
      ? `Order Details:\n- Customer: ${esc(order.customer_name)}\n- Request Type: ${esc(order.request_type)}\n- Vendor: ${esc(order.vendor || 'Not specified')}\n- Date Needed: ${esc(order.date_needed || 'Not set')}\n- Status: ${esc(order.status || 'pending')}`
      : record
      ? `Opportunity Details:\n- Title: ${esc(record.title)}\n- Customer: ${esc(record.customer_display_name)}\n- Stage: ${esc(record.stage)}\n- Salesperson: ${esc(record.salesperson || 'Unassigned')}\n- Budget: ${esc(record.budget_amount ?? 'Not set')}`
      : `Work Order Details:\n- Title: ${esc(workOrder.title)}\n- Client: ${esc(workOrder.client_name)}\n- Stage: ${esc(formatStage(workOrder.current_stage))}\n- Due Date: ${esc(workOrder.due_date || 'Not set')}\n- Assigned To: ${esc(workOrder.assigned_to || 'Unassigned')}\n- ASAP: ${workOrder.asap ? 'Yes' : 'No'}\n- Description: ${esc(workOrder.description || 'None')}`;
    const aiResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate a professional email notification about a ${order ? 'order' : record ? 'sales opportunity' : 'work order'} update.\n\n${recordContext}\n\nContext from user: ${esc(body || 'Standard notification')}\n\nGenerate a concise, professional email body (HTML format). Keep it brief but informative.`,
      response_json_schema: {
        type: 'object',
        properties: { subject: { type: 'string' }, body: { type: 'string' } },
      },
    });
    if (aiResult.subject) subject = aiResult.subject;
    if (aiResult.body) body = aiResult.body;
  }

  const sent: string[] = [];
  for (const to of [...new Set(recipients)]) {
    try {
      await base44.integrations.Core.SendEmail({ to, subject, body });
      sent.push(to);
    } catch (error) {
      console.error(`Workflow automation email failed for ${to}:`, error?.message || error);
    }
  }
  return { emails_sent: sent.length, recipients: sent };
}

async function executeAction(base44: any, action: any, workOrder: any, context: any, changedBy: string) {
  const config = action?.action_config || {};
  // Mutating actions all write through workOrder; events without one (order
  // events) can only send email.
  if (action?.action_type !== 'send_email' && !workOrder?.id) {
    return { skipped: true, reason: 'Action requires a Work Order' };
  }
  switch (action?.action_type) {
    case 'send_email':
      return sendEmailAction(base44, config, context, changedBy);
    case 'change_stage':
      if (config.stage) {
        const nextFields = { current_stage: config.stage };
        const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation stage change' });
        Object.assign(workOrder, saved);
        return { stage_changed_to: config.stage };
      }
      break;
    case 'set_asap': {
      const nextFields = { asap: config.asap === true };
      const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation ASAP update' });
      Object.assign(workOrder, saved);
      return { asap_set: config.asap === true };
    }
    case 'assign_to':
      if (config.assignee) {
        const nextFields = { assigned_to: config.assignee };
        const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation assignment' });
        Object.assign(workOrder, saved);
        return { assigned_to: config.assignee };
      }
      break;
    case 'add_task':
      if (config.task) {
        const currentNotes = Array.isArray(workOrder.notes) ? workOrder.notes : [];
        const newTask = { text: config.task, timestamp: new Date().toISOString(), created_by: 'Automation', completed: false, sub_tasks: [] };
        const nextFields = { notes: [...currentNotes, newTask] };
        const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation task addition' });
        Object.assign(workOrder, saved);
        return { task_added: config.task };
      }
      break;
    case 'add_note':
      if (config.note) {
        const currentWorkNotes = Array.isArray(workOrder.work_notes) ? workOrder.work_notes : [];
        const newNote = { id: Date.now(), type: config.note_type || 'admin', text: config.note, timestamp: new Date().toISOString(), created_by: 'Automation', sub_tasks: [] };
        const nextFields = { work_notes: [...currentWorkNotes, newNote] };
        const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation note addition' });
        Object.assign(workOrder, saved);
        return { note_added: config.note };
      }
      break;
    case 'set_due_date':
      if (config.days) {
        const days = parseInt(config.days, 10);
        const date = new Date();
        date.setDate(date.getDate() + days);
        const nextFields = { due_date: date.toISOString().split('T')[0] };
        const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation due date update' });
        Object.assign(workOrder, saved);
        return { due_date_set: nextFields.due_date };
      }
      break;
    case 'mark_complete': {
      const nextFields = { completed: true, current_stage: 'completed' };
      const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation completion' });
      Object.assign(workOrder, saved);
      return { marked_complete: true };
    }
    case 'set_priority': {
      const priority = Number(config.priority);
      if (!Number.isFinite(priority)) break;
      const nextFields = { priority };
      const saved = await replaceWorkOrderFieldsIfUnchanged({ entity: base44.asServiceRole.entities.WorkOrder, workOrderId: workOrder.id, expectedFields: expectedWorkOrderFields(workOrder, nextFields), nextFields, label: 'Workflow automation priority update' });
      Object.assign(workOrder, saved);
      return { priority_set: priority };
    }
    case 'create_rider': {
      const titleTemplate = String(config.title || '').trim();
      const title = (titleTemplate ? titleTemplate.replace(/\{\{title\}\}/g, String(workOrder.title || '')) : `${workOrder.title || 'Work Order'} - Rider`).trim();
      if (!title) break;
      // A rule that already created a rider with this title for this parent
      // does not create another — re-fired events must not duplicate riders.
      const existing = await base44.asServiceRole.entities.WorkOrder.filter({ parent_work_order_id: workOrder.id, is_rider: true, title });
      if (!Array.isArray(existing)) throw new Error('Workflow rider dedup lookup could not be verified.');
      if (existing.length > 0) return { skipped: true, reason: 'A rider with this title already exists for this work order', rider_id: existing[0].id };
      const stage = String(config.rider_stage || workOrder.current_stage || '').trim();
      const days = parseInt(config.days, 10);
      const dueDate = Number.isFinite(days)
        ? (() => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; })()
        : '';
      const riderData = {
        title,
        client_name: workOrder.client_name || '',
        description: config.note || '',
        is_rider: true,
        parent_work_order_id: workOrder.id,
        current_stage: stage || 'production',
        rider_stage: RIDER_STAGES.has(stage) ? stage : undefined,
        assigned_to: config.assignee || '',
        due_date: dueDate,
        in_pipeline: true,
        notes: config.task ? [{ text: config.task, timestamp: new Date().toISOString(), created_by: 'Automation', completed: false, sub_tasks: [] }] : [],
      };
      const rider = await base44.asServiceRole.entities.WorkOrder.create(riderData);
      return { rider_created: rider?.id, title };
    }
    default:
      return { skipped: true, reason: 'Unknown action type' };
  }
  return { skipped: true };
}

export async function processWorkflowTriggerEvent({ base44, payload, changedByOverride = '' }: any) {
  const eventType = String(payload?.event_type || '').trim();
  const suppliedWorkOrder = payload?.work_order;
  const suppliedOrder = payload?.order;
  const isOrderEvent = eventType.startsWith('order_');
  const recordEntity = RECORD_CONTEXT_EVENTS[eventType];
  if (!eventType) throw Object.assign(new Error('Missing event_type'), { status: 400 });
  if (isOrderEvent) {
    if (!suppliedOrder?.id) throw Object.assign(new Error('Missing order id'), { status: 400 });
  } else if (recordEntity) {
    if (!payload?.record?.id) throw Object.assign(new Error('Missing record id'), { status: 400 });
  } else if (!suppliedWorkOrder?.id) {
    throw Object.assign(new Error('Missing work_order id'), { status: 400 });
  }

  let currentWorkOrder: any = null;
  if (suppliedWorkOrder?.id) {
    currentWorkOrder = await base44.asServiceRole.entities.WorkOrder.get(suppliedWorkOrder.id);
    if (!currentWorkOrder?.id) throw Object.assign(new Error('Work Order not found'), { status: 404 });
    // work_order_deleted events legitimately describe a record already in
    // Project Trash; every other event must target a live Work Order.
    if (currentWorkOrder.deleted === true && eventType !== 'work_order_deleted') {
      throw Object.assign(new Error('Workflow automation cannot run against a Work Order in Project Trash'), { status: 409 });
    }
  }

  let orderRecord: any = null;
  if (isOrderEvent) {
    orderRecord = await base44.asServiceRole.entities.Order.get(suppliedOrder.id);
    if (!orderRecord?.id) throw Object.assign(new Error('Order not found'), { status: 404 });
  }

  let contextRecord: any = null;
  if (recordEntity) {
    contextRecord = await base44.asServiceRole.entities[recordEntity].get(String(payload.record.id));
    if (!contextRecord?.id) throw Object.assign(new Error(`${recordEntity} not found`), { status: 404 });
  }

  const permitContext: Record<string, unknown> = {};
  for (const field of PERMIT_CONTEXT_FIELDS) {
    if (suppliedWorkOrder && Object.prototype.hasOwnProperty.call(suppliedWorkOrder, field)) permitContext[field] = suppliedWorkOrder[field];
  }
  const eventWorkOrder = currentWorkOrder ? { ...currentWorkOrder, ...permitContext } : null;
  const actionWorkOrder = currentWorkOrder ? { ...currentWorkOrder } : null;
  const oldData = payload?.old_data && typeof payload.old_data === 'object' ? payload.old_data : {};
  const extras = payload?.extras && typeof payload.extras === 'object' ? payload.extras : {};
  const changedBy = String(changedByOverride || payload?.changed_by || 'System').trim() || 'System';
  const context = { workOrder: eventWorkOrder, order: orderRecord, record: contextRecord, extras };

  const automations = await loadAllEntityRows({ entity: base44.asServiceRole.entities.AutomationRule, query: { enabled: true }, sort: null, label: 'Enabled workflow automation rules' });
  const triggeredActions: any[] = [];
  for (const rule of automations) {
    // Triggers combine with each row's declared logic (and/or). AND only
    // holds when several trigger rows can match the same event — the same
    // semantics the Admin editor warns about for mixed event types.
    let triggered: boolean | null = null;
    for (const trigger of rule.triggers || []) {
      const m = matchesTrigger(trigger, eventType, eventWorkOrder, oldData, extras, orderRecord);
      if (triggered === null) triggered = m;
      else triggered = trigger?.logic === 'and' ? (triggered && m) : (triggered || m);
    }
    if (triggered !== true) continue;
    for (const action of rule.actions || []) {
      try {
        const result = await executeAction(base44, action, actionWorkOrder, context, changedBy);
        triggeredActions.push({ rule: rule.name, action: action.action_type, result });
      } catch (error) {
        console.error(`Action error for rule ${rule.name}:`, error?.message || error);
        triggeredActions.push({ rule: rule.name, action: action.action_type, error: error?.message || 'Action failed' });
      }
    }
  }
  return { success: true, triggered_count: triggeredActions.length, actions: triggeredActions };
}