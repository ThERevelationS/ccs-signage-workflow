import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';

// Helpers for verifying admin via session token
function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}
async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}
async function verifyTokenIsAdmin(token, secret, base44) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (expectedSig !== providedSig) return null;
  const payload = JSON.parse(b64urlDecode(payloadStr));
  if (payload.exp && payload.exp < Date.now()) return null;
  const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: payload.email });
  const user = users?.[0];
  if (!user || user.role !== 'admin') return null;
  return user;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { username, new_password, user_email, reset_token, session_token } = body || {};

    if (!new_password || new_password.length < 4) {
      return Response.json({ success: false, error: 'Password must be at least 4 characters' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const secret = Deno.env.get('SESSION_SIGNING_SECRET');

    // Determine target user — by reset_token (public), or by admin session
    let targetUser = null;
    let isResetFlow = false;

    if (reset_token) {
      // Public flow: reset token from email
      const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ password_reset_token: reset_token });
      const u = users?.[0];
      if (!u) return Response.json({ success: false, error: 'Invalid reset link' }, { status: 401 });
      if (u.password_reset_expires && new Date(u.password_reset_expires) < new Date()) {
        return Response.json({ success: false, error: 'Reset link expired' }, { status: 401 });
      }
      targetUser = u;
      isResetFlow = true;
    } else {
      // Admin flow: must provide admin session token
      const admin = await verifyTokenIsAdmin(session_token, secret, base44);
      if (!admin) {
        return Response.json({ success: false, error: 'Admin authentication required' }, { status: 403 });
      }
      const lookupEmail = (user_email || '').toLowerCase().trim();
      if (!lookupEmail) {
        return Response.json({ success: false, error: 'user_email required' }, { status: 400 });
      }
      const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: lookupEmail });
      targetUser = users?.[0];
      if (!targetUser) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 });
      }
    }

    // Determine username: use provided, else existing on user, else derive from email
    const uname = (username || targetUser.username || targetUser.email.split('@')[0]).toLowerCase().trim();

    // Hash password
    const password_hash = await bcrypt.hash(new_password, 10);

    // Upsert UserCredential by user_email
    const existing = await base44.asServiceRole.entities.UserCredential.filter({ user_email: targetUser.email });
    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.UserCredential.update(existing[0].id, {
        username: uname,
        password_hash,
      });
    } else {
      await base44.asServiceRole.entities.UserCredential.create({
        username: uname,
        user_email: targetUser.email,
        password_hash,
      });
    }

    // Also update the username on AuthorizedEmail, clear any password_hash/reset tokens
    const updates = { username: uname, password_hash: null };
    if (isResetFlow) {
      updates.password_reset_token = null;
      updates.password_reset_expires = null;
    }
    await base44.asServiceRole.entities.AuthorizedEmail.update(targetUser.id, updates);

    return Response.json({ success: true });
  } catch (error) {
    console.error('setPassword error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});