export const PDF_TEXT_METHOD = 'pdfjs-4.8.69-text-v1';
export const PDF_TEXT_PAGE_BATCH = 5;
export const PDF_TEXT_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_TEXT_MAX_PAGE_CHARS = 50_000;
export const PDF_TEXT_MAX_TOTAL_CHARS = 500_000;
export const PDF_TEXT_TIMEOUT_MS = 12_000;

export async function textSha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

async function timed(promise, timeout, cancel) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => { try { cancel?.(); } catch {} reject(Error('PDF text work exceeded its time budget.')); }, timeout);
    })]);
  } finally { clearTimeout(timer); }
}

export async function readVerifiedPdfArchive(source, fetchSource) {
  const controller = new AbortController();
  try {
    return await timed((async () => {
      const response = await fetchSource(source.archived_file_url, { signal: controller.signal });
      if (!response.ok) throw Error('Archive returned HTTP ' + response.status);
      if (/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) throw Error('Archive returned HTML.');
      if (Number(response.headers.get('content-length')) > PDF_TEXT_MAX_BYTES) throw Object.assign(Error('Archive exceeds bounded text-extraction size.'), { permanent: true });
      const reader = response.body?.getReader();
      const chunks = []; let size = 0;
      if (!reader) throw Error('Archive has no readable body.');
      try {
        while (true) {
          const {value,done} = await reader.read(); if (done) break;
          size += value.length;
          if (size > PDF_TEXT_MAX_BYTES) { await reader.cancel(); throw Object.assign(Error('Archive exceeds bounded text-extraction size.'), { permanent: true }); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (!size || new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw Object.assign(Error('Archive is not a PDF.'), { permanent: true });
      if (size !== source.file_bytes || await textSha256(bytes) !== source.file_hash_sha256) throw Object.assign(Error('Archive hash/byte identity differs from the catalog snapshot.'), { permanent: true });
      return bytes;
    })(), PDF_TEXT_TIMEOUT_MS, () => controller.abort());
  } finally { controller.abort(); }
}

export function pdfItemsText(items) {
  const chunks = [];
  for (const item of items || []) {
    if (typeof item.str !== 'string') continue;
    chunks.push(item.str);
    chunks.push(item.hasEOL ? '\n' : ' ');
  }
  return chunks.join('').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

// This reads text operators only: no rendering, OCR, AI, or embedded PDF scripts.
export async function extractPdfTextChunk({ bytes, source, startPage = 1, openPdf, now = () => Date.now() }) {
  let task;
  try {
    return await timed((async () => {
      task = openPdf(bytes);
      const pdf = await task.promise;
      const total = pdf.numPages;
      if (!Number.isInteger(total) || total < 1 || !Number.isInteger(startPage) || startPage < 1 || startPage > total) throw Object.assign(Error('Invalid PDF page continuation.'), { permanent: true });
      const pages = [];
      for (let pageNumber = startPage; pageNumber <= Math.min(total, startPage + PDF_TEXT_PAGE_BATCH - 1); pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          const fullText = pdfItemsText(content.items);
          const text = fullText.slice(0, PDF_TEXT_MAX_PAGE_CHARS);
          pages.push({
            page: pageNumber, text, source_document_id: source.id, source_sha256: source.file_hash_sha256,
            text_sha256: await textSha256(new TextEncoder().encode(text)),
            method: PDF_TEXT_METHOD, extracted_at: new Date(now()).toISOString(),
            truncated: fullText.length > text.length,
            needs_ocr_review: text.replace(/\s/g, '').length < 20,
          });
        } finally { page.cleanup?.(); }
      }
      return { total_pages: total, pages, next_page: pages.at(-1).page + 1 };
    })(), PDF_TEXT_TIMEOUT_MS, () => { void task?.destroy?.().catch?.(() => {}); });
  } finally { await task?.destroy?.().catch?.(() => {}); }
}

export function assembledSourceText(source, pages) {
  return pages.map(p => '[Source ' + source.id + '; archive SHA-256 ' + source.file_hash_sha256 + '; PDF page ' + p.page + ']\n' + p.text).join('\n\n');
}
