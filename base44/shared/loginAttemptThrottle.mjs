// Brute-force throttle for verifyLogin. Every sign-in attempt appends its own
// FailedAdminAttempt row *before* the password is compared, then counts the
// rows in the current window. Appends never collide, so concurrent attempts
// cannot collapse into a single counter tick the way a read-modify-write of
// AuthorizedEmail.failed_login_count does: the k-th concurrent attempt always
// sees at least k rows, so at most `maxFailures` attempts per window ever
// reach the password comparison.

export const LOGIN_ATTEMPT_PENDING = 'login_attempt_pending';
export const LOGIN_ATTEMPT_BAD_PASSWORD = 'bad_password';
export const LOGIN_ATTEMPT_LOCKED_OUT = 'locked_out';

const COUNTED_REASONS = new Set([LOGIN_ATTEMPT_PENDING, LOGIN_ATTEMPT_BAD_PASSWORD]);
const COUNT_SCAN_LIMIT = 200;

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Failures only count since the window opened and since the last event that
// legitimately resets the counter (a successful sign-in or a credential change).
export function loginAttemptWindowStart(user, { now = Date.now(), windowMinutes } = {}) {
  return new Date(Math.max(
    now - windowMinutes * 60 * 1000,
    timestamp(user?.last_login_at),
    timestamp(user?.session_not_before),
  )).toISOString();
}

export async function countLoginAttempts({ attempts, email, since }) {
  // Filter reasons server-side so a flood of locked-out rows cannot push the
  // counted rows out of the scan window.
  const rows = await attempts.filter(
    { email, reason: { $in: [...COUNTED_REASONS] }, at: { $gte: since } },
    '-at',
    COUNT_SCAN_LIMIT,
  );
  if (!Array.isArray(rows)) throw new Error('Sign-in attempt history could not be read.');
  return rows.filter(row => COUNTED_REASONS.has(row?.reason) && String(row?.at || '') >= since).length;
}

// Reserves an attempt slot. Throws when the attempt cannot be recorded or
// counted so callers fail closed instead of comparing an uncounted password.
export async function reserveLoginAttempt({ attempts, user, maxFailures, windowMinutes, now = Date.now() }) {
  const email = String(user?.email || '');
  if (!email || typeof attempts?.create !== 'function' || typeof attempts?.filter !== 'function') {
    throw new Error('Sign-in attempt tracking is unavailable.');
  }
  const since = loginAttemptWindowStart(user, { now, windowMinutes });
  const reservation = await attempts.create({
    email,
    reason: LOGIN_ATTEMPT_PENDING,
    at: new Date(now).toISOString(),
  });
  if (!reservation?.id) throw new Error('Sign-in attempt could not be recorded.');
  const count = await countLoginAttempts({ attempts, email, since });
  return { reservation, count: Math.max(count, 1), allowed: count <= maxFailures };
}

export async function markLoginAttempt({ attempts, reservation, reason }) {
  if (!reservation?.id) return;
  try {
    await attempts.update(reservation.id, { reason });
  } catch (error) {
    // A still-pending row keeps counting as a failure, which errs toward lockout.
    console.error('Could not finalize sign-in attempt record:', error?.message || error);
  }
}

export async function releaseLoginAttempt({ attempts, reservation }) {
  if (!reservation?.id) return;
  try {
    await attempts.delete(reservation.id);
  } catch (error) {
    // The successful sign-in also advances last_login_at, which moves the
    // window start past this row, so a failed delete cannot cause a lockout.
    console.error('Could not release sign-in attempt record:', error?.message || error);
  }
}
