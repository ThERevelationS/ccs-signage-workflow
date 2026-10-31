import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { jurisdictionProtectionGuards, replaceJurisdictionFieldsIfUnchanged } from '../../shared/jurisdictionPersistence.mjs';
import { invalidateVerifiedJurisdictionAfterResearch } from '../../shared/jurisdictionVerification.ts';
import { mergeJurisdictionResearchDocuments } from '../../shared/jurisdictionResearchDocumentMerge.mjs';
import { gateResearchRegulatoryPromotion } from '../../shared/jurisdictionResearchAuthorityGate.mjs';
import { gateResearchSourceUrls } from '../../shared/permittingResearchUrlTrust.mjs';

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
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

        const { research: data, review: sourceUrlReview } = gateResearchSourceUrls(jurisdiction, agentResult?.data?.data || agentResult?.data || agentResult);
        if (sourceUrlReview.length) console.warn(`Held ${sourceUrlReview.length} AI source URL(s) for review on ${jurisdiction.name}: ${sourceUrlReview.map(r => r.reason).join(', ')}`);

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
            source: "ai_discovered"
          }));

          const countyDocs = (data.parent_county?.documents || []).map((d, i) => ({
            id: `ai_county_${Date.now()}_${i}`,
            title: `[${data.parent_county.name}] ${d.title || "Untitled"}`,
            url: d.url || "",
            doc_type: d.doc_type || "other",
            source: "ai_discovered"
          }));

          updateData.documents = mergeJurisdictionResearchDocuments(jurisdiction.documents, [...newDocs, ...countyDocs]);
        }

        if (settings.updateRequirements && (!settings.skipManualData || !jurisdiction._manual_requirements)) {
          updateData.contact_info = data.contact_info || jurisdiction.contact_info;
          updateData.ai_summary = data.ai_summary || jurisdiction.ai_summary;
        }
        updateData.parent_county = data.parent_county || jurisdiction.parent_county;
        updateData.last_updated = new Date().toISOString();
        const authorityGatedUpdate = gateResearchRegulatoryPromotion({
          jurisdiction,
          researchData: data,
          updateData,
          documentEvidence: updateData.documents || [],
        }).updateData;
        const finalUpdateData = invalidateVerifiedJurisdictionAfterResearch(jurisdiction, authorityGatedUpdate);

        await replaceJurisdictionFieldsIfUnchanged({
          entity: base44.entities.JurisdictionProfile,
          jurisdiction,
          nextFields: finalUpdateData,
          guardFields: jurisdictionProtectionGuards(jurisdiction, finalUpdateData, {
            respectManualProtection: settings.skipManualData !== false,
          }),
          label: `Jurisdiction batch research ${jurisdiction.name || jurisdictionId}`,
        });
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
    console.error('batchUpdateJurisdictions error:', error?.message || error);
    return Response.json({ error: 'Jurisdiction batch update could not be completed safely' }, { status: 500 });
  }
});