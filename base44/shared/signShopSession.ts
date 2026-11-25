import { constantTimeEqual } from './constantTime.ts';
import { applyOwnerCapabilities } from './ownerRole.ts';

// Short-lived auth cache — every function call used to spend ~2 entity_list
// reads re-verifying the same session (AuthorizedEmail + UserSession). Deno
// isolates persist across invocations, so a 15s cache eliminates the
// per-invoke read cost on warm isolates while keeping session revocation
// bounded. Only successful authentications are cached.
const sessionAuthCache = new Map<string, { user: any; expires: number }>();
const SESSION_AUTH_CACHE_MS = 15_000;

// Shared roster + revocation snapshot — the per-token cache above only helps
// a caller that lands on a warm isolate; every cold call used to spend ~2
// entity_list reads (AuthorizedEmail + UserSession) re-verifying the same
// session, and requests spread across isolates so most calls paid full price.
// The roster and revoked-session sets are small and shared across ALL staff
// tokens, so one pair of reads per isolate per TTL covers every caller.
// Misses, ambiguity and snapshot failures degrade to the direct per-call
// reads at the call site, preserving the exact pre-snapshot behavior.
// Staleness: deactivation, role/permission changes and revocation now take
// effect within ~60s per isolate (was ~15s) — the accepted trade for cutting
// ~2 entity reads off nearly every function call.
type StaffSessionSnapshot = {
  usersByEmail: Map<string, any[]>;
  revokedHashes: Set<string>;
  revokedOverflow: boolean;
  at: number;
};
const STAFF_SNAPSHOT_TTL_MS = 60_000;
const STAFF_SNAPSHOT_LIMIT = 2000;
const staffSnapshotState: { snapshot: StaffSessionSnapshot | null; inFlight: Promise<StaffSessionSnapshot | null> | null } = {
  snapshot: null,
  inFlight: null,
};

async function staffSessionSnapshot(base44: any): Promise<StaffSessionSnapshot | null> {
  const { snapshot, inFlight } = staffSnapshotState;
  if (snapshot && Date.now() - snapshot.at < STAFF_SNAPSHOT_TTL_MS) return snapshot;
  if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const [users, revoked] = await Promise.all([
        base44.asServiceRole.entities.AuthorizedEmail.list('-updated_date', STAFF_SNAPSHOT_LIMIT),
        base44.asServiceRole.entities.UserSession.filter({ revoked: true }, '-created_date', STAFF_SNAPSHOT_LIMIT).catch(() => null),
      ]);
      if (!Array.isArray(users)) return null;
      const usersByEmail = new Map<string, any[]>();
      for (const u of users) {
        const key = String(u?.email || '').trim().toLowerCase();
        if (!key) continue;
        const rows = usersByEmail.get(key) || [];
        rows.push(u);
        usersByEmail.set(key, rows);
      }
      // A failed or capped revoked-set read must not let a revoked token ride
      // the snapshot — overflow marks it unusable so the caller falls back to
      // the direct per-token check.
      const revokedOverflow = !Array.isArray(revoked) || revoked.length >= STAFF_SNAPSHOT_LIMIT;
      const snap: StaffSessionSnapshot = {
        usersByEmail,
        revokedHashes: new Set(
          (Array.isArray(revoked) ? revoked : [])
            .map((r: any) => String(r?.token_hash || ''))
            .filter(Boolean),
        ),
        revokedOverflow,
        at: Date.now(),
      };
      staffSnapshotState.snapshot = snap;
      return snap;
    } catch {
      return null;
    } finally {
      staffSnapshotState.inFlight = null;
    }
  })();
  staffSnapshotState.inFlight = promise;
  return promise;
}

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

export async function signShopSessionPayload(payload: Record<string, unknown>) {
  const secret = Deno.env.get('SESSION_SIGNING_SECRET');
  if (!secret) throw Object.assign(new Error('Session authentication is unavailable'), { status: 503 });

  const payloadStr = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(payloadStr, secret);
  return `${payloadStr}.${sig}`;
}

