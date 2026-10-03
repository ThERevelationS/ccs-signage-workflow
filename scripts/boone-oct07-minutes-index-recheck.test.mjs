import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-oct07-minutes-index-recheck-2026-10-03.json', 'utf8'));
const snapshot = readFileSync(evidence.priorSnapshotPath);
const html = snapshot.toString('utf8');

test('Oct 7 minutes recheck preserves unchanged index status and a bounded legislative next target', () => {
  assert.equal(evidence.liveHttpStatus, 200);
  assert.equal(evidence.liveBytes, snapshot.length);
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), evidence.liveSha256);
  assert.equal(evidence.matchesPriorSnapshot, true);

  const businessRow = html.match(/<tr>[sS]*?October 7, 2026 Business Meeting[sS]*?</tr>/i)?.[0] ?? '';
  const hearingRow = html.match(/<tr>[sS]*?October 7, 2026 Public Hearing[sS]*?</tr>/i)?.[0] ?? '';

  assert.match(businessRow, />Agenda</a>/i);
  assert.match(businessRow, /<td[^>]*>s*Minutess*</td>/i);
  assert.doesNotMatch(businessRow, />Minutes</a>/i);

  assert.match(hearingRow, />Agenda</a>/i);
  assert.match(hearingRow, /<td[^>]*>s*Minutess*</td>/i);
  assert.doesNotMatch(hearingRow, />Minutes</a>/i);

  assert.equal(evidence.october7BusinessMeeting.minutesLinked, false);
  assert.equal(evidence.october7PublicHearing.minutesLinked, false);
  assert.match(evidence.authorityBoundary, /current index-link status only/i);
  assert.match(evidence.authorityBoundary, /does not establish that minutes do not exist elsewhere/i);
  assert.equal(evidence.nextOfficialAuthorityTarget.body, 'Boone County Fiscal Court');
  assert.equal(evidence.nextOfficialAuthorityTarget.minutesPath, 'government/boone_county_fiscal_court/fiscal_court_meeting_minutes.php');
  assert.match(evidence.adoptedSignAuthority, /Continue using.*adopted.*Article 34/i);
});
