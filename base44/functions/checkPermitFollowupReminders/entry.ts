import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { claimPermitFollowupForToday } from '../../shared/permitLineItemPersistence.mjs';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';

// Scheduled: scans PermitLineItems for follow-up dates that are due today or overdue,
// fires `permit_followup_due` and `permit_followup_overdue` automation triggers.
// Dedupe: uses `last_followup_fired_date` field on the line item to avoid double-firing.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth check — only admins or scheduled invocations
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date().toISOString().split('T')[0];
    const allLines = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.PermitLineItem,
      query: { status: 'active' },
      sort: 'next_followup_date',
      label: 'Active permit follow-up lines',
    });
    const workOrders = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.WorkOrder,
      query: { completed: false, deleted: { $ne: true } },
      sort: 'created_date',
      label: 'Permit reminder Work Orders',
    });
    const woById = new Map(workOrders.map(w => [w.id, w]));

    let dueFired = 0;
    let overdueFired = 0;
    let alreadyClaimed = 0;
    let claimSkipped = 0;
    let triggerErrors = 0;

    for (const line of allLines) {
      let claim;
      try {
        claim = await claimPermitFollowupForToday({
          entity: base44.asServiceRole.entities.PermitLineItem,
          lineId: line.id,
          today,
          label: `Permit follow-up ${line.id}`,
        });
      } catch (claimError) {
        claimSkipped++;
        console.warn('Failed reminder claim for line', line.id, claimError.message);
        continue;
      }

      if (!claim?.claimed) {
        if (claim?.reason === 'already_claimed') alreadyClaimed++;
        else claimSkipped++;
        continue;
      }

      const claimedLine = claim.record;
      const wo = woById.get(claimedLine.work_order_id);
      if (!wo) {
        claimSkipped++;
        console.warn('Permit follow-up claim has no active Work Order', claimedLine.id, claimedLine.work_order_id);
        continue;
      }

      try {
        await processWorkflowTriggerEvent({
          base44,
          payload: {
            event_type: claim.eventType,
            work_order: {
              ...wo,
              locality_name: claimedLine.locality_name,
              office_type: claimedLine.office_type,
              row_name: claimedLine.row_name,
              submitted_date: claimedLine.submitted_date,
              next_followup_date: claimedLine.next_followup_date,
              permit_received_date: claimedLine.permit_received_date,
            },
            old_data: {},
          },
          changedByOverride: 'Scheduled Reminder',
        });
        if (claim.eventType === 'permit_followup_due') dueFired++;
        else overdueFired++;
      } catch (e) {
        triggerErrors++;
        // The claim intentionally remains set for today. A failed function response
        // can be ambiguous after downstream email/actions, so retrying automatically
        // could duplicate reminders or workflow actions.
        console.warn('Failed trigger for claimed permit line', claimedLine.id, e.message);
      }
    }

    return Response.json({
      success: true,
      scanned: allLines.length,
      due_fired: dueFired,
      overdue_fired: overdueFired,
      already_claimed: alreadyClaimed,
      claim_skipped: claimSkipped,
      trigger_errors: triggerErrors
    });
  } catch (error) {
    console.error('checkPermitFollowupReminders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});