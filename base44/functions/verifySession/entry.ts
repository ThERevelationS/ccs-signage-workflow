import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

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

    const base44 = createClientFromRequest(req);
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
        can_view_resources: user.can_view_resources,
      },
    });
  } catch (error) {
    console.error('verifySession error:', error);
    return Response.json({ valid: false, error: 'Session verification could not be completed safely' }, { status: 500 });
  }
});