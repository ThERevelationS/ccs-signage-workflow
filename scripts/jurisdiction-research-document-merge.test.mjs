import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findExistingJurisdictionDocument,
  jurisdictionDocumentSourceKey,
  mergeJurisdictionResearchDocuments,
} from '../base44/shared/jurisdictionResearchDocumentMerge.mjs';

const manifest = JSON.parse(readFileSync('docs/permitting-boone-ky-download-manifest-2026-09-26.json', 'utf8'));
const booneDocs = manifest.files.map((file, index) => ({
  id: 'existing-boone-' + index, source: 'ai_discovered', url: file.sourceUrl,
  title: file.filename, doc_type: 'permit_application',
  file_url: 'https://storage.example/boone/' + file.filename,
  source_sha256: file.sha256, stored_sha256: file.sha256,
  source_bytes: file.bytes, stored_bytes: file.bytes,
  extracted_text: 'Original searchable permit form ' + index,
  downloaded_at: '2026-09-26T13:00:00Z',
  last_fetched: '2026-09-26T13:00:00Z',
}));
const updated = (doc, title = 'New AI title') => ({
  id: 'generated-new-id', url: doc.url, source: 'ai_discovered',
  title, doc_type: 'other', ai_summary: 'Fresh research summary',
  last_fetched: '2026-09-27T00:00:00Z',
});

test('omitted AI results never remove six downloaded Boone County documents', () => {
  const merged = mergeJurisdictionResearchDocuments(booneDocs, [updated(booneDocs[0])]);
  assert.equal(merged.length, 6);
  for (let index = 0; index < 6; index++) {
    assert.equal(merged[index].id, booneDocs[index].id);
    for (const field of ['file_url', 'source_sha256', 'stored_sha256', 'source_bytes',
      'stored_bytes', 'extracted_text', 'downloaded_at', 'last_fetched']) {
      assert.equal(merged[index][field], booneDocs[index][field], field);
    }
  }
  assert.equal(merged[0].title, 'New AI title');
  assert.equal(merged[0].ai_summary, 'Fresh research summary');
  assert.equal(booneDocs[0].title, manifest.files[0].filename, 'Original records remain unchanged');
});

test('manual sign ordinance retains its exact contents when research rediscovers its URL', () => {
  const manual = { ...booneDocs[0], source: 'manual', title: 'Staff title' };
  assert.deepEqual(mergeJurisdictionResearchDocuments([manual], [updated(manual)])[0], manual);
});

test('new, source-backed application is appended while old archives remain', () => {
  const fresh = { id: 'new-application', url: 'https://gov.example/sign-form-2027.pdf', source: 'ai_discovered' };
  const merged = mergeJurisdictionResearchDocuments(booneDocs, [fresh]);
  assert.equal(merged.length, 7);
  assert.equal(merged[6].id, 'new-application');
});

test('a repeated URL cannot create duplicate documents or change stable IDs', () => {
  const candidate = updated(booneDocs[0]);
  const once = mergeJurisdictionResearchDocuments(booneDocs, [candidate, candidate]);
  const twice = mergeJurisdictionResearchDocuments(once, [candidate]);
  assert.equal(once.length, 6);
  assert.equal(twice.length, 6);
  assert.equal(twice[0].id, booneDocs[0].id);
  assert.deepEqual(twice, once);
});

test('a URL fragment or hostname capitalization does not create a duplicate', () => {
  const existing = { ...booneDocs[0], url: 'https://County.Example/Forms/Sign.pdf' };
  const found = findExistingJurisdictionDocument([existing], { url: 'https://county.example/Forms/Sign.pdf#section' });
  assert.equal(found, existing);
  assert.equal(jurisdictionDocumentSourceKey(existing), jurisdictionDocumentSourceKey({ url: 'https://county.example/Forms/Sign.pdf#section' }));
  assert.equal(mergeJurisdictionResearchDocuments([existing], [{ url: 'https://county.example/Forms/Sign.pdf#section' }]).length, 1);
});

test('different file versions in query strings remain distinct', () => {
  const older = { ...booneDocs[0], url: 'https://county.example/sign.pdf?version=1' };
  assert.equal(mergeJurisdictionResearchDocuments([older], [{ url: 'https://county.example/sign.pdf?version=2' }]).length, 2);
});

test('unlinked AI suggestions cannot accumulate bogus documents', () => {
  const older = { id: 'legacy-unlinked', source: 'manual', title: 'Awaiting official URL' };
  const merged = mergeJurisdictionResearchDocuments([older], [{ title: 'No source' }, { url: '' }]);
  assert.deepEqual(merged, [older]);
});

test('older unarchived research can receive a newly downloaded PDF and extracted text', () => {
  const old = { id: 'existing', source: 'ai_discovered', url: 'https://county.example/form.pdf', extracted_text: 'old' };
  const incoming = { id: 'new-id', url: old.url, file_url: 'https://files.example/form.pdf',
    extracted_text: 'updated text', last_fetched: '2026-09-27T00:00:00Z' };
  const [merged] = mergeJurisdictionResearchDocuments([old], [incoming]);
  assert.equal(merged.id, 'existing');
  assert.equal(merged.file_url, incoming.file_url);
  assert.equal(merged.extracted_text, 'updated text');
  assert.equal(merged.last_fetched, incoming.last_fetched);
});

test('Boone building application review records the current county-linked online workflow', () => {
  assert.equal(manifest.onlineForms.buildingPermitPortal, 'https://app.govwell.com/');
  assert.match(manifest.onlineForms.buildingPermitSubmission, /Boone County Building Permits page/i);
  assert.match(manifest.sourceGapReview, /resolved as an online workflow/i);
  assert.equal(manifest.files.length, 6);
});

test('both server refresh paths use safe merge and individual refresh skips pinned re-download', () => {
  const individual = readFileSync('base44/functions/refreshJurisdiction/entry.ts', 'utf8');
  const batch = readFileSync('base44/functions/batchUpdateJurisdictions/entry.ts', 'utf8');
  assert.match(individual, /mergeJurisdictionResearchDocuments\(jurisdiction\.documents, processedDocs\)/);
  assert.match(individual, /existing\?\.source_sha256/);
  assert.match(individual, /existing\?\.file_url/);
  assert.match(batch, /mergeJurisdictionResearchDocuments\(jurisdiction\.documents, \[\.\.\.newDocs, \.\.\.countyDocs\]\)/);
  assert.match(individual, /replaceJurisdictionFieldsIfUnchanged/);
  assert.match(batch, /replaceJurisdictionFieldsIfUnchanged/);
});
