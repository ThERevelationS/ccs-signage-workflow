import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { replaceAuthorizedEmailCredentialFieldsIfUnchanged } from '../../shared/authorizedEmailCredentialPersistence.mjs';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Must be authenticated admin via Base44's normal auth
    const me = await base44.auth.me().catch(() => null);
    if (!me || me.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    // AuthorizedEmail is the current credential source of truth used by verifyLogin.
    // This legacy action now only upgrades plaintext values to bcrypt in place. It
    // never clears or moves the active login credential.
    const entity = base44.asServiceRole.entities.AuthorizedEmail;
    const users = await entity.list();
    const results = { migrated: 0, skipped: 0, cleared: 0, errors: [] };

    for (const user of users) {
      try {
        const stored = String(user.password_hash || '');
        if (!stored) {
          results.skipped++;
          continue;
        }
        if (/^\$2[aby]\$/.test(stored)) {
          results.skipped++;
          continue;
        }

        const password_hash = await bcrypt.hash(stored, 10);
        await replaceAuthorizedEmailCredentialFieldsIfUnchanged({
          entity,
          user,
          nextFields: { password_hash },
          guardFields: { email: user.email },
          label: `Legacy password hash upgrade for ${user.email}`,
        });
        results.migrated++;
      } catch (e) {
        console.error('Password hash upgrade error for', user.email, e);
        results.errors.push({ email: user.email, error: e.message });
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error('migrateCredentials error:', error?.message || error);
    return Response.json({ success: false, error: 'Credential migration could not be completed safely' }, { status: 500 });
  }
});
