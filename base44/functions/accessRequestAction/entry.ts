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
      // Reason keywords map to grant types — 'breakglass' asks for a 4-hour
      // time-boxed grant, 'full admin' asks for the complete role.
      const reasonLower = reason.toLowerCase();
      if (reasonLower.includes('breakglass') && !sections.includes('breakglass')) sections.push('breakglass');
      if (reasonLower.includes('full admin') && !sections.includes('full_admin')) sections.push('full_admin');
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
      // Approving applies the grant: 'full_admin' → full admin, 'breakglass'
      // → full admin for 4 hours (auto-lapses via admin_grant_expires),
      // otherwise sections merge into admin_permissions.sections. Only the
      // requester's record is written — the approver's access never changes.
      if (action === 'approve') {
        const users = base44.asServiceRole.entities.AuthorizedEmail;
        const targetRows = await users.filter({ email: row.requester_email });
        if (!Array.isArray(targetRows) || targetRows.length !== 1) {
          return Response.json({ success: false, error: 'Requesting user could not be resolved' }, { status: 404 });
        }
        const target = targetRows[0];
        const sections = Array.isArray(row.requested_sections) ? row.requested_sections : [];
        const next: Record<string, unknown> = { role: 'admin' };
        if (sections.includes('breakglass')) {
          next.is_full_admin = true;
          next.admin_grant_expires = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        } else if (sections.includes('full_admin')) {
          next.is_full_admin = true;
        } else if (sections.length) {
          const perms = target.admin_permissions && typeof target.admin_permissions === 'object' ? target.admin_permissions : {};
          next.admin_permissions = { ...perms, sections: [...new Set([...(Array.isArray(perms.sections) ? perms.sections : []), ...sections])] };
        }
        await users.update(target.id, next);
      }
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
