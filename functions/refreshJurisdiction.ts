import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { jurisdiction_id } = await req.json();
    if (!jurisdiction_id) return Response.json({ error: 'jurisdiction_id required' }, { status: 400 });

    const jurisdiction = await base44.entities.JurisdictionProfile.get(jurisdiction_id);
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

    // Preserve manual documents, merge/update AI-discovered ones
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

    // Now attempt to extract text from PDFs for AI Q&A
    const docsWithText = await Promise.all(newAiDocs.map(async (doc) => {
      if (!doc.url || !doc.url.toLowerCase().includes('.pdf')) return doc;
      try {
        const extractResult = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: doc.url,
          json_schema: {
            type: "object",
            properties: {
              content: { type: "string", description: "Full text content of the document" },
              summary: { type: "string", description: "Summary of key sign permit requirements in this document" }
            }
          }
        });
        if (extractResult?.status === 'success' && extractResult.output) {
          return {
            ...doc,
            extracted_text: extractResult.output.content || "",
            ai_summary: extractResult.output.summary || doc.ai_summary
          };
        }
      } catch (e) {
        // Extraction failed, keep doc without text
      }
      return doc;
    }));

    const updatedJurisdiction = {
      website_url: data.website_url || jurisdiction.website_url,
      permitting_url: data.permitting_url || jurisdiction.permitting_url,
      ai_summary: data.ai_summary || jurisdiction.ai_summary,
      contact_info: data.contact_info || jurisdiction.contact_info,
      permit_requirements: data.permit_requirements || jurisdiction.permit_requirements,
      documents: [...manualDocs, ...docsWithText],
      last_updated: new Date().toISOString()
    };

    const updated = await base44.entities.JurisdictionProfile.update(jurisdiction_id, updatedJurisdiction);

    return Response.json({ success: true, jurisdiction: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});