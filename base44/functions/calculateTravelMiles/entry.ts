import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

/**
 * Round-trip driving miles between the shop and a job site.
 * Primary: Google Routes API (real driving distance + duration).
 * Fallback: LLM estimate when Routes is unavailable/not enabled.
 *
 * Auth: staff session_token OR platform auth.
 * Body: { session_token?, shop_address: string, site_address: string }
 * Returns: { one_way_miles, round_trip_miles, one_way_minutes?, source }
 */
const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const cleanAddress = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 500);

async function routesApiMiles(shop, site, apiKey) {
  const resp = await fetch(ROUTES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: { address: shop },
      destination: { address: site },
      travelMode: 'DRIVE',
      units: 'IMPERIAL',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error('Routes API error', resp.status, String(data?.error?.message || '').slice(0, 200));
    return null;
  }
  const route = data?.routes?.[0];
  const meters = Number(route?.distanceMeters);
  if (!isFinite(meters) || meters <= 0) return null;
  const durationSec = parseFloat(String(route?.duration || '').replace('s', '')) || null;
  return { miles: meters / 1609.344, minutes: durationSec ? durationSec / 60 : null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let user = await authenticateSignShopSession(base44, body?.session_token).catch(() => null);
    if (!user) user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const shop_address = cleanAddress(body?.shop_address);
    const site_address = cleanAddress(body?.site_address);
    if (!shop_address || !site_address) {
      return Response.json({ error: 'shop_address and site_address are required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim()
      || Deno.env.get('GOOGLE_GEOCODING_API_KEY')?.trim();
    if (apiKey) {
      const r = await routesApiMiles(shop_address, site_address, apiKey).catch((e) => {
        console.error('Routes API fetch failed:', e?.message || e);
        return null;
      });
      if (r) {
        return Response.json({
          one_way_miles: Math.round(r.miles * 10) / 10,
          round_trip_miles: Math.round(r.miles * 2 * 10) / 10,
          one_way_minutes: r.minutes ? Math.round(r.minutes) : undefined,
          source: 'google_routes',
        });
      }
    }

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Estimate the typical one-way DRIVING distance in miles between these two US addresses, using Google Maps or similar routing knowledge. Return ONLY a numeric value (miles), no units in the number.
Origin (shop): ${shop_address}
Destination (site): ${site_address}
If the addresses are clearly invalid or impossible to route, return one_way_miles = 0.`,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          one_way_miles: { type: "number", description: "One-way driving miles between the two addresses" },
          source: { type: "string", description: "Source / reasoning (e.g. Google Maps)" }
        },
        required: ["one_way_miles"]
      }
    });
    const oneWay = parseFloat(result?.one_way_miles);
    if (!isFinite(oneWay) || oneWay < 0 || oneWay > 5000) {
      console.error('Invalid miles returned by travel estimator');
      return Response.json({ error: 'Could not estimate distance' }, { status: 502 });
    }
    return Response.json({
      one_way_miles: oneWay,
      round_trip_miles: oneWay * 2,
      source: result?.source || 'llm_estimate',
    });
  } catch (error) {
    console.error('calculateTravelMiles error:', error?.message || error);
    return Response.json({ error: 'Travel distance could not be estimated safely' }, { status: 500 });
  }
});
