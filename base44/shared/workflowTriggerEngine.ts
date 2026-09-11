import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from './workOrderFieldPersistence.mjs';
import { loadAllEntityRows } from './pagedEntityRows.ts';

const PERMIT_CONTEXT_FIELDS = [
  'locality_name',
  'office_type',
  'row_name',
  'submitted_date',
  'next_followup_date',
  'permit_received_date',
];

function matchesTrigger(trigger: any, eventType: string, workOrder: any, oldData: any) {
  const condition = trigger?.trigger_condition || {};

  switch (trigger?.trigger_type) {
    case 'work_order_created':
      if (eventType !== 'create') return false;
      break;
    case 'work_order_completed':
      if (eventType !== 'update' || !workOrder.completed) return false;
      if (oldData?.completed === true) return false;
      break;
    case 'stage_changed':
      if (eventType !== 'update') return false;
      if (oldData?.current_stage === workOrder.current_stage) return false;
      if (condition.from_stage && oldData?.current_stage !== condition.from_stage) return false;
      if (condition.to_stage && workOrder.current_stage !== condition.to_stage) return false;
      break;
    case 'stage_entered':
      if (eventType !== 'update') return false;
      if (oldData?.current_stage === workOrder.current_stage) return false;
      if (condition.stage && workOrder.current_stage !== condition.stage) return false;
      break;
    case 'stage_exited':
      if (eventType !== 'update') return false;
      if (oldData?.current_stage === workOrder.current_stage) return false;
      if (condition.stage && oldData?.current_stage !== condition.stage) return false;
      break;
    case 'asap_toggled_on':
      if (eventType !== 'update') return false;
      if (!workOrder.asap || oldData?.asap === true) return false;
      break;
    case 'asap_toggled_off':
      if (eventType !== 'update') return false;
      if (workOrder.asap || oldData?.asap !== true) return false;
      break;
    case 'assigned_to_changed':
      if (eventType !== 'update') return false;
      if (oldData?.assigned_to === workOrder.assigned_to) return false;
      break;
    case 'permit_submitted':
    case 'permit_received':
    case 'permit_followup_due':
    case 'permit_followup_overdue':
      if (eventType !== trigger.trigger_type) return false;
      break;
    default:
      return false;
  }

  if (condition.is_asap === true && !workOrder.asap) return false;
  if (condition.is_rider === true && !workOrder.is_rider) return false;
  if (condition.is_rider === false && workOrder.is_rider) return false;
  return true;
}

async function sendEmailAction(base44: any, config: any, workOrder: any, changedBy: string) {
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

  let subject = config.subject || 'Work Order Update';
  let body = config.body || '';
  const vars: Record<string, string> = {
    '{{title}}': workOrder.title || '',
    '{{client_name}}': workOrder.client_name || '',
    '{{description}}': workOrder.description || '',
    '{{current_stage}}': workOrder.current_stage || '',
    '{{assigned_to}}': workOrder.assigned_to || '',
    '{{due_date}}': workOrder.due_date || '',
    '{{created_by}}': workOrder.created_by || '',
    '{{is_rider}}': workOrder.is_rider ? 'Yes' : 'No',
    '{{is_asap}}': workOrder.asap ? 'Yes' : 'No',
    '{{changed_by}}': changedBy || 'System',
    '{{timestamp}}': new Date().toLocaleString(),
    '{{locality_name}}': workOrder.locality_name || '',
    '{{office_type}}': workOrder.office_type || '',
    '{{row_name}}': workOrder.row_name || '',
    '{{submitted_date}}': workOrder.submitted_date || '',
    '{{next_followup_date}}': workOrder.next_followup_date || '',
    '{{permit_received_date}}': workOrder.permit_received_date || '',
  };
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  if (config.use_ai) {
    const aiResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate a professional email notification about a work order update.\n\nWork Order Details:\n- Title: ${workOrder.title}\n- Client: ${workOrder.client_name}\n- Stage: ${workOrder.current_stage}\n- Due Date: ${workOrder.due_date || 'Not set'}\n- Assigned To: ${workOrder.assigned_to || 'Unassigned'}\n- ASAP: ${workOrder.asap ? 'Yes' : 'No'}\n- Description: ${workOrder.description || 'None'}\n\nContext from user: ${body || 'Standard notification'}\n\nGenerate a concise, professional email body (HTML format). Keep it brief but informative.`,
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

async function executeAction(base44: any, action: any, workOrder: any, eventWorkOrder: any, changedBy: string) {
  const config = action?.action_config || {};
  switch (action?.action_type) {
    case 'send_email':
      return sendEmailAction(base44, config, eventWorkOrder, changedBy);
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
    default:
      return { skipped: true, reason: 'Unknown action type' };
  }
  return { skipped: true };
}

export async function processWorkflowTriggerEvent({ base44, payload, changedByOverride = '' }: any) {
  const eventType = String(payload?.event_type || '').trim();
  const suppliedWorkOrder = payload?.work_order;
  if (!eventType || !suppliedWorkOrder?.id) throw Object.assign(new Error('Missing event_type or work_order id'), { status: 400 });

  const currentWorkOrder = await base44.asServiceRole.entities.WorkOrder.get(suppliedWorkOrder.id);
  if (!currentWorkOrder?.id) throw Object.assign(new Error('Work Order not found'), { status: 404 });
  if (currentWorkOrder.deleted === true) throw Object.assign(new Error('Workflow automation cannot run against a Work Order in Project Trash'), { status: 409 });

  const permitContext: Record<string, unknown> = {};
  for (const field of PERMIT_CONTEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(suppliedWorkOrder, field)) permitContext[field] = suppliedWorkOrder[field];
  }
  const eventWorkOrder = { ...currentWorkOrder, ...permitContext };
  const actionWorkOrder = { ...currentWorkOrder };
  const oldData = payload?.old_data && typeof payload.old_data === 'object' ? payload.old_data : {};
  const changedBy = String(changedByOverride || payload?.changed_by || 'System').trim() || 'System';

  const automations = await loadAllEntityRows({ entity: base44.asServiceRole.entities.AutomationRule, query: { enabled: true }, sort: null, label: 'Enabled workflow automation rules' });
  const triggeredActions: any[] = [];
  for (const rule of automations) {
    const triggered = (rule.triggers || []).some((trigger: any) => matchesTrigger(trigger, eventType, eventWorkOrder, oldData));
    if (!triggered) continue;
    for (const action of rule.actions || []) {
      try {
        const result = await executeAction(base44, action, actionWorkOrder, eventWorkOrder, changedBy);
        triggeredActions.push({ rule: rule.name, action: action.action_type, result });
      } catch (error) {
        console.error(`Action error for rule ${rule.name}:`, error?.message || error);
        triggeredActions.push({ rule: rule.name, action: action.action_type, error: error?.message || 'Action failed' });
      }
    }
  }
  return { success: true, triggered_count: triggeredActions.length, actions: triggeredActions };
}
