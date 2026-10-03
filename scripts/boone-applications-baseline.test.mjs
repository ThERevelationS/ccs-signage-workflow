import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync('docs/permitting-boone-ky-applications-baseline-2026-10-02.json', 'utf8'));
const html = readFileSync(baseline.sourcePage, 'utf8');
const hrefPattern = /href\s*=\s*["']([^"']*Documents\/Applications Forms\/Applications\/([^"'?]+)(?:\?[^"']*)?)["']/gi;
const listed = new Set();
for (const match of html.matchAll(hrefPattern)) listed.add(match[2]);

test('Boone preserved page Applications baseline accounts for every unique listed PDF', () => {
  const baselineFiles = new Set(baseline.applications.map((entry) => entry.sourceFile));
  assert.equal(listed.size, 26);
  assert.deepEqual([...baselineFiles].sort(), [...listed].sort());
  assert.equal(baseline.uniqueListedApplications, 26);
  assert.equal(baseline.accountedApplications, 26);
  assert.equal(baseline.remainingApplications, 0);
  assert.equal(baseline.baselineStatus, 'complete_for_preserved_page');
  assert.equal(baseline.applications.length, 26);

  for (const entry of baseline.applications) {
    assert.equal(entry.status, 'archived');
    assert.ok(entry.repositoryPath && existsSync(entry.repositoryPath), entry.sourceFile + ' archive missing');
    assert.ok(entry.evidencePath && existsSync(entry.evidencePath), entry.sourceFile + ' evidence missing');
    const evidence = JSON.parse(readFileSync(entry.evidencePath, 'utf8'));
    assert.equal(evidence.repositoryPath, entry.repositoryPath);
  }

  assert.match(baseline.scope, /source-file accounting only/i);
  assert.match(baseline.scope, /does not assert that every application applies to a particular sign project/i);
  assert.equal(baseline.nextBaselineCategory, 'none_on_preserved_applications_forms_page');
});

test('Applications reconciliation uses the current archived Seasonal TCD evidence', () => {
  const seasonal = baseline.applications.find((entry) => entry.sourceFile === 'TCDSeasonal.pdf');
  assert.ok(seasonal);
  assert.equal(seasonal.evidencePath, 'docs/permitting-boone-ky-temporary-commercial-display-seasonal-evidence-2026-10-01.json');
  assert.equal(seasonal.repositoryPath, 'public/permitting/sources/boone-ky/temporary-commercial-display-seasonal-2026-10-01.pdf');
});
