import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import { validatePermitDocumentBytes } from '../../shared/permittingDocumentValidation.mjs';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { patchJurisdictionDocuments } from '../../shared/jurisdictionPersistence.mjs';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';

const MAX_PERMIT_DOCUMENT_BYTES = 50 * 1024 * 1024;

async function permitDocumentSha256(bytes: Uint8Array) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

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
  let reporter:any=silentScanReporter;
  async function respond(data:any,options:any={}){return Response.json({...data,scan_run:await reporter.finish(data.error?'failed':'complete',data.error || '')},options);}
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return respond({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jurisdiction_id, document_url, document_title,action_token } = await req.json();

    if (!jurisdiction_id || !document_url) {
      return respond({ error: 'Missing jurisdiction_id or document_url' }, { status: 400 });
    }

    // Re-read the live document before downloading. A source that has already
    // been archived and fingerprinted must match that exact archive before it can
    // be copied into live File Storage.
    const jurisdiction = await base44.entities.JurisdictionProfile.get(jurisdiction_id);
    if(action_token && user.role==='admin')reporter=await createScanReporter({entity:base44.asServiceRole.entities.PermittingScanRun,token:action_token,user,targetId:jurisdiction_id,targetName:jurisdiction.name,kind:'document',label:`Download ${document_title || document_url}`});
    const sourceDocument = (jurisdiction?.documents || []).find(doc => doc.url === document_url);
    if (!sourceDocument) {
      return respond({ error: 'Document source is no longer present on this jurisdiction' }, { status: 409 });
    }
    const expectedSha256 = String(sourceDocument.source_sha256 || '').trim().toLowerCase();
    const expectedBytes = Number(sourceDocument.source_bytes || 0);
    // Live storage ingest is only allowed for a fully archived/fingerprinted source.
    // This prevents an unpinned link (or a partially populated fingerprint) from
    // being silently treated as a collected document.
    if (!expectedSha256 || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
      return respond({ error: 'Document has not been fully archived and fingerprinted; live ingest was blocked' }, { status: 409 });
    }
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      return respond({ error: 'Stored source SHA-256 is invalid; live ingest was blocked' }, { status: 409 });
    }

    // Make retries idempotent at the backend boundary, not just in the UI. A
    // timeout after UploadFile can otherwise tempt an operator to retry and create
    // duplicate File Storage objects. Only treat an existing file as complete when
    // its stored proof exactly matches the archived source fingerprint.
    if (sourceDocument.file_url) {
      const storedSha256 = String(sourceDocument.stored_sha256 || '').trim().toLowerCase();
      const storedBytes = Number(sourceDocument.stored_bytes || 0);
      if (storedSha256 === expectedSha256 && storedBytes === expectedBytes) {
        return respond({
          success: true,
          already_stored: true,
          file_url: sourceDocument.file_url,
          jurisdiction,
        });
      }
      return respond({
        error: 'Document already has a File Storage URL without matching stored fingerprint proof; live ingest was blocked',
      }, { status: 409 });
    }

    // Download the file with browser-like headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    await reporter.emit({kind:'download',url:document_url,detail:'Downloading original for comparison with its saved fingerprint.'},{stage:'Downloading original',current_url:document_url,processed:0,total:3,indeterminate:false});
    let fileResponse;
    try {
      fileResponse = await safeExternalFetch(document_url, { headers });
    } catch (fetchErr) {
      if (Number(fetchErr?.status || 0) === 400) throw fetchErr;
      fileResponse = await safeExternalFetch(document_url);
    }

    if (!fileResponse.ok) {
      return respond({ error: `Failed to download file (HTTP ${fileResponse.status})` }, { status: 400 });
    }

    const contentType = fileResponse.headers.get('content-type') || '';
    const ext = getExtFromContentType(contentType, document_url);

    // A removed form may redirect to an HTTP 200 HTML error page. Never store it
    // as a downloaded permit document or report the source file as complete.
    if (/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
      return respond({ error: 'Source returned a web page instead of a downloadable document' }, { status: 415 });
    }
    const fileBytes = await readResponseBytes(fileResponse);
    if (fileBytes.byteLength === 0) {
      return respond({ error: 'Downloaded file is empty' }, { status: 400 });
    }
    validatePermitDocumentBytes(fileBytes, {format: ext, contentType});

    if (expectedBytes > 0 && fileBytes.byteLength !== expectedBytes) {
      return respond({ error: `Official source changed size since archival (${fileBytes.byteLength} bytes received; ${expectedBytes} expected). Re-verify before live ingest.` }, { status: 409 });
    }
    const sourceSha256 = await permitDocumentSha256(fileBytes);
    if (expectedSha256 && sourceSha256 !== expectedSha256) {
      return respond({ error: 'Official source SHA-256 changed since archival. Re-verify before live ingest.' }, { status: 409 });
    }

    const safeTitle = (document_title || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_');
    const fileName = `${safeTitle}.${ext}`;
    const mimeType = contentType.split(';')[0].trim() || 'application/octet-stream';
    const file = new File([fileBytes], fileName, { type: mimeType });

    // Upload to app's file system
    await reporter.emit({kind:'upload',detail:`Validated ${fileBytes.byteLength} source bytes; uploading file.`},{stage:'Uploading file',processed:1,total:3});
    const uploadResult = await base44.integrations.Core.UploadFile({ file });

    if (!uploadResult?.file_url) {
      return respond({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Patch only the matching document against the latest Jurisdiction snapshot so
    // concurrent document additions/edits are preserved instead of replacing the array.
    await reporter.emit({kind:'saving',detail:'Saving file URL and fingerprint against the current document identity.'},{stage:'Saving document receipt',processed:2,total:3});
    const downloadedAt = new Date().toISOString();
    const updatedJurisdiction = await patchJurisdictionDocuments({
      entity: base44.entities.JurisdictionProfile,
      jurisdictionId: jurisdiction_id,
      documentUrl: document_url,
      patch: {
        file_url: uploadResult.file_url,
        downloaded_at: downloadedAt,
        stored_sha256: sourceSha256,
        stored_bytes: fileBytes.byteLength,
      },
      label: `Jurisdiction document download ${document_title || document_url}`,
    });

    return respond({ 
      success: true, 
      file_url: uploadResult.file_url,
      jurisdiction: updatedJurisdiction,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 409, 413, 415].includes(status) ? status : 500;
    console.error('downloadPermitPDF error:', error?.message || error);
    return respond({
      error: safeStatus === 500 ? 'Permit document could not be downloaded safely' : error.message,
    }, { status: safeStatus });
  }
});