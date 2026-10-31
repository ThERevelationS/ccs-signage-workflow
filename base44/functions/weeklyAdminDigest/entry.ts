import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled digest — reads pending admin queues and emails all admins a
// compact weekly summary. Runs without a session (service-role reads).
export async function handler() {
  try {
    const base44 = createClientFromRequest(new Request("https://internal/cron"));
    const ent = base44.asServiceRole.entities;
    const [pto, corrections, deletions, conflicts, requests] = await Promise.all([
      ent.TimeOffRequest.count({ status: 'pending' }).catch(() => null),
      ent.TimeClockCorrectionRequest.count({ status: 'pending' }).catch(() => null),
      ent.DeletionRequest.count({ status: 'pending' }).catch(() => null),
      ent.SyncConflict.count({ status: 'open' }).catch(() => null),
      ent.AccessRequest.count({ status: 'pending' }).catch(() => null),
    ]);
    const admins = await ent.AuthorizedEmail.filter({ role: 'admin' });
    const recipients = (admins || [])
      .filter((u: any) => u?.email && u?.notification_prefs?.automation_emails !== false)
      .map((u: any) => u.email);
    if (!recipients.length) return Response.json({ success: true, sent: 0, reason: 'no admin recipients' });

    const rows = [
      ['PTO requests pending', pto],
      ['Time-clock corrections pending', corrections],
      ['Deletion requests pending', deletions],
      ['Sync conflicts open', conflicts],
      ['Access requests pending', requests],
    ];
    const total = rows.reduce((n, [, v]) => n + (Number(v) || 0), 0);
    const body = rows.map(([k, v]) => `${k}: ${v ?? 'unavailable'}`).join('<br>')
      + `<br><br>Total pending items: <b>${total}</b><br><br>Open Admin Settings to work the queues.`;

    for (const to of recipients.slice(0, 10)) {
      await base44.integrations.Core.SendEmail({ to, subject: `Admin digest — ${total} item${total === 1 ? '' : 's'} pending`, body });
    }
    return Response.json({ success: true, sent: Math.min(recipients.length, 10), total });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Digest failed' }, { status: 500 });
  }
}
