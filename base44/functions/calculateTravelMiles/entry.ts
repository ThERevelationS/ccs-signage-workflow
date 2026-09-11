import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Estimate round-trip driving miles between the shop and a job site
 * using the LLM with internet context (Google Maps style estimation).
 *
 * Body: { shop_address: string, site_address: string }
 * Returns: { round_trip_miles: number, one_way_miles: number, source?: string }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const shop_address = String(body?.shop_address || '').trim().replace(/\s+/g, ' ');
    const site_address = String(body?.site_address || '').trim().replace(/\s+/g, ' ');

    if (!shop_address || !site_address) {
      return Response.json({ error: 'shop_address and site_address are required' }, { status: 400 });
    }
    if (shop_address.length > 500 || site_address.length > 500) {
      return Response.json({ error: 'Travel addresses must be 500 characters or fewer' }, { status: 400 });
    }
    if (/[\u0000-\u001F\u007F]/.test(shop_address) || /[\u0000-\u001F\u007F]/.test(site_address)) {
      return Response.json({ error: 'Travel addresses contain invalid control characters' }, { status: 400 });
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
      source: result?.source || 'web',
    });
  } catch (error) {
    console.error('calculateTravelMiles error:', error?.message || error);
    return Response.json({ error: 'Travel distance could not be estimated safely' }, { status: 500 });
  }
});