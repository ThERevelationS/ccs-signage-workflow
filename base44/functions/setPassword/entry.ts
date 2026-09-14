import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { hashBearerToken } from '../../shared/bearerTokenHash.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  claimPasswordResetToken,
  replaceAuthorizedEmailCredentialFieldsIfUnchanged,
} from '../../shared/authorizedEmailCredentialPersistence.mjs';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { username, new_password, user_email, reset_token, session_token } = body || {};

    if (!new_password || new_password.length < 8) {
      return Response.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const authorized = base44.asServiceRole.entities.AuthorizedEmail;
    const secret = Deno.env.get('SESSION_SIGNING_SECRET');

    let targetUser = null;
    let isResetFlow = false;

    if (reset_token) {
      const resetTokenHash = await hashBearerToken(reset_token);
      let users = await authorized.filter({ password_reset_token_hash: resetTokenHash });
      if (Array.isArray(users) && users.length === 0) {
        // Backward-compatible rollout guard for a legacy raw token issued by an
        // older deployed function immediately before hash-at-rest became active.
        users = await authorized.filter({ password_reset_token: reset_token });
      }
      if (!Array.isArray(users) || users.length !== 1) {
        return Response.json({ success: false, error: 'Invalid or already-used reset link' }, { status: 401 });
      }
      const candidate = users[0];
      if (candidate.password_reset_expires && new Date(candidate.password_reset_expires) < new Date()) {
        return Response.json({ success: false, error: 'Reset link expired' }, { status: 401 });
      }
      try {
        targetUser = await claimPasswordResetToken({
          entity: authorized,
          user: candidate,
          resetToken: reset_token,
          resetTokenHash,
          label: `Password reset token for ${candidate.email}`,
        });
      } catch (claimError) {
        return Response.json({ success: false, error: claimError.message }, { status: 409 });
      }
      isResetFlow = true;
    } else {
      const admin = await verifyTokenIsAdmin(session_token, secret, base44);
      if (!admin) {
        return Response.json({ success: false, error: 'Admin authentication required' }, { status: 403 });
      }
      const lookupEmail = (user_email || '').toLowerCase().trim();
      if (!lookupEmail) {
        return Response.json({ success: false, error: 'user_email required' }, { status: 400 });
      }
      const users = await authorized.filter({ email: lookupEmail });
      if (!users || users.length !== 1) {
        return Response.json({ success: false, error: users?.length > 1 ? 'Duplicate authorized user records require admin review' : 'User not found' }, { status: users?.length > 1 ? 409 : 404 });
      }
      targetUser = users[0];
    }

    const uname = (username || targetUser.username || targetUser.email.split('@')[0]).toLowerCase().trim();
    if (!uname) {
      return Response.json({ success: false, error: 'Username required' }, { status: 400 });
    }
    const usernameMatches = await authorized.filter({ username: uname });
    if ((usernameMatches || []).some(row => row.id !== targetUser.id)) {
      return Response.json({ success: false, error: 'Username is already in use' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    const nextFields: Record<string, unknown> = {
      username: uname,
      password_hash,
      session_not_before: new Date().toISOString(),
    };
    // Admin password changes invalidate any outstanding reset link. Reset-flow links
    // were already claimed atomically above.
    if (!isResetFlow) {
      nextFields.password_reset_token = null;
      nextFields.password_reset_token_hash = null;
      nextFields.password_reset_expires = null;
    }

    await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
      entity: authorized,
      user: targetUser,
      nextFields,
      guardFields: { email: targetUser.email },
      label: `Password update for ${targetUser.email}`,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('setPassword error:', error);
    return Response.json({ success: false, error: 'Password update could not be completed safely' }, { status: 500 });
  }
});
