import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';
import { signShopSessionPayload } from '../../shared/signShopSession.ts';

// Fixed bcrypt work factor for invalid/unknown credentials. This is not a real
// account credential; it only keeps failed-login timing closer to valid-user
// bcrypt verification so username existence is harder to infer remotely.
const DUMMY_PASSWORD_HASH = '$2a$10$ApDRjqUs6Q5EbAw/6UybWuLWQOAa5Eg4dLKs/F9iQRZUXfcubNGKa';

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

    const base44 = createClientFromRequest(req);
    const uname = username.toLowerCase().trim();

    // Look up the user directly on AuthorizedEmail (the credential source of truth).
    // Respect platform/provider throttling instead of retrying through a 429 signal.
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
        can_view_resources: user.can_view_resources,
      },
    });
  } catch (error) {
    console.error('verifyLogin error:', error);
    return Response.json({ success: false, error: 'Sign in could not be completed safely' }, { status: 500 });
  }
});