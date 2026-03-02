import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Use AI to find and extract document content
    const researchPrompt = `You are a permitting research assistant for a sign company.

Research ${jurisdiction.name} ${jurisdiction.type}, ${jurisdiction.state} for sign/signage permitting requirements.

Current known permitting URL: ${jurisdiction.permitting_url || 'unknown'}
Current known website: ${jurisdiction.website_url || 'unknown'}

Please:
1. Find the most current sign ordinance, zoning code sections about signs, permit applications, and fee schedules
2. Extract key permitting requirements
3. Check if any document URLs have changed or new documents are available

Return as JSON:
{
  "website_url": "updated official url or same",
  "permitting_url": "updated permitting url or same",
  "ai_summary": "updated 3-4 sentence summary of current sign permit requirements",
  "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
  "permit_requirements": {
    "requires_permit": true/false,
    "max_sign_area_sqft": number or null,
    "max_height_ft": number or null,
    "setback_requirements": "description or null",
    "illumination_allowed": true/false/null,
    "electronic_signs_allowed": true/false/null,
    "fee_range": "e.g. $50-$200 or null",
    "processing_time": "e.g. 5-10 business days or null"
  },
  "documents": [
    {
      "title": "document name",
      "url": "direct URL to document",
      "doc_type": "sign_ordinance|permit_application|zoning_code|fee_schedule|checklist|other",
      "ai_summary": "1-2 sentence description of this document"
    }
  ]
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: researchPrompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          website_url: { type: "string" },
          permitting_url: { type: "string" },
          ai_summary: { type: "string" },
          contact_info: { type: "object" },
          permit_requirements: { type: "object" },
          documents: { type: "array", items: { type: "object" } }
        }
      }
    });

    const data = typeof result === 'string' ? JSON.parse(result) : result;

    // Build update object based on settings
    const updateData = {};
    const batchSettings = settings || { updateWebsites: true, updatePermittingUrls: true, updateRequirements: true, updateDocuments: true, skipManualData: true };

    if (batchSettings.updateWebsites && (!batchSettings.skipManualData || !jurisdiction._manual_website_url)) {
      updateData.website_url = data.website_url || jurisdiction.website_url;
    }

    if (batchSettings.updatePermittingUrls && (!batchSettings.skipManualData || !jurisdiction._manual_permitting_url)) {
      updateData.permitting_url = data.permitting_url || jurisdiction.permitting_url;
    }

    if (batchSettings.updateRequirements && (!batchSettings.skipManualData || !jurisdiction._manual_requirements)) {
      updateData.permit_requirements = data.permit_requirements || jurisdiction.permit_requirements;
      updateData.ai_summary = data.ai_summary || jurisdiction.ai_summary;
      updateData.contact_info = data.contact_info || jurisdiction.contact_info;
    }

    // Handle documents
    let finalDocs = jurisdiction.documents || [];
    if (batchSettings.updateDocuments && (!batchSettings.skipManualData || !jurisdiction._manual_documents)) {
      const manualDocs = (jurisdiction.documents || []).filter(d => d.source === 'manual');
      const newAiDocs = (data.documents || []).map((d, i) => ({
        id: `ai_${Date.now()}_${i}`,
        title: d.title || "Untitled",
        url: d.url || "",
        doc_type: d.doc_type || "other",
        ai_summary: d.ai_summary || "",
        source: "ai_discovered",
        last_fetched: new Date().toISOString()
      }));
      finalDocs = [...manualDocs, ...newAiDocs];
    }

    // Download and extract text from PDFs if documents were updated
    if (batchSettings.updateDocuments && (!batchSettings.skipManualData || !jurisdiction._manual_documents)) {
      const newAiDocs = finalDocs.filter(d => d.source === 'ai_discovered' && !d.extracted_text);
      
      // Process PDFs sequentially to avoid overwhelming the system
      const docsWithText = [];
      for (const doc of newAiDocs) {
        if (!doc.url || !doc.url.toLowerCase().includes('.pdf')) {
          docsWithText.push(doc);
          continue;
        }
        
        try {
          // Download the PDF first
          const downloadResult = await fetch(doc.url);
          if (!downloadResult.ok) {
            docsWithText.push(doc);
            continue;
          }
          
          const pdfBuffer = await downloadResult.arrayBuffer();
          const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
          
          // Upload the downloaded PDF
          const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
            file: pdfBlob
          });
          
          if (!uploadResult?.file_url) {
            docsWithText.push(doc);
            continue;
          }
          
          // Extract text from the uploaded PDF
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
          
          if (extractResult?.status === 'success' && extractResult.output) {
            docsWithText.push({
              ...doc,
              extracted_text: extractResult.output.content || "",
              ai_summary: extractResult.output.summary || doc.ai_summary,
              file_url: uploadResult.file_url
            });
          } else {
            docsWithText.push(doc);
          }
        } catch (e) {
          // Download or extraction failed, keep doc without text
          docsWithText.push(doc);
        }
      }

      const manualDocs = finalDocs.filter(d => d.source === 'manual');
      const existingAiDocs = finalDocs.filter(d => d.source === 'ai_discovered' && d.extracted_text);
      updateData.documents = [...manualDocs, ...existingAiDocs, ...docsWithText];
    }

    updateData.last_updated = new Date().toISOString();

    const updated = await base44.entities.JurisdictionProfile.update(id, updateData);

    return Response.json({ success: true, jurisdiction: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});