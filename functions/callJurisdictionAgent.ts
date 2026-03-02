import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Wrapper function that calls the jurisdictionResearch agent
 * Used by: JurisdictionFormDialog (create), refreshJurisdiction (refresh), batch operations
 * This allows agent prompt control from the dashboard while keeping backend integration simple
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { jurisdictionName, jurisdictionState, jurisdictionType = 'county', includeParentCounty = true } = await req.json();
    
    if (!jurisdictionName || !jurisdictionState) {
      return Response.json({ error: 'jurisdictionName and jurisdictionState required' }, { status: 400 });
    }

    // For now, fallback to direct LLM call since agent API may have timing issues
    // The agent prompt instructions are documented in agents/jurisdictionResearch.json
    
    const researchPrompt = `You are a specialized jurisdiction research assistant for sign permit information.

JURISDICTION: ${jurisdictionName} ${jurisdictionType}, ${jurisdictionState}

CRITICAL RESEARCH RULES:
1. ONLY use official government sources (city/county/state websites)
2. DO NOT fabricate, guess, or hallucinate URLs
3. If information cannot be verified, explicitly state "INFORMATION NOT FOUND"
4. Cross-reference information when possible
5. Prioritize official ordinances and zoning codes

RESEARCH OBJECTIVES:
- Official website URL (verify it's real and current)
- Permitting/zoning department URL
- Sign permit requirements (area, height, setback, illumination, electronic signs, fees, processing time)
- Regulatory documents (ordinances, zoning codes, applications, fee schedules)
- Contact information from official sources
- Property lookup database URL (CAGIS or equivalent)
${includeParentCounty && jurisdictionType !== 'county' ? `- Parent county information and documents (identify local vs. county rules)` : ''}

Return ONLY valid JSON with these fields (use null for unfound data):
{
  "website_url": null,
  "permitting_url": null,
  "cagis_database_url": null,
  "ai_summary": null,
  "contact_info": { "department": null, "phone": null, "email": null, "address": null },
  "permit_requirements": { "requires_permit": null, "max_sign_area_sqft": null, "max_height_ft": null, "setback_requirements": null, "illumination_allowed": null, "electronic_signs_allowed": null, "fee_range": null, "processing_time": null },
  "documents": [],
  "sqft_width_height_rules": null,
  "height_allowances": null,
  "setback_rules": null,
  "lighting_allowances": null
  ${includeParentCounty && jurisdictionType !== 'county' ? `,
  "parent_county": { "name": null, "website_url": null, "permitting_url": null, "contact_info": {}, "documents": [] }` : ''}
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: researchPrompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          website_url: { type: ["string", "null"] },
          permitting_url: { type: ["string", "null"] },
          cagis_database_url: { type: ["string", "null"] },
          ai_summary: { type: ["string", "null"] },
          contact_info: { type: "object" },
          permit_requirements: { type: "object" },
          documents: { type: "array" },
          parent_county: { type: ["object", "null"] },
          sqft_width_height_rules: { type: ["string", "null"] },
          height_allowances: { type: ["string", "null"] },
          setback_rules: { type: ["string", "null"] },
          lighting_allowances: { type: ["string", "null"] }
        }
      }
    });

    const researchData = typeof result === 'string' ? JSON.parse(result) : result;
    
    if (!researchData) {
      return Response.json({ error: 'Failed to parse research results' }, { status: 400 });
    }

    return Response.json({ 
      success: true,
      data: researchData,
      conversation_id: conversation.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});