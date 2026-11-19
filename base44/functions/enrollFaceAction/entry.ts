import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';

// Face biometric descriptors never leave the backend (staffDataRead denylist),
// so enrollment must merge server-side: load the real record, merge the
// capture batch against the stored templates, CAS-write the result.
//
// Authorization: an employee may enroll their OWN face (self-service from the
// Time Clock settings), or an admin may enroll on anyone's behalf — anything
// broader would let one session overwrite another employee's biometrics.

const FACE_TEMPLATE_MERGE_DISTANCE = 0.10;
const FACE_TEMPLATE_MAX = 40;

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanFaceDescriptors(value: any) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64
      || !value.every((d: any) => Array.isArray(d) && d.length === 128 && d.every((n: any) => Number.isFinite(n)))) {
    throw Object.assign(new Error('Face descriptors are invalid.'), { status: 400 });
  }
  return value.map((d: any[]) => d.map(Number));
}

function faceDistance(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (!actor?.email) {
      return Response.json({ error: 'A signed-in session is required.' }, { status: 401 });
    }

    const id = String(body?.id || '').trim();
    const email = cleanEmail(body?.email);
    if (!id || !email) return Response.json({ error: 'User identity is required.' }, { status: 400 });

    const selfEnroll = cleanEmail(actor.email) === email;
    if (!selfEnroll && actor.role !== 'admin') {
      return Response.json({ error: 'You can only enroll your own face unless you are an admin.' }, { status: 403 });
    }

    const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
    const current = await AuthorizedEmail.get(id).catch(() => null);
    if (!current?.id || cleanEmail(current.email) !== email) {
      return Response.json({ error: 'Authorized user no longer matches the loaded record.' }, { status: 409 });
    }

    const batch = cleanFaceDescriptors(body?.face_descriptors);
    const stored = (Array.isArray(current?.face_descriptors) ? current.face_descriptors : [])
      .filter((v: any) => Array.isArray(v) && v.length === 128 && v.every((n: any) => Number.isFinite(n)))
      .map((v: any[]) => v.map(Number));
    const merged = stored.slice();
    let added = 0;
    for (const d of batch) {
      if (!merged.some((e) => faceDistance(e, d) < FACE_TEMPLATE_MERGE_DISTANCE)) {
        merged.push(d);
        added += 1;
      }
    }
    const dropped = Math.max(0, merged.length - FACE_TEMPLATE_MAX);
    const finalDescriptors = dropped ? merged.slice(dropped) : merged;
    const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
      entity: AuthorizedEmail,
      user: { id, face_descriptors: stored },
      nextFields: { face_descriptors: finalDescriptors },
      guardFields: { email: current.email },
      label: `Face enrollment for ${current.email}`,
    });
    try {
      await base44.asServiceRole.entities.AdminAuditLog.create({
        actor_email: actor?.email || 'unknown',
        action: 'enroll_face',
        target_email: current.email,
        detail: `added ${added}, dropped ${dropped}, total ${finalDescriptors.length}`,
        at: new Date().toISOString(),
      });
    } catch { /* audit logging is best-effort — never block the save */ }
    return Response.json({
      success: true,
      added,
      stored: stored.length,
      dropped,
      total: finalDescriptors.length,
      record: { id: saved.id, email: saved.email },
    });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 429, 503].includes(status) ? status : 500;
    console.error('enrollFaceAction error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Face enrollment could not be completed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
