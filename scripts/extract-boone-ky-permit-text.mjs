import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const archive = 'public/permitting/sources/boone-ky/';
const manifest = JSON.parse(await readFile('docs/permitting-boone-ky-download-manifest-2026-09-26.json', 'utf8'));
const documentIds = {
  'sign-permit-application-2024.pdf': 'source-boone-ky-sign-form-20260926',
  'sign-permit-checklist.pdf': 'source-boone-ky-sign-checklist-20260926',
  'planning-fee-schedule-2021.pdf': 'source-boone-ky-fees-20260926',
  'building-sign-permit-guide.pdf': 'source-boone-ky-building-sign-20260926',
  'online-building-permit-instructions.pdf': 'source-boone-ky-building-online-20260926',
  'encroachment-permit-application-2025.pdf': 'source-boone-ky-right-of-way-20260926',
};
const entries = [];
for (const file of manifest.files) {
  const documentId = documentIds[file.filename];
  if (!documentId || file.repositoryPath !== archive + file.filename) throw Error('Unexpected manifest file ' + file.filename);
  const bytes = await readFile(file.repositoryPath);
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw Error('Archived PDF failed file type or SHA-256 verification: ' + file.filename);
  }
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false });
  const pdf = await loading.promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str ?? '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) pages.push(`Page ${index}\n${text}`);
  }
  const extractedText = pages.join('\n\n');
  entries.push({ documentId, filename: file.filename, sha256: file.sha256, sourceUrl: file.sourceUrl,
    pageCount: pdf.numPages, textPages: pages.length, characterCount: extractedText.length,
    extractionStatus: pages.length === pdf.numPages ? 'text_extracted' : pages.length ? 'partial_text_check_for_scanned_pages' : 'no_text_requires_manual_review_or_ocr',
    extractedText });
  await loading.destroy();
  console.log('EXTRACTED', file.filename, pdf.numPages + ' pages', extractedText.length + ' characters', entries.at(-1).extractionStatus);
}
if (entries.length !== 6 || new Set(entries.map(e => e.documentId)).size !== 6) throw Error('Incomplete or duplicate Boone PDF mapping');
if (!manifest.sourceGapReview?.toLowerCase().includes('resolved as an online workflow')) {
  throw Error('Boone building application workflow review must remain explicit');
}
await writeFile('docs/permitting-boone-ky-extracted-text-2026-09-26.json', JSON.stringify({ jurisdictionId:'6ab7c6107f2251a8e8e48b90', state:'KY', generatedAt: new Date().toISOString(), entries }, null, 2) + '\n');
console.log('VERIFIED', entries.length, 'PDFs; file hashes, page counts and nonempty extraction status recorded');
