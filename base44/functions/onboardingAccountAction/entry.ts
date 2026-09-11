import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { constantTimeEqual } from '../../shared/constantTime.ts';

function b64urlEncode(str: string) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str: string) {
  let value = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  return atob(value);
}
async function hmacSign(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}
async function verifySignedSession(token: string, secret: string, entity: any) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, suppliedSig] = parts;
  if (!constantTimeEqual(await hmacSign(payloadStr, secret), suppliedSig)) return null;
  let payload: any;
  try { payload = JSON.parse(b64urlDecode(payloadStr)); } catch { return null; }
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (
    !payload?.email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) return null;
  const rows = await entity.filter({ email: String(payload.email).trim().toLowerCase() });
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const user = rows[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) return null;
  return user;
}
function secureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
function sanitizedUser(user: any) {
  if (!user?.id) return null;
  return {
    id: user.id,
    email: user.email || '',
    full_name: user.full_name || '',
    username: user.username || '',
    role: user.role || 'user',
    sales_roles: Array.isArray(user.sales_roles) ? user.sales_roles : [],
    can_import_export: user.can_import_export === true,
    can_view_resources: user.can_view_resources === true,
    face_descriptors: Array.isArray(user.face_descriptors) ? user.face_descriptors : [],
    hr_data: user.hr_data && typeof user.hr_data === 'object' && !Array.isArray(user.hr_data) ? user.hr_data : {},
    onboarding_complete: user.onboarding_complete === true,
    updated_date: user.updated_date || '',
  };
}
async function loadInvitation(entity: any, token: string) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw Object.assign(new Error('Onboarding token is required'), { status: 400 });
  const rows = await entity.filter({ onboarding_token: cleanToken });
  if (!Array.isArray(rows)) throw Object.assign(new Error('Onboarding token lookup could not be verified'), { status: 503 });
  if (rows.length !== 1) throw Object.assign(new Error(rows.length ? 'Onboarding identity is ambiguous' : 'This onboarding link is invalid or already used'), { status: rows.length ? 409 : 401 });
  const user = rows[0];
  if (user.onboarding_complete === true) throw Object.assign(new Error('This onboarding link has already been completed'), { status: 409 });
  if (user.onboarding_expires && new Date(user.onboarding_expires).getTime() < Date.now()) {
    throw Object.assign(new Error('This onboarding link has expired'), { status: 401 });
  }
  return user;
}
function invitationUrl(token: string) {
  const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || 'https://clay-flow-signage-suite-387da97c.base44.app').replace(/\/$/, '');
  return `${appUrl}/NewUserSetup?token=${encodeURIComponent(token)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const authorized = base44.asServiceRole.entities.AuthorizedEmail;

    if (action === 'issue_invite') {
      const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';
      const actor = await verifySignedSession(String(body?.session_token || ''), secret, authorized);
      if (!actor?.id || actor.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin authentication required' }, { status: 403 });
      }
      const targetEmail = String(body?.target_email || '').trim().toLowerCase();
      if (!targetEmail) return Response.json({ success: false, error: 'Target email is required' }, { status: 400 });
      const targets = await authorized.filter({ email: targetEmail });
      if (!Array.isArray(targets) || targets.length !== 1) {
        return Response.json({ success: false, error: Array.isArray(targets) && targets.length === 0 ? 'Authorized user not found' : 'Authorized user identity is ambiguous' }, { status: Array.isArray(targets) && targets.length === 0 ? 404 : 409 });
      }
      const target = targets[0];
      const token = secureToken();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: authorized,
        user: target,
        nextFields: { onboarding_token: token, onboarding_expires: expires, onboarding_complete: false },
        guardFields: { email: target.email },
        label: `Onboarding invitation for ${target.email}`,
      });

      const registrationLink = invitationUrl(token);
      const firstName = String(target.full_name || '').trim().split(/\s+/)[0] || 'there';
      let subject = 'Complete Your Sign Shop Workflow Registration';
      let html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1F2937;"><div style="background:#FFFFFF;padding:30px;border-radius:16px;border:1px solid #E5E7EB;"><h2>Welcome to Sign Shop Workflow</h2><p>Hi ${firstName.replace(/[<>&"']/g, '')},</p><p>Complete your registration using the button below.</p><p style="text-align:center;margin:30px 0;"><a href="${registrationLink}" style="background-color:#7C3AED;color:#FFFFFF;padding:16px 32px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Complete Registration</a></p><p style="color:#6B7280;font-size:14px;">This link expires in 7 days.</p></div></div>`;
      try {
        const aiEmail = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Create a brief, professional HTML invitation email for Sign Shop Workflow. Recipient first name: ${firstName}. Role: ${target.role === 'admin' ? 'Admin' : 'Team Member'}. The registration link MUST be used exactly as provided: ${registrationLink}. Use a white background, dark text, a solid #7C3AED CTA button with white text, inline CSS, no emojis, and mention the link expires in 7 days. Return subject and body.`,
          response_json_schema: {
            type: 'object',
            properties: { subject: { type: 'string' }, body: { type: 'string' } },
            required: ['subject', 'body'],
          },
        });
        if (aiEmail?.subject && aiEmail?.body && String(aiEmail.body).includes(registrationLink)) {
          subject = aiEmail.subject;
          html = aiEmail.body;
        }
      } catch (aiError) {
        console.error('Onboarding invitation AI formatting failed; using safe fallback for user id:', target.id);
      }
      const sent = await base44.asServiceRole.functions.invoke('sendGmail', { to: target.email, subject, body: html });
      const sendResult = sent?.data || sent;
      if (sendResult?.error || sendResult?.success === false) {
        console.error('Onboarding invitation email failed for user id:', target.id);
        return Response.json({ success: false, error: 'The invitation token was saved, but the email could not be sent. Retry to issue a new link.' }, { status: 502 });
      }
      return Response.json({ success: true });
    }

    const token = String(body?.token || '').trim();
    const user = await loadInvitation(authorized, token);

    if (action === 'validate') {
      return Response.json({ success: true, user: sanitizedUser(user) });
    }

    if (action === 'save_credentials') {
      const fullName = String(body?.full_name || '').trim();
      const username = String(body?.username || '').trim().toLowerCase();
      const password = String(body?.password || '');
      if (!fullName) return Response.json({ success: false, error: 'Full name is required' }, { status: 400 });
      if (!/^[a-z0-9]{3,}$/.test(username)) return Response.json({ success: false, error: 'Username must be at least 3 letters/numbers with no spaces' }, { status: 400 });
      if (password.length < 8) return Response.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
      const usernameRows = await authorized.filter({ username });
      if (!Array.isArray(usernameRows)) return Response.json({ success: false, error: 'Username uniqueness could not be verified' }, { status: 503 });
      if (usernameRows.some((row: any) => row.id !== user.id)) return Response.json({ success: false, error: 'This username is already in use' }, { status: 409 });

      const nextFields: Record<string, unknown> = {
        full_name: fullName,
        username,
        password_hash: await bcrypt.hash(password, 10),
        password_reset_token: null,
        password_reset_expires: null,
        session_not_before: new Date().toISOString(),
      };
      if (Array.isArray(body?.face_descriptors) && body.face_descriptors.length) nextFields.face_descriptors = body.face_descriptors;
      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: authorized,
        user,
        nextFields,
        guardFields: { onboarding_token: token, onboarding_complete: false, email: user.email },
        label: `Onboarding credentials for ${user.email}`,
      });
      return Response.json({ success: true, user: sanitizedUser(saved) });
    }

    if (action === 'save_hr') {
      const hrData = body?.hr_data;
      if (!hrData || typeof hrData !== 'object' || Array.isArray(hrData)) return Response.json({ success: false, error: 'HR data must be an object' }, { status: 400 });
      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: authorized,
        user,
        nextFields: { hr_data: hrData },
        guardFields: { onboarding_token: token, onboarding_complete: false, email: user.email },
        label: `Onboarding HR data for ${user.email}`,
      });
      return Response.json({ success: true, user: sanitizedUser(saved) });
    }

    if (action === 'complete') {
      const saved = await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
        entity: authorized,
        user,
        nextFields: { onboarding_complete: true, onboarding_token: null, onboarding_expires: null },
        guardFields: { onboarding_token: token, onboarding_complete: false, email: user.email },
        label: `Complete onboarding for ${user.email}`,
      });
      return Response.json({ success: true, user: sanitizedUser(saved) });
    }

    return Response.json({ success: false, error: 'Invalid onboarding action' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('onboardingAccountAction error:', safeStatus, error?.message || error);
    return Response.json({ success: false, error: safeStatus === 500 ? 'Onboarding could not be completed safely' : error.message }, { status: safeStatus });
  }
});
