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

    // Call the jurisdiction research agent for refreshed data
    const agentResult = await base44.asServiceRole.functions.invoke('callJurisdictionAgent', {
      jurisdictionName: jurisdiction.name,
      jurisdictionState: jurisdiction.state,
      jurisdictionType: jurisdiction.type,
      includeParentCounty: jurisdiction.type !== 'county'
    });

    const data = agentResult.data || agentResult;

    // Verify data accuracy with cross-checks
    const verifiedData = await verifyJurisdictionData(base44, jurisdiction, data);

    // Build update object based on settings
    const updateData = {};
    const batchSettings = settings || { updateWebsites: true, updatePermittingUrls: true, updateRequirements: true, updateDocuments: true, skipManualData: true };

    if (batchSettings.updateWebsites && (!batchSettings.skipManualData || !jurisdiction._manual_website_url)) {
      updateData.website_url = verifiedData.website_url || jurisdiction.website_url;
    }

    if (batchSettings.updatePermittingUrls && (!batchSettings.skipManualData || !jurisdiction._manual_permitting_url)) {
      updateData.permitting_url = verifiedData.permitting_url || jurisdiction.permitting_url;
    }

    // Always update CAGIS database URL if verified
    if (verifiedData.cagis_database_url) {
      updateData.cagis_database_url = verifiedData.cagis_database_url;
    }

    if (batchSettings.updateRequirements && (!batchSettings.skipManualData || !jurisdiction._manual_requirements)) {
      updateData.permit_requirements = verifiedData.permit_requirements || jurisdiction.permit_requirements;
      updateData.ai_summary = verifiedData.ai_summary || jurisdiction.ai_summary;
      updateData.contact_info = verifiedData.contact_info || jurisdiction.contact_info;
    }

    // Handle documents
    let finalDocs = jurisdiction.documents || [];
    if (batchSettings.updateDocuments && (!batchSettings.skipManualData || !jurisdiction._manual_documents)) {
      const manualDocs = (jurisdiction.documents || []).filter(d => d.source === 'manual');
      const newAiDocs = (verifiedData.documents || []).map((d, i) => ({
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

// Data verification function with multiple checks
async function verifyJurisdictionData(base44, jurisdiction, initialData) {
  const verified = { ...initialData };
  const MAX_VERIFICATION_ATTEMPTS = 3;

  // Verify URLs by checking if they're valid and contain relevant content
  const verifyURLs = async () => {
    const urlsToCheck = [
      { name: 'website_url', value: verified.website_url },
      { name: 'permitting_url', value: verified.permitting_url },
      { name: 'cagis_database_url', value: verified.cagis_database_url }
    ];

    for (const urlItem of urlsToCheck) {
      if (!urlItem.value) continue;

      try {
        const response = await fetch(urlItem.value, { method: 'HEAD', timeout: 5000 });
        if (!response.ok && response.status !== 405) {
          console.warn(`URL validation failed for ${urlItem.name}: ${urlItem.value}`);
          verified[urlItem.name] = undefined;
        }
      } catch (e) {
        console.warn(`URL check failed for ${urlItem.name}: ${urlItem.value}`);
        verified[urlItem.name] = undefined;
      }
    }
  };

  // Verify requirements data with cross-check
  const verifyRequirements = async (attempt = 1) => {
    if (!verified.permit_requirements || Object.keys(verified.permit_requirements).length === 0) {
      return;
    }

    if (attempt <= MAX_VERIFICATION_ATTEMPTS) {
      const verificationPrompt = `Verify the following sign permit requirements for ${jurisdiction.name}, ${jurisdiction.state}:
      
${JSON.stringify(verified.permit_requirements, null, 2)}

Check if these values are accurate and reasonable. Return JSON with:
{
  "verified": true/false,
  "issues": ["list of any inaccuracies or unreasonable values"],
  "corrected_values": { "field": "corrected_value" } or null
}

Be strict - if you cannot verify a value, mark it as unverified.`;

      try {
        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: verificationPrompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              verified: { type: "boolean" },
              issues: { type: "array", items: { type: "string" } },
              corrected_values: { type: ["object", "null"] }
            }
          }
        });

        const verification = typeof result === 'string' ? JSON.parse(result) : result;

        if (!verification.verified) {
          if (verification.issues.length > 0) {
            console.warn(`Verification issues found: ${verification.issues.join(', ')}`);
          }

          if (attempt < MAX_VERIFICATION_ATTEMPTS) {
            // Re-research if verification failed
            console.warn(`Re-researching requirements for ${jurisdiction.name} (attempt ${attempt + 1})`);
            const reresearchPrompt = `Research sign permit requirements for ${jurisdiction.name}, ${jurisdiction.state} again. 
            
Previous data had these issues: ${verification.issues?.join(', ') || 'Unknown'}

Return ONLY accurate, verifiable information. Omit any fields you cannot confirm.`;

            const reresult = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: reresearchPrompt,
              add_context_from_internet: true,
              response_json_schema: {
                type: "object",
                properties: {
                  permit_requirements: { type: "object" },
                  ai_summary: { type: "string" }
                }
              }
            });

            const redata = typeof reresult === 'string' ? JSON.parse(reresult) : reresult;
            verified.permit_requirements = redata.permit_requirements || {};
            if (redata.ai_summary) verified.ai_summary = redata.ai_summary;

            // Recurse for another verification
            await verifyRequirements(attempt + 1);
          } else {
            // Max attempts reached - remove unverified data
            console.warn(`Max verification attempts reached for ${jurisdiction.name}. Removing unverified requirements.`);
            verified.permit_requirements = {};
          }
        } else if (verification.corrected_values) {
          verified.permit_requirements = { ...verified.permit_requirements, ...verification.corrected_values };
        }
      } catch (e) {
        console.error(`Verification error: ${e.message}`);
        verified.permit_requirements = {};
      }
    }
  };

  // Verify documents by checking URLs are accessible
  const verifyDocuments = async () => {
    if (!verified.documents || !Array.isArray(verified.documents)) {
      verified.documents = [];
      return;
    }

    const validDocs = [];
    for (const doc of verified.documents) {
      if (!doc.url) {
        validDocs.push(doc);
        continue;
      }

      try {
        const response = await fetch(doc.url, { method: 'HEAD', timeout: 5000 });
        if (response.ok || response.status === 405) {
          validDocs.push(doc);
        } else {
          console.warn(`Document URL inaccessible: ${doc.title} (${doc.url})`);
        }
      } catch (e) {
        console.warn(`Document verification failed: ${doc.title}`);
      }
    }

    verified.documents = validDocs;
  };

  // Run all verifications
  await verifyURLs();
  await verifyRequirements();
  await verifyDocuments();

  return verified;
}