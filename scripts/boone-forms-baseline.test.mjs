import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync('docs/permitting-boone-ky-forms-baseline-2026-10-02.json', 'utf8'));
const html = readFileSync(manifest.sourcePage, 'utf8');

test('Boone Forms baseline accounts for every unique preserved Forms PDF', () => {
  const files = [...html.matchAll(/Documents\/Applications Forms\/Forms\/([^"'<>]+\.pdf)/gi)].map((m) => m[1]);
  const uniqueFiles = [...new Set(files)];
  assert.deepEqual([...uniqueFiles].sort(), ['45DayWaiver.pdf', 'ExtSitePlan.pdf', 'PublicRecordsRequest.pdf', 'SpecialBM.pdf'].sort());
  assert.equal(manifest.uniqueListedForms, uniqueFiles.length);
  assert.equal(manifest.accountedForms, uniqueFiles.length);
  assert.equal(manifest.baselineStatus, 'complete_for_preserved_page');

  const entries = new Map(manifest.forms.map((entry) => [entry.sourceFile, entry]));
  assert.deepEqual([...entries.keys()].sort(), [...uniqueFiles].sort());

  for (const entry of manifest.forms) {
    assert.equal(existsSync(entry.evidencePath), true, `missing evidence for ${entry.sourceFile}`);
    const evidence = JSON.parse(readFileSync(entry.evidencePath, 'utf8'));

    if (entry.status === 'archived') {
      assert.ok(entry.repositoryPath);
      assert.equal(existsSync(entry.repositoryPath), true);
      const bytes = readFileSync(entry.repositoryPath);
      assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.equal(bytes.length, evidence.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
    } else {
      assert.equal(entry.status, 'source_unavailable');
      assert.equal(entry.repositoryPath, null);
      assert.equal(evidence.archiveStatus, 'not_archived_source_unavailable');
      assert.equal(evidence.repositoryPath, null);
    }
  }

  assert.match(manifest.duplicateListingNote, /SpecialBM\.pdf appears more than once/i);
  assert.match(manifest.scope, /every unique PDF linked under Documents\/Applications Forms\/Forms\//i);
  assert.match(manifest.scope, /does not assert that these forms are required for any particular sign project/i);
  assert.equal(manifest.nextBaselineCategory, 'Checklists');
});
