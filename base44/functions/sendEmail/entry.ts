import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

// Email sending is intentionally disabled in this build.
// Notifications are handled on the Smartsheet side for now.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, payload?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    return Response.json(
      { error: 'Email system is disabled. Notifications are handled on the Smartsheet side.' },
      { status: 503 },
    );
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    const safeStatus = [400, 401, 403, 503].includes(status) ? status : 500;
    return Response.json(
      { error: safeStatus === 500 ? 'Email could not be sent safely' : (error as any)?.message },
      { status: safeStatus },
    );
  }
});