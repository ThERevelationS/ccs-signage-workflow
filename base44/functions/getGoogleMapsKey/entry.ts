import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      console.error('getGoogleMapsKey is not configured');
      return Response.json({ error: 'Google Maps is not configured' }, { status: 503 });
    }

    return Response.json({ apiKey });
  } catch (error) {
    console.error('getGoogleMapsKey error:', error?.message || error);
    return Response.json({ error: 'Google Maps configuration could not be loaded safely' }, { status: 500 });
  }
});