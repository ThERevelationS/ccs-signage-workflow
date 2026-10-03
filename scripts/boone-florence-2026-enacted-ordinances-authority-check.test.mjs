import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const e = JSON.parse(readFileSync('docs/permitting-boone-ky-florence-2026-enacted-ordinances-authority-check-2026-10-03.json', 'utf8'));

test('Florence 2026 enacted-ordinance evidence keeps narrow text amendments separate from the comprehensive rewrite', () => {
  assert.equal(e.jurisdiction, 'City of Florence, Kentucky');
  assert.equal(e.legislativeBody, 'Florence City Council');
  assert.equal(e.officialSource.freshOfficialPageReview, true);
  assert.equal(e.officialSource.directArchiveAttemptHttpStatus, 403);
  assert.equal(e.officialSource.repositorySnapshotArchived, false);
  assert.match(e.officialSource.archiveGap, /No denial\/challenge body is treated as ordinance content/i);

  assert.equal(e.latestReviewed2026EnactedOrdinance.number, 'O-21-2026');
  assert.equal(e.latestReviewed2026EnactedOrdinance.enactedDate, '2026-09-01');
  assert.equal(e.reviewed2026ZoningTextAmendments.length, 2);

  const parking = e.reviewed2026ZoningTextAmendments.find((x) => x.number === 'O-3-2026');
  const homes = e.reviewed2026ZoningTextAmendments.find((x) => x.number === 'O-6-2026');
  assert.ok(parking && homes);
  assert.match(parking.scope, /Commercial parking/i);
  assert.match(homes.scope, /Manufactured home/i);
  assert.ok(e.reviewed2026ZoningTextAmendments.every((x) => x.comprehensiveRewrite === false));
  assert.ok(e.reviewed2026ZoningTextAmendments.every((x) => x.article34Replacement === false));

  assert.equal(e.rewriteOrArticle34SignEnactmentFound, false);
  assert.match(e.authorityFinding, /no Article 34 or sign-regulation enactment/i);
  assert.match(e.authorityFinding, /must not be classified as the comprehensive rewrite/i);
  assert.match(e.authorityBoundary, /does not prove that no unposted ordinance exists/i);
  assert.match(e.adoptedSignAuthority, /Continue using.*Article 34/i);
  assert.match(e.nextLogicalAuthorityTarget, /City of Union/i);
});
