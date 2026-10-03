import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const e = JSON.parse(readFileSync('docs/permitting-boone-ky-enacted-ordinances-2026-authority-check-2026-10-03.json', 'utf8'));

test('2026 enacted-ordinance evidence does not misclassify narrow text amendments as the comprehensive rewrite', () => {
  assert.ok(existsSync(e.enactedOrdinances.repositoryPath));
  const bytes = readFileSync(e.enactedOrdinances.repositoryPath);
  const html = bytes.toString('utf8');

  assert.equal(bytes.length, e.enactedOrdinances.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), e.enactedOrdinances.sha256);
  assert.equal(e.enactedOrdinances.httpStatus, 200);
  assert.equal(e.enactedOrdinances.parsed2026EntryCount, 14);
  assert.equal(e.enactedOrdinances.highestPosted2026OrdinanceNumber, '2026-15');
  assert.equal(e.enactedOrdinances.latestPosted2026OrdinanceDate, '2026-09-23');
  assert.equal(e.enactedOrdinances.rewriteOrArticle34SignEnactmentHits, 0);

  assert.ok(html.includes('Ordinance2026-15'));
  assert.ok(html.includes('2026-02 Mfg Home Text Admendment.pdf'));
  assert.ok(html.includes('2026-01 Truck Parking Text Amendment.pdf'));

  assert.equal(e.narrowZoningTextAmendments.length, 2);
  assert.ok(e.narrowZoningTextAmendments.every((x) => x.rewriteReplacement === false));
  assert.match(e.narrowZoningTextAmendments.find((x) => x.number === '2026-02').scope, /Commercial parking/i);
  assert.match(e.narrowZoningTextAmendments.find((x) => x.number === '2026-03').scope, /Manufactured home/i);

  assert.equal(e.ordinanceDatabase.firstAttemptHttpStatus, 403);
  assert.equal(e.ordinanceDatabase.browserStyleRetryHttpStatus, 403);
  assert.equal(e.ordinanceDatabase.cloudflareChallenge, true);
  assert.equal(e.ordinanceDatabase.bodyArchived, false);
  assert.match(e.ordinanceDatabase.sourceGap, /denial page was not archived as ordinance content/i);

  assert.match(e.authorityFinding, /no description identifies adoption of the 2026 comprehensive zoning ordinance rewrite/i);
  assert.match(e.authorityBoundary, /does not prove that no unposted enactment exists/i);
  assert.match(e.adoptedSignAuthority, /Continue using.*Article 34/i);
});
