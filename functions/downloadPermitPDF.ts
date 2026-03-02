import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jurisdiction_id, document_url, document_title } = await req.json();

    if (!jurisdiction_id || !document_url) {
      return Response.json({ error: 'Missing jurisdiction_id or document_url' }, { status: 400 });
    }

    // Download the PDF from the URL
    const pdfResponse = await fetch(document_url);
    if (!pdfResponse.ok) {
      return Response.json({ error: `Failed to download PDF: ${pdfResponse.statusText}` }, { status: 400 });
    }

    const pdfBlob = await pdfResponse.blob();
    
    // Convert blob to ArrayBuffer for upload
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const file = new File([arrayBuffer], `${document_title || 'document'}.pdf`, { type: 'application/pdf' });

    // Upload to app's file system
    const uploadResult = await base44.integrations.Core.UploadFile({ file });

    if (!uploadResult.file_url) {
      return Response.json({ error: 'Failed to upload PDF' }, { status: 500 });
    }

    // Update the jurisdiction profile with the file URL
    const jurisdiction = await base44.entities.JurisdictionProfile.get(jurisdiction_id);
    const updatedDocuments = (jurisdiction.documents || []).map(doc => {
      if (doc.url === document_url) {
        return {
          ...doc,
          file_url: uploadResult.file_url,
          downloaded_at: new Date().toISOString()
        };
      }
      return doc;
    });

    await base44.entities.JurisdictionProfile.update(jurisdiction_id, { documents: updatedDocuments });

    return Response.json({ 
      success: true, 
      file_url: uploadResult.file_url 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});