import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import {
  buildJurisdictionRewriteAuthorityUpdate,
  sameRewriteAuthority,
} from '../../shared/jurisdictionRewriteAuthorityVerification.mjs';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const jurisdictionId = String(body?.jurisdiction_id || body?.jurisdictionId || '').trim();
    const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
    if (!jurisdictionId) return Response.json({ error: 'Jurisdiction id is required' }, { status: 400 });
    if (!expectedUpdatedDate) {
      return Response.json({ error: 'Reload the jurisdiction before saving rewrite authority evidence.' }, { status: 409 });
    }

    const Jurisdiction = base44.asServiceRole.entities.JurisdictionProfile;
    const current = await Jurisdiction.get(jurisdictionId);
    if (!current?.id) return Response.json({ error: 'Jurisdiction not found' }, { status: 404 });
    if (String(current.updated_date || '') !== expectedUpdatedDate) {
      return Response.json({ error: 'Jurisdiction changed in another session. Reload before saving authority evidence.' }, { status: 409 });
    }

    let rewriteAuthority;
    try {
      rewriteAuthority = buildJurisdictionRewriteAuthorityUpdate({
        jurisdiction: current,
        input: body?.authority || {},
        actor: user,
      });
    } catch (error) {
      return Response.json({ error: error?.message || 'Rewrite authority evidence is invalid.' }, { status: 400 });
    }

    if (sameRewriteAuthority(current.rewrite_authority || {}, rewriteAuthority)) {
      return Response.json({ success: true, jurisdiction: current, rewrite_authority: current.rewrite_authority || rewriteAuthority });
    }

    const result = await Jurisdiction.updateMany(
      { id: current.id, updated_date: expectedUpdatedDate },
      { $set: { rewrite_authority: rewriteAuthority } },
    );
    if (!result || typeof result.updated !== 'number') {
      throw new Error('Rewrite authority update result could not be verified.');
    }
    if (result.updated !== 1) {
      return Response.json({ error: 'Jurisdiction changed while authority evidence was being saved. Reload before retrying.' }, { status: 409 });
    }

    const saved = await Jurisdiction.get(current.id);
    if (!saved?.id || !sameRewriteAuthority(saved.rewrite_authority || {}, rewriteAuthority)) {
      throw new Error('Rewrite authority was saved but could not be verified.');
    }

    return Response.json({
      success: true,
      jurisdiction: saved,
      rewrite_authority: saved.rewrite_authority,
    });
  } catch (error) {
    console.error('updateJurisdictionRewriteAuthority error:', error?.message || error);
    return Response.json({ error: 'Rewrite authority evidence could not be saved safely.' }, { status: 500 });
  }
});
