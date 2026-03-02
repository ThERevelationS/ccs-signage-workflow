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
        const prompt = `CRITICAL: Research ONLY REAL, VERIFIED information for ${jurisdiction.name} ${jurisdiction.type}, ${jurisdiction.state}. 

**DO NOT FABRICATE URLs OR INFORMATION.** If you cannot find verified information, leave that field empty/null or state "information not found."

Only research ${jurisdiction.state}. Do not provide information from other states.

Find ONLY verified information from official government websites:
1. Official ${jurisdiction.name} government website URL (verify it's real and current)
2. Actual permitting/zoning department website URL (from official government sources only)
3. Real permit application forms and ordinances (must link to actual government documents)
4. Contact information (must be from official sources)
5. Specific sign permit rules found in actual ordinances or zoning codes
6. Document links (must be verified to exist and be from official sources)

**VERIFICATION RULE:** Only include URLs that you can verify are from official ${jurisdiction.name} or ${jurisdiction.state} government websites. Do not make up, guess, or assume URLs exist. If a URL cannot be verified as real, do not include it.

${isNonCounty ? `For this ${jurisdiction.type}, also research:
   - Actual parent county name and real contact information
   - Real parent county government website and verified permitting URLs
   - Only include parent county documents that actually exist
   - Note which documents are from county vs. local jurisdiction` : ''}

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
              contact_info: { 
                type: "object",
                properties: {
                  department: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string" },
                  address: { type: "string" }
                }
              },
              permit_requirements: { 
                type: "object",
                properties: {
                  requires_permit: { type: "boolean" },
                  max_sign_area_sqft: { type: "number" },
                  max_height_ft: { type: "number" },
                  setback_requirements: { type: "string" },
                  illumination_allowed: { type: "boolean" },
                  electronic_signs_allowed: { type: "boolean" },
                  fee_range: { type: "string" },
                  processing_time: { type: "string" }
                }
              },
              documents: { 
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    doc_type: { type: "string" }
                  }
                }
              },
              parent_county: { 
                type: "object",
                properties: {
                  name: { type: "string" },
                  website_url: { type: "string" },
                  permitting_url: { type: "string" },
                  contact_info: { type: "object" },
                  documents: { 
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        url: { type: "string" },
                        doc_type: { type: "string" }
                      }
                    }
                  }
                }
              },
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