import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Check for approaching and overdue deadlines and trigger notifications
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Only allow admins to run this
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const threeDaysOut = new Date(now);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    const sevenDaysOut = new Date(now);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    
    // Get all active work orders with due dates
    const workOrders = await base44.asServiceRole.entities.WorkOrder.filter({ 
      completed: false,
      deleted: false
    });
    
    // Get automation rules for deadline triggers
    const automations = await base44.asServiceRole.entities.AutomationRule.filter({ enabled: true });
    const deadlineRules = automations.filter(a => 
      a.triggers?.some(t => 
        t.trigger_type === 'due_date_approaching' || 
        t.trigger_type === 'due_date_passed'
      )
    );
    
    const results = {
      overdue: [],
      approaching: [],
      triggered_automations: []
    };
    
    for (const wo of workOrders) {
      if (!wo.due_date) continue;
      
      const dueDate = new Date(wo.due_date + 'T23:59:59');
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      
      // Check for overdue
      if (dueDate < now) {
        results.overdue.push({
          id: wo.id,
          title: wo.title,
          client: wo.client_name,
          due_date: wo.due_date,
          days_overdue: Math.abs(daysUntilDue)
        });
        
        // Trigger due_date_passed automations
        for (const rule of deadlineRules) {
          const passedTrigger = rule.triggers?.find(t => t.trigger_type === 'due_date_passed');
          if (passedTrigger) {
            const actionResults = await executeRuleActions(base44, rule, wo, 'due_date_passed');
            results.triggered_automations.push({
              rule: rule.name,
              work_order: wo.title,
              trigger: 'due_date_passed',
              actions: actionResults
            });
          }
        }
      }
      // Check for approaching deadlines
      else if (daysUntilDue <= 7 && daysUntilDue > 0) {
        results.approaching.push({
          id: wo.id,
          title: wo.title,
          client: wo.client_name,
          due_date: wo.due_date,
          days_until_due: daysUntilDue
        });
        
        // Trigger due_date_approaching automations
        for (const rule of deadlineRules) {
          const approachingTrigger = rule.triggers?.find(t => t.trigger_type === 'due_date_approaching');
          if (approachingTrigger) {
            const condition = approachingTrigger.trigger_condition || {};
            const daysThreshold = condition.days_before_due || 7;
            
            if (daysUntilDue <= daysThreshold) {
              const actionResults = await executeRuleActions(base44, rule, wo, 'due_date_approaching');
              results.triggered_automations.push({
                rule: rule.name,
                work_order: wo.title,
                trigger: 'due_date_approaching',
                days_until_due: daysUntilDue,
                actions: actionResults
              });
            }
          }
        }
      }
    }
    
    return Response.json({
      success: true,
      checked_at: now.toISOString(),
      summary: {
        total_work_orders: workOrders.length,
        overdue_count: results.overdue.length,
        approaching_count: results.approaching.length,
        automations_triggered: results.triggered_automations.length
      },
      details: results
    });
    
  } catch (error) {
    console.error('Error checking deadlines:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function executeRuleActions(base44, rule, work_order, trigger_type) {
  const results = [];
  
  for (const action of rule.actions || []) {
    try {
      const config = action.action_config || {};
      
      switch (action.action_type) {
        case 'send_email':
          const emailResult = await sendDeadlineEmail(base44, config, work_order, trigger_type);
          results.push({ type: 'send_email', result: emailResult });
          break;
          
        case 'set_asap':
          await base44.asServiceRole.entities.WorkOrder.update(work_order.id, {
            asap: config.asap === true
          });
          results.push({ type: 'set_asap', result: { asap: config.asap } });
          break;
          
        case 'add_task':
          if (config.task) {
            const notes = work_order.notes || [];
            notes.push({
              text: config.task,
              timestamp: new Date().toISOString(),
              created_by: 'Deadline Automation',
              completed: false,
              sub_tasks: []
            });
            await base44.asServiceRole.entities.WorkOrder.update(work_order.id, { notes });
            results.push({ type: 'add_task', result: { task: config.task } });
          }
          break;
          
        case 'add_note':
          if (config.note) {
            const workNotes = work_order.work_notes || [];
            workNotes.push({
              id: Date.now(),
              type: config.note_type || 'admin',
              text: config.note,
              timestamp: new Date().toISOString(),
              created_by: 'Deadline Automation',
              sub_tasks: []
            });
            await base44.asServiceRole.entities.WorkOrder.update(work_order.id, { work_notes: workNotes });
            results.push({ type: 'add_note', result: { note: config.note } });
          }
          break;
          
        default:
          results.push({ type: action.action_type, skipped: true });
      }
    } catch (err) {
      results.push({ type: action.action_type, error: err.message });
    }
  }
  
  return results;
}

async function sendDeadlineEmail(base44, config, work_order, trigger_type) {
  const recipients = [];
  
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
  
  const isOverdue = trigger_type === 'due_date_passed';
  const dueDate = new Date(work_order.due_date);
  const now = new Date();
  const daysDiff = Math.ceil(Math.abs(dueDate - now) / (1000 * 60 * 60 * 24));
  
  let subject = config.subject || (isOverdue 
    ? `⚠️ OVERDUE: ${work_order.title}` 
    : `📅 Deadline Approaching: ${work_order.title}`);
    
  let body = config.body || '';
  
  // Replace variables
  const vars = {
    '{{title}}': work_order.title || '',
    '{{client_name}}': work_order.client_name || '',
    '{{due_date}}': work_order.due_date || '',
    '{{current_stage}}': work_order.current_stage || '',
    '{{assigned_to}}': work_order.assigned_to || 'Unassigned',
    '{{days_overdue}}': isOverdue ? daysDiff.toString() : '0',
    '{{days_until_due}}': !isOverdue ? daysDiff.toString() : '0'
  };
  
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  // Generate default body if empty
  if (!body) {
    if (isOverdue) {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEE2E2; padding: 20px; border-radius: 8px; border-left: 4px solid #EF4444;">
            <h2 style="color: #991B1B; margin: 0 0 10px 0;">⚠️ Work Order Overdue</h2>
            <p style="color: #7F1D1D; margin: 0;"><strong>${work_order.title}</strong> for <strong>${work_order.client_name}</strong> is ${daysDiff} day(s) overdue.</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Due Date:</strong> ${work_order.due_date}</p>
            <p><strong>Current Stage:</strong> ${work_order.current_stage}</p>
            <p><strong>Assigned To:</strong> ${work_order.assigned_to || 'Unassigned'}</p>
          </div>
        </div>
      `;
    } else {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; border-left: 4px solid #F59E0B;">
            <h2 style="color: #92400E; margin: 0 0 10px 0;">📅 Deadline Approaching</h2>
            <p style="color: #78350F; margin: 0;"><strong>${work_order.title}</strong> for <strong>${work_order.client_name}</strong> is due in ${daysDiff} day(s).</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Due Date:</strong> ${work_order.due_date}</p>
            <p><strong>Current Stage:</strong> ${work_order.current_stage}</p>
            <p><strong>Assigned To:</strong> ${work_order.assigned_to || 'Unassigned'}</p>
          </div>
        </div>
      `;
    }
  }
  
  const sent = [];
  for (const to of [...new Set(recipients)]) {
    try {
      await base44.integrations.Core.SendEmail({ to, subject, body });
      sent.push(to);
    } catch (e) {
      console.error(`Failed to send to ${to}:`, e);
    }
  }
  
  return { emails_sent: sent.length, recipients: sent };
}