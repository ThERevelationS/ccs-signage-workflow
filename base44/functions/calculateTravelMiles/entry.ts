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
    const shop_address = (body?.shop_address || '').trim();
    const site_address = (body?.site_address || '').trim();

    if (!shop_address || !site_address) {
      return Response.json({ error: 'shop_address and site_address are required' }, { status: 400 });
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
      console.error("Invalid miles returned:", result);
      return Response.json({ error: 'Could not estimate distance', llm_result: result }, { status: 502 });
    }

    return Response.json({
      one_way_miles: oneWay,
      round_trip_miles: oneWay * 2,
      source: result?.source || 'web',
    });
  } catch (error) {
    console.error("calculateTravelMiles error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});