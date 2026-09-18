/**
 * adminBootstrapLogin
 *
 * Emergency bootstrap: lets a user who is authenticated via Base44's built-in
 * auth AND marked as admin in AuthorizedEmail get a signed session token
 * without needing to know their password. Used once to recover access after
 * the security lockout, so admins can then set passwords for everyone.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { signShopSessionPayload } from '../../shared/signShopSession.ts';

Deno.serve(async (req) => {
  try {
    if (Deno.env.get('ADMIN_BOOTSTRAP_ENABLED') !== 'true') {
      return Response.json({ success: false, error: 'Emergency admin sign-in is disabled' }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) {
      return Response.json({ success: false, error: 'Not authenticated with Base44' }, { status: 401 });
    }

    // Cross-check they're an admin in our AuthorizedEmail list
    const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: me.email });
    if (!Array.isArray(users) || users.length !== 1) {
      return Response.json({ success: false, error: 'Authorized admin identity could not be verified uniquely' }, { status: 403 });
    }
    const user = users[0];
    if (user.role !== 'admin') {
      return Response.json({ success: false, error: 'Not an admin in AuthorizedEmail' }, { status: 403 });
    }

    const payload = {
      email: user.email,
      username: user.username || user.email.split('@')[0],
      role: 'admin',
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
      bootstrap: true,
    };
    let token;
    try {
      token = await signShopSessionPayload(payload);
    } catch (signError) {
      if (Number(signError?.status || 500) === 503) {
        console.error('adminBootstrapLogin session signing secret is unavailable');
        return Response.json({ success: false, error: 'Emergency admin sign-in service is unavailable' }, { status: 500 });
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
        username: payload.username,
        role: 'admin',
        sales_roles: user.sales_roles,
        can_import_export: user.can_import_export,
        can_view_resources: user.can_view_resources,
      },
    });
  } catch (error) {
    console.error('adminBootstrapLogin error:', error);
    return Response.json({ success: false, error: 'Emergency admin sign-in could not be completed safely' }, { status: 500 });
  }
});