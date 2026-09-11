import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { patchJurisdictionDocuments } from '../../shared/jurisdictionPersistence.mjs';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';

const MAX_PERMIT_DOCUMENT_BYTES = 50 * 1024 * 1024;

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

async function readResponseBytes(response: Response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PERMIT_DOCUMENT_BYTES) {
    throw Object.assign(new Error('Permit document exceeds the 50 MB safety limit.'), { status: 413 });
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PERMIT_DOCUMENT_BYTES) {
      throw Object.assign(new Error('Permit document exceeds the 50 MB safety limit.'), { status: 413 });
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PERMIT_DOCUMENT_BYTES) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error('Permit document exceeds the 50 MB safety limit.'), { status: 413 });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

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
      fileResponse = await safeExternalFetch(document_url, { headers });
    } catch (fetchErr) {
      if (Number(fetchErr?.status || 0) === 400) throw fetchErr;
      fileResponse = await safeExternalFetch(document_url);
    }

    if (!fileResponse.ok) {
      return Response.json({ error: `Failed to download file (HTTP ${fileResponse.status})` }, { status: 400 });
    }

    const contentType = fileResponse.headers.get('content-type') || '';
    const ext = getExtFromContentType(contentType, document_url);

    // Accept any non-empty file type, but cap bytes before buffering/uploading.
    const fileBytes = await readResponseBytes(fileResponse);
    if (fileBytes.byteLength === 0) {
      return Response.json({ error: 'Downloaded file is empty' }, { status: 400 });
    }

    const safeTitle = (document_title || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_');
    const fileName = `${safeTitle}.${ext}`;
    const mimeType = contentType.split(';')[0].trim() || 'application/octet-stream';
    const file = new File([fileBytes], fileName, { type: mimeType });

    // Upload to app's file system
    const uploadResult = await base44.integrations.Core.UploadFile({ file });

    if (!uploadResult?.file_url) {
      return Response.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Patch only the matching document against the latest Jurisdiction snapshot so
    // concurrent document additions/edits are preserved instead of replacing the array.
    const downloadedAt = new Date().toISOString();
    const updatedJurisdiction = await patchJurisdictionDocuments({
      entity: base44.entities.JurisdictionProfile,
      jurisdictionId: jurisdiction_id,
      documentUrl: document_url,
      patch: {
        file_url: uploadResult.file_url,
        downloaded_at: downloadedAt,
      },
      label: `Jurisdiction document download ${document_title || document_url}`,
    });

    return Response.json({ 
      success: true, 
      file_url: uploadResult.file_url,
      jurisdiction: updatedJurisdiction,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 413].includes(status) ? status : 500;
    console.error('downloadPermitPDF error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Permit document could not be downloaded safely' : error.message,
    }, { status: safeStatus });
  }
});