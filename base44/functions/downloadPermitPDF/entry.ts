import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Maps content-type to file extension
function getExtFromContentType(contentType, fallbackUrl) {
  if (!contentType) contentType = '';
  const ct = contentType.toLowerCase().split(';')[0].trim();
  const map = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/html': 'html',
    'application/octet-stream': null, // fall through to URL
  };
  if (map[ct]) return map[ct];
  // Try to get from URL
  if (fallbackUrl) {
    const urlExt = fallbackUrl.split('?')[0].split('.').pop()?.toLowerCase();
    if (urlExt && urlExt.length <= 5) return urlExt;
  }
  return 'pdf'; // final fallback
}

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

    // Download the file with browser-like headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    let fileResponse;
    try {
      fileResponse = await fetch(document_url, { headers });
    } catch (fetchErr) {
      fileResponse = await fetch(document_url);
    }

    if (!fileResponse.ok) {
      return Response.json({ error: `Failed to download file: ${fileResponse.statusText}` }, { status: 400 });
    }

    const contentType = fileResponse.headers.get('content-type') || '';
    const ext = getExtFromContentType(contentType, document_url);

    // Accept any non-empty file — don't filter by content type
    const arrayBuffer = await fileResponse.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return Response.json({ error: 'Downloaded file is empty' }, { status: 400 });
    }

    const safeTitle = (document_title || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_');
    const fileName = `${safeTitle}.${ext}`;
    const mimeType = contentType.split(';')[0].trim() || 'application/octet-stream';
    const file = new File([arrayBuffer], fileName, { type: mimeType });

    // Upload to app's file system
    const uploadResult = await base44.integrations.Core.UploadFile({ file });

    if (!uploadResult?.file_url) {
      return Response.json({ error: 'Failed to upload file' }, { status: 500 });
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