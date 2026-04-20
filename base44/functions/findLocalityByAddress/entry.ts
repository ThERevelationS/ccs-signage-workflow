import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * AI-powered address lookup.
 * Given an address, returns:
 *  - geocoded lat/lon (from OpenStreetMap Nominatim, free, no key)
 *  - suggested locality (matched against the user's PermitLocality list)
 *  - zoning district (AI-inferred)
 *  - parcel info (owner, lot size) if available from CAGIS-style lookups
 *
 * Request body: { address: string }
 * Response: {
 *   success: boolean,
 *   geocode: { lat, lon, display_name } | null,
 *   suggested_locality: { id, name, state, zip } | null,
 *   ai_locality_name: string,
 *   ai_state: string,
 *   ai_county: string,
 *   zoning: { district_code, district_name, summary },
 *   parcel: { owner, lot_size_acres, parcel_number, source_url },
 *   not_matched: boolean,
 *   notes: string
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const address = (body.address || "").trim();

    if (!address) {
      return Response.json({ success: false, error: "Address is required" }, { status: 400 });
    }

    // 1) Geocode with OpenStreetMap Nominatim (free, no key required)
    let geocode = null;
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1`;
      const geoRes = await fetch(geoUrl, {
        headers: {
          'User-Agent': 'SignShopWorkflow/1.0 (permitting-locality-lookup)',
          'Accept': 'application/json'
        }
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (Array.isArray(geoData) && geoData.length > 0) {
          const g = geoData[0];
          geocode = {
            lat: parseFloat(g.lat),
            lon: parseFloat(g.lon),
            display_name: g.display_name,
            address_parts: g.address || {}
          };
        }
      }
    } catch (e) {
      console.warn('Geocoding failed:', e.message);
    }

    // 2) Pull existing localities so AI can match
    const localities = await base44.asServiceRole.entities.PermitLocality.list();
    const localityOptions = localities.map(l => ({
      id: l.id,
      name: l.name,
      state: l.state || "",
      zip: l.zip || ""
    }));

    // 3) Ask AI for permitting details — zoning district, parcel info, locality match
    const prompt = `You are a zoning/permitting research assistant. Look up the following address and return structured JSON.

ADDRESS: ${address}
${geocode ? `Geocoded to: ${geocode.display_name} (${geocode.lat}, ${geocode.lon})` : ''}

TASK:
1. Identify the locality (township/city/village) and state that governs this address for SIGN PERMITTING.
2. From this list of known localities, find the BEST match (by name + state). If none match closely, set suggested_locality_id to null.
   Known localities:
${localityOptions.map(l => `- id: ${l.id} | ${l.name}${l.state ? `, ${l.state}` : ''}${l.zip ? ` ${l.zip}` : ''}`).join('\n')}

3. Return the zoning district for this parcel (code and plain-English name), plus a short summary of sign rules if you can find them.
4. Return parcel info (owner name, lot size in acres, parcel/APN number) if you can find it from CAGIS, county auditor sites, or other public records. Also include a source_url when possible.
5. Be factual. If unknown, leave fields empty strings. Do not fabricate owner names or parcel numbers.`;

    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: "object",
        properties: {
          suggested_locality_id: { type: "string", description: "ID from the known localities list, or empty if no good match" },
          ai_locality_name: { type: "string", description: "The locality governing this address (e.g. 'Deerfield Township')" },
          ai_state: { type: "string" },
          ai_county: { type: "string" },
          zoning: {
            type: "object",
            properties: {
              district_code: { type: "string" },
              district_name: { type: "string" },
              summary: { type: "string", description: "Short summary of sign rules for this district, if known" }
            }
          },
          parcel: {
            type: "object",
            properties: {
              owner: { type: "string" },
              lot_size_acres: { type: "string" },
              parcel_number: { type: "string" },
              source_url: { type: "string" }
            }
          },
          notes: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        }
      }
    });

    // Resolve the locality match from the AI's suggested id
    let matchedLocality = null;
    if (aiResult.suggested_locality_id) {
      const found = localities.find(l => l.id === aiResult.suggested_locality_id);
      if (found) {
        matchedLocality = {
          id: found.id,
          name: found.name,
          state: found.state || "",
          zip: found.zip || ""
        };
      }
    }

    return Response.json({
      success: true,
      geocode,
      suggested_locality: matchedLocality,
      not_matched: !matchedLocality,
      ai_locality_name: aiResult.ai_locality_name || "",
      ai_state: aiResult.ai_state || "",
      ai_county: aiResult.ai_county || "",
      zoning: aiResult.zoning || { district_code: "", district_name: "", summary: "" },
      parcel: aiResult.parcel || { owner: "", lot_size_acres: "", parcel_number: "", source_url: "" },
      notes: aiResult.notes || "",
      confidence: aiResult.confidence || "medium"
    });
  } catch (error) {
    console.error('findLocalityByAddress error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});