import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const { jurisdiction_id, jurisdictionId, settings } = body;
    const id = jurisdiction_id || jurisdictionId;

    // Scheduled/batch mode: refresh up to 5 oldest auto_refresh jurisdictions
    if (!id) {
      const all = await base44.asServiceRole.entities.JurisdictionProfile.list('last_updated', 200);
      const toRefresh = all.filter(j => j.auto_refresh !== false).slice(0, 5);
      const results = [];
      for (const j of toRefresh) {
        try {
          const r = await base44.asServiceRole.functions.invoke('refreshJurisdiction', { jurisdiction_id: j.id });
          results.push({ id: j.id, name: j.name, success: true });
        } catch (e) {
          results.push({ id: j.id, name: j.name, success: false, error: e.message });
        }
      }
      return Response.json({ batch: true, processed: results.length, results });
    }

    const jurisdiction = await base44.asServiceRole.entities.JurisdictionProfile.get(id);
    if (!jurisdiction) return Response.json({ error: 'Jurisdiction not found' }, { status: 404 });

    const batchSettings = settings || {
      updateWebsites: true,
      updatePermittingUrls: true,
      updateRequirements: true,
      updateDocuments: true,
      skipManualData: true
    };

    // Use the full jurisdiction research agent (same prompt used for new jurisdiction creation)
    const includeParentCounty = jurisdiction.type !== 'county';
    const agentResult = await base44.asServiceRole.functions.invoke('jurisdictionResearchAgent', {
      jurisdictionName: jurisdiction.name,
      jurisdictionState: jurisdiction.state,
      jurisdictionType: jurisdiction.type,
      includeParentCounty
    });

    const researchData = agentResult?.data?.data || agentResult?.data || agentResult;
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