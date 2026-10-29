import { base44 } from '@/api/base44Client';

// Daily anomaly scan — flags unusual admin/security activity and emails admins
// only when something crosses a threshold. Quiet when nothing is wrong.
const THRESHOLDS = {
  failed_logins: 10,       // FailedAdminAttempt rows in last 24h
  permission_changes: 15,  // AdminAuditLog update_user rows in last 24h
  session_revokes: 5,      // revoke_session audit rows in last 24h
};

export async function handler() {
  try {
    const ent = base44.asServiceRole.entities;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [failedRows, auditRows] = await Promise.all([
      ent.FailedAdminAttempt.filter({ at: { $gte: since } }).catch(() => []),
      ent.AdminAuditLog.filter({ at: { $gte: since } }).catch(() => []),
    ]);
    const failed = (failedRows || []).length;
    const audits = auditRows || [];
    const permChanges = audits.filter((r: any) => r.action === 'update_user').length;
    const revokes = audits.filter((r: any) => r.action === 'revoke_session').length;

    const flags = [];
    if (failed >= THRESHOLDS.failed_logins) flags.push(`${failed} failed sign-in attempts (threshold ${THRESHOLDS.failed_logins})`);
    if (permChanges >= THRESHOLDS.permission_changes) flags.push(`${permChanges} permission changes (threshold ${THRESHOLDS.permission_changes})`);
    if (revokes >= THRESHOLDS.session_revokes) flags.push(`${revokes} session revokes (threshold ${THRESHOLDS.session_revokes})`);
    if (!flags.length) return Response.json({ success: true, sent: 0, reason: 'below thresholds' });

    const admins = await ent.AuthorizedEmail.filter({ role: 'admin' });
    const recipients = (admins || [])
      .filter((u: any) => u?.email && u?.notification_prefs?.automation_emails !== false)
      .map((u: any) => u.email);
    const body = `Unusual admin activity in the last 24 hours:<br><br>${flags.join('<br>')}<br><br>Review the Security activity card in Admin → Backend/Data.`;
    for (const to of recipients.slice(0, 10)) {
      await base44.integrations.Core.SendEmail({ to, subject: 'Admin security anomaly digest', body });
    }
    return Response.json({ success: true, sent: Math.min(recipients.length, 10), flags });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Anomaly scan failed' }, { status: 500 });
  }
}
