import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverOfficialPermittingResources,
  isDownloadableResearchDocument,
  permittingDocumentType,
} from '../base44/shared/jurisdictionPermittingLinkDiscovery.mjs';

test('official zoning forms page yields index, application, fee, and zoning resources', () => {
  const html = `
    <html><body>
      <a href="/files/Zoning-Permit-Application.pdf">Zoning Permit Application</a>
      <a href="/files/Zoning-Fee-Schedule.pdf">Zoning Fee Schedule</a>
      <a href="/government/department/zoning/zoning_resolution.php">Zoning Resolution</a>
      <a href="/parks">Parks and Recreation</a>
      <a href="https://example.com/external-permit.pdf">External Permit</a>
    </body></html>`;
  const pageUrl = 'https://www.morrowcountyohio.gov/government/department/zoning/zoning_forms.php';
  const docs = discoverOfficialPermittingResources(html, pageUrl);

  assert.equal(docs.length, 4);
  assert.equal(docs[0].url, pageUrl);
  assert.equal(docs[0].doc_type, 'permit_application');
  assert.equal(docs[1].doc_type, 'permit_application');
  assert.equal(docs[2].doc_type, 'fee_schedule');
  assert.equal(docs[3].doc_type, 'zoning_code');
  assert.equal(docs.some((doc) => doc.url.includes('example.com')), false);
  assert.equal(docs.some((doc) => doc.url.endsWith('/parks')), false);
});

test('www and bare versions of the same official hostname are accepted', () => {
  const docs = discoverOfficialPermittingResources(
    '<a href="https://morrowcountyohio.gov/files/sign-application.pdf">Sign Permit Application</a>',
    'https://www.morrowcountyohio.gov/zoning/forms.php',
  );
  assert.equal(docs.length, 2);
  assert.equal(docs[1].doc_type, 'permit_application');
});

test('only actual downloadable file URLs are archive candidates', () => {
  assert.equal(isDownloadableResearchDocument({ url: 'https://gov.example/forms/sign.pdf' }), true);
  assert.equal(isDownloadableResearchDocument({ url: 'https://gov.example/apply?permit=sign' }), false);
  assert.equal(isDownloadableResearchDocument({ url: 'https://gov.example/zoning/forms.php' }), false);
  assert.equal(permittingDocumentType({ title: 'Sign Ordinance', url: 'https://gov.example/code/signs' }), 'sign_ordinance');
});
