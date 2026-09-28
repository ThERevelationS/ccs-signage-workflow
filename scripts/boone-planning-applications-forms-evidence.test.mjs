import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-planning-applications-forms-evidence-2026-09-28.json', 'utf8'));

test('current Planning Commission Applications and Forms page preserves sign and temporary-display categories without inventing online submission', () => {
  assert.equal(evidence.httpStatus, 200);
  const bytes = readFileSync(evidence.repositoryPath);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
  const html = bytes.toString('utf8');
  assert.match(html, /SignPermit_checklist\.pdf[^>]*[^]*?Sign Permit/i);
  assert.match(html, /SignPermit\.pdf[^>]*[^]*?Sign Permit/i);
  assert.match(html, /TAD\.pdf[^>]*[^]*?Temporary Advertising Display/i);
  assert.match(html, /TCDFlorenceUnionWalton\.pdf[^>]*[^]*?Temporary Commercial Display \(Incorporated\)/i);
  assert.match(html, /TCDSeasonal\.pdf[^>]*[^]*?Temporary Commercial Display \(Seasonal\)/i);
  assert.match(html, /TCDBooneCounty\.pdf[^>]*[^]*?Temporary Commercial Display \(Unincorporated\)/i);
  assert.match(evidence.evidenceScope, /does not establish an authenticated online submission workflow/i);
  assert.match(evidence.evidenceScope, /does not by itself confirm every requirement, eligibility rule, jurisdiction boundary, instruction, or fee/i);
});
