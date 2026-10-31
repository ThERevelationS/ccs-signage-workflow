import { constantTimeEqual } from './constantTime.ts';

// Short-lived, recipient-bound permission for a non-admin staff session to send
// one approved estimate quote through sendGmail. Issued only by
// recordEstimateQuoteDelivery's authorize_send after the quote approval gate.
const PURPOSE = 'quote-send-grant';
const MAX_AGE_MS = 15 * 60 * 1000;

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

export function normalizeRecipientList(value: unknown) {
  return Array.from(new Set(
    String(value || '')
      .split(/[,;]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )).sort().join(',');
}

function unavailable() {
  const error: any = new Error('Quote send authorization is unavailable.');
  error.status = 503;
  return error;
}

export async function issueQuoteSendGrant({ user, estimateId, to, cc, bcc }: {
  user: any; estimateId: string; to: unknown; cc?: unknown; bcc?: unknown;
}) {
  const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';
  if (!secret) throw unavailable();
  const email = String(user?.email || '').trim().toLowerCase();
  const normalizedTo = normalizeRecipientList(to);
  if (!email || !estimateId || !normalizedTo || user?.role === 'badge') {
    const error: any = new Error('Quote send authorization requires a staff session, estimate, and recipient.');
    error.status = 400;
    throw error;
  }
  const now = Date.now();
  const payload = {
    v: 1,
    purpose: PURPOSE,
    email,
    estimate_id: String(estimateId),
    to: normalizedTo,
    cc: normalizeRecipientList(cc),
    bcc: normalizeRecipientList(bcc),
    iat: now,
    exp: now + MAX_AGE_MS,
    nonce: crypto.randomUUID(),
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  return { token: `${encoded}.${await hmac(encoded, secret)}`, expiresAt: new Date(payload.exp).toISOString() };
}

export async function verifyQuoteSendGrant(token: unknown, { email, to, cc, bcc }: {
  email: unknown; to: unknown; cc?: unknown; bcc?: unknown;
}) {
  const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';
  if (!secret) throw unavailable();
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 2) return false;
  const [encoded, providedSignature] = parts;
  if (!constantTimeEqual(await hmac(encoded, secret), providedSignature)) return false;

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecode(encoded));
  } catch {
    return false;
  }
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  const now = Date.now();
  if (
    payload?.v !== 1 ||
    payload?.purpose !== PURPOSE ||
    !payload?.estimate_id ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_AGE_MS + 1000
  ) {
    return false;
  }
  const callerEmail = String(email || '').trim().toLowerCase();
  return Boolean(callerEmail) &&
    payload.email === callerEmail &&
    payload.to === normalizeRecipientList(to) &&
    payload.cc === normalizeRecipientList(cc) &&
    payload.bcc === normalizeRecipientList(bcc);
}
