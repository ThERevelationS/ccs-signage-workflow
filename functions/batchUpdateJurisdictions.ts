import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { jurisdictionIds, settings } = await req.json();

    if (!jurisdictionIds || !Array.isArray(jurisdictionIds) || jurisdictionIds.length === 0) {
      return Response.json({ error: 'No jurisdictions selected' }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;

    for (const jurisdictionId of jurisdictionIds) {
      try {
        const jurisdiction = await base44.entities.JurisdictionProfile.get(jurisdictionId);
        
        if (!jurisdiction) continue;

        // Re-research jurisdiction if updates are enabled
        const isNonCounty = jurisdiction.type !== 'county';
        const prompt = `Research ${jurisdiction.name} ${jurisdiction.type}, ${jurisdiction.state} sign permit requirements. IMPORTANT: Only research ${jurisdiction.state}. Do not provide information from other states.

Find:
1. Official permitting/zoning department website URL
2. Sign ordinance or zoning code URL
3. Permit application forms (signage/construction permit, electrical IBI application, zoning forms, building forms, NIC forms, NKYEI forms, locality-specific forms)
4. Contact information for the permitting department
5. Specific sign permit rules:
   - SQFT/Width/Height allowance rules
   - Height allowances and rules
   - Setback requirements and rules
   - Lighting allowances and restrictions
6. Any other relevant permitting document URLs

${isNonCounty ? `IMPORTANT: Since this is a ${jurisdiction.type}, also research and include:
   - The parent county name and contact information
   - Parent county's official website and permitting URLs
   - Parent county's relevant permit forms and documents
   - Note which documents are from the county vs. local jurisdiction` : ''}

Return as JSON with this structure:
{
  "website_url": "...",
  "permitting_url": "...",
  "ai_summary": "2-3 sentence summary",
  "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
  "permit_requirements": {
    "requires_permit": true/false,
    "max_sign_area_sqft": number or null,
    "max_height_ft": number or null,
    "setback_requirements": "...",
    "illumination_allowed": true/false/null,
    "electronic_signs_allowed": true/false/null,
    "fee_range": "...",
    "processing_time": "..."
  },
  "documents": [
    { "title": "...", "url": "...", "doc_type": "sign_ordinance|permit_application|zoning_code|fee_schedule|checklist|other" }
  ],
  "parent_county": {
    "name": "...",
    "website_url": "...",
    "permitting_url": "...",
    "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
    "documents": []
  },
  "sqft_width_height_rules": "...",
  "height_allowances": "...",
  "setback_rules": "...",
  "lighting_allowances": "..."
}`;

        const aiResult = await base44.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              website_url: { type: "string" },
              permitting_url: { type: "string" },
              ai_summary: { type: "string" },
              contact_info: { type: "object" },
              permit_requirements: { type: "object" },
              documents: { type: "array" },
              parent_county: { type: "object" },
              sqft_width_height_rules: { type: "string" },
              height_allowances: { type: "string" },
              setback_rules: { type: "string" },
              lighting_allowances: { type: "string" }
            }
          }
        });

        const data = typeof aiResult === 'string' ? JSON.parse(aiResult) : aiResult;

        // Build update object, respecting manual data protection
        const updateData = {};

        if (settings.updateWebsiteUrls && (!settings.skipManualData || !jurisdiction._manual_website_url)) {
          updateData.website_url = data.website_url || jurisdiction.website_url;
        }

        if (settings.updatePermittingUrls && (!settings.skipManualData || !jurisdiction._manual_permitting_url)) {
          updateData.permitting_url = data.permitting_url || jurisdiction.permitting_url;
        }

        if (settings.updateRequirements && (!settings.skipManualData || !jurisdiction._manual_requirements)) {
          updateData.permit_requirements = data.permit_requirements || jurisdiction.permit_requirements;
          updateData.sqft_width_height_rules = data.sqft_width_height_rules || jurisdiction.sqft_width_height_rules;
          updateData.height_allowances = data.height_allowances || jurisdiction.height_allowances;
          updateData.setback_rules = data.setback_rules || jurisdiction.setback_rules;
          updateData.lighting_allowances = data.lighting_allowances || jurisdiction.lighting_allowances;
        }

        if (settings.updateDocuments && (!settings.skipManualData || !jurisdiction._manual_documents)) {
          const newDocs = (data.documents || []).map((d, i) => ({
            id: `ai_${Date.now()}_${i}`,
            title: d.title || "Untitled",
            url: d.url || "",
            doc_type: d.doc_type || "other",
            source: "ai_discovered",
            last_fetched: new Date().toISOString()
          }));

          const countyDocs = (data.parent_county?.documents || []).map((d, i) => ({
            id: `ai_county_${Date.now()}_${i}`,
            title: `[${data.parent_county.name}] ${d.title || "Untitled"}`,
            url: d.url || "",
            doc_type: d.doc_type || "other",
            source: "ai_discovered",
            last_fetched: new Date().toISOString()
          }));

          updateData.documents = [...(jurisdiction.documents || []).filter(d => d.source === 'manual'), ...newDocs, ...countyDocs];
        }

        updateData.contact_info = data.contact_info || jurisdiction.contact_info;
        updateData.parent_county = data.parent_county || jurisdiction.parent_county;
        updateData.ai_summary = data.ai_summary || jurisdiction.ai_summary;
        updateData.last_updated = new Date().toISOString();

        await base44.entities.JurisdictionProfile.update(jurisdictionId, updateData);
        updated++;
      } catch (e) {
        console.error(`Error updating jurisdiction ${jurisdictionId}:`, e);
        skipped++;
      }
    }

    return Response.json({
      success: true,
      updated,
      skipped,
      total: jurisdictionIds.length
    });
  } catch (error) {
    console.error("Batch update error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});