import { authenticateSignShopSession } from './signShopSession.ts';

// Fleet functions predate the EmailGate session model and authorize through
// base44.auth.me(), which only resolves for Base44-authenticated sessions
// (builder preview, service-to-service invokes). Staff browsers hold an
// EmailGate session (sss_session_token) backed by AuthorizedEmail — the app's
// real role system. This resolves the same {id,email,full_name,role} shape so
// each function's existing downstream authorization checks work unchanged.
// Returns null when no valid staff session is presented; callers keep their
// existing unauthenticated handling.
export async function resolveFleetStaffUser(base44: any, sessionToken: unknown) {
  const token = String(sessionToken || '').trim();
  if (!token) return null;
  try {
    const actor = await authenticateSignShopSession(base44, token);
    const role = String(actor?.role || '');
    if (!['admin', 'user'].includes(role)) return null;
    return {
      id: actor.id,
      email: actor.email,
      full_name: actor.full_name,
      role,
    };
  } catch (error: any) {
    // Only a rejected identity means "not signed in". A verification that could
    // not be completed (rate-limited or transient entity read, missing signing
    // secret) must not be reported as an expired session, because callers turn
    // null into 401 "Authentication required" and the client then demands a new
    // sign-in for what is really a retryable service failure.
    const status = Number(error?.status || 0);
    if (status === 401 || status === 409) return null;
    throw error;
  }
}