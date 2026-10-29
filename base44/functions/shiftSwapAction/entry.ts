import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { base44 } from '@/api/base44Client';

export async function handler(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const swaps = base44.asServiceRole.entities.ShiftSwapRequest;
    const action = body?.action || 'submit';

    if (action === 'submit') {
      const partner = String(body?.partner_email || '').trim().toLowerCase();
      const reason = String(body?.reason || '').trim().slice(0, 400);
      if (!partner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partner)) {
        return Response.json({ success: false, error: 'A partner email is required' }, { status: 400 });
      }
      if (partner === String(actor.email).toLowerCase()) {
        return Response.json({ success: false, error: 'You cannot swap with yourself' }, { status: 400 });
      }
      const partnerUser = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: partner });
      if (!Array.isArray(partnerUser) || partnerUser.length !== 1) {
        return Response.json({ success: false, error: 'No employee with that email' }, { status: 404 });
      }
      const existing = await swaps.filter({ requester_email: actor.email, status: 'pending' });
      if (Array.isArray(existing) && existing.length > 0) {
        return Response.json({ success: true, already_pending: true });
      }
      await swaps.create({ requester_email: actor.email, partner_email: partner, reason, status: 'pending' });
      return Response.json({ success: true });
    }

    if (actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    if (action === 'list') {
      const rows = await swaps.filter({ status: 'pending' }, '-created_date', 50);
      return Response.json({ success: true, swaps: rows || [] });
    }

    if (action === 'approve' || action === 'reject') {
      const id = String(body?.request_id || '');
      const note = String(body?.note || '').trim().slice(0, 300);
      const row = await swaps.get(id).catch(() => null);
      if (!row) return Response.json({ success: false, error: 'Request not found' }, { status: 404 });
      if (row.status !== 'pending') return Response.json({ success: false, error: 'Already decided' }, { status: 409 });
      if (action === 'approve') {
        // Swap the two employees' active shift templates by exchanging
        // user_email — the schedules trade owners, templates themselves are
        // untouched. No active template on one side = honest no-op report.
        const tpl = base44.asServiceRole.entities.TimeClockShiftTemplate;
        const [mine, theirs] = await Promise.all([
          tpl.filter({ user_email: row.requester_email, active: true }),
          tpl.filter({ user_email: row.partner_email, active: true }),
        ]);
        if ((!Array.isArray(mine) || !mine.length) && (!Array.isArray(theirs) || !theirs.length)) {
          return Response.json({ success: false, error: 'Neither employee has an active shift template to swap' }, { status: 409 });
        }
        for (const t of (mine || [])) await tpl.update(t.id, { user_email: row.partner_email });
        for (const t of (theirs || [])) await tpl.update(t.id, { user_email: row.requester_email });
      }
      await swaps.update(id, {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewer_email: actor.email, decided_at: new Date().toISOString(), decided_note: note,
      });
      return Response.json({ success: true });
    }
    return Response.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Shift swap failed' }, { status: e?.status || 500 });
  }
}