export async function signShopSessionTokenHash(token: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(buf)));
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

  // Break-glass expiry — a time-boxed admin grant lapses automatically; the
  // actor keeps their session but every backend admin gate sees a non-admin.
  const stripExpiredGrant = (user: any) => {
    const grantExpiry = Date.parse(String(user?.admin_grant_expires || ''));
    if (Number.isFinite(grantExpiry) && grantExpiry > 0 && grantExpiry <= Date.now() && user) {
      user.role = 'user';
      user.is_full_admin = false;
      user.admin_permissions = {};
    }
    return user;
  };

  // Deactivated accounts and lapsed access windows must not keep working on
  // an already-issued token — verifyLogin blocks NEW logins for these, but
  // session tokens live 30 days and per-session revocation is manual. The
  // user row is fetched fresh (or re-checked from the ≤15s cache) on every
  // call, so enforcement lands within seconds of the admin change.
  const rejectInactive = (user: any) => {
    if (user?.is_deactivated === true || user?.is_active === false) {
      throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
    // access_expires_on is a "valid through" date — the account lapses the day
    // after (matches the admin UI's expired badge). End-of-UTC-day parse keeps
    // the boundary timezone-safe.
    const expiry = Date.parse(`${String(user?.access_expires_on || '').trim()}T23:59:59.999Z`);
    if (Number.isFinite(expiry) && expiry > 0 && expiry <= Date.now()) {
      throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
    return user;
  };

  const tokenHash = await signShopSessionTokenHash(rawToken);
  const cachedAuth = sessionAuthCache.get(tokenHash);
  if (cachedAuth && cachedAuth.expires > Date.now()) {
    // Free hit-path recheck — the cached user's session_not_before still gates
    // older tokens (catches not_before bumps fetched inside the cache window).
    const cachedUser = applyOwnerCapabilities(rejectInactive(stripExpiredGrant(cachedAuth.user)));
    const cachedNotBefore = Date.parse(String(cachedUser?.session_not_before || ''));
    if (Number.isFinite(cachedNotBefore) && cachedNotBefore > 0 && issuedAt < cachedNotBefore) {
      throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
    return cachedUser;
  }

  let row: any = null;
  const snap = await staffSessionSnapshot(base44);
  if (snap) {
    const rows = snap.usersByEmail.get(email);
    if (Array.isArray(rows) && rows.length === 1 && !snap.revokedOverflow) {
      if (snap.revokedHashes.has(tokenHash)) {
        throw Object.assign(new Error('Authentication required'), { status: 401 });
      }
      row = rows[0];
    }
  }
  if (!row) {
    const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
    if (!Array.isArray(users)) {
      throw Object.assign(new Error('Authenticated user identity could not be verified'), { status: 503 });
    }
    if (users.length === 0) throw Object.assign(new Error('Authentication required'), { status: 401 });
    if (users.length !== 1) {
      throw Object.assign(new Error('Authenticated user identity is ambiguous'), { status: 409 });
    }

    // Revocation check — a revoked UserSession row (by token fingerprint) rejects this token.
    try {
      const revoked = await base44.asServiceRole.entities.UserSession.filter({ token_hash: tokenHash, revoked: true });
      if (Array.isArray(revoked) && revoked.length > 0) {
        throw Object.assign(new Error('Authentication required'), { status: 401 });
      }
    } catch (e) {
      if (e?.status === 401) throw e;
      // UserSession may not exist yet — treat lookup failures as non-blocking.
    }
    row = users[0];
  }

  // Owner normalization runs AFTER grant-expiry strip — an owner (anchored or
  // granted) is never demoted by a lapsed break-glass grant. Snapshot rows are
  // shared across callers, so normalize a copy (the helpers mutate the row).
  const user = applyOwnerCapabilities(rejectInactive(stripExpiredGrant({ ...row })));
  if (sessionAuthCache.size > 500) sessionAuthCache.clear();
  sessionAuthCache.set(tokenHash, { user, expires: Date.now() + SESSION_AUTH_CACHE_MS });
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  return user;
}