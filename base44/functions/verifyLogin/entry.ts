import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';

// Base64url helpers
function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    const { username, password } = body || {};

    if (!username || !password) {
      return Response.json({ success: false, error: 'Username and password required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const uname = String(username).toLowerCase().trim();

    // Look up credential as service role (bypasses RLS)
    const creds = await base44.asServiceRole.entities.UserCredential.filter({ username: uname });
    if (!creds || creds.length === 0) {
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }

    const cred = creds[0];
    const match = await bcrypt.compare(password, cred.password_hash);
    if (!match) {
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }

    // Look up full user info
    const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: cred.user_email });
    const user = users?.[0];
    if (!user) {
      return Response.json({ success: false, error: 'User record not found' }, { status: 404 });
    }

    // Build signed session token: base64url(payload).base64url(signature)
    const secret = Deno.env.get('SESSION_SIGNING_SECRET');
    if (!secret) {
      return Response.json({ success: false, error: 'Session secret not configured' }, { status: 500 });
    }

    const payload = {
      email: user.email,
      username: cred.username,
      role: user.role || 'user',
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
    };
    const payloadStr = b64urlEncode(JSON.stringify(payload));
    const sig = await hmacSign(payloadStr, secret);
    const token = `${payloadStr}.${sig}`;

    return Response.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: cred.username,
        role: user.role,
        sales_roles: user.sales_roles,
        can_import_export: user.can_import_export,
        can_view_resources: user.can_view_resources,
      },
    });
  } catch (error) {
    console.error('verifyLogin error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});