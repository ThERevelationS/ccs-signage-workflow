import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const STATUSES = new Set(['new', 'in_review', 'in_progress', 'completed', 'declined']);
const TYPES = new Set(['bug_report', 'feature_request', 'change_request']);
const PRIORITIES = new Set(['low', 'medium', 'high']);
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;
const norm = (value: unknown) => String(value ?? '').trim();
const sameFeedbackCreate = (row: any, desired: any) =>
  norm(row?.title) === norm(desired?.title)
  && norm(row?.description) === norm(desired?.description)
  && norm(row?.type) === norm(desired?.type)
  && norm(row?.priority || 'medium') === norm(desired?.priority || 'medium')
  && String(row?.submitted_by_email || '').toLowerCase() === String(desired?.submitted_by_email || '').toLowerCase()
  && JSON.stringify(Array.isArray(row?.attachment_urls) ? row.attachment_urls : []) === JSON.stringify(Array.isArray(desired?.attachment_urls) ? desired.attachment_urls : []);

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({ error: 'Fleet feedback administration requires a CCS admin.' }, { status: 403 }) };
  return { user };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const Report = base44.asServiceRole.entities.FleetSystemReport;

    if (action === 'create') {
      const creationKey = String(body?.creation_key || '').trim();
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) {
        return Response.json({ error: 'Fleet feedback create identity is missing or invalid. Reopen the feedback form and try again.' }, { status: 409 });
      }
      const title = norm(body?.report?.title || body?.title);
      const description = norm(body?.report?.description || body?.description);
      const type = norm(body?.report?.type || body?.type);
      const priority = norm(body?.report?.priority || body?.priority || 'medium');
      const attachmentUrls = Array.isArray(body?.report?.attachment_urls || body?.attachment_urls)
        ? [...new Set((body?.report?.attachment_urls || body?.attachment_urls).map((value: any) => norm(value)).filter(Boolean))].slice(0, 5)
        : [];
      if (!title || !description) return Response.json({ error: 'Fleet feedback title and description are required.' }, { status: 400 });
      if (!TYPES.has(type)) return Response.json({ error: 'Invalid Fleet feedback type.' }, { status: 400 });
      if (!PRIORITIES.has(priority)) return Response.json({ error: 'Invalid Fleet feedback priority.' }, { status: 400 });
      const desired = {
        title,
        description,
        type,
        priority,
        status: 'new',
        submitted_by_email: auth.user.email,
        submitted_by_name: auth.user.full_name || auth.user.name || auth.user.email,
        attachment_urls: attachmentUrls,
      };
      const existingRows = await Report.filter({ creation_key: creationKey });
      if (existingRows.length > 1) return Response.json({ error: 'Multiple Fleet feedback reports share this create identity. Review the duplicates before retrying.' }, { status: 409 });
      if (existingRows[0]) {
        const reused = existingRows[0];
        if (!sameFeedbackCreate(reused, desired)) {
          return Response.json({ error: 'This create identity already belongs to different Fleet feedback details. Reopen the feedback form before submitting another report.' }, { status: 409 });
        }
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
          event_type: 'system_report_created', target_id: reused.id, event_token: `system-report-created:${creationKey}`,
        }).catch(() => null);
        return Response.json({ success: true, reused: true, report: reused });
      }
      const created = await Report.create({ ...desired, creation_key: creationKey });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Report.filter({ creation_key: creationKey });
      if (contenders.length > 1) {
        const winner = canonical(contenders) || created;
        if (winner.id !== created.id) {
          await Report.delete(created.id).catch(() => null);
          if (!sameFeedbackCreate(winner, desired)) {
            return Response.json({ error: 'Another Fleet feedback submission won this identity with different details. The losing duplicate was discarded; reopen the form.' }, { status: 409 });
          }
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'system_report_created', target_id: winner.id, event_token: `system-report-created:${creationKey}`,
          }).catch(() => null);
          return Response.json({ success: true, reused: true, report: winner });
        }
        for (const duplicate of contenders) if (duplicate.id !== winner.id) await Report.delete(duplicate.id).catch(() => null);
      }
      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
        event_type: 'system_report_created', target_id: created.id, event_token: `system-report-created:${creationKey}`,
      }).catch(() => null);
      return Response.json({ success: true, report: created });
    }

    if (action !== 'update_status') return Response.json({ error: 'Unsupported Fleet feedback action.' }, { status: 400 });

    const id = String(body?.id || body?.report_id || '').trim();
    const status = String(body?.status || '').trim();
    const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
    if (!id) return Response.json({ error: 'Fleet feedback report id is required.' }, { status: 400 });
    if (!STATUSES.has(status)) return Response.json({ error: 'Invalid Fleet feedback status.' }, { status: 400 });
    if (!expectedUpdatedAt) return Response.json({ error: 'Fleet feedback version is missing. Reload before changing status.' }, { status: 409 });

    const existing = await Report.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Fleet feedback report not found.' }, { status: 404 });
    if (existing.status === status) return Response.json({ success: true, reused: true, report: existing });

    const updated = await updateFleetRecordIfCurrent({
      entity: Report,
      id,
      expectedUpdatedAt,
      patch: { status },
      label: 'Fleet feedback report',
    });

    await base44.asServiceRole.entities.FleetSystemLog.create({
      source: 'fleetSystemReportAction',
      level: 'info',
      message: 'Fleet feedback status changed.',
      details: {
        report_id: id,
        title: existing.title || '',
        before_status: existing.status || '',
        after_status: status,
        changed_by: auth.user?.email || '',
      },
    }).catch(() => null);

    return Response.json({ success: true, report: updated });
  } catch (error: any) {
    console.error('fleetSystemReportAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet feedback could not be updated.' }, { status: 500 });
  }
});