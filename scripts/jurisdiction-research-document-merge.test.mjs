import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

test('Boone building application review preserves evidence-bounded GovWell and Oracle routing', () => {
  assert.equal(manifest.onlineForms.buildingPermitPortal, 'https://app.govwell.com/');
  assert.match(manifest.onlineForms.buildingPermitSubmission, /NEW building-permit applications/i);
  assert.match(manifest.onlineForms.buildingPermitPortalEvidence.newApplications, /GovWell.*current official county-directed path.*new building-permit applications/i);
  assert.match(manifest.onlineForms.buildingPermitPortalEvidence.oracleCurrentPageLink, /current Boone County Building Permits page still links.*Oracle/i);
  assert.match(manifest.onlineForms.buildingPermitPortalEvidence.oracleArchivedEvidence, /archived official Online Permit Information PDF.*Oracle.*building-permit workflow/i);
  assert.match(manifest.onlineForms.buildingPermitPortalEvidence.oracleScopeCaveat, /does not establish.*Oracle is obsolete.*does not define every permit type/i);
  assert.match(manifest.onlineForms.buildingPermitPortalEvidence.newApplicationRoutingRule, /Do not direct new building-permit applications to Oracle without newer permit-specific official evidence/i);
  assert.match(manifest.sourceGapReview, /directs NEW building-permit applications to GovWell/i);
  assert.match(manifest.sourceGapReview, /current evidence does not establish that Oracle is obsolete/i);
  assert.equal(manifest.files.length, 6);
});

test('Boone official Planning Commission sign application remains byte-identical without overclaiming printed workflow currency', () => {
  const signApplication = manifest.files.find(file => file.purpose === 'sign_permit_application');
  assert.ok(signApplication);
  assert.equal(signApplication.currencyCheck.httpStatus, 200);
  assert.equal(signApplication.currencyCheck.sourceBytes, signApplication.bytes);
  assert.equal(signApplication.currencyCheck.sourceSha256, signApplication.sha256);
  assert.equal(signApplication.currencyCheck.matchesArchivedCopy, true);
  assert.match(signApplication.currencyCheck.evidenceScope, /current bytes\/hash match the archived repository copy/i);
  assert.match(signApplication.currencyCheck.evidenceScope, /does not by itself prove that every instruction, fee, or workflow printed inside the form is current/i);
  assert.equal(manifest.files.length, 6);
});

test('Boone official Planning Commission sign checklist remains byte-identical without overclaiming printed requirement currency', () => {
  const checklist = manifest.files.find(file => file.purpose === 'sign_permit_checklist');
  assert.ok(checklist);
  assert.equal(checklist.currencyCheck.httpStatus, 200);
  assert.equal(checklist.currencyCheck.sourceBytes, checklist.bytes);
  assert.equal(checklist.currencyCheck.sourceSha256, checklist.sha256);
  assert.equal(checklist.currencyCheck.matchesArchivedCopy, true);
  assert.match(checklist.currencyCheck.evidenceScope, /current bytes\/hash match the archived repository copy/i);
  assert.match(checklist.currencyCheck.evidenceScope, /does not by itself prove that every checklist requirement, instruction, fee, or workflow printed inside the document is current/i);
  assert.match(manifest.sourceGapReview, /SignPermit_checklist\.pdf.*same 46354-byte SHA-256-identical file/i);
  assert.equal(manifest.files.length, 6);
});

test('Boone official Planning Commission fee schedule remains byte-identical without promoting 2021 fee amounts to current fees', () => {
  const feeSchedule = manifest.files.find(file => file.purpose === 'planning_fee_schedule_verify_currency');
  assert.ok(feeSchedule);
  assert.equal(feeSchedule.currencyCheck.httpStatus, 200);
  assert.equal(feeSchedule.currencyCheck.sourceBytes, feeSchedule.bytes);
  assert.equal(feeSchedule.currencyCheck.sourceSha256, feeSchedule.sha256);
  assert.equal(feeSchedule.currencyCheck.matchesArchivedCopy, true);
  assert.match(feeSchedule.currencyCheck.evidenceScope, /current bytes\/hash match the archived repository copy/i);
  assert.match(feeSchedule.currencyCheck.evidenceScope, /archived document is a 2021 fee schedule/i);
  assert.match(feeSchedule.currencyCheck.evidenceScope, /does not by itself establish that any individual fee amount printed inside it is current in 2026/i);
  assert.match(manifest.sourceGapReview, /FeeSchedule\.pdf.*same 281297-byte SHA-256-identical file.*2021 fee schedule/i);
  assert.equal(manifest.files.length, 6);
});

