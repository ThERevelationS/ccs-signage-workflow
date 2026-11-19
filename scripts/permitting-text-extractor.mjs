// permitting-text-extractor.mjs — extract text/<sha>.txt from LOCAL fetched
// bytes. The remote extraction path only touches sources with archived_file_url
// — but ~36k files are local:// and never upload under the quota cap. Without
// text, the signage-facts + rule lanes starve. This drains the local backlog:
// pdfjs → per-page text → office dossier text/<sha>.txt + index 'extracted'.
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync, openSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readIndex, indexFile, officeDir } from './lib/office-files.mjs';

const DIR = '.audit-work';
const DONE_FILE = `${DIR}/text-extract-done.json`;
const MAX_PER_PASS = Number(process.env.TXT_PER_PASS || 400);
const PASS_GAP = Number(process.env.TXT_GAP_MS || 3 * 60_000);

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'txt-extract', ...e }) + '\n', { flag: 'a' }); } catch {} };

let done = {};
try { done = JSON.parse(readFileSync(DONE_FILE, 'utf8')); } catch {}

const PDF_EXTS = new Set(['pdf']);

async function extractPdf(localPath) {
  const buf = readFileSync(localPath);
  const doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(`--- page ${p} ---\n` + tc.items.map((i) => i.str).join(' '));
  }
  await doc.destroy();
  return pages.join('\n');
}

async function pass() {
  const idx = readIndex();
  let extracted = 0, failed = 0, skipped = 0;
  for (const [key, office] of Object.entries(idx.offices || {})) {
    if (extracted >= MAX_PER_PASS) break;
    const dir = officeDir(key);
    for (const f of office.files || []) {
      if (extracted >= MAX_PER_PASS) break;
      if (f.stage !== 'fetched' && f.stage !== 'uploaded') continue;
      if (!f.local_path || !f.sha256) continue;
      const lp = f.local_path.replace(/^local:\/\//, '');
      const ext = lp.split('.').pop().toLowerCase();
      if (!PDF_EXTS.has(ext)) continue; // html/txt handled by other lanes
      const k = `${key}|${f.sha256}`;
      if (done[k]) { skipped++; continue; }
      const txtPath = path.join(dir, 'text', `${f.sha256}.txt`);
      if (existsSync(txtPath)) { done[k] = 1; skipped++; continue; }
      if (!existsSync(lp)) { done[k] = 1; continue; }
      try {
        const text = await extractPdf(lp);
        mkdirSync(path.dirname(txtPath), { recursive: true });
        appendFileSync(txtPath, text + '\n');
        indexFile(key, { jurisdiction_id: office.jurisdiction_id, jurisdiction_name: office.jurisdiction_name, state: office.state, locality_id: office.locality_id, office_id: office.office_id, office_name: office.office_name, roles: office.roles },
          { sha256: f.sha256, name: f.name, stage: 'extracted', official_url: f.official_url, source_document_id: f.source_document_id, local_path: f.local_path });
        done[k] = 1; extracted++;
        if (extracted % 25 === 0) emit({ stage: 'txt_progress', detail: `${extracted} extracted (${skipped} prior)` });
      } catch (e) {
        done[k] = 1; failed++;
        emit({ stage: 'txt_err', address: office.jurisdiction_name, ok: false, detail: `${(f.name || f.sha256 || '').slice(0, 45)} — ${String(e?.message || e).slice(0, 70)}` });
      }
    }
  }
  writeFileSync(DONE_FILE, JSON.stringify(done));
  emit({ stage: 'txt_pass', ok: true, detail: `extracted:${extracted} failed:${failed} prior:${skipped} backlog:${Object.keys(done).length}` });
}

for (;;) {
  try { await pass(); } catch (e) { emit({ stage: 'txt_err', ok: false, detail: String(e?.message || e).slice(0, 140) }); }
  await new Promise((r) => setTimeout(r, PASS_GAP));
}
