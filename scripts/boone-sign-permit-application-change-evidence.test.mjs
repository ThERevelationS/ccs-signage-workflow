import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const readFileAsync = promisify(readFile);
const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-sign-permit-application-change-evidence-2026-09-28.json', 'utf8'));

async function firstPageText(path) {
  const bytes = await readFileAsync(path);
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false });
  const pdf = await loading.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map(item => item.str ?? '').join(' ').replace(/\s+/g, ' ').trim();
  const pages = pdf.numPages;
  await loading.destroy();
  return { bytes, text, pages };
}

test('Boone Sign Permit application comparison keeps drawing-copy change as corroboration-required evidence', async () => {
  const prior = await firstPageText(evidence.priorSource.repositoryPath);
  const current = await firstPageText(evidence.currentSource.repositoryPath);

  assert.equal(prior.pages, evidence.comparison.pagesPrior);
  assert.equal(current.pages, evidence.comparison.pagesCurrent);
  assert.equal(prior.bytes.length, evidence.priorSource.bytes);
  assert.equal(current.bytes.length, evidence.currentSource.bytes);
  assert.equal(createHash('sha256').update(prior.bytes).digest('hex'), evidence.priorSource.sha256);
  assert.equal(createHash('sha256').update(current.bytes).digest('hex'), evidence.currentSource.sha256);

  assert.match(prior.text, /Three \(3\s*\) copies of submitted drawings are required/i);
  assert.match(current.text, /One \(1\s*\) cop\s*y of submitted drawings are required/i);

  assert.equal(evidence.comparison.substantiveChangeCandidates.length, 1);
  const change = evidence.comparison.substantiveChangeCandidates[0];
  assert.equal(change.field, 'submitted_drawing_copy_count');
  assert.equal(change.status, 'current_form_change_candidate_requires_corroboration');
  assert.match(change.useRule, /Do not promote.*until corroborated by another current official source or staff approval/i);
  assert.match(evidence.evidenceScope, /does not by itself establish the controlling submission requirement/i);
});
