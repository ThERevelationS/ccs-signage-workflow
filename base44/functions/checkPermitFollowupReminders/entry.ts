import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

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

    for (const line of allLines) {
      if (!line.next_followup_date) continue;
      // Already fired today → skip
      if (line.last_followup_fired_date === today) continue;

      const wo = woById.get(line.work_order_id);
      if (!wo) continue;

      const followupDate = line.next_followup_date;
      let event_type = null;
      if (followupDate === today) event_type = 'permit_followup_due';
      else if (followupDate < today) event_type = 'permit_followup_overdue';

      if (!event_type) continue;

      try {
        await base44.asServiceRole.functions.invoke('processWorkflowTriggers', {
          event_type,
          work_order: {
            ...wo,
            locality_name: line.locality_name,
            office_type: line.office_type,
            row_name: line.row_name,
            submitted_date: line.submitted_date,
            next_followup_date: line.next_followup_date,
            permit_received_date: line.permit_received_date
          },
          old_data: {},
          changed_by: 'Scheduled Reminder'
        });
        await base44.asServiceRole.entities.PermitLineItem.update(line.id, {
          last_followup_fired_date: today
        });
        if (event_type === 'permit_followup_due') dueFired++;
        else overdueFired++;
      } catch (e) {
        console.warn('Failed trigger for line', line.id, e.message);
      }
    }

    return Response.json({
      success: true,
      scanned: allLines.length,
      due_fired: dueFired,
      overdue_fired: overdueFired
    });
  } catch (error) {
    console.error('checkPermitFollowupReminders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});