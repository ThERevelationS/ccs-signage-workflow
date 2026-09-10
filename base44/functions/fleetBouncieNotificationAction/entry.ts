import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

async function authorizeFleetUser(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin' || user.role === 'user') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  const role = rows?.[0]?.role || '';
  if (!['admin', 'user'].includes(role)) {
    return { error: Response.json({ error: 'This CCS account is not authorized for Fleet notifications.' }, { status: 403 }) };
  }
  return { user };
}

const normalizeVin = (value: unknown) => String(value || '').trim().toUpperCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorizeFleetUser(base44);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const Notification = base44.asServiceRole.entities.BouncieNotification;

    if (action === 'mark_read') {
      const id = String(body?.id || body?.notification_id || '').trim();
      if (!id) return Response.json({ error: 'Bouncie notification id is required.' }, { status: 400 });
      const existing = await Notification.get(id).catch(() => null);
      if (!existing) return Response.json({ error: 'Bouncie notification not found.' }, { status: 404 });
      if (existing.is_read === true) return Response.json({ success: true, reused: true, notification: existing });
      const updated = await Notification.update(id, { is_read: true });
      return Response.json({ success: true, notification: updated });
    }

    if (action === 'mark_vehicle_read') {
      const vin = normalizeVin(body?.vehicle_vin || body?.vin);
      if (!vin) return Response.json({ error: 'Vehicle VIN is required.' }, { status: 400 });
      const unread = await loadAllEntityRows({
        entity: Notification,
        query: { vehicle_vin: vin, is_read: false },
        sort: '-timestamp',
        label: `Unread Bouncie notifications for ${vin}`,
      });
      let updated = 0;
      for (let index = 0; index < unread.length; index += 50) {
        const batch = unread.slice(index, index + 50);
        const results = await Promise.all(batch.map((row: any) => Notification.update(row.id, { is_read: true }).then(() => true).catch(() => false)));
        updated += results.filter(Boolean).length;
      }
      if (updated !== unread.length) {
        return Response.json({ error: `Marked ${updated} of ${unread.length} unread Bouncie notifications. Refresh and retry to finish.` }, { status: 500 });
      }
      return Response.json({ success: true, vehicle_vin: vin, marked_read: updated });
    }

    return Response.json({ error: 'Unsupported Fleet Bouncie notification action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetBouncieNotificationAction error:', error);
    return Response.json({ error: error?.message || 'Fleet Bouncie notification operation failed.' }, { status: 500 });
  }
});