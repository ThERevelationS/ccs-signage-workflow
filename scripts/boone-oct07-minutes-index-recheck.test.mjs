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

  const rowFor = (label) => {
    const marker = html.indexOf(label);
    assert.notEqual(marker, -1);
    const start = html.lastIndexOf('<tr>', marker);
    const end = html.indexOf('</tr>', marker);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    return html.slice(start, end + 5);
  };

  const businessRow = rowFor('October 7, 2026 Business Meeting');
  const hearingRow = rowFor('October 7, 2026 Public Hearing');

  assert.ok(businessRow.includes('>Agenda</a>'));
  assert.ok(businessRow.includes('>Minutes</td>'));
  assert.ok(!businessRow.includes('>Minutes</a>'));

  assert.ok(hearingRow.includes('>Agenda</a>'));
  assert.ok(hearingRow.includes('>Minutes</td>'));
  assert.ok(!hearingRow.includes('>Minutes</a>'));

  assert.equal(evidence.october7BusinessMeeting.minutesLinked, false);
  assert.equal(evidence.october7PublicHearing.minutesLinked, false);
  assert.match(evidence.authorityBoundary, /current index-link status only/i);
  assert.match(evidence.authorityBoundary, /does not establish that minutes do not exist elsewhere/i);
  assert.equal(evidence.nextOfficialAuthorityTarget.body, 'Boone County Fiscal Court');
  assert.equal(evidence.nextOfficialAuthorityTarget.minutesPath, 'government/boone_county_fiscal_court/fiscal_court_meeting_minutes.php');
  assert.match(evidence.adoptedSignAuthority, /Continue using.*adopted.*Article 34/i);
});
