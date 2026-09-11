import { constantTimeEqual } from './constantTime.ts';

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

export async function authenticateSignShopSession(base44: any, token: unknown) {
  const rawToken = String(token || '').trim();
  if (!rawToken) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const parts = rawToken.split('.');
  if (parts.length !== 2) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const secret = Deno.env.get('SESSION_SIGNING_SECRET');
  if (!secret) throw Object.assign(new Error('Session authentication is unavailable'), { status: 503 });

  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) throw Object.assign(new Error('Authentication required'), { status: 401 });

  let sessionPayload: any;
  try {
    sessionPayload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const email = String(sessionPayload?.email || '').trim().toLowerCase();
  const issuedAt = Number(sessionPayload?.iat);
  const expiresAt = Number(sessionPayload?.exp);
  if (
    !email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
  if (!Array.isArray(users)) {
    throw Object.assign(new Error('Authenticated user identity could not be verified'), { status: 503 });
  }
  if (users.length === 0) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (users.length !== 1) {
    throw Object.assign(new Error('Authenticated user identity is ambiguous'), { status: 409 });
  }

  const user = users[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  return user;
}
