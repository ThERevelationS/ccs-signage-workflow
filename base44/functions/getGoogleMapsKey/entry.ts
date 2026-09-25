import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    await authenticateSignShopSession(base44, body?.session_token);

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      console.error('getGoogleMapsKey is not configured');
      return Response.json({ error: 'Google Maps is not configured' }, { status: 503 });
    }

    return Response.json({ apiKey });
  } catch (error) {
    console.error('getGoogleMapsKey error:', error?.message || error);
    const status = Number(error?.status || 500);
    const safeStatus = [401, 409, 503].includes(status) ? status : 500;
    return Response.json({ error: safeStatus === 401 ? 'Authentication required' : 'Google Maps configuration could not be loaded safely' }, { status: safeStatus });
  }
});