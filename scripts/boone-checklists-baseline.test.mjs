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
  assert.equal(baseline.accountedChecklists, 5);
  assert.equal(baseline.remainingChecklists, 0);
  assert.equal(baseline.baselineStatus, 'complete_for_preserved_page');
  const archived = baseline.checklists.filter((entry) => entry.status === 'archived');
  const gaps = baseline.checklists.filter((entry) => entry.status === 'source_unavailable');
  assert.equal(archived.length, 4);
  assert.equal(gaps.length, 1);
  for (const entry of archived) {
    assert.ok(entry.repositoryPath && existsSync(entry.repositoryPath));
    assert.ok(entry.evidencePath && existsSync(entry.evidencePath));
  }
  for (const entry of gaps) {
    assert.equal(entry.repositoryPath, null);
    assert.ok(entry.evidencePath && existsSync(entry.evidencePath));
  }
  assert.deepEqual(gaps.map((entry) => entry.sourceFile), ['Variance_checklist.pdf']);
  assert.equal(baseline.nextChecklist, null);
  assert.equal(baseline.nextBaselineCategory, 'Applications');
  assert.match(baseline.scope, /accounts for every unique PDF linked/i);
  assert.match(baseline.scope, /does not assert that any checklist applies to a particular sign project/i);
});
