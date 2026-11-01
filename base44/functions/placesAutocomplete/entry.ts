import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

/**
 * Real Google Places autocomplete for address inputs.
 * Auth: staff session_token OR platform auth (console/admin callers).
 * Body: { session_token?, input: string }
 * Returns: { suggestions: [{ full_address, label, place_id }] }
 */
const MAX_INPUT = 200;
const ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let user = await authenticateSignShopSession(base44, body?.session_token).catch(() => null);
    if (!user) user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const input = String(body?.input || '').trim().replace(/\s+/g, ' ').slice(0, MAX_INPUT);
    if (input.length < 3) return Response.json({ suggestions: [] });

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim()
      || Deno.env.get('GOOGLE_GEOCODING_API_KEY')?.trim();
    if (!apiKey) return Response.json({ error: 'Places API key not configured' }, { status: 503 });

    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
      },
      body: JSON.stringify({
        input,
        languageCode: 'en',
        includedRegionCodes: ['us'],
      }),
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('placesAutocomplete upstream error', resp.status, String(data?.error?.message || '').slice(0, 200));
      return Response.json({ error: 'Address suggestions unavailable' }, { status: 502 });
    }

    const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : [])
      .map((s: any) => {
        const p = s?.placePrediction;
        const full = String(p?.text?.text || '').trim();
        if (!full) return null;
        return {
          full_address: full.slice(0, 300),
          label: String(p?.structuredFormat?.mainText?.text || full).slice(0, 120),
          secondary: String(p?.structuredFormat?.secondaryText?.text || '').slice(0, 160),
          place_id: String(p?.placeId || '').slice(0, 200),
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    return Response.json({ suggestions });
  } catch (error) {
    console.error('placesAutocomplete error:', error?.message || error);
    return Response.json({ error: 'Address suggestions unavailable' }, { status: 500 });
  }
});
