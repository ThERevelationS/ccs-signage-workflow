import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from '../../shared/workOrderFieldPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

// Process workflow automation triggers
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const payload = await req.json();
    const { event_type, work_order, old_data, changed_by } = payload;
    
    if (!event_type || !work_order) {
      return Response.json({ error: 'Missing event_type or work_order' }, { status: 400 });
    }

    // Get all enabled automation rules
    const automations = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.AutomationRule,
      query: { enabled: true },
      sort: null,
      label: 'Enabled workflow automation rules',
    });
    
    const triggeredActions = [];
    // Trigger conditions and notification templates keep using the original event
    // snapshot, while mutation actions advance through confirmed saved state.
    const eventWorkOrder = work_order;
    const actionWorkOrder = { ...work_order };
    
    for (const rule of automations) {
      const triggers = rule.triggers || [];
      
      // Check if any trigger matches
      let triggered = false;
      
      for (const trigger of triggers) {
        if (matchesTrigger(trigger, event_type, eventWorkOrder, old_data)) {
          triggered = true;
          break;
        }
      }
      
      if (!triggered) continue;
      
      // Execute all actions
      for (const action of rule.actions || []) {
        try {
          const result = await executeAction(base44, action, actionWorkOrder, eventWorkOrder, changed_by);
          triggeredActions.push({
            rule: rule.name,
            action: action.action_type,
            result
          });
        } catch (actionErr) {
          console.error(`Action error for rule ${rule.name}:`, actionErr);
          triggeredActions.push({
            rule: rule.name,
            action: action.action_type,
            error: actionErr.message
          });
        }
      }
    }
    
    return Response.json({ 
      success: true, 
      triggered_count: triggeredActions.length,
      actions: triggeredActions 
    });
    
  } catch (error) {
    console.error('Error processing workflow triggers:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function matchesTrigger(trigger, event_type, work_order, old_data) {
  const condition = trigger.trigger_condition || {};
  
  // Check if trigger type matches event
  switch (trigger.trigger_type) {
    case 'work_order_created':
      if (event_type !== 'create') return false;
      break;
      
    case 'work_order_completed':
      if (event_type !== 'update' || !work_order.completed) return false;
      if (old_data?.completed === true) return false; // Already was completed
      break;
      
    case 'stage_changed':
      if (event_type !== 'update') return false;
      if (old_data?.current_stage === work_order.current_stage) return false;
      if (condition.from_stage && old_data?.current_stage !== condition.from_stage) return false;
      if (condition.to_stage && work_order.current_stage !== condition.to_stage) return false;
      break;
      
    case 'stage_entered':
      if (event_type !== 'update') return false;
      if (old_data?.current_stage === work_order.current_stage) return false;
      if (condition.stage && work_order.current_stage !== condition.stage) return false;
      break;
      
    case 'stage_exited':
      if (event_type !== 'update') return false;
      if (old_data?.current_stage === work_order.current_stage) return false;
      if (condition.stage && old_data?.current_stage !== condition.stage) return false;
      break;
      
    case 'asap_toggled_on':
      if (event_type !== 'update') return false;
      if (!work_order.asap || old_data?.asap === true) return false;
      break;
      
    case 'asap_toggled_off':
      if (event_type !== 'update') return false;
      if (work_order.asap || old_data?.asap !== true) return false;
      break;
      
    case 'assigned_to_changed':
      if (event_type !== 'update') return false;
      if (old_data?.assigned_to === work_order.assigned_to) return false;
      break;

    // ── Permitting line-item events ──
    // These are fired directly from the Permitting page with a matching event_type.
    case 'permit_submitted':
    case 'permit_received':
    case 'permit_followup_due':
    case 'permit_followup_overdue':
      if (event_type !== trigger.trigger_type) return false;
      break;

    default:
      return false;
  }
  
  // Check additional conditions
  if (condition.is_asap === true && !work_order.asap) return false;
  if (condition.is_rider === true && !work_order.is_rider) return false;
  if (condition.is_rider === false && work_order.is_rider) return false;
  
  return true;
}

async function executeAction(base44, action, work_order, event_work_order, changed_by) {
  const config = action.action_config || {};
  
  switch (action.action_type) {
    case 'send_email':
      return await sendEmailAction(base44, config, event_work_order, changed_by);
      
    case 'change_stage':
      if (config.stage) {
        const nextFields = { current_stage: config.stage };
        const saved = await replaceWorkOrderFieldsIfUnchanged({
          entity: base44.asServiceRole.entities.WorkOrder,
          workOrderId: work_order.id,
          expectedFields: expectedWorkOrderFields(work_order, nextFields),
          nextFields,
          label: 'Workflow automation stage change',
        });
        Object.assign(work_order, saved);
        return { stage_changed_to: config.stage };
      }
      break;
      
    case 'set_asap': {
      const nextFields = { asap: config.asap === true };
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        entity: base44.asServiceRole.entities.WorkOrder,
        workOrderId: work_order.id,
        expectedFields: expectedWorkOrderFields(work_order, nextFields),
        nextFields,
        label: 'Workflow automation ASAP update',
      });
      Object.assign(work_order, saved);
      return { asap_set: config.asap };
    }
      
    case 'assign_to':
      if (config.assignee) {
        const nextFields = { assigned_to: config.assignee };
        const saved = await replaceWorkOrderFieldsIfUnchanged({
          entity: base44.asServiceRole.entities.WorkOrder,
          workOrderId: work_order.id,
          expectedFields: expectedWorkOrderFields(work_order, nextFields),
          nextFields,
          label: 'Workflow automation assignment',
        });
        Object.assign(work_order, saved);
        return { assigned_to: config.assignee };
      }
      break;
      
    case 'add_task':
      if (config.task) {
        const currentNotes = Array.isArray(work_order.notes) ? work_order.notes : [];
        const newTask = {
          text: config.task,
          timestamp: new Date().toISOString(),
          created_by: 'Automation',
          completed: false,
          sub_tasks: []
        };
        const nextFields = { notes: [...currentNotes, newTask] };
        const saved = await replaceWorkOrderFieldsIfUnchanged({
          entity: base44.asServiceRole.entities.WorkOrder,
          workOrderId: work_order.id,
          expectedFields: expectedWorkOrderFields(work_order, nextFields),
          nextFields,
          label: 'Workflow automation task addition',
        });
        Object.assign(work_order, saved);
        return { task_added: config.task };
      }
      break;
      
    case 'add_note':
      if (config.note) {
        const currentWorkNotes = Array.isArray(work_order.work_notes) ? work_order.work_notes : [];
        const newNote = {
          id: Date.now(),
          type: config.note_type || 'admin',
          text: config.note,
          timestamp: new Date().toISOString(),
          created_by: 'Automation',
          sub_tasks: []
        };
        const nextFields = { work_notes: [...currentWorkNotes, newNote] };
        const saved = await replaceWorkOrderFieldsIfUnchanged({
          entity: base44.asServiceRole.entities.WorkOrder,
          workOrderId: work_order.id,
          expectedFields: expectedWorkOrderFields(work_order, nextFields),
          nextFields,
          label: 'Workflow automation note addition',
        });
        Object.assign(work_order, saved);
        return { note_added: config.note };
      }
      break;
      
    case 'set_due_date':
      if (config.days) {
        const days = parseInt(config.days);
        const date = new Date();
        date.setDate(date.getDate() + days);
        const nextFields = { due_date: date.toISOString().split('T')[0] };
        const saved = await replaceWorkOrderFieldsIfUnchanged({
          entity: base44.asServiceRole.entities.WorkOrder,
          workOrderId: work_order.id,
          expectedFields: expectedWorkOrderFields(work_order, nextFields),
          nextFields,
          label: 'Workflow automation due date update',
        });
        Object.assign(work_order, saved);
        return { due_date_set: nextFields.due_date };
      }
      break;
      
    case 'mark_complete': {
      const nextFields = { completed: true, current_stage: 'completed' };
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        entity: base44.asServiceRole.entities.WorkOrder,
        workOrderId: work_order.id,
        expectedFields: expectedWorkOrderFields(work_order, nextFields),
        nextFields,
        label: 'Workflow automation completion',
      });
      Object.assign(work_order, saved);
      return { marked_complete: true };
    }
      
    default:
      return { skipped: true, reason: 'Unknown action type' };
  }
  
  return { skipped: true };
}

