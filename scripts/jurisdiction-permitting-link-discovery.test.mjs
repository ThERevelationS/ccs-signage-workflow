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

test('Revize base URL, spaced href attributes, and underscore/plural classification', () => {
  const docs = discoverOfficialPermittingResources('<base href="https://county.gov/"><a href= "Zoning/Zoning Permit Application.pdf">Zoning Permit Application</a><a href="Zoning/zoning_regulations.php">Zoning Regulations</a><a href="Zoning/fee_schedule.pdf">Fees</a><a href="Zoning/submittal_requirements.pdf">Submittal Requirements</a>', 'https://county.gov/government/zoning/forms.php');
  assert.equal(docs.length, 5);
  assert.equal(docs[1].url, 'https://county.gov/Zoning/Zoning%20Permit%20Application.pdf');
  assert.equal(docs.find(d => d.title === 'Zoning Regulations').doc_type, 'zoning_code');
  assert.equal(docs.find(d => d.title === 'Fees').doc_type, 'fee_schedule');
  assert.equal(docs.find(d => d.title === 'Submittal Requirements').doc_type, 'checklist');
});

test('parent zoning directory cannot make unrelated navigation relevant', () => {
  const docs = discoverOfficialPermittingResources('<a href="index.php">Home</a><a href="schools.php">County Schools</a><a href="calendar.php">Calendar</a><a href="forms.php#">French</a><a href="house.pdf">House Numbering Form</a><a href="sign_application.pdf">Sign Application</a>', 'https://county.gov/zoning/forms.php');
  assert.equal(docs.length, 2);
  assert.equal(docs[1].title, 'Sign Application');
});

test('malicious base tags and credential/external links stay outside discovery', () => {
  const docs = discoverOfficialPermittingResources('<base href="https://evil.test/"><a href="sign.pdf">Sign Form</a><a href="https://user:pass@county.gov/permit.pdf">Permit</a><a href="https://other.gov/code">Code</a>', 'https://county.gov/zoning/forms.php');
  assert.equal(docs.length, 2);
  assert.equal(docs[1].url, 'https://county.gov/zoning/sign.pdf');
});

test('files precede navigation when bounded links fill up; zero budget stays empty', () => {
  const html = '<a href="/zoning">Zoning Department</a><a href="/permit.pdf">Permit Application</a><a href="/signs.pdf">Signs Ordinance</a>';
  const docs = discoverOfficialPermittingResources(html, 'https://county.gov/forms', { maxLinks: 2 });
  assert.equal(docs.length, 2);
  assert.equal(docs[1].url, 'https://county.gov/permit.pdf');
  assert.deepEqual(discoverOfficialPermittingResources(html, 'https://county.gov/forms', { maxLinks: 0 }), []);
});

test('script/comment pseudo-anchors never become evidence', () => {
  const docs = discoverOfficialPermittingResources('<script>const html = "<a href=\'/fake-permit.pdf\'>Permit</a>";</script><!-- <a href="/old-sign.pdf">Sign</a> -->', 'https://county.gov/forms');
  assert.equal(docs.length, 1);
});

test('employment and sign-up navigation are not permitting resources', () => {
  const docs = discoverOfficialPermittingResources('<a href="/how_do_i_/apply_for___obtain/employment_opportunities.php">Employment Opportunities</a><a href="/enotify/index.php">E-Alert Sign-up</a><a href="/signs_application.pdf">Signs Application</a>', 'https://county.gov/forms');
  assert.equal(docs.length, 2);
  assert.equal(docs[1].title, 'Signs Application');
});
