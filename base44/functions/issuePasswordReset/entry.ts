import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { getWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { hashBearerToken } from '../../shared/bearerTokenHash.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';

// Fire-and-forget automation emit — a failure must never break a verified
// write, so this swallows and logs like the other emit helpers.
async function emitRecordAutomation(base44: any, eventType: string, recordId: string, actor: string) {
  try {
    await processWorkflowTriggerEvent({
      base44,
      payload: { event_type: eventType, record: { id: recordId } },
      changedByOverride: actor,
    });
  } catch (error: any) {
    console.error(`Automation emit failed for ${eventType}:`, error?.message || error);
  }
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
    const authorized = base44.asServiceRole.entities.AuthorizedEmail;

    let actor;
    try {
      actor = await authenticateSignShopSession(base44, sessionToken);
    } catch (authError) {
      const status = Number(authError?.status || 401);
      const safeStatus = [401, 409, 503].includes(status) ? status : 401;
      const error = safeStatus === 503
        ? 'Session authentication is unavailable'
        : safeStatus === 409
          ? 'Signed-in user identity could not be verified'
          : 'A valid signed-in session is required';
      return Response.json({ success: false, error }, { status: safeStatus });
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

    // Cooldown: if an unexpired reset token was already issued, don't mint a
    // new one (or resend email) — rapid repeated requests are email bombing.
    const existingExpiry = Date.parse(String(target?.password_reset_expires || '')) || 0;
    if (existingExpiry > Date.now()) {
      return Response.json({ success: true, cooldown: true, message: 'A reset link was already issued recently — check your email or wait for it to expire before requesting another.' });
    }

    const resetToken = secureToken();
    const resetTokenHash = await hashBearerToken(resetToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
      entity: authorized,
      user: target,
      nextFields: {
        password_reset_token: null,
        password_reset_token_hash: resetTokenHash,
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
      _workflow_capability: getWorkflowInvocationCapability('sendGmail'),
    });
    const sendResult = sendResponse?.data || sendResponse;
    if (sendResult?.error || sendResult?.success === false) {
      console.error('Password reset email could not be sent for user id:', target.id);
      return Response.json({ success: false, error: 'The reset token was saved, but the reset email could not be sent. Retry to issue a new link.' }, { status: 502 });
    }

    await emitRecordAutomation(base44, 'user_password_reset', target.id, actorEmail);
    return Response.json({ success: true });
  } catch (error) {
    console.error('issuePasswordReset error:', error?.message || error);
    return Response.json({ success: false, error: 'Password reset could not be issued safely' }, { status: 500 });
  }
});