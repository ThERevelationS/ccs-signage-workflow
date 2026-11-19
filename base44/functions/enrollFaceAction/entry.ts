import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { FACE_MATCH, cleanDescriptorBatch, mergeFaceTemplates, storedTemplates } from '../../shared/faceMatch.ts';

// Face biometric descriptors never leave the backend (staffDataRead denylist),
// so enrollment must merge server-side: load the real record, merge the
// capture batch against the stored templates, CAS-write the result.
//
// Authorization: an employee may enroll their OWN face (self-service from the
// Time Clock settings), or an admin may enroll on anyone's behalf — anything
// broader would let one session overwrite another employee's biometrics.

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
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

    const batch = cleanDescriptorBatch(body?.face_descriptors, FACE_MATCH.batchMax);
    if (!batch.length) {
      throw Object.assign(new Error('Face descriptors are invalid.'), { status: 400 });
    }
    const stored = storedTemplates(current);
    const { merged: finalDescriptors, added, dropped } = mergeFaceTemplates(stored, batch);
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