test('Boone official Planning Commission fee schedule remains byte-identical without promoting 2021 fee amounts to current fees', () => {
  const feeSchedule = manifest.files.find(file => file.purpose === 'planning_fee_schedule_verify_currency');
  assert.ok(feeSchedule);
  assert.equal(feeSchedule.currencyCheck.httpStatus, 200);
  assert.equal(feeSchedule.currencyCheck.sourceBytes, feeSchedule.bytes);
  assert.equal(feeSchedule.currencyCheck.sourceSha256, feeSchedule.sha256);
  assert.equal(feeSchedule.currencyCheck.matchesArchivedCopy, true);
  assert.match(feeSchedule.currencyCheck.evidenceScope, /current bytes\/hash match the archived repository copy/i);
  assert.match(feeSchedule.currencyCheck.evidenceScope, /archived document is a 2021 fee schedule/i);
  assert.match(feeSchedule.currencyCheck.evidenceScope, /does not by itself establish that any individual fee amount printed inside it is current in 2026/i);
  assert.match(manifest.sourceGapReview, /FeeSchedule\.pdf.*same 281297-byte SHA-256-identical file.*2021 fee schedule/i);
  assert.equal(manifest.files.length, 6);
});

test('Boone Building Department SIGN FEES source identity cannot override newer current fee evidence', () => {
  const guide = manifest.files.find(file => file.purpose === 'building_sign_permit_instructions_verify_currency');
  assert.ok(guide);
  assert.equal(guide.currencyCheck.httpStatus, 200);
  assert.equal(guide.currencyCheck.sourceBytes, guide.bytes);
  assert.equal(guide.currencyCheck.sourceSha256, guide.sha256);
  assert.equal(guide.currencyCheck.matchesArchivedCopy, true);
  assert.match(guide.currencyCheck.evidenceScope, /source-file identity only/i);
  assert.match(guide.currencyCheck.evidenceScope, /Do not use it to override or broaden the current official Commercial Building Permit Fees page/i);
  assert.match(guide.currencyCheck.evidenceScope, /do not infer that every fee, threshold, instruction, or workflow.*is current/i);
  assert.match(manifest.sourceGapReview, /SIGN FEES\.pdf.*same 28092-byte SHA-256-identical file.*source-file identity evidence only/i);
  assert.equal(manifest.files.length, 6);
});

test('Boone current Building Permits page is archived separately from the six PDFs with bounded portal evidence', () => {
  assert.equal(manifest.files.length, 6);
  const source = manifest.webSources.find(item => item.purpose === 'current_building_permit_process_and_portal_evidence');
  assert.ok(source);
  assert.equal(source.sourceUrl, manifest.onlineForms.countyPortalPage);
  assert.equal(source.httpStatus, 200);
  assert.equal(source.contentType, 'text/html');
  const bytes = readFileSync(source.repositoryPath);
  assert.equal(bytes.length, source.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  const html = bytes.toString('utf8');
  assert.match(html, /app\.govwell\.com/i);
  assert.match(html, /fa-erbz-saasfaprod1\.fa\.ocs\.oraclecloud\.com/i);
  assert.match(source.evidenceScope, /does not establish which permit types, if any, still use Oracle/i);
});

test('Boone current commercial fee page preserves the signage-over-32-square-feet Building Department fee with scope caveats', () => {
  assert.equal(manifest.files.length, 6);
  const source = manifest.webSources.find(item => item.purpose === 'current_building_department_signage_review_fee_evidence');
  assert.ok(source);
  assert.equal(source.httpStatus, 200);
  assert.equal(source.contentType, 'text/html');
  const bytes = readFileSync(source.repositoryPath);
  assert.equal(bytes.length, source.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  const html = bytes.toString('utf8');
  assert.match(html, /Signage \(over 32 sq ft\)/i);
  assert.match(html, /\$150\/sign/i);
  assert.match(source.evidenceScope, /Building Department fee evidence only/i);
  assert.match(source.evidenceScope, /does not establish the complete cost of a sign project/i);
  assert.match(source.evidenceScope, /does not.*replace Planning Commission sign\/zoning fees/i);
  assert.match(source.evidenceScope, /establish a fee for signage 32 sq ft or less/i);
});

test('Boone electrical application remains an explicit unarchived source gap', () => {
  const electrical = manifest.onlineForms.electricalPermitApplication;
  assert.equal(electrical.listedLabel, 'Electrical Permit Application Form');
  assert.equal(electrical.httpStatus, 404);
  assert.equal(electrical.archiveStatus, 'not_archived_source_unavailable');
  assert.match(electrical.notes, /No repository copy was created and no file hash\/byte count is claimed/i);
  assert.match(manifest.sourceGapReview, /explicit unresolved source gap and was not archived/i);
  assert.equal(manifest.files.length, 6);
  assert.equal(manifest.files.some(file => /ElecApp|electrical/i.test(file.filename)), false);
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
