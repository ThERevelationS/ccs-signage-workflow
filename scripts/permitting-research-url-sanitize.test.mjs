import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeJurisdictionResearch } from '../base44/shared/jurisdictionResearchSanitizer.ts';

test('non-URL permitting/website/cagis strings are nulled rather than stored', () => {
  const out = sanitizeJurisdictionResearch({
    permitting_url: 'INFORMATION NOT FOUND',
    website_url: 'call 555-1234 for zoning',
    cagis_database_url: 'see county website',
    ai_summary: 'No online permitting source located.',
  });
  assert.equal(out.permitting_url, null);
  assert.equal(out.website_url, null);
  assert.equal(out.cagis_database_url, null);
  assert.equal(out.ai_summary, 'No online permitting source located.');
});

test('valid http(s) URLs survive; other schemes are rejected', () => {
  const out = sanitizeJurisdictionResearch({
    permitting_url: 'https://www.greenecountyohio.gov/index.aspx?NID=139',
    website_url: 'http://lakecountyohio.gov/building-inspection',
    cagis_database_url: 'ftp://example.com/x',
  });
  assert.equal(out.permitting_url, 'https://www.greenecountyohio.gov/index.aspx?NID=139');
  assert.equal(out.website_url, 'http://lakecountyohio.gov/building-inspection');
  assert.equal(out.cagis_database_url, null);
});

test('mailto/javascript/relative strings are not stored as URLs', () => {
  const out = sanitizeJurisdictionResearch({
    permitting_url: 'mailto:zoning@example.gov',
    website_url: 'javascript:void(0)',
    cagis_database_url: '/relative/path',
  });
  assert.equal(out.permitting_url, null);
  assert.equal(out.website_url, null);
  assert.equal(out.cagis_database_url, null);
});
