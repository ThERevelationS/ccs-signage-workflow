import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bcrypt from 'npm:bcryptjs@2.4.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Must be authenticated admin via Base44's normal auth
    const me = await base44.auth.me().catch(() => null);
    if (!me || me.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const users = await base44.asServiceRole.entities.AuthorizedEmail.list();
    const existingCreds = await base44.asServiceRole.entities.UserCredential.list();
    const credsByEmail = new Map(existingCreds.map(c => [c.user_email?.toLowerCase(), c]));

    const results = { migrated: 0, skipped: 0, cleared: 0, errors: [] };

    for (const user of users) {
      try {
        const hasPlain = !!user.password_hash;
        const hasUsername = !!user.username;
        const email = user.email?.toLowerCase();
        if (!email) { results.skipped++; continue; }

        const already = credsByEmail.get(email);

        if (hasPlain && hasUsername) {
          // Migrate plain password into bcrypt hash
          const password_hash = await bcrypt.hash(user.password_hash, 10);
          const uname = user.username.toLowerCase().trim();
          if (already) {
            await base44.asServiceRole.entities.UserCredential.update(already.id, { username: uname, password_hash });
          } else {
            await base44.asServiceRole.entities.UserCredential.create({
              username: uname,
              user_email: user.email,
              password_hash,
            });
          }
          results.migrated++;
        } else if (already) {
          results.skipped++;
        } else {
          results.skipped++;
        }

        // Always clear password_hash from AuthorizedEmail after processing
        if (hasPlain) {
          await base44.asServiceRole.entities.AuthorizedEmail.update(user.id, { password_hash: null });
          results.cleared++;
        }
      } catch (e) {
        console.error('Migration error for', user.email, e);
        results.errors.push({ email: user.email, error: e.message });
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error('migrateCredentials error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});