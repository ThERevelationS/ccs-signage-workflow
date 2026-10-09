import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAdminSearchKeyboardIndex } from '../src/components/admin/adminTabNavigation.js';

const ui = readFileSync('src/components/admin/AdminSettingsSearch.jsx', 'utf8');

test('Up/Down selects first/last and cycles through visible search results', () => {
  for (const count of [1, 2, 8]) {
    assert.equal(getAdminSearchKeyboardIndex('ArrowDown', -1, count), 0);
    assert.equal(getAdminSearchKeyboardIndex('ArrowUp', -1, count), count - 1);
    assert.equal(getAdminSearchKeyboardIndex('ArrowDown', count - 1, count), 0);
    assert.equal(getAdminSearchKeyboardIndex('ArrowUp', 0, count), count - 1);
    for (let index = 1; index < count; index += 1) {
      assert.equal(getAdminSearchKeyboardIndex('ArrowUp', index, count), index - 1);
      assert.equal(getAdminSearchKeyboardIndex('ArrowDown', index - 1, count), index);
    }
  }
});

test('No-result and unrelated keys do not capture normal search input behavior', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(getAdminSearchKeyboardIndex(key, 0, 0), null);
  }
  for (const key of ['Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight', ' ']) {
    assert.equal(getAdminSearchKeyboardIndex(key, -1, 3), null);
  }
  assert.equal(getAdminSearchKeyboardIndex('ArrowDown', NaN, 3), null);
  assert.equal(getAdminSearchKeyboardIndex('ArrowUp', 0, -1), null);
});

test('Search keeps input focus, changes selection visually, and announces current result', () => {
  assert.match(ui, /const \[activeIndex, setActiveIndex\] = useState\(-1\)/);
  assert.match(ui, /getAdminSearchKeyboardIndex\(event\.key, activeIndex, results\.length\)/);
  assert.match(ui, /if \(nextIndex !== null\) \{\s*event\.preventDefault\(\);/);
  assert.match(ui, /openResult\(selectedResult \|\| results\[0\]\)/);
  assert.match(ui, /data-admin-search-active=\{index === activeIndex \? "true" : "false"\}/);
  assert.match(ui, /id=\{searchStatusId\} role="status" aria-live="polite"/);
  assert.match(ui, /aria-describedby=\{hasQuery \? searchStatusId : undefined\}/);
  assert.match(ui, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
});

test('Selection resets on query edits, Escape, clear button and activation', () => {
  const resets = ui.match(/setActiveIndex\(-1\)/g) || [];
  assert.ok(resets.length >= 4, `Expected four reset paths, found ${resets.length}`);
  assert.match(ui, /searchInputRef\.current\?\.focus\(\)/);
});

test('Search input explicitly identifies its active option using combobox semantics', () => {
  assert.match(ui, /role="combobox"/);
  assert.match(ui, /aria-autocomplete="list"/);
  assert.match(ui, /aria-expanded=\{hasResults\}/);
  assert.match(ui, /aria-controls=\{hasResults \? resultsListId : undefined\}/);
  assert.match(ui, /aria-activedescendant=\{selectedResult \?/);
  assert.match(ui, /role="listbox"/);
  assert.match(ui, /id=\{resultsListId\}/);
  assert.match(ui, /role="option"/);
  assert.match(ui, /aria-selected=\{index === activeIndex\}/);
  assert.match(ui, /id=\{\`\$\{resultsListId\}-option-\$\{index\}\`\}/);
});
