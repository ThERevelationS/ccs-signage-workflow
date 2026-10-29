import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { base44 } from '@/api/base44Client';

export async function handler(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const requests = base44.asServiceRole.entities.AccessRequest;
    const audit = base44.asServiceRole.entities.AdminAuditLog;
    const action = body?.action || 'submit';

    if (action === 'submit') {
      const reason = String(body?.reason || '').trim().slice(0, 500);
      const sections = Array.isArray(body?.requested_sections)
        ? body.requested_sections.map((v: unknown) => String(v).slice(0, 80)).filter(Boolean).slice(0, 20)
        : [];
      // Idempotent: one pending request per email.
      const existing = await requests.filter({ requester_email: actor.email, status: 'pending' });
      if (Array.isArray(existing) && existing.length > 0) {
        return Response.json({ success: true, already_pending: true });
      }
      const row = await requests.create({
        requester_email: actor.email, requested_sections: sections, reason,
        status: 'pending',
      });
      await audit.create({ actor_email: actor.email, action: 'request_access', target_email: actor.email, detail: reason ? `${sections.join(',')} — ${reason}` : sections.join(','), at: new Date().toISOString() });
      return Response.json({ success: true, id: row.id });
    }

    if (actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    if (action === 'list') {
      const rows = await requests.filter({ status: 'pending' }, '-created_date', 50);
      return Response.json({ success: true, requests: rows || [] });
    }

    if (action === 'approve' || action === 'reject') {
      const id = String(body?.request_id || '');
      if (!id) return Response.json({ success: false, error: 'request_id required' }, { status: 400 });
      const row = await requests.get(id).catch(() => null);
      if (!row) return Response.json({ success: false, error: 'Request not found' }, { status: 404 });
      if (row.status !== 'pending') return Response.json({ success: false, error: 'Request already decided' }, { status: 409 });
      const note = String(body?.note || '').trim().slice(0, 300);
      await requests.update(id, {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewer_email: actor.email, decided_at: new Date().toISOString(), decided_note: note,
      });
      await audit.create({ actor_email: actor.email, action: `${action}_access`, target_email: row.requester_email, detail: note, at: new Date().toISOString() });
      return Response.json({ success: true });
    }

    return Response.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Access request failed' }, { status: e?.status || 500 });
  }
}
