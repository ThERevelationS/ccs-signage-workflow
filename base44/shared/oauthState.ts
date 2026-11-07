function b64urlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string) {
  let normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return atob(normalized);
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signPayload(payload: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`oauth-state|${payload}`));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

function randomNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return b64urlEncode(String.fromCharCode(...bytes));
}

const STATE_TTL_MS = 10 * 60 * 1000;

async function hashNonce(nonce: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`oauth-state-nonce|${nonce}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nonceStore(base44: any) {
  const store = base44?.asServiceRole?.entities?.OAuthStateNonce;
  if (!store || typeof store.create !== 'function' || typeof store.filter !== 'function' || typeof store.updateMany !== 'function') {
    throw Object.assign(new Error('OAuth state storage is unavailable'), { status: 503 });
  }
  return store;
}

async function pruneExpiredNonces(store: any, userId: string) {
  try {
    const rows = await store.filter({ user_id: userId }, '-created_date', 50);
    const cutoff = Date.now();
    for (const row of (Array.isArray(rows) ? rows : [])) {
      if (row?.id && Date.parse(row.expires_at) < cutoff) await store.delete(row.id);
    }
  } catch {}
}

function signingSecret() {
  return String(Deno.env.get('SESSION_SIGNING_SECRET') || '').trim();
}

export async function issueOAuthState(base44: any, user: any, purpose: string) {
  const secret = signingSecret();
  const store = nonceStore(base44);
  const userId = String(user?.id || '').trim();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!secret) throw Object.assign(new Error('OAuth state signing is unavailable'), { status: 503 });
  if (!userId || !email || !purpose) throw Object.assign(new Error('OAuth identity could not be verified'), { status: 401 });

  const now = Date.now();
  const exp = now + STATE_TTL_MS;
  const nonce = randomNonce();
  await pruneExpiredNonces(store, userId);
  await store.create({
    nonce_hash: await hashNonce(nonce),
    user_id: userId,
    purpose,
    expires_at: new Date(exp).toISOString(),
    used: false,
  });

  const payload = b64urlEncode(JSON.stringify({
    v: 1,
    user_id: userId,
    email,
    purpose,
    iat: now,
    exp,
    nonce,
  }));
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyOAuthState(base44: any, state: unknown, expectedPurpose: string) {
  const secret = signingSecret();
  const store = nonceStore(base44);
  if (!secret) throw Object.assign(new Error('OAuth state verification is unavailable'), { status: 503 });

  const raw = String(state || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2) throw Object.assign(new Error('Invalid OAuth state'), { status: 401 });
  const [payload, suppliedSignature] = parts;
  const expectedSignature = await signPayload(payload, secret);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    throw Object.assign(new Error('Invalid OAuth state'), { status: 401 });
  }

  let decoded: any;
  try {
    decoded = JSON.parse(b64urlDecode(payload));
  } catch {
    throw Object.assign(new Error('Invalid OAuth state'), { status: 401 });
  }

  const userId = String(decoded?.user_id || '').trim();
  const email = String(decoded?.email || '').trim().toLowerCase();
  const nonce = typeof decoded?.nonce === 'string' ? decoded.nonce : '';
  if (
    decoded?.v !== 1 ||
    !nonce ||
    decoded?.purpose !== expectedPurpose ||
    !userId ||
    !email ||
    !Number.isFinite(Number(decoded?.exp)) ||
    Number(decoded.exp) < Date.now()
  ) {
    throw Object.assign(new Error('Invalid or expired OAuth state'), { status: 401 });
  }

  // Single use: atomically claim the persisted nonce so a replayed state is rejected.
  const matches = await store.filter({ nonce_hash: await hashNonce(nonce) });
  const record = Array.isArray(matches) && matches.length === 1 ? matches[0] : null;
  if (
    !record ||
    record.used !== false ||
    String(record.user_id || '') !== userId ||
    record.purpose !== expectedPurpose ||
    !(Date.parse(record.expires_at) >= Date.now())
  ) {
    throw Object.assign(new Error('Invalid or expired OAuth state'), { status: 401 });
  }
  const claimed = await store.updateMany(
    { id: record.id, updated_date: record.updated_date, used: false },
    { $set: { used: true, used_at: new Date().toISOString() } },
  );
  if (!claimed || claimed.updated !== 1) {
    throw Object.assign(new Error('Invalid or expired OAuth state'), { status: 401 });
  }

  return { userId, email };
}
