import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { signShopSessionPayload } from '../../shared/signShopSession.ts';
import { withEmployeeAccessReads } from '../../shared/employeeAccessReads.ts';

// Fixed bcrypt work factor for invalid/unknown credentials. This is not a real
// account credential; it only keeps failed-login timing closer to valid-user
// bcrypt verification so username existence is harder to infer remotely.
const DUMMY_PASSWORD_HASH = '$2a$10$ApDRjqUs6Q5EbAw/6UybWuLWQOAa5Eg4dLKs/F9iQRZUXfcubNGKa';

// Brute-force lockout: after MAX_FAILED_LOGINS consecutive failures the
// account refuses sign-in attempts for LOCKOUT_MINUTES minutes. The counter
// and deadline live on AuthorizedEmail so they survive across invocations.
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

async function persistLoginSecurityFields(authorized, user, nextFields) {
  try {
    await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
      entity: authorized,
      user,
      nextFields,
      guardFields: { email: user.email },
      label: `Login attempt tracking for ${user.email}`,
    });
  } catch (error) {
    // Login security bookkeeping must never block or leak into the sign-in
    // response; a lost counter update just delays the lockout by one attempt.
    console.error('Could not persist login attempt tracking:', error?.message || error);
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { username, password } = body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return Response.json({ success: false, error: 'Username and password required' }, { status: 400 });
    }
    if (username.length > 128 || password.length > 1024) {
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 400 });
    }

    const base44 = withEmployeeAccessReads(createClientFromRequest(req));
    const uname = username.toLowerCase().trim();

    // Look up the user directly on AuthorizedEmail (the credential source of truth).
    // Read retries retain credential and uniqueness checks on every attempt.
    const authorized = base44.asServiceRole.entities.AuthorizedEmail;
    let users;
    try {
      users = await authorized.filter({ username: uname });
    } catch (lookupError) {
      const status = lookupError?.status || lookupError?.response?.status;
      if (status === 429) {
        return Response.json(
          { success: false, error: 'Sign in is temporarily rate limited. Try again shortly.' },
          { status: 429 },
        );
      }
      throw lookupError;
    }
    if (!Array.isArray(users) || users.length !== 1) {
      if (users?.length > 1) console.error(`verifyLogin duplicate username records for ${uname}`);
      await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH).catch(() => false);
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }
    const user = users[0];

    const lockedUntil = Date.parse(String(user.login_locked_until || ''));
    if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
      // Keep bcrypt timing on the lockout path so locked accounts cannot be
      // distinguished from ordinary bad-password responses by response time.
      await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH).catch(() => false);
      return Response.json({
        success: false,
        error: `Too many failed sign-in attempts. Try again in ${Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000))} minutes.`,
      }, { status: 429 });
    }

    const stored = user.password_hash || '';
    if (!stored) {
      await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH).catch(() => false);
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }

    // Support both bcrypt hashes ($2a/$2b/$2y) and legacy plaintext passwords.
    // Once a legacy credential successfully authenticates, upgrade it in place
    // before issuing the session so plaintext storage disappears naturally as
    // users sign in. Never expose the plaintext or generated hash in logs.
    const isBcrypt = /^\$2[aby]\$/.test(stored);
    let match = isBcrypt ? await bcrypt.compare(password, stored) : password === stored;

    if (!match) {
      if (!isBcrypt) {
        await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH).catch(() => false);
      }
      const failures = (Number.isFinite(Number(user.failed_login_count)) ? Number(user.failed_login_count) : 0) + 1;
      const nextFields: Record<string, unknown> = { failed_login_count: failures };
      if (failures >= MAX_FAILED_LOGINS) {
        nextFields.login_locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      }
      await persistLoginSecurityFields(authorized, user, nextFields);
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }

    if (!isBcrypt) {
      const upgradedHash = await bcrypt.hash(password, 10);
      try {
        await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
          entity: authorized,
          user,
          nextFields: { password_hash: upgradedHash },
          guardFields: { email: user.email },
          label: `Legacy password hash upgrade for ${user.email}`,
        });
      } catch (upgradeError) {
        // A simultaneous successful login may have upgraded the same plaintext
        // credential with a different bcrypt salt. Accept that convergence only
        // if the freshly stored bcrypt hash still verifies this password.
        const current = await authorized.get(user.id).catch(() => null);
        const currentStored = String(current?.password_hash || '');
        const concurrentlyUpgraded = /^\$2[aby]\$/.test(currentStored) && await bcrypt.compare(password, currentStored).catch(() => false);
        if (!concurrentlyUpgraded) {
          console.error('Legacy password upgrade could not be verified for user id:', user.id);
          return Response.json({ success: false, error: 'Credential security upgrade could not be verified. Please retry sign in.' }, { status: 409 });
        }
      }
    }

    if (user.is_deactivated === true) {
      return Response.json({ success: false, error: 'This account has been deactivated. Please see an administrator.' }, { status: 403 });
    }
    if (user.force_password_reset === true) {
      return Response.json({ success: false, requires_password_reset: true, error: 'Password reset required. Please see an administrator for a new password.' }, { status: 403 });
    }

    const loginSecurityFields: Record<string, unknown> = { last_login_at: new Date().toISOString() };
    if (Number(user.failed_login_count) > 0 || user.login_locked_until) {
      loginSecurityFields.failed_login_count = 0;
      loginSecurityFields.login_locked_until = null;
    }
    await persistLoginSecurityFields(authorized, user, loginSecurityFields);

    // Build signed session token with the shared sign-shop signing primitive.
    const payload = {
      email: user.email,
      username: user.username,
      role: user.role || 'user',
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
    };
    let token;
    try {
      token = await signShopSessionPayload(payload);
    } catch (signError) {
      if (Number(signError?.status || 500) === 503) {
        console.error('verifyLogin session signing secret is unavailable');
        return Response.json({ success: false, error: 'Sign in service is unavailable' }, { status: 500 });
      }
      throw signError;
    }

    return Response.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: user.username,
        role: user.role,
        sales_roles: user.sales_roles,
        can_import_export: user.can_import_export,
        can_order_export: user.role === 'admin' && user.can_order_export === true,
        can_view_resources: user.can_view_resources,
        order_form_filter: user.order_form_filter,
      },
    });
  } catch (error) {
    console.error('verifyLogin error:', error);
    return Response.json({ success: false, error: 'Sign in could not be completed safely' }, { status: 500 });
  }
});