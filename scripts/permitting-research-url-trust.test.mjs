import test from 'node:test';
import assert from 'node:assert/strict';
import { gateResearchSourceUrls, isGovernmentHost } from '../base44/shared/permittingResearchUrlTrust.mjs';

test('government host detection accepts .gov and state locality .us only', () => {
  for (const h of ['city.gov', 'greenecountyohio.gov', 'ci.example.oh.us']) assert.equal(isGovernmentHost(h), true, h);
  for (const h of ['evil.example', 'gov.evil.com', 'evil.us', 'evilgov', 'city.gov.evil.com', null]) assert.equal(isGovernmentHost(h), false, String(h));
});

test('established host is kept; a different host (even .gov) is held for review', () => {
  const profile = { permitting_url: 'https://www.city.gov/permits', website_url: 'https://city.gov/' };
  const same = gateResearchSourceUrls(profile, { permitting_url: 'https://city.gov/zoning', website_url: 'https://www.city.gov/home' });
  assert.equal(same.research.permitting_url, 'https://city.gov/zoning');
  assert.equal(same.research.website_url, 'https://www.city.gov/home');
  assert.deepEqual(same.review, []);
  const moved = gateResearchSourceUrls(profile, { permitting_url: 'https://evil.example/permits', website_url: 'https://other.gov/' });
  assert.equal(moved.research.permitting_url, null);
  assert.equal(moved.research.website_url, null);
  assert.deepEqual(moved.review.map(r => r.reason), ['host_change_requires_review', 'host_change_requires_review']);
});

test('profile without a saved host accepts only vetted government domains', () => {
  const r = gateResearchSourceUrls({}, { permitting_url: 'https://county.gov/zoning', website_url: 'https://county-official.com/' });
  assert.equal(r.research.permitting_url, 'https://county.gov/zoning');
  assert.equal(r.research.website_url, null);
  assert.equal(r.review[0].reason, 'unvetted_host_requires_review');
});

test('documents are limited to trusted, government or code-publisher hosts', () => {
  const r = gateResearchSourceUrls({ permitting_url: 'https://village-site.org/p' }, { documents: [
    { url: 'https://village-site.org/a.pdf', title: 'A' }, { url: 'https://library.municode.com/oh/x', title: 'Code' },
    { url: 'https://state.gov/b.pdf', title: 'B' }, { url: 'https://evil.example/c.pdf', title: 'C' }, { url: 'javascript:alert(1)', title: 'D' },
  ] });
  assert.deepEqual(r.research.documents.map(d => d.title), ['A', 'Code', 'B']);
  assert.equal(r.review.filter(x => x.field === 'documents').length, 2);
});

test('parent county and CAGIS URLs are gated against their own saved hosts', () => {
  const r = gateResearchSourceUrls({ parent_county: { website_url: 'https://county.gov/' }, cagis_database_url: 'https://cagis.tax.ohio.gov/x' }, {
    cagis_database_url: 'https://evil.example/cagis',
    parent_county: { name: 'County', website_url: 'https://evil.example/', permitting_url: 'https://county.gov/zoning', documents: [{ url: 'https://evil.example/d.pdf', title: 'D' }] },
  });
  assert.equal(r.research.cagis_database_url, null);
  assert.equal(r.research.parent_county.website_url, null);
  assert.equal(r.research.parent_county.permitting_url, 'https://county.gov/zoning');
  assert.deepEqual(r.research.parent_county.documents, []);
  assert.equal(r.research.parent_county.name, 'County');
});

test('credentialed URLs cannot smuggle an attacker host past the gate', () => {
  const r = gateResearchSourceUrls({ permitting_url: 'https://city.gov/p' }, { permitting_url: 'https://city.gov@evil.example/p', website_url: 'https://u:p@city.gov/' });
  assert.equal(r.research.permitting_url, null);
  assert.equal(r.research.website_url, null);
  assert.deepEqual(r.review.map(x => x.reason), ['credentials_in_url_require_review', 'credentials_in_url_require_review']);
});
