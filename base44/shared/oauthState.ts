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

function signingSecret() {
  return String(Deno.env.get('SESSION_SIGNING_SECRET') || '').trim();
}

export async function issueOAuthState(user: any, purpose: string) {
  const secret = signingSecret();
  const userId = String(user?.id || '').trim();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!secret) throw Object.assign(new Error('OAuth state signing is unavailable'), { status: 503 });
  if (!userId || !email || !purpose) throw Object.assign(new Error('OAuth identity could not be verified'), { status: 401 });

  const now = Date.now();
  const payload = b64urlEncode(JSON.stringify({
    v: 1,
    user_id: userId,
    email,
    purpose,
    iat: now,
    exp: now + 10 * 60 * 1000,
    nonce: randomNonce(),
  }));
  const signature = await signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyOAuthState(state: unknown, expectedPurpose: string) {
  const secret = signingSecret();
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
  if (
    decoded?.v !== 1 ||
    decoded?.purpose !== expectedPurpose ||
    !userId ||
    !email ||
    !Number.isFinite(Number(decoded?.exp)) ||
    Number(decoded.exp) < Date.now()
  ) {
    throw Object.assign(new Error('Invalid or expired OAuth state'), { status: 401 });
  }

  return { userId, email };
}
