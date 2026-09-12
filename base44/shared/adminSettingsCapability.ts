import { constantTimeEqual } from './constantTime.ts';

const PURPOSE = 'admin-settings';
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function b64urlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string) {
  let text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  return atob(text);
}

async function hmac(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${PURPOSE}|${message}`));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

export async function issueAdminSettingsCapability(user: any) {
  const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';
  if (!secret) {
    const error: any = new Error('Admin Settings authorization is unavailable.');
    error.status = 503;
    throw error;
  }
  if (!user?.id || !user?.email || user?.role !== 'admin') {
    const error: any = new Error('Admin access is required.');
    error.status = 403;
    throw error;
  }

  const now = Date.now();
  const payload = {
    v: 1,
    purpose: PURPOSE,
    user_id: String(user.id),
    email: String(user.email).trim().toLowerCase(),
    iat: now,
    exp: now + MAX_AGE_MS,
    nonce: crypto.randomUUID(),
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  const signature = await hmac(encoded, secret);
  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export async function verifyAdminSettingsCapability(base44: any, token: unknown) {
  const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';
  if (!secret) {
    const error: any = new Error('Admin Settings authorization is unavailable.');
    error.status = 503;
    throw error;
  }

  const parts = String(token || '').trim().split('.');
  if (parts.length !== 2) {
    const error: any = new Error('Admin Settings authorization is required.');
    error.status = 401;
    throw error;
  }
  const [encoded, providedSignature] = parts;
  const expectedSignature = await hmac(encoded, secret);
  if (!constantTimeEqual(expectedSignature, providedSignature)) {
    const error: any = new Error('Admin Settings authorization is invalid.');
    error.status = 401;
    throw error;
  }

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecode(encoded));
  } catch {
    const error: any = new Error('Admin Settings authorization is invalid.');
    error.status = 401;
    throw error;
  }

  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  const now = Date.now();
  if (
    payload?.v !== 1 ||
    payload?.purpose !== PURPOSE ||
    !payload?.user_id ||
    !payload?.email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_AGE_MS + 1000
  ) {
    const error: any = new Error('Admin Settings authorization has expired or is invalid.');
    error.status = 401;
    throw error;
  }

  const email = String(payload.email).trim().toLowerCase();
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
  if (!Array.isArray(rows) || rows.length !== 1) {
    const error: any = new Error('Admin identity could not be verified uniquely.');
    error.status = rows?.length > 1 ? 409 : 401;
    throw error;
  }
  const user = rows[0];
  if (String(user.id || '') !== String(payload.user_id) || user.role !== 'admin') {
    const error: any = new Error('Admin access is no longer authorized.');
    error.status = 403;
    throw error;
  }
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && issuedAt < notBefore) {
    const error: any = new Error('Admin Settings authorization was revoked.');
    error.status = 401;
    throw error;
  }
  return user;
}
