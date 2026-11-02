import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

// Fixture-collection helper: wraps Google Places Text Search with the app's
// server-side key so the address-pool builder can pull real small-town
// businesses (OSM coverage is thin there). Staff session required.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (!actor) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const query = String(body?.query || '').trim();
    const pagetoken = String(body?.pagetoken || '').trim();
    if (!query && !pagetoken) return Response.json({ error: 'query required' }, { status: 400 });

    const key = Deno.env.get('GOOGLE_GEOCODING_API_KEY')?.trim() || Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim();
    if (!key) return Response.json({ error: 'no google key configured' }, { status: 500 });

    const url = pagetoken
      ? `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${encodeURIComponent(pagetoken)}&key=${encodeURIComponent(key)}`
      : `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    return Response.json({
      status: j.status || 'HTTP_' + r.status,
      error: j.error_message || undefined,
      next_page_token: j.next_page_token || undefined,
      results: (j.results || []).map((p: any) => ({
        name: p.name,
        address: p.formatted_address,
        types: (p.types || []).slice(0, 4),
      })),
    });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
});
