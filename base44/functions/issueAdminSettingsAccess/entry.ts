import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { issueAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';
import { verifyBadgeCredential } from '../../shared/timeClockBadgeVerify.ts';

const FACE_DIMENSIONS = 128;
const CONFIDENCE_THRESHOLD = 0.38;
const SEPARATION_RATIO = 1.5;

function validDescriptor(value: unknown) {
  if (!Array.isArray(value) || value.length !== FACE_DIMENSIONS) return null;
  const numbers = value.map(Number);
  if (numbers.some((number) => !Number.isFinite(number) || Math.abs(number) > 10)) return null;
  return numbers;
}

function euclideanDistance(a: number[], b: number[]) {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function bestAdminFaceMatch(admins: any[], descriptor: number[]) {
  const matches: Array<{ user: any; distance: number }> = [];
  for (const user of admins || []) {
    const storedDescriptors = Array.isArray(user?.face_descriptors) ? user.face_descriptors : [];
    let bestDistance = Infinity;
    for (const stored of storedDescriptors) {
      const normalized = validDescriptor(stored);
      if (!normalized) continue;
      bestDistance = Math.min(bestDistance, euclideanDistance(descriptor, normalized));
    }
    if (Number.isFinite(bestDistance)) matches.push({ user, distance: bestDistance });
  }
  matches.sort((a, b) => a.distance - b.distance);
  const best = matches[0] || null;
  const second = matches[1] || null;
  if (!best || best.distance > CONFIDENCE_THRESHOLD) return null;
  const secondDistance = second?.distance ?? Infinity;
  if (secondDistance / Math.max(best.distance, Number.EPSILON) < SEPARATION_RATIO) return null;
  return best.user;
}

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

    const descriptor = validDescriptor(body?.face_descriptor);
    if (descriptor) {
      const matched = bestAdminFaceMatch([admin], descriptor);
      if (!matched?.id || matched.id !== admin.id) {
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
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    console.error('issueAdminSettingsAccess error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Admin Settings authorization could not be issued safely.' : error?.message,
    }, { status: safeStatus });
  }
});
