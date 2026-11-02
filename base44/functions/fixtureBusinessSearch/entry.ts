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

    const payload: any = { textQuery: pagetoken ? undefined : query, pageSize: 20 };
    if (pagetoken) payload.pageToken = pagetoken;
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.types,nextPageToken',
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    return Response.json({
      status: r.ok ? 'OK' : (j.error?.status || 'HTTP_' + r.status),
      error: j.error?.message || undefined,
      next_page_token: j.nextPageToken || undefined,
      results: (j.places || []).map((p: any) => ({
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        types: (p.types || []).slice(0, 4),
      })),
    });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
});
