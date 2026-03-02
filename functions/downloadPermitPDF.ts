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

    // Download the PDF from the URL with various headers to work around CORS
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/pdf,*/*'
    };

    let pdfResponse;
    try {
      pdfResponse = await fetch(document_url, { headers });
    } catch (fetchErr) {
      // Try without headers if first attempt fails
      pdfResponse = await fetch(document_url);
    }

    if (!pdfResponse.ok) {
      return Response.json({ error: `Failed to download PDF: ${pdfResponse.statusText}` }, { status: 400 });
    }

    const pdfBlob = await pdfResponse.blob();
    
    // Validate it's a PDF
    if (!pdfBlob.type.includes('pdf') && !pdfBlob.type.includes('octet-stream')) {
      return Response.json({ error: `Invalid file type: ${pdfBlob.type}` }, { status: 400 });
    }

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