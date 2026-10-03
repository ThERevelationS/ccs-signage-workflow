import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pageBaseline = JSON.parse(readFileSync('docs/permitting-boone-ky-applications-forms-page-baseline-2026-10-02.json', 'utf8'));

test('Boone Applications and Forms page has three independently complete permitting categories', () => {
  assert.equal(pageBaseline.baselineStatus, 'complete_for_preserved_page');
  assert.deepEqual(pageBaseline.categories.map((x) => x.name), ['Checklists', 'Applications', 'Forms']);
  assert.equal(pageBaseline.totalUniqueCategoryEntries, 35);
  assert.equal(pageBaseline.totalAccountedCategoryEntries, 35);
  assert.equal(pageBaseline.remainingCategoryEntries, 0);

  let unique = 0;
  let accounted = 0;
  for (const category of pageBaseline.categories) {
    assert.ok(existsSync(category.baselinePath), category.name + ' baseline missing');
    const child = JSON.parse(readFileSync(category.baselinePath, 'utf8'));
    assert.equal(child.baselineStatus, 'complete_for_preserved_page');
    assert.equal(category.remaining, 0);
    unique += category.uniqueListed;
    accounted += category.accounted;
  }
  assert.equal(unique, pageBaseline.totalUniqueCategoryEntries);
  assert.equal(accounted, pageBaseline.totalAccountedCategoryEntries);
  assert.match(pageBaseline.navigationScopeNote, /not a fourth Applications\/Forms permitting category/i);
  assert.match(pageBaseline.scope, /does not assert that every listed document applies to a particular sign project/i);
  assert.match(pageBaseline.nextResearchRule, /exclude unrelated global-navigation documents/i);
});
