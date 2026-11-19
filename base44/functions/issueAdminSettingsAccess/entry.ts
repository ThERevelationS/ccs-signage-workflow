import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { issueAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';
import { verifyBadgeCredential } from '../../shared/timeClockBadgeVerify.ts';
import { cleanDescriptorBatch, matchFaceFrames, storedTemplates } from '../../shared/faceMatch.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let admin: any = null;
    let method = '';

    const sessionToken = String(body?.session_token || '').trim();
    const badgeCode = String(body?.badge_code || '').trim();
    // QR badge arm — a valid TIMECLOCK2 badge is itself a verified credential
    // (email|version|token checked against the active badge record's stored
    // hash), so an admin's badge can unlock without a pre-existing session,
    // matching how the same badge already identifies them on the kiosk.
    if (badgeCode) {
      const badgeAuth = await verifyBadgeCredential(
        badgeCode,
        base44.asServiceRole.entities.TimeClockBadge,
        base44.asServiceRole.entities.AuthorizedEmail,
      );
      if (!badgeAuth?.target?.id) {
        return Response.json({ error: 'Time Clock badge is invalid, expired, or has been replaced.' }, { status: 401 });
      }
      if (badgeAuth.target.role !== 'admin') {
        return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      }
      admin = badgeAuth.target;
      method = 'admin_badge';
    } else {
      // An admin session is mandatory. A client-supplied face descriptor is a
      // static, replayable template — it must never be the sole credential
      // (any photo of an admin reproduces a matching vector). If one is sent
      // alongside a session, it is checked only against THAT admin's
      // stored descriptors as defense-in-depth.
      if (!sessionToken) {
        return Response.json({ error: 'A valid admin session is required.' }, { status: 401 });
      }
      const user = await authenticateSignShopSession(base44, sessionToken);
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      }
      admin = user;
      method = 'admin_session';
    }

    const frames = cleanDescriptorBatch(body?.face_descriptors ?? body?.face_descriptor);
    if (frames.length) {
      // The session/badge user objects come from a full AuthorizedEmail read
      // and normally carry face_descriptors; re-read when they don't so the
      // check can never pass on a row that simply lacked the field.
      const adminWithTemplates = storedTemplates(admin).length
        ? admin
        : await base44.asServiceRole.entities.AuthorizedEmail.get(admin.id).catch(() => admin);
      const matched = matchFaceFrames([adminWithTemplates], frames);
      if (!matched?.user?.id || String(matched.user.id) !== String(admin.id)) {
        return Response.json({ error: 'Face verification failed for this admin.' }, { status: 401 });
      }
      method = 'admin_session+face';
    }

    const issued = await issueAdminSettingsCapability(admin);
    return Response.json({
      success: true,
      capability: issued.token,
      expires_at: issued.expiresAt,
      authentication_method: method,
      user: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name || admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 429, 503].includes(status) ? status : 500;
    console.error('issueAdminSettingsAccess error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Admin Settings authorization could not be issued safely.' : error?.message,
    }, { status: safeStatus });
  }
});