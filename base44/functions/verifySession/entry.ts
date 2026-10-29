import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEmployeeAccessReads } from '../../shared/employeeAccessReads.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { token } = body || {};

    if (!token) {
      return Response.json({ valid: false, error: 'No token provided' }, { status: 400 });
    }

    const base44 = withEntityRateLimitRetry(withEmployeeAccessReads(createClientFromRequest(req)), { maxRetries: 1 });
    // action === 'logout': revoke the server-side session (not just the
    // client token) by bumping session_not_before past this token's issue.
    const isLogout = String(body?.action || '') === 'logout';
    let user;
    try {
      user = await authenticateSignShopSession(base44, token);
    } catch (authError) {
      const status = Number(authError?.status || 500);
      if (status === 503) console.error('verifySession session authentication service is unavailable');
      const safeStatus = [401, 409].includes(status) ? status : 500;
      return Response.json({
        valid: false,
        error: safeStatus === 409 ? 'User identity could not be verified uniquely' :
          safeStatus === 401 ? 'Session is invalid, expired, or revoked' :
          'Session verification service is unavailable',
      }, { status: safeStatus });
    }

    // Authentication above verifies the signed payload. Decode only to preserve
    // the legacy username fallback when the AuthorizedEmail record has none.
    let payload = {};
    try {
      payload = JSON.parse(b64urlDecode(String(token).split('.')[0] || ''));
    } catch {
      // The shared verifier already validated this payload; keep a safe fallback.
    }

    if (isLogout) {
      await base44.asServiceRole.entities.AuthorizedEmail.update(user.id, {
        session_not_before: new Date().toISOString(),
      }).catch(() => null);
      return Response.json({ valid: true, logged_out: true });
    }
    return Response.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        username: user.username || payload.username,
        role: user.role,
        sales_roles: user.sales_roles,
        can_import_export: user.can_import_export,
        can_order_export: user.role === 'admin' && user.can_order_export === true,
        can_view_resources: user.can_view_resources,
        can_approve_quotes: user.can_approve_quotes === true,
        order_form_filter: user.order_form_filter,
        is_full_admin: user.is_full_admin === true,
        admin_permissions: user.admin_permissions && typeof user.admin_permissions === "object" && !Array.isArray(user.admin_permissions) ? user.admin_permissions : {},
      },
    });
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 500);
    if (status === 429) {
      return Response.json({ valid: false, retry_later: true, error: 'Session verification is busy. Try again in a moment.' }, { status: 429 });
    }
    console.error('verifySession error:', error);
    return Response.json({ valid: false, error: 'Session verification could not be completed safely' }, { status: 500 });
  }
});