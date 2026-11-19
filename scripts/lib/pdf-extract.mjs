// MP-3.1 — PDF text extraction (pdfjs-dist, worker-less Node mode).
// Permit PDFs carry the real answer: office names, fees, form titles,
// submission instructions. A scanned PDF yields no text → callers tag
// `pdf_no_text` instead of treating silence as absence of evidence.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// url → joined text of the first `maxPages` pages (permit forms are 1-3p).
// Returns { text, pages } or null on fetch/parse failure.
export async function pdfText(url, { maxPages = 4, timeout = 20000 } = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'ccs-signage-office-research/1.0' } });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 100 || buf.length > 8_000_000) return null; // skip junk/huge
    const doc = await getDocument({ data: buf, isEvalSupported: false, useWorkerFetch: false, disableFontFace: true }).promise;
    const n = Math.min(doc.numPages, maxPages);
    let text = '';
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map((it) => it.str).join(' ') + '\n';
    }
    await doc.destroy();
    return { text: text.replace(/\s+/g, ' ').trim(), pages: doc.numPages };
  } catch { return null; }
}

// Batch: pdfEvidence() entries → pseudo-pages for extract(). Caps work per
// crawl — PDFs are heavy and most value lands in the first few.
export async function pdfPages(pdfs, { max = 3, sleepMs = 400 } = {}) {
  const out = [];
  for (const p of (pdfs || []).slice(0, max)) {
    const got = await pdfText(p.url);
    if (got?.text && got.text.length > 80) {
      out.push({ url: p.url, text: got.text, mailto: [], tel: [] });
    }
    await sleep(sleepMs);
  }
  return out;
}
