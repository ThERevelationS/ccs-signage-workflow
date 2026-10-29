import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { base44 } from '@/api/base44Client';

export async function handler(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }
    const sessions = base44.asServiceRole.entities.UserSession;
    const audit = base44.asServiceRole.entities.AdminAuditLog;
    const action = body?.action || 'list';
    const targetEmail = String(body?.target_email || '').trim().toLowerCase();

    if (action === 'list') {
      const rows = await sessions.filter(targetEmail ? { user_email: targetEmail } : {}, '-created_at', 100);
      const safe = (rows || []).map((r: any) => ({
        id: r.id, user_email: r.user_email, created_at: r.created_at, expires_at: r.expires_at,
        revoked: !!r.revoked, revoked_at: r.revoked_at, revoked_by: r.revoked_by,
      }));
      return Response.json({ success: true, sessions: safe });
    }
    if (action === 'revoke') {
      const id = String(body?.session_id || '');
      if (!id) return Response.json({ success: false, error: 'session_id required' }, { status: 400 });
      const row = await sessions.get(id).catch(() => null);
      if (!row) return Response.json({ success: false, error: 'Session not found' }, { status: 404 });
      if (row.user_email === actor.email && !body?.confirm_self) {
        return Response.json({ success: false, error: 'Cannot revoke your own session without confirm_self' }, { status: 400 });
      }
      await sessions.update(id, { revoked: true, revoked_at: new Date().toISOString(), revoked_by: actor.email });
      await audit.create({ actor_email: actor.email, action: 'revoke_session', target_email: row.user_email, detail: `Session ${id} revoked`, at: new Date().toISOString() });
      return Response.json({ success: true });
    }
    return Response.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Session admin failed' }, { status: e?.status || 500 });
  }
}
