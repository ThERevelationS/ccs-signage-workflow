import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('docs/permitting-boone-ky-zoning-rewrite-adoption-records-target-2026-10-03.json', 'utf8'));
const homepage = readFileSync(evidence.sourcePage, 'utf8');

test('Boone rewrite adoption discovery target is official and bounded', () => {
  assert.equal(evidence.officialRecordsPath, 'commission_boards/meeting_agendas.php');
  assert.match(homepage, /commission_boards\/meeting_agendas\.php[^>]*>Meeting Agendas and Minutes</i);
  assert.deepEqual(evidence.targetWindow, ['2026-09', '2026-10']);
  assert.equal(evidence.retrievalStatus, 'not_verified_in_this_chunk');
  assert.match(evidence.retrievalNote, /tool failure is not recorded as source evidence/i);
  assert.match(evidence.currentAuthorityBoundary, /Do not promote draft\/rewrite text/i);
  assert.match(evidence.scope, /does not claim that adoption did or did not occur/i);
});
