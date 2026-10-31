import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from '../../shared/workOrderFieldPersistence.mjs';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { sanitizeEmailSubject } from '../../shared/emailSubject.mjs';

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

    const ORDER_DEADLINE_TRIGGERS = ['order_date_needed_approaching', 'order_date_needed_passed', 'order_overdue'];
    const orderDeadlineRules = automations.filter(a =>
      a.triggers?.some(t => ORDER_DEADLINE_TRIGGERS.includes(t.trigger_type))
    );
    const installDateRules = automations.filter(a =>
      a.triggers?.some(t =>
        t.trigger_type === 'work_order_install_date_approaching' ||
        t.trigger_type === 'work_order_install_date_passed'
      )
    );
    const siteSurveyRules = automations.filter(a =>
      a.triggers?.some(t => t.trigger_type === 'site_survey_approaching')
    );
    const sipRevisitRules = automations.filter(a =>
      a.triggers?.some(t => t.trigger_type === 'sip_revisit_date_approaching')
    );
    const taskDeadlineRules = automations.filter(a =>
      a.triggers?.some(t =>
        t.trigger_type === 'task_due_date_approaching' ||
        t.trigger_type === 'task_due_date_passed'
      )
    );
    const SALES_DEADLINE_TRIGGERS = [
      'sales_follow_up_date_approaching', 'sales_follow_up_date_passed',
      'sales_close_date_approaching',
    ];
    const salesDeadlineRules = automations.filter(a =>
      a.triggers?.some(t => SALES_DEADLINE_TRIGGERS.includes(t.trigger_type))
    );
    const activeOrders = orderDeadlineRules.length > 0
      ? await loadAllEntityRows({
          entity: base44.asServiceRole.entities.Order,
          query: { deleted: false },
          sort: 'date_needed',
          label: 'Deadline reminder Orders',
        })
      : [];
    const openOpportunities = salesDeadlineRules.length > 0
      ? await loadAllEntityRows({
          entity: base44.asServiceRole.entities.Opportunity,
          query: {},
          sort: 'next_action_due',
          label: 'Deadline reminder Opportunities',
        })
      : [];

    const results = {
      overdue: [],
      approaching: [],
      orders_overdue: [],
      orders_approaching: [],
      triggered_automations: []
    };
    
    for (const wo of workOrders) {
      // Per-task due dates: each (rule, task, due date) is claimed on the
      // WO's marker map so a task reminder fires exactly once.
      if (taskDeadlineRules.length > 0 && Array.isArray(wo.notes)) {
        for (const task of wo.notes) {
          const taskDue = String(task?.due_date || '').trim();
          if (!taskDue || task?.completed) continue;
          const taskKey = String(task?.id ?? task?.text ?? '').slice(0, 80);
          if (!taskKey) continue;
          const taskTarget = new Date(taskDue + 'T23:59:59');
          const daysUntilTask = Math.ceil((taskTarget - now) / (1000 * 60 * 60 * 24));
          const taskCtx = { text: String(task?.text || ''), due_date: taskDue };
          for (const rule of taskDeadlineRules) {
            if (taskTarget < now) {
              const trigger = rule.triggers?.find(t => t.trigger_type === 'task_due_date_passed');
              if (!trigger) continue;
              const claim = await claimDeadlineFire(base44, wo, `${rule.id}|task_due_date_passed|${taskKey}|${taskDue}`, today);
              if (!claim.claimed) continue;
              const actionResults = await executeRuleActions(base44, rule, wo, 'task_due_date_passed', taskCtx);
              results.triggered_automations.push({ rule: rule.name, work_order: wo.title, task: taskCtx.text, trigger: 'task_due_date_passed', actions: actionResults });
            } else if (daysUntilTask <= 7 && daysUntilTask > 0) {
              const trigger = rule.triggers?.find(t => t.trigger_type === 'task_due_date_approaching');
              if (!trigger) continue;
              const condition = trigger.trigger_condition || {};
              if (daysUntilTask > (condition.days_before_due || 7)) continue;
              const claim = await claimDeadlineFire(base44, wo, `${rule.id}|task_due_date_approaching|${taskKey}|${taskDue}`, today);
              if (!claim.claimed) continue;
              const actionResults = await executeRuleActions(base44, rule, wo, 'task_due_date_approaching', taskCtx);
              results.triggered_automations.push({ rule: rule.name, work_order: wo.title, task: taskCtx.text, trigger: 'task_due_date_approaching', days_until_due: daysUntilTask, actions: actionResults });
            }
          }
        }
      }
      // Install-date reminders run the same claim/action path as due dates,
      // keyed on project_install_date.
      if (installDateRules.length > 0 && wo.project_install_date) {
        const installDate = new Date(wo.project_install_date + 'T23:59:59');
        const daysUntilInstall = Math.ceil((installDate - now) / (1000 * 60 * 60 * 24));
        for (const rule of installDateRules) {
          if (installDate < now) {
            const trigger = rule.triggers?.find(t => t.trigger_type === 'work_order_install_date_passed');
            if (!trigger) continue;
            const claim = await claimDeadlineFire(base44, wo, `${rule.id}|work_order_install_date_passed|${wo.project_install_date}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRuleActions(base44, rule, wo, 'work_order_install_date_passed');
            results.triggered_automations.push({ rule: rule.name, work_order: wo.title, trigger: 'work_order_install_date_passed', actions: actionResults });
          } else if (daysUntilInstall <= 7 && daysUntilInstall > 0) {
            const trigger = rule.triggers?.find(t => t.trigger_type === 'work_order_install_date_approaching');
            if (!trigger) continue;
            const condition = trigger.trigger_condition || {};
            if (daysUntilInstall > (condition.days_before_due || 7)) continue;
            const claim = await claimDeadlineFire(base44, wo, `${rule.id}|work_order_install_date_approaching|${wo.project_install_date}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRuleActions(base44, rule, wo, 'work_order_install_date_approaching');
            results.triggered_automations.push({ rule: rule.name, work_order: wo.title, trigger: 'work_order_install_date_approaching', days_until_due: daysUntilInstall, actions: actionResults });
          }
        }
      }

      // Site-survey reminders fire only on approach — there is no advertised
      // "survey passed" trigger.
      if (siteSurveyRules.length > 0 && wo.site_survey_date) {
        const surveyDate = new Date(wo.site_survey_date + 'T23:59:59');
        const daysUntilSurvey = Math.ceil((surveyDate - now) / (1000 * 60 * 60 * 24));
        if (surveyDate >= now && daysUntilSurvey <= 7 && daysUntilSurvey > 0) {
          for (const rule of siteSurveyRules) {
            const trigger = rule.triggers?.find(t => t.trigger_type === 'site_survey_approaching');
            if (!trigger) continue;
            const condition = trigger.trigger_condition || {};
            if (daysUntilSurvey > (condition.days_before_due || 7)) continue;
            const claim = await claimDeadlineFire(base44, wo, `${rule.id}|site_survey_approaching|${wo.site_survey_date}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRuleActions(base44, rule, wo, 'site_survey_approaching');
            results.triggered_automations.push({ rule: rule.name, work_order: wo.title, trigger: 'site_survey_approaching', days_until_due: daysUntilSurvey, actions: actionResults });
          }
        }
      }

      // SIP revisit reminders fire only on approach — there is no advertised
      // "revisit passed" trigger.
      if (sipRevisitRules.length > 0 && wo.sip_revisit_date) {
        const revisitDate = new Date(wo.sip_revisit_date + 'T23:59:59');
        const daysUntilRevisit = Math.ceil((revisitDate - now) / (1000 * 60 * 60 * 24));
        if (revisitDate >= now && daysUntilRevisit <= 7 && daysUntilRevisit > 0) {
          for (const rule of sipRevisitRules) {
            const trigger = rule.triggers?.find(t => t.trigger_type === 'sip_revisit_date_approaching');
            if (!trigger) continue;
            const condition = trigger.trigger_condition || {};
            if (daysUntilRevisit > (condition.days_before_due || 7)) continue;
            const claim = await claimDeadlineFire(base44, wo, `${rule.id}|sip_revisit_date_approaching|${wo.sip_revisit_date}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRuleActions(base44, rule, wo, 'sip_revisit_date_approaching');
            results.triggered_automations.push({ rule: rule.name, work_order: wo.title, trigger: 'sip_revisit_date_approaching', days_until_due: daysUntilRevisit, actions: actionResults });
          }
        }
      }

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
    
    // Orders awaiting delivery get the same once-per-rule/due-date treatment:
    // approaching when date_needed is inside the threshold window, overdue
    // (and order_overdue) once it has passed. Both overdue trigger types fire
    // for the same order — they are distinct advertised triggers.
    for (const order of activeOrders) {
      if (!order.date_needed || order.status === 'received' || order.status === 'cancelled') continue;

      const neededDate = new Date(order.date_needed + 'T23:59:59');
      const daysUntilNeeded = Math.ceil((neededDate - now) / (1000 * 60 * 60 * 24));

      if (neededDate < now) {
        results.orders_overdue.push({ id: order.id, customer: order.customer_name, date_needed: order.date_needed, days_overdue: Math.abs(daysUntilNeeded) });
        for (const rule of orderDeadlineRules) {
          for (const triggerType of ['order_date_needed_passed', 'order_overdue']) {
            const trigger = rule.triggers?.find(t => t.trigger_type === triggerType);
            if (!trigger || !orderMatchesTriggerFilters(order, trigger)) continue;
            const claim = await claimRecordDeadlineFire(base44, base44.asServiceRole.entities.Order, order, `${rule.id}|${triggerType}|${order.date_needed}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRecordRuleActions(base44, rule, order, triggerType);
            results.triggered_automations.push({ rule: rule.name, order: order.customer_name, trigger: triggerType, actions: actionResults });
          }
        }
      } else if (daysUntilNeeded <= 7 && daysUntilNeeded > 0) {
        results.orders_approaching.push({ id: order.id, customer: order.customer_name, date_needed: order.date_needed, days_until_due: daysUntilNeeded });
        for (const rule of orderDeadlineRules) {
          const trigger = rule.triggers?.find(t => t.trigger_type === 'order_date_needed_approaching');
          if (!trigger || !orderMatchesTriggerFilters(order, trigger)) continue;
          const condition = trigger.trigger_condition || {};
          if (daysUntilNeeded > (condition.days_before_due || 7)) continue;
          const claim = await claimRecordDeadlineFire(base44, base44.asServiceRole.entities.Order, order, `${rule.id}|order_date_needed_approaching|${order.date_needed}`, today);
          if (!claim.claimed) continue;
          const actionResults = await executeRecordRuleActions(base44, rule, order, 'order_date_needed_approaching');
          results.triggered_automations.push({ rule: rule.name, order: order.customer_name, trigger: 'order_date_needed_approaching', days_until_due: daysUntilNeeded, actions: actionResults });
        }
      }
    }

    // Sales-pipeline reminders: open opportunities only (won/lost are done).
    // next_action_due covers follow-up approaching + passed; the desired
    // completion date covers close-date approaching only.
    for (const opp of openOpportunities) {
      const oppStage = String(opp.stage || '').trim();
      if (oppStage === 'won' || oppStage === 'lost') continue;

      for (const [field, approachingType, passedType] of [
        ['next_action_due', 'sales_follow_up_date_approaching', 'sales_follow_up_date_passed'],
        ['desired_completion_date', 'sales_close_date_approaching', null],
      ]) {
        const dateStr = String(opp[field] || '').trim();
        if (!dateStr) continue;
        const target = new Date(dateStr + 'T23:59:59');
        const daysUntil = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

        for (const rule of salesDeadlineRules) {
          if (target < now && passedType) {
            const trigger = rule.triggers?.find(t => t.trigger_type === passedType);
            if (!trigger) continue;
            const claim = await claimRecordDeadlineFire(base44, base44.asServiceRole.entities.Opportunity, opp, `${rule.id}|${passedType}|${field}|${dateStr}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRecordRuleActions(base44, rule, opp, passedType, sendOpportunityDeadlineEmail);
            results.triggered_automations.push({ rule: rule.name, opportunity: opp.title, trigger: passedType, actions: actionResults });
          } else if (daysUntil <= 7 && daysUntil > 0) {
            const trigger = rule.triggers?.find(t => t.trigger_type === approachingType);
            if (!trigger) continue;
            const condition = trigger.trigger_condition || {};
            if (daysUntil > (condition.days_before_due || 7)) continue;
            const claim = await claimRecordDeadlineFire(base44, base44.asServiceRole.entities.Opportunity, opp, `${rule.id}|${approachingType}|${field}|${dateStr}`, today);
            if (!claim.claimed) continue;
            const actionResults = await executeRecordRuleActions(base44, rule, opp, approachingType, sendOpportunityDeadlineEmail);
            results.triggered_automations.push({ rule: rule.name, opportunity: opp.title, trigger: approachingType, days_until_due: daysUntil, actions: actionResults });
          }
        }
      }
    }

    return Response.json({
      success: true,
      checked_at: now.toISOString(),
      summary: {
        total_work_orders: workOrders.length,
        total_orders: activeOrders.length,
        total_opportunities: openOpportunities.length,
        overdue_count: results.overdue.length,
        approaching_count: results.approaching.length,
        orders_overdue_count: results.orders_overdue.length,
        orders_approaching_count: results.orders_approaching.length,
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

async function executeRuleActions(base44, rule, work_order, trigger_type, taskCtx = null) {
  const results = [];

  for (const action of rule.actions || []) {
    try {
      const config = action.action_config || {};

      switch (action.action_type) {
        case 'send_email':
          const emailResult = await sendDeadlineEmail(base44, config, work_order, trigger_type, taskCtx);
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

async function sendDeadlineEmail(base44, config, work_order, trigger_type, taskCtx = null) {
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
  
  const isInstall = trigger_type === 'work_order_install_date_passed' || trigger_type === 'work_order_install_date_approaching';
  const isTask = taskCtx !== null;
  const isRevisit = trigger_type === 'sip_revisit_date_approaching';
  const isOverdue = trigger_type === 'due_date_passed' || trigger_type === 'work_order_install_date_passed' || trigger_type === 'task_due_date_passed';
  const effectiveDate = isTask ? taskCtx.due_date : isInstall ? work_order.project_install_date : isRevisit ? work_order.sip_revisit_date : work_order.due_date;
  const dueDate = new Date(effectiveDate);
  const now = new Date();
  const daysDiff = Math.ceil(Math.abs(dueDate - now) / (1000 * 60 * 60 * 24));

  let subject = config.subject || (isOverdue
    ? `⚠️ ${isTask ? 'TASK OVERDUE' : isInstall ? 'INSTALL DATE PASSED' : 'OVERDUE'}: ${isTask ? taskCtx.text : work_order.title}`
    : `📅 ${isTask ? 'Task Due Approaching' : isInstall ? 'Install Date Approaching' : isRevisit ? 'SIP Revisit Date Approaching' : 'Deadline Approaching'}: ${isTask ? taskCtx.text : work_order.title}`);

  let body = config.body || '';

  // Replace variables — HTML-escape all work-order-derived values to prevent
  // injected markup from rendering inside notification emails.
  const vars: Record<string, string> = {
    '{{title}}': esc(work_order.title),
    '{{client_name}}': esc(work_order.client_name),
    '{{due_date}}': esc(work_order.due_date),
    '{{install_date}}': esc(work_order.project_install_date),
    '{{current_stage}}': esc(work_order.current_stage),
    '{{assigned_to}}': esc(work_order.assigned_to || 'Unassigned'),
    '{{task_text}}': esc(taskCtx?.text),
    '{{task_due_date}}': esc(taskCtx?.due_date),
    '{{sip_revisit_date}}': esc(work_order.sip_revisit_date),
    '{{days_overdue}}': isOverdue ? String(daysDiff) : '0',
    '{{days_until_due}}': !isOverdue ? String(daysDiff) : '0',
  };

  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  subject = sanitizeEmailSubject(subject);

  // Generate default body if empty
  if (!body) {
    const safeTitle = esc(work_order.title);
    const safeClient = esc(work_order.client_name);
    const safeDue = esc(effectiveDate);
    const safeStage = esc(work_order.current_stage);
    const safeAssigned = esc(work_order.assigned_to || 'Unassigned');
    const dateLabel = isInstall ? 'Install Date' : 'Due Date';
    if (isOverdue) {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEE2E2; padding: 20px; border-radius: 8px; border-left: 4px solid #EF4444;">
            <h2 style="color: #991B1B; margin: 0 0 10px 0;">⚠️ ${isInstall ? 'Install Date Passed' : 'Work Order Overdue'}</h2>
            <p style="color: #7F1D1D; margin: 0;"><strong>${safeTitle}</strong> for <strong>${safeClient}</strong> is ${daysDiff} day(s) ${isInstall ? 'past its install date' : 'overdue'}.</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>${dateLabel}:</strong> ${safeDue}</p>
            <p><strong>Current Stage:</strong> ${safeStage}</p>
            <p><strong>Assigned To:</strong> ${safeAssigned}</p>
          </div>
        </div>
      `;
    } else {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; border-left: 4px solid #F59E0B;">
            <h2 style="color: #92400E; margin: 0 0 10px 0;">📅 ${isInstall ? 'Install Date Approaching' : 'Deadline Approaching'}</h2>
            <p style="color: #78350F; margin: 0;"><strong>${safeTitle}</strong> for <strong>${safeClient}</strong> is ${isInstall ? 'scheduled to install' : 'due'} in ${daysDiff} day(s).</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>${dateLabel}:</strong> ${safeDue}</p>
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

// Order filters must match the same semantics as the workflow engine's
// order_* matching, so a rule behaves identically whichever path fires it.
function orderMatchesTriggerFilters(order, trigger) {
  const condition = trigger?.trigger_condition || {};
  if (condition.request_type && String(order.request_type || '') !== condition.request_type) return false;
  if (condition.vendor && String(order.vendor || '') !== condition.vendor) return false;
  if (condition.requestor && String(order.requestor_name || order.requestor || '') !== condition.requestor) return false;
  if (condition.min_quantity != null && !(Number(order.quantity) >= Number(condition.min_quantity))) return false;
  if (condition.max_quantity != null && !(Number(order.quantity) <= Number(condition.max_quantity))) return false;
  return true;
}

// Order version of the Work Order claim: conditional write on the loaded
// version so two runs cannot both claim the same rule/due-date firing.
async function claimRecordDeadlineFire(base44, entityApi, order, key, today) {
  const markers = (order.automation_deadline_fired && typeof order.automation_deadline_fired === 'object' && !Array.isArray(order.automation_deadline_fired))
    ? order.automation_deadline_fired : {};
  if (markers[key]) return { claimed: false, reason: 'already_fired' };
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  const nextMarkers = {};
  for (const [k, v] of Object.entries(markers)) {
    if (String(v).slice(0, 10) >= cutoffDate) nextMarkers[k] = v;
  }
  nextMarkers[key] = `${today}|${crypto.randomUUID().slice(0, 12)}`;

  const version = String(order.updated_date || '').trim();
  if (!version) {
    console.warn(`Record deadline claim has no loaded version for Order ${order.id} — skipping.`);
    return { claimed: false, reason: 'claim_failed' };
  }
  let result;
  try {
    result = await entityApi.updateMany(
      { id: order.id, updated_date: version },
      { $set: { automation_deadline_fired: nextMarkers } },
    );
  } catch (error) {
    let afterError;
    try {
      afterError = await entityApi.get(order.id);
    } catch (verificationError) {
      console.warn(`Record deadline claim errored and its outcome could not be verified for ${order.id}:`, verificationError?.message || verificationError);
      return { claimed: false, reason: 'claim_failed' };
    }
    if (afterError?.automation_deadline_fired?.[key] === nextMarkers[key]) {
      Object.assign(order, afterError);
      return { claimed: true };
    }
    console.warn(`Record deadline claim failed for Order ${order.id}:`, error?.message || error);
    return { claimed: false, reason: 'claim_failed' };
  }
  if (!result || typeof result.updated !== 'number') {
    console.warn(`Record deadline claim result could not be verified for ${order.id}.`);
    return { claimed: false, reason: 'claim_failed' };
  }
  if (result.updated === 1) {
    const saved = await entityApi.get(order.id).catch(() => null);
    if (!saved?.id || saved.automation_deadline_fired?.[key] !== nextMarkers[key]) {
      console.warn(`Record deadline claim succeeded but could not be verified for ${order.id} — skipping to avoid a duplicate firing.`);
      return { claimed: false, reason: 'claim_failed' };
    }
    Object.assign(order, saved);
    return { claimed: true };
  }
  // updated === 0: a concurrent write owns the record — skip; the next daily
  // run re-evaluates.
  return { claimed: false, reason: 'conflict' };
}

// Record deadline rules are send_email only: Orders and Opportunities carry
// no Work Order, so mutating actions are reported as skipped.
async function executeRecordRuleActions(base44, rule, record, trigger_type, sendEmail = sendOrderDeadlineEmail) {
  const results = [];
  for (const action of rule.actions || []) {
    try {
      if (action.action_type === 'send_email') {
        results.push({ type: 'send_email', result: await sendEmail(base44, action.action_config || {}, record, trigger_type) });
      } else {
        results.push({ type: action.action_type, skipped: true, reason: 'Action requires a Work Order' });
      }
    } catch (err) {
      console.error(`Record deadline automation action failed (${rule?.name || 'unnamed rule'} / ${action?.action_type || 'unknown'} / ${record?.id || 'unknown'}):`, err);
      results.push({ type: action.action_type, error: 'Deadline automation action could not be completed safely' });
    }
  }
  return results;
}

async function sendOrderDeadlineEmail(base44, config, order, trigger_type) {
  const recipients = [];

  for (const recipient of (config.recipients || [])) {
    switch (recipient.type) {
      case 'email':
        if (recipient.value) recipients.push(recipient.value);
        break;
      case 'all_admins': {
        const admins = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.AuthorizedEmail,
          query: { role: 'admin' },
          sort: null,
          label: 'Order deadline admin recipients',
        });
        admins.forEach(a => a.email && recipients.push(a.email));
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
          if (groups[0]?.emails) recipients.push(...groups[0].emails);
        }
        break;
    }
  }

  if (recipients.length === 0) {
    return { skipped: true, reason: 'No recipients' };
  }

  const isOverdue = trigger_type === 'order_date_needed_passed' || trigger_type === 'order_overdue';
  const neededDate = new Date(order.date_needed);
  const now = new Date();
  const daysDiff = Math.ceil(Math.abs(neededDate - now) / (1000 * 60 * 60 * 24));

  let subject = config.subject || (isOverdue
    ? `⚠️ OVERDUE ORDER: ${order.customer_name || 'Customer'}`
    : `📅 Order Date Needed Approaching: ${order.customer_name || 'Customer'}`);
  let body = config.body || '';

  const vars: Record<string, string> = {
    '{{customer_name}}': esc(order.customer_name),
    '{{request_type}}': esc(order.request_type),
    '{{description}}': esc(order.description),
    '{{quantity}}': esc(order.quantity),
    '{{requestor_name}}': esc(order.requestor_name),
    '{{requestor_email}}': esc(order.requestor_email),
    '{{vendor}}': esc(order.vendor),
    '{{date_needed}}': esc(order.date_needed),
    '{{date_ordered}}': esc(order.date_ordered),
    '{{status}}': esc(order.status),
    '{{days_overdue}}': isOverdue ? String(daysDiff) : '0',
    '{{days_until_due}}': !isOverdue ? String(daysDiff) : '0',
  };
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  subject = sanitizeEmailSubject(subject);

  if (!body) {
    const safeCustomer = esc(order.customer_name);
    const safeRequest = esc(order.request_type);
    const safeVendor = esc(order.vendor || 'Not specified');
    const safeNeeded = esc(order.date_needed);
    const safeDescription = esc(order.description || 'None');
    if (isOverdue) {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEE2E2; padding: 20px; border-radius: 8px; border-left: 4px solid #EF4444;">
            <h2 style="color: #991B1B; margin: 0 0 10px 0;">⚠️ Order Overdue</h2>
            <p style="color: #7F1D1D; margin: 0;"><strong>${safeCustomer}</strong> — ${safeRequest} is ${daysDiff} day(s) past its needed date.</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Date Needed:</strong> ${safeNeeded}</p>
            <p><strong>Vendor:</strong> ${safeVendor}</p>
            <p><strong>Description:</strong> ${safeDescription}</p>
          </div>
        </div>
      `;
    } else {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; border-left: 4px solid #F59E0B;">
            <h2 style="color: #92400E; margin: 0 0 10px 0;">📅 Order Date Needed Approaching</h2>
            <p style="color: #78350F; margin: 0;"><strong>${safeCustomer}</strong> — ${safeRequest} is needed in ${daysDiff} day(s).</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Date Needed:</strong> ${safeNeeded}</p>
            <p><strong>Vendor:</strong> ${safeVendor}</p>
            <p><strong>Description:</strong> ${safeDescription}</p>
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
async function sendOpportunityDeadlineEmail(base44, config, opp, trigger_type) {
  const recipients = [];

  for (const recipient of (config.recipients || [])) {
    switch (recipient.type) {
      case 'email':
        if (recipient.value) recipients.push(recipient.value);
        break;
      case 'all_admins': {
        const admins = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.AuthorizedEmail,
          query: { role: 'admin' },
          sort: null,
          label: 'Sales deadline admin recipients',
        });
        admins.forEach(a => a.email && recipients.push(a.email));
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
          if (groups[0]?.emails) recipients.push(...groups[0].emails);
        }
        break;
    }
  }

  if (recipients.length === 0) {
    return { skipped: true, reason: 'No recipients' };
  }

  const isOverdue = trigger_type === 'sales_follow_up_date_passed';
  const isFollowUp = trigger_type.startsWith('sales_follow_up');
  const dateStr = isFollowUp ? opp.next_action_due : opp.desired_completion_date;
  const target = new Date(dateStr);
  const now = new Date();
  const daysDiff = Math.ceil(Math.abs(target - now) / (1000 * 60 * 60 * 24));
  const title = opp.title || 'Opportunity';

  let subject = config.subject || (isOverdue
    ? `OVERDUE FOLLOW-UP: ${title}`
    : isFollowUp
      ? `Follow-Up Approaching: ${title}`
      : `Close Date Approaching: ${title}`);
  let body = config.body || '';

  const vars = {
    '{{opportunity_title}}': esc(opp.title),
    '{{opportunity_stage}}': esc(opp.stage),
    '{{customer_display_name}}': esc(opp.customer_display_name),
    '{{salesperson}}': esc(opp.salesperson),
    '{{budget_amount}}': esc(opp.budget_amount),
    '{{next_action}}': esc(opp.next_action),
    '{{next_action_due}}': esc(opp.next_action_due),
    '{{desired_completion_date}}': esc(opp.desired_completion_date),
    '{{days_overdue}}': isOverdue ? String(daysDiff) : '0',
    '{{days_until_due}}': !isOverdue ? String(daysDiff) : '0',
  };
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  subject = sanitizeEmailSubject(subject);

  if (!body) {
    const safeTitle = esc(title);
    const safeCustomer = esc(opp.customer_display_name || 'Unknown customer');
    const safeSalesperson = esc(opp.salesperson || 'Unassigned');
    const safeAction = esc(opp.next_action || 'Follow up');
    const safeDate = esc(dateStr);
    if (isOverdue) {
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEE2E2; padding: 20px; border-radius: 8px; border-left: 4px solid #EF4444;">
            <h2 style="color: #991B1B; margin: 0 0 10px 0;">Sales Follow-Up Overdue</h2>
            <p style="color: #7F1D1D; margin: 0;"><strong>${safeTitle}</strong> — follow-up is ${daysDiff} day(s) past due.</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Customer:</strong> ${safeCustomer}</p>
            <p><strong>Salesperson:</strong> ${safeSalesperson}</p>
            <p><strong>Next Action:</strong> ${safeAction}</p>
            <p><strong>Due:</strong> ${safeDate}</p>
          </div>
        </div>
      `;
    } else {
      const heading = isFollowUp ? 'Sales Follow-Up Approaching' : 'Desired Close Date Approaching';
      const label = isFollowUp ? 'Follow-Up Due' : 'Desired Completion';
      body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; border-left: 4px solid #F59E0B;">
            <h2 style="color: #92400E; margin: 0 0 10px 0;">${heading}</h2>
            <p style="color: #78350F; margin: 0;"><strong>${safeTitle}</strong> — ${daysDiff} day(s) out.</p>
          </div>
          <div style="padding: 20px;">
            <p><strong>Customer:</strong> ${safeCustomer}</p>
            <p><strong>Salesperson:</strong> ${safeSalesperson}</p>
            <p><strong>${label}:</strong> ${safeDate}</p>
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

