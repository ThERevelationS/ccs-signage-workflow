import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const STATUSES = new Set(['new', 'in_review', 'in_progress', 'completed', 'declined']);

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
    if (action !== 'update_status') return Response.json({ error: 'Unsupported Fleet feedback action.' }, { status: 400 });

    const id = String(body?.id || body?.report_id || '').trim();
    const status = String(body?.status || '').trim();
    const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
    if (!id) return Response.json({ error: 'Fleet feedback report id is required.' }, { status: 400 });
    if (!STATUSES.has(status)) return Response.json({ error: 'Invalid Fleet feedback status.' }, { status: 400 });
    if (!expectedUpdatedAt) return Response.json({ error: 'Fleet feedback version is missing. Reload before changing status.' }, { status: 409 });

    const Report = base44.asServiceRole.entities.FleetSystemReport;
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