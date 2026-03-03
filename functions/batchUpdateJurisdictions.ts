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
    let processed = 0;

    for (const jurisdictionId of jurisdictionIds) {
     processed++;
     try {
       const jurisdiction = await base44.entities.JurisdictionProfile.get(jurisdictionId);
       console.log(`[RESEARCH_PROGRESS] Processing ${processed}/${jurisdictionIds.length}: ${jurisdiction?.name}`);
        
        if (!jurisdiction) continue;

        // Use the jurisdiction research agent for all searches
        const agentResult = await base44.asServiceRole.functions.invoke('jurisdictionResearchAgent', {
          jurisdictionName: jurisdiction.name,
          jurisdictionState: jurisdiction.state,
          jurisdictionType: jurisdiction.type,
          includeParentCounty: jurisdiction.type !== 'county'
        });

        const data = agentResult?.data?.data || agentResult?.data || agentResult;

        // Build update object, respecting manual data protection
        const updateData = {};

        if (settings.updateWebsites && (!settings.skipManualData || !jurisdiction._manual_website_url)) {
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