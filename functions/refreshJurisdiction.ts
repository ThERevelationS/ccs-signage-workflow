import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { jurisdiction_id, jurisdictionId, settings } = await req.json();
    const id = jurisdiction_id || jurisdictionId;
    if (!id) return Response.json({ error: 'jurisdiction_id required' }, { status: 400 });

    const jurisdiction = await base44.entities.JurisdictionProfile.get(id);
    if (!jurisdiction) return Response.json({ error: 'Jurisdiction not found' }, { status: 404 });

    const batchSettings = settings || {
      updateWebsites: true,
      updatePermittingUrls: true,
      updateRequirements: true,
      updateDocuments: true,
      skipManualData: true
    };

    // Deep research prompt — get everything
    const includeParentCounty = jurisdiction.type !== 'county';
    const researchPrompt = `You are an expert sign permit researcher. Do a THOROUGH, DEEP research on this jurisdiction.

JURISDICTION: ${jurisdiction.name} ${jurisdiction.type}, ${jurisdiction.state}

You MUST search the internet extensively and return REAL, ACCURATE data from official government sources.
DO NOT return null for fields you can find. Search hard for everything.

Find ALL of the following:
1. Official government website URL
2. Permitting/zoning/building department URL (direct link to sign permit info)
3. Property lookup/parcel database URL (CAGIS or county GIS equivalent)
4. Sign permit requirements — be SPECIFIC with actual numbers:
   - Does it require a permit? (yes/no)
   - Maximum sign area in square feet (actual number)
   - Maximum sign height in feet (actual number)
   - Setback requirements (exact distances)
   - Illumination allowed? (yes/no with restrictions)
   - Electronic/LED signs allowed? (yes/no with restrictions)
   - Fee range (actual dollar amounts)
   - Processing/approval time
5. Detailed SQFT/Width/Height rules (quote the actual ordinance if possible)
6. Height allowances (specific rules)
7. Setback rules (specific distances)
8. Lighting/illumination allowances (specific rules)
9. ALL available permit documents with REAL URLs:
   - Sign ordinances
   - Permit applications (PDF links)
   - Zoning codes
   - Fee schedules
   - Checklists
10. Department contact info: name, phone, email, address
11. AI summary: comprehensive paragraph about sign permitting in this jurisdiction
${includeParentCounty ? `12. Parent county info: name, website, permitting URL, contact info, documents` : ''}

Return comprehensive JSON. Fill in every field you can find. Only use null if truly not findable.`;

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
          contact_info: {
            type: "object",
            properties: {
              department: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              address: { type: ["string", "null"] }
            }
          },
          permit_requirements: {
            type: "object",
            properties: {
              requires_permit: { type: ["boolean", "null"] },
              max_sign_area_sqft: { type: ["number", "null"] },
              max_height_ft: { type: ["number", "null"] },
              setback_requirements: { type: ["string", "null"] },
              illumination_allowed: { type: ["boolean", "null"] },
              electronic_signs_allowed: { type: ["boolean", "null"] },
              fee_range: { type: ["string", "null"] },
              processing_time: { type: ["string", "null"] }
            }
          },
          sqft_width_height_rules: { type: ["string", "null"] },
          height_allowances: { type: ["string", "null"] },
          setback_rules: { type: ["string", "null"] },
          lighting_allowances: { type: ["string", "null"] },
          documents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                doc_type: { type: "string" },
                ai_summary: { type: "string" }
              }
            }
          },
          parent_county: {
            type: ["object", "null"],
            properties: {
              name: { type: ["string", "null"] },
              website_url: { type: ["string", "null"] },
              permitting_url: { type: ["string", "null"] },
              contact_info: { type: "object" },
              documents: { type: "array" }
            }
          }
        }
      }
    });

    const researchData = typeof result === 'string' ? JSON.parse(result) : result;
    if (!researchData) return Response.json({ error: 'No research data returned' }, { status: 400 });

    // Build update object — replace with new data, keep manual overrides
    const updateData = {};

    if (batchSettings.updateWebsites && (!batchSettings.skipManualData || !jurisdiction._manual_website_url)) {
      if (researchData.website_url) updateData.website_url = researchData.website_url;
    }

    if (batchSettings.updatePermittingUrls && (!batchSettings.skipManualData || !jurisdiction._manual_permitting_url)) {
      if (researchData.permitting_url) updateData.permitting_url = researchData.permitting_url;
    }

    if (researchData.cagis_database_url) {
      updateData.cagis_database_url = researchData.cagis_database_url;
    }

    if (batchSettings.updateRequirements && (!batchSettings.skipManualData || !jurisdiction._manual_requirements)) {
      // Always replace with new research data — don't fall back to old
      if (researchData.permit_requirements && Object.keys(researchData.permit_requirements).length > 0) {
        updateData.permit_requirements = researchData.permit_requirements;
      }
      if (researchData.ai_summary) updateData.ai_summary = researchData.ai_summary;
      if (researchData.contact_info && Object.keys(researchData.contact_info).some(k => researchData.contact_info[k])) {
        updateData.contact_info = researchData.contact_info;
      }
      if (researchData.sqft_width_height_rules) updateData.sqft_width_height_rules = researchData.sqft_width_height_rules;
      if (researchData.height_allowances) updateData.height_allowances = researchData.height_allowances;
      if (researchData.setback_rules) updateData.setback_rules = researchData.setback_rules;
      if (researchData.lighting_allowances) updateData.lighting_allowances = researchData.lighting_allowances;
    }

    if (includeParentCounty && researchData.parent_county?.name) {
      updateData.parent_county = researchData.parent_county;
    }

    // Handle documents — preserve manual docs, replace AI docs
    if (batchSettings.updateDocuments && (!batchSettings.skipManualData || !jurisdiction._manual_documents)) {
      const manualDocs = (jurisdiction.documents || []).filter(d => d.source === 'manual');
      const newAiDocs = (researchData.documents || []).map((d, i) => ({
        id: `ai_${Date.now()}_${i}`,
        title: d.title || "Untitled",
        url: d.url || "",
        doc_type: d.doc_type || "other",
        ai_summary: d.ai_summary || "",
        source: "ai_discovered",
        last_fetched: new Date().toISOString()
      }));

      // Download and extract text from all new docs
      const processedDocs = [];
      for (const doc of newAiDocs) {
        if (!doc.url) {
          processedDocs.push(doc);
          continue;
        }
        try {
          const downloadResult = await fetch(doc.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          if (!downloadResult.ok) {
            processedDocs.push(doc);
            continue;
          }

          const buffer = await downloadResult.arrayBuffer();
          if (!buffer || buffer.byteLength === 0) {
            processedDocs.push(doc);
            continue;
          }

          const contentType = downloadResult.headers.get('content-type') || 'application/octet-stream';
          const ext = doc.url.split('?')[0].split('.').pop()?.toLowerCase() || 'pdf';
          const mimeMap = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain', csv: 'text/csv' };
          const mimeType = mimeMap[ext] || contentType.split(';')[0].trim() || 'application/octet-stream';

          const fileBlob = new Blob([buffer], { type: mimeType });
          const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileBlob });

          if (!uploadResult?.file_url) {
            processedDocs.push(doc);
            continue;
          }

          const extractResult = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
            file_url: uploadResult.file_url,
            json_schema: {
              type: "object",
              properties: {
                content: { type: "string", description: "Full text content of the document" },
                summary: { type: "string", description: "Summary of key sign permit requirements in this document" }
              }
            }
          });

          processedDocs.push({
            ...doc,
            file_url: uploadResult.file_url,
            extracted_text: extractResult?.output?.content || "",
            ai_summary: extractResult?.output?.summary || doc.ai_summary
          });
        } catch (e) {
          console.error(`Failed to process doc ${doc.title}:`, e.message);
          processedDocs.push(doc);
        }
      }

      updateData.documents = [...manualDocs, ...processedDocs];
    }

    updateData.last_updated = new Date().toISOString();

    const updated = await base44.entities.JurisdictionProfile.update(id, updateData);

    return Response.json({ success: true, jurisdiction: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});