import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const e = JSON.parse(readFileSync('docs/permitting-boone-ky-fiscal-court-oct06-authority-check-2026-10-03.json', 'utf8'));

test('Oct 6 Fiscal Court agenda preserves a bounded pre-meeting no-rewrite-item finding', () => {
  assert.ok(existsSync(e.minutesIndex.repositoryPath));
  assert.ok(existsSync(e.agenda.repositoryPath));
  assert.ok(existsSync(e.agenda.extractedTextPath));

  const indexBytes = readFileSync(e.minutesIndex.repositoryPath);
  const agendaBytes = readFileSync(e.agenda.repositoryPath);
  const agendaText = readFileSync(e.agenda.extractedTextPath, 'utf8');
  const visibleIndex = indexBytes.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/ +/g, ' ');

  assert.equal(indexBytes.length, e.minutesIndex.bytes);
  assert.equal(createHash('sha256').update(indexBytes).digest('hex'), e.minutesIndex.sha256);
  assert.equal(agendaBytes.length, e.agenda.bytes);
  assert.equal(createHash('sha256').update(agendaBytes).digest('hex'), e.agenda.sha256);
  assert.equal(agendaBytes.subarray(0, 5).toString('ascii'), '%PDF-');

  assert.equal(e.minutesIndex.latestLinked2026RegularMeetingMinutes, '2026-09-08');
  assert.ok(visibleIndex.includes('09/08/2026 Regular Meeting'));
  assert.ok(indexBytes.toString('utf8').includes('September 8, 2026 Minutes.pdf'));

  assert.equal(e.agenda.meetingDate, '2026-10-06');
  assert.ok(agendaText.includes('ITEM IV.            ORDINANCES'));
  assert.ok(agendaText.includes('A. None.'));
  assert.ok(agendaText.includes('NEXT FISCAL COURT MEETING – Tuesday, October 20, 2026 @ 5:30 pm'));
  assert.ok(agendaText.includes('MINUTES FROM THE FISCAL COURT MEETING OF SEPTEMBER 22, 2026'));
  assert.ok(agendaText.includes('FISCAL COURT CAUCUS MEETING OF SEPTEMBER 24, 2026'));

  for (const count of Object.values(e.agenda.reviewTerms)) assert.equal(count, 0);
  assert.equal(e.rewriteAdoptionItemFound, false);
  assert.ok(e.authorityBoundary.includes('upcoming October 6, 2026 meeting'));
  assert.ok(e.authorityBoundary.includes('does not establish what action may ultimately occur'));
  assert.ok(e.minutesBoundary.includes('absence of later links on the index is not treated as proof'));
  assert.ok(e.adoptedSignAuthority.includes('Article 34'));
});
