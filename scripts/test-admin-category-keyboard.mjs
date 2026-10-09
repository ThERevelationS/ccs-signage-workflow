import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getAccessibleAdminGroups, getAdminCategoryKeyboardTarget,
} from '../src/components/admin/adminTabNavigation.js';

const page = readFileSync('src/pages/AdminSettings.jsx', 'utf8');
const search = readFileSync('src/components/admin/AdminSettingsSearch.jsx', 'utf8');

test('Category arrows wrap and Home/End reach boundaries without changing category', () => {
  for (const count of [2, 5]) {
    assert.equal(getAdminCategoryKeyboardTarget('ArrowRight', count-1, count), 0);
    assert.equal(getAdminCategoryKeyboardTarget('ArrowDown', count-1, count), 0);
    assert.equal(getAdminCategoryKeyboardTarget('ArrowLeft', 0, count), count-1);
    assert.equal(getAdminCategoryKeyboardTarget('ArrowUp', 0, count), count-1);
    assert.equal(getAdminCategoryKeyboardTarget('Home', count-1, count), 0);
    assert.equal(getAdminCategoryKeyboardTarget('End', 0, count), count-1);
  }
  assert.equal(getAdminCategoryKeyboardTarget('Tab', 1, 5), null);
  assert.equal(getAdminCategoryKeyboardTarget('Enter', 1, 5), null);
  assert.equal(getAdminCategoryKeyboardTarget(' ', 1, 5), null);
  for(const invalid of [-1,5,NaN]) assert.equal(getAdminCategoryKeyboardTarget('ArrowLeft',invalid,5),null);
  assert.equal(getAdminCategoryKeyboardTarget('ArrowRight',0,0),null);
});

test('Keyboard handling works with both full admin and reduced category counts', () => {
  for (const isAdmin of [true,false]) {
    const groups = getAccessibleAdminGroups(isAdmin);
    const count = groups.length;
    assert.equal(count,isAdmin?5:2);
    for (let i=0;i<count;i++){
      assert.equal(getAdminCategoryKeyboardTarget('ArrowRight',i,count),(i+1)%count);
      assert.equal(getAdminCategoryKeyboardTarget('ArrowLeft',i,count),(i-1+count)%count);
    }
  }
});

test('Category keyboard movement focuses neighbors; only buttons activate changes', () => {
  assert.match(page,/data-admin-category=\{group\.id\}/);
  assert.match(page,/onKeyDown=\{\(event\) => \{/);
  assert.match(page,/getAdminCategoryKeyboardTarget\(event\.key, index, availableAdminGroups\.length\)/);
  assert.match(page,/event\.preventDefault\(\)/);
  assert.match(page,/querySelectorAll\("\[data-admin-category\]"\)\[targetIndex\]\?\.focus\(\)/);
  assert.match(page,/onClick=\{\(\) => \{\s*if \(activeAdminGroup\.id !== group\.id\) handleAdminTabChange\(group\.tabs\[0\]\.value\)/);
});

test('Selected categories and all Admin tab levels show a distinct keyboard focus ring', () => {
  const section=page.slice(page.indexOf('aria-label="Admin navigation categories"'),page.indexOf('<TabsContent value="users">'));
  assert.match(section,/focus-visible:ring-blue-600 focus-visible:ring-offset-2/);
  const triggerTags=page.match(/<TabsTrigger\b[\s\S]*?>/g)||[];
  assert.equal(triggerTags.length,12);
  for(const tag of triggerTags) assert.match(tag,/focus-visible:ring-blue-600 focus-visible:ring-offset-2/);
});

test('Search result dismissal preserves keyboard focus on the existing input',()=>{
  assert.match(search,/useRef\(null\)/);
  assert.match(search,/ref=\{searchInputRef\}/);
  assert.match(search,/searchInputRef\.current\?\.focus\(\)/);
});
