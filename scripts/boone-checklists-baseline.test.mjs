import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync('docs/permitting-boone-ky-checklists-baseline-2026-10-02.json', 'utf8'));
const html = readFileSync(baseline.sourcePage, 'utf8');
const hrefPattern = /href\s*=\s*["']([^"']*Documents\/Applications Forms\/Checklists\/([^"'?]+)(?:\?[^"']*)?)["']/gi;
const listed = new Set();
for (const match of html.matchAll(hrefPattern)) listed.add(match[2]);

test('Boone preserved page checklist baseline is complete and bounded', () => {
  const baselineFiles = new Set(baseline.checklists.map((entry) => entry.sourceFile));
  assert.equal(listed.size, 5);
  assert.deepEqual([...baselineFiles].sort(), [...listed].sort());
  assert.equal(baseline.uniqueListedChecklists, listed.size);
  assert.equal(baseline.accountedChecklists, 4);
  assert.equal(baseline.remainingChecklists, 1);
  assert.equal(baseline.baselineStatus, 'in_progress_for_preserved_page');
  const archived = baseline.checklists.filter((entry) => entry.status === 'archived');
  const gaps = baseline.checklists.filter((entry) => entry.status === 'source_unavailable');
  const pending = baseline.checklists.filter((entry) => entry.status === 'pending_verification');
  assert.equal(archived.length, 3);
  assert.equal(gaps.length, 1);
  assert.equal(pending.length, 1);
  for (const entry of archived) {
    assert.ok(entry.repositoryPath && existsSync(entry.repositoryPath));
    assert.ok(entry.evidencePath && existsSync(entry.evidencePath));
  }
  for (const entry of gaps) {
    assert.equal(entry.repositoryPath, null);
    assert.ok(entry.evidencePath && existsSync(entry.evidencePath));
  }
  assert.deepEqual(gaps.map((entry) => entry.sourceFile), ['Variance_checklist.pdf']);
  assert.deepEqual(pending.map((entry) => entry.sourceFile), ['ZoningMapAmendment_checklist.pdf']);
  assert.equal(baseline.nextChecklist, 'ZoningMapAmendment_checklist.pdf');
  assert.match(baseline.scope, /does not assert that any checklist applies to a particular sign project/i);
});