async function sendEmailAction(base44, config, work_order, changed_by) {
  const recipients = [];
  
  // Resolve recipients
  for (const recipient of (config.recipients || [])) {
    switch (recipient.type) {
      case 'email':
        if (recipient.value) recipients.push(recipient.value);
        break;
      case 'assigned_user':
        if (work_order.assigned_to) {
          const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ full_name: work_order.assigned_to });
          if (users[0]?.email) recipients.push(users[0].email);
        }
        break;
      case 'creator':
        if (work_order.created_by) recipients.push(work_order.created_by);
        break;
      case 'all_admins':
        const admins = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.AuthorizedEmail,
          query: { role: 'admin' },
          sort: null,
          label: 'Workflow automation admin recipients',
        });
        admins.forEach(a => a.email && recipients.push(a.email));
        break;
      case 'email_group':
        if (recipient.value) {
          const groups = await base44.asServiceRole.entities.EmailGroup.filter({ id: recipient.value });
          if (groups[0]?.emails) recipients.push(...groups[0].emails);
        }
        break;
    }
  }
  
  if (recipients.length === 0) {
    return { skipped: true, reason: 'No recipients' };
  }
  
  // Replace template variables
  let subject = config.subject || 'Work Order Update';
  let body = config.body || '';
  
  const vars = {
    '{{title}}': work_order.title || '',
    '{{client_name}}': work_order.client_name || '',
    '{{description}}': work_order.description || '',
    '{{current_stage}}': work_order.current_stage || '',
    '{{assigned_to}}': work_order.assigned_to || '',
    '{{due_date}}': work_order.due_date || '',
    '{{created_by}}': work_order.created_by || '',
    '{{is_rider}}': work_order.is_rider ? 'Yes' : 'No',
    '{{is_asap}}': work_order.asap ? 'Yes' : 'No',
    '{{changed_by}}': changed_by || 'System',
    '{{timestamp}}': new Date().toLocaleString(),
    // Permit line-item context (empty strings when event is not permit-related)
    '{{locality_name}}': work_order.locality_name || '',
    '{{office_type}}': work_order.office_type || '',
    '{{row_name}}': work_order.row_name || '',
    '{{submitted_date}}': work_order.submitted_date || '',
    '{{next_followup_date}}': work_order.next_followup_date || '',
    '{{permit_received_date}}': work_order.permit_received_date || ''
  };
  
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  // Use AI-generated email if enabled
  if (config.use_ai) {
    const aiResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate a professional email notification about a work order update.

Work Order Details:
- Title: ${work_order.title}
- Client: ${work_order.client_name}
- Stage: ${work_order.current_stage}
- Due Date: ${work_order.due_date || 'Not set'}
- Assigned To: ${work_order.assigned_to || 'Unassigned'}
- ASAP: ${work_order.asap ? 'Yes' : 'No'}
- Description: ${work_order.description || 'None'}

Context from user: ${body || 'Standard notification'}

Generate a concise, professional email body (HTML format). Keep it brief but informative.`,
      response_json_schema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" }
        }
      }
    });
    
    if (aiResult.subject) subject = aiResult.subject;
    if (aiResult.body) body = aiResult.body;
  }
  
  // Send email to each recipient
  const sent = [];
  for (const to of [...new Set(recipients)]) {
    try {
      await base44.integrations.Core.SendEmail({
        to,
        subject,
        body
      });
      sent.push(to);
    } catch (e) {
      console.error(`Failed to send to ${to}:`, e);
    }
  }
  
  return { emails_sent: sent.length, recipients: sent };
}