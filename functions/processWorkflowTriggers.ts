import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    const automations = await base44.asServiceRole.entities.AutomationRule.filter({ enabled: true });
    
    const triggeredActions = [];
    
    for (const rule of automations) {
      const triggers = rule.triggers || [];
      
      // Check if any trigger matches
      let triggered = false;
      
      for (const trigger of triggers) {
        if (matchesTrigger(trigger, event_type, work_order, old_data)) {
          triggered = true;
          break;
        }
      }
      
      if (!triggered) continue;
      
      // Execute all actions
      for (const action of rule.actions || []) {
        try {
          const result = await executeAction(base44, action, work_order, changed_by);
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
      
    default:
      return false;
  }
  
  // Check additional conditions
  if (condition.is_asap === true && !work_order.asap) return false;
  if (condition.is_rider === true && !work_order.is_rider) return false;
  if (condition.is_rider === false && work_order.is_rider) return false;
  
  return true;
}

async function executeAction(base44, action, work_order, changed_by) {
  const config = action.action_config || {};
  
  switch (action.action_type) {
    case 'send_email':
      return await sendEmailAction(base44, config, work_order, changed_by);
      
    case 'change_stage':
      if (config.stage) {
        await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
          current_stage: config.stage
        });
        return { stage_changed_to: config.stage };
      }
      break;
      
    case 'set_asap':
      await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
        asap: config.asap === true
      });
      return { asap_set: config.asap };
      
    case 'assign_to':
      if (config.assignee) {
        await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
          assigned_to: config.assignee
        });
        return { assigned_to: config.assignee };
      }
      break;
      
    case 'add_task':
      if (config.task) {
        const currentNotes = work_order.notes || [];
        const newTask = {
          text: config.task,
          timestamp: new Date().toISOString(),
          created_by: 'Automation',
          completed: false,
          sub_tasks: []
        };
        await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
          notes: [...currentNotes, newTask]
        });
        return { task_added: config.task };
      }
      break;
      
    case 'add_note':
      if (config.note) {
        const currentWorkNotes = work_order.work_notes || [];
        const newNote = {
          id: Date.now(),
          type: config.note_type || 'admin',
          text: config.note,
          timestamp: new Date().toISOString(),
          created_by: 'Automation',
          sub_tasks: []
        };
        await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
          work_notes: [...currentWorkNotes, newNote]
        });
        return { note_added: config.note };
      }
      break;
      
    case 'set_due_date':
      if (config.days) {
        const days = parseInt(config.days);
        const date = new Date();
        date.setDate(date.getDate() + days);
        await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
          due_date: date.toISOString().split('T')[0]
        });
        return { due_date_set: date.toISOString().split('T')[0] };
      }
      break;
      
    case 'mark_complete':
      await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
        completed: true,
        current_stage: 'completed'
      });
      return { marked_complete: true };
      
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
        const admins = await base44.asServiceRole.entities.AuthorizedEmail.filter({ role: 'admin' });
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
    '{{timestamp}}': new Date().toLocaleString()
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