import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from '../../shared/workOrderFieldPersistence.mjs';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Check for approaching and overdue deadlines and trigger notifications
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isScheduledRun = await hasWorkflowInvocationCapability(body, 'checkDeadlineReminders');

    if (!isScheduledRun) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const threeDaysOut = new Date(now);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    const sevenDaysOut = new Date(now);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    
    // Get all active work orders with due dates.
    const workOrders = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.WorkOrder,
      query: { completed: false, deleted: false },
      sort: 'due_date',
      label: 'Deadline reminder Work Orders',
    });
    
    // Get all enabled automation rules for deadline triggers.
    const automations = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.AutomationRule,
      query: { enabled: true },
      sort: 'created_date',
      label: 'Deadline automation rules',
    });
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
        
        // Trigger due_date_passed automations — claimed durably on the Work
        // Order so the same rule cannot re-fire for the same due date.
        for (const rule of deadlineRules) {
          const passedTrigger = rule.triggers?.find(t => t.trigger_type === 'due_date_passed');
          if (passedTrigger) {
            const claim = await claimDeadlineFire(base44, wo, `${rule.id}|due_date_passed|${wo.due_date}`, today);
            if (!claim.claimed) continue;
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
              const claim = await claimDeadlineFire(base44, wo, `${rule.id}|due_date_approaching|${wo.due_date}`, today);
              if (!claim.claimed) continue;
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
    console.error('checkDeadlineReminders error:', error?.message || error);
    return Response.json({ error: 'Deadline reminders could not be checked safely' }, { status: 500 });
  }
});

// Claims a deadline firing on the Work Order so a rule fires only once per
// record/due-date combination. The marker is written BEFORE the actions run
// (same philosophy as permit follow-up claims): a failed run is ambiguous
// after downstream emails, so the claim intentionally stands — it trades a
// possible missed reminder for a guarantee of no duplicate sends. Markers
// older than 90 days are pruned on each write to bound growth.
async function claimDeadlineFire(base44, wo, key, today) {
  const markers = (wo.automation_deadline_fired && typeof wo.automation_deadline_fired === 'object' && !Array.isArray(wo.automation_deadline_fired))
    ? wo.automation_deadline_fired : {};
  if (markers[key]) return { claimed: false, reason: 'already_fired' };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  const nextMarkers = {};
  for (const [k, v] of Object.entries(markers)) {
    if (String(v).slice(0, 10) >= cutoffDate) nextMarkers[k] = v;
  }
  // A per-run nonce in the marker value prevents a second same-day run from
  // satisfying the conditional write's "already desired" early-return and
  // re-firing a key the first run already claimed.
  nextMarkers[key] = `${today}|${crypto.randomUUID().slice(0, 12)}`;
  const nextFields = { automation_deadline_fired: nextMarkers };
  try {
    const saved = await replaceWorkOrderFieldsIfUnchanged({
      entity: base44.asServiceRole.entities.WorkOrder,
      workOrderId: wo.id,
      expectedFields: expectedWorkOrderFields(wo, nextFields),
      nextFields,
      label: 'Deadline reminder claim',
    });
    Object.assign(wo, saved);
    return { claimed: true };
  } catch (error) {
    // A conflicting write or a trashed Work Order means another process owns
    // the record — skip rather than risk a duplicate firing.
    console.warn(`Deadline reminder claim failed for Work Order ${wo.id}:`, error?.message || error);
    return { claimed: false, reason: 'claim_failed' };
  }
}

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
          
        case 'set_asap': {
          const nextFields = { asap: config.asap === true };
          const saved = await replaceWorkOrderFieldsIfUnchanged({
            entity: base44.asServiceRole.entities.WorkOrder,
            workOrderId: work_order.id,
            expectedFields: expectedWorkOrderFields(work_order, nextFields),
            nextFields,
            label: `Deadline automation ${rule.name || 'set_asap'}`,
          });
          Object.assign(work_order, saved);
          results.push({ type: 'set_asap', result: { asap: config.asap } });
          break;
        }
          
        case 'add_task':
          if (config.task) {
            const notes = [
              ...(Array.isArray(work_order.notes) ? work_order.notes : []),
              {
                text: config.task,
                timestamp: new Date().toISOString(),
                created_by: 'Deadline Automation',
                completed: false,
                sub_tasks: []
              }
            ];
            const nextFields = { notes };
            const saved = await replaceWorkOrderFieldsIfUnchanged({
              entity: base44.asServiceRole.entities.WorkOrder,
              workOrderId: work_order.id,
              expectedFields: expectedWorkOrderFields(work_order, nextFields),
              nextFields,
              label: `Deadline automation ${rule.name || 'add_task'}`,
            });
            Object.assign(work_order, saved);
            results.push({ type: 'add_task', result: { task: config.task } });
          }
          break;
          
        case 'add_note':
          if (config.note) {
            const workNotes = [
              ...(Array.isArray(work_order.work_notes) ? work_order.work_notes : []),
              {
                id: Date.now(),
                type: config.note_type || 'admin',
                text: config.note,
                timestamp: new Date().toISOString(),
                created_by: 'Deadline Automation',
                sub_tasks: []
              }
            ];
            const nextFields = { work_notes: workNotes };
            const saved = await replaceWorkOrderFieldsIfUnchanged({
              entity: base44.asServiceRole.entities.WorkOrder,
              workOrderId: work_order.id,
              expectedFields: expectedWorkOrderFields(work_order, nextFields),
              nextFields,
              label: `Deadline automation ${rule.name || 'add_note'}`,
            });
            Object.assign(work_order, saved);
            results.push({ type: 'add_note', result: { note: config.note } });
          }
          break;
          
        default:
          results.push({ type: action.action_type, skipped: true });
      }
    } catch (err) {
      console.error(`Deadline automation action failed (${rule?.name || 'unnamed rule'} / ${action?.action_type || 'unknown action'} / WorkOrder ${work_order?.id || 'unknown'}):`, err);
      results.push({ type: action.action_type, error: 'Deadline automation action could not be completed safely' });
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
        const admins = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.AuthorizedEmail,
          query: { role: 'admin' },
          sort: null,
          label: 'Deadline reminder admin recipients',
        });
        admins.forEach(a => a.email && recipients.push(a.email));
        break;
      case 'creator':
        if (work_order.created_by) recipients.push(work_order.created_by);
        break;
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
  
  // Replace variables — HTML-escape all work-order-derived values to prevent
  // injected markup from rendering inside notification emails.
  const vars: Record<string, string> = {
    '{{title}}': esc(work_order.title),
    '{{client_name}}': esc(work_order.client_name),
    '{{due_date}}': esc(work_order.due_date),
    '{{current_stage}}': esc(work_order.current_stage),
    '{{assigned_to}}': esc(work_order.assigned_to || 'Unassigned'),
    '{{days_overdue}}': isOverdue ? String(daysDiff) : '0',
    '{{days_until_due}}': !isOverdue ? String(daysDiff) : '0',
  };

  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  // Generate default body if empty
  if (!body) {
    const safeTitle = esc(work_order.title);
    const safeClient = esc(work_order.client_name);
    const safeDue = esc(work_order.due_date);
    const safeStage = esc(work_order.current_stage);
    const safeAssigned = esc(work_order.assigned_to || 'Unassigned');
    if (isOverdue) {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEE2E2; padding: 20px; border-radius: 8px; border-left: 4px solid #EF4444;">
            <h2 style="color: #991B1B; margin: 0 0 10px 0;">⚠️ Work Order Overdue</h2>
            <p style="color: #7F1D1D; margin: 0;"><strong>${safeTitle}</strong> for <strong>${safeClient}</strong> is ${daysDiff} day(s) overdue.</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Due Date:</strong> ${safeDue}</p>
            <p><strong>Current Stage:</strong> ${safeStage}</p>
            <p><strong>Assigned To:</strong> ${safeAssigned}</p>
          </div>
        </div>
      `;
    } else {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; border-left: 4px solid #F59E0B;">
            <h2 style="color: #92400E; margin: 0 0 10px 0;">📅 Deadline Approaching</h2>
            <p style="color: #78350F; margin: 0;"><strong>${safeTitle}</strong> for <strong>${safeClient}</strong> is due in ${daysDiff} day(s).</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Due Date:</strong> ${safeDue}</p>
            <p><strong>Current Stage:</strong> ${safeStage}</p>
            <p><strong>Assigned To:</strong> ${safeAssigned}</p>
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