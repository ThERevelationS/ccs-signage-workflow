export const PDF_RESOURCE_METHOD = 'http-mime-signature-v1';
export function hasClassifiedPdfResource(doc) {
  const r = doc?.resource_classification;
  return r?.kind === 'pdf' && r.method === PDF_RESOURCE_METHOD && r.source_url === doc.url;
}

// Classification is a routing hint, not an archive or authority receipt. PDF
// probing reads only its signature and cancels the body; archival later fetches
// and verifies all original bytes through the normal durable archive worker.
export async function readPermittingResourceResponse(response, { htmlMaxBytes = 2 * 1024 * 1024 } = {}) {
  if (!response.ok) throw Error('Official resource returned HTTP ' + response.status);
  const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const pdf = type === 'application/pdf';
  if (!pdf && !['text/html', 'application/xhtml+xml'].includes(type)) throw Error('Unsupported official resource content type.');
  if (!pdf && Number(response.headers.get('content-length') || 0) > htmlMaxBytes) throw Error('Official HTML exceeds its byte limit.');
  const reader = response.body?.getReader();
  if (!reader) throw Error('Official resource has no readable response body.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      if (pdf) {
        const part = value.slice(0, Math.max(0, 5 - size)); chunks.push(part); size += part.length;
        if (size >= 5) break;
      } else {
        size += value.length;
        if (size > htmlMaxBytes) throw Error('Official HTML exceeds its byte limit.');
        chunks.push(value);
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (pdf) {
    if (new TextDecoder().decode(bytes) !== '%PDF-') throw Error('PDF MIME type has no PDF signature.');
    return { resource_kind: 'pdf', classification_method: PDF_RESOURCE_METHOD, finalUrl: response.url };
  }
  return { html: new TextDecoder().decode(bytes), finalUrl: response.url };
}
