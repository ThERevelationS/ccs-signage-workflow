import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
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
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifySessionToken(token: string, secret: string, authorized: any) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) return null;

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    return null;
  }
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (
    !payload?.email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) return null;

  const rows = await authorized.filter({ email: String(payload.email).toLowerCase().trim() });
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const user = rows[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) return null;
  return user;
}

function secureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function htmlEscape(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.session_token || '').trim();
    const requestedEmail = String(body?.target_email || '').trim().toLowerCase();
    const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';
    const authorized = base44.asServiceRole.entities.AuthorizedEmail;

    const actor = await verifySessionToken(sessionToken, secret, authorized);
    if (!actor?.id) {
      return Response.json({ success: false, error: 'A valid signed-in session is required' }, { status: 401 });
    }

    const actorEmail = String(actor.email || '').trim().toLowerCase();
    const targetEmail = requestedEmail || actorEmail;
    if (!targetEmail) {
      return Response.json({ success: false, error: 'Target email is required' }, { status: 400 });
    }
    if (targetEmail !== actorEmail && actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access is required to reset another user' }, { status: 403 });
    }

    const targetRows = await authorized.filter({ email: targetEmail });
    if (!Array.isArray(targetRows) || targetRows.length !== 1) {
      return Response.json({
        success: false,
        error: Array.isArray(targetRows) && targetRows.length === 0 ? 'Authorized user not found' : 'Authorized user identity is ambiguous',
      }, { status: Array.isArray(targetRows) && targetRows.length === 0 ? 404 : 409 });
    }
    const target = targetRows[0];

    const resetToken = secureToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
      entity: authorized,
      user: target,
      nextFields: {
        password_reset_token: resetToken,
        password_reset_expires: expires,
      },
      guardFields: { email: target.email },
      label: `Password reset token for ${target.email}`,
    });

    const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || 'https://clay-flow-signage-suite-387da97c.base44.app').replace(/\/$/, '');
    const resetLink = `${appUrl}/ResetPassword?token=${encodeURIComponent(resetToken)}`;
    const displayName = htmlEscape(target.full_name || target.email || 'there');
    const emailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1F2937;">
        <div style="background:#FFFFFF;padding:30px;border-radius:16px;border:1px solid #E5E7EB;">
          <h2 style="margin:0 0 16px 0;">Password Reset</h2>
          <p>Hello ${displayName},</p>
          <p>A password reset was requested for your Sign Shop Workflow account.</p>
          <p style="text-align:center;margin:30px 0;">
            <a href="${resetLink}" style="background-color:#7C3AED;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Reset Password</a>
          </p>
          <p style="color:#6B7280;font-size:14px;">This one-time link expires in 24 hours. If you did not request it, you can ignore this email.</p>
        </div>
      </div>`;

    const sendResponse = await base44.asServiceRole.functions.invoke('sendGmail', {
      to: target.email,
      subject: 'Reset Your Sign Shop Workflow Password',
      body: emailBody,
    });
    const sendResult = sendResponse?.data || sendResponse;
    if (sendResult?.error || sendResult?.success === false) {
      console.error('Password reset email could not be sent for user id:', target.id);
      return Response.json({ success: false, error: 'The reset token was saved, but the reset email could not be sent. Retry to issue a new link.' }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('issuePasswordReset error:', error?.message || error);
    return Response.json({ success: false, error: 'Password reset could not be issued safely' }, { status: 500 });
  }
});
