import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { constantTimeEqual } from '../../shared/constantTime.ts';

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
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { token } = body || {};

    if (!token) {
      return Response.json({ valid: false, error: 'No token provided' }, { status: 400 });
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return Response.json({ valid: false, error: 'Malformed token' }, { status: 401 });
    }

    const [payloadStr, providedSig] = parts;
    const secret = Deno.env.get('SESSION_SIGNING_SECRET');
    if (!secret) {
      console.error('verifySession session signing secret is unavailable');
      return Response.json({ valid: false, error: 'Session verification service is unavailable' }, { status: 500 });
    }

    const expectedSig = await hmacSign(payloadStr, secret);
    if (!constantTimeEqual(expectedSig, providedSig)) {
      return Response.json({ valid: false, error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(b64urlDecode(payloadStr));
    const issuedAt = Number(payload?.iat);
    const expiresAt = Number(payload?.exp);
    if (
      !payload?.email ||
      !Number.isFinite(issuedAt) || issuedAt <= 0 ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
    ) {
      return Response.json({ valid: false, error: 'Token expired or invalid' }, { status: 401 });
    }

    // Fetch fresh user data as service role
    const base44 = createClientFromRequest(req);
    const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: payload.email });
    if (!Array.isArray(users) || users.length !== 1) {
      return Response.json({
        valid: false,
        error: Array.isArray(users) && users.length === 0 ? 'User no longer exists' : 'User identity could not be verified uniquely'
      }, { status: Array.isArray(users) && users.length === 0 ? 404 : 409 });
    }
    const user = users[0];
    const notBefore = Date.parse(String(user?.session_not_before || ''));
    if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
      return Response.json({ valid: false, error: 'Session has been revoked' }, { status: 401 });
    }

    return Response.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: user.username || payload.username,
        role: user.role,
        sales_roles: user.sales_roles,
        can_import_export: user.can_import_export,
        can_view_resources: user.can_view_resources,
      },
    });
  } catch (error) {
    console.error('verifySession error:', error);
    return Response.json({ valid: false, error: 'Session verification could not be completed safely' }, { status: 500 });
  }
});