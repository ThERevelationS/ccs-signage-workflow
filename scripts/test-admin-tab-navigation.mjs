import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAccessibleAdminTab } from '../src/components/admin/adminTabNavigation.js';

const page = readFileSync(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8');
const listTags = page.match(/<TabsList\b[^>]*>/g) || [];
const triggerTags = page.match(/<TabsTrigger\b[^>]*>/g) || [];
const mainNav = page.slice(page.indexOf('<Tabs value={selectedAdminTab}'), page.indexOf('<TabsContent value="users">'));
const mainTabIds = [...mainNav.matchAll(/<TabsTrigger value="([^"]+)"/g)].map((match) => match[1]);
const contentIds = new Set([...page.matchAll(/<TabsContent value="([^"]+)"/g)].map((match) => match[1]));

test('Admin main navigation retains all 15 tabs and content panels', () => {
  assert.equal(mainTabIds.length, 15);
  assert.equal(new Set(mainTabIds).size, mainTabIds.length);
  for (const id of mainTabIds) assert.ok(contentIds.has(id), `Missing content for ${id}`);
});

test('Admin tab bars grow and wrap inside a bounded container', () => {
  assert.equal(listTags.length, 3);
  for (const list of listTags) {
    for (const className of ['h-auto', 'w-full', 'max-w-full', 'flex-wrap', 'justify-start']) {
      assert.ok(list.includes(className), `${className} missing in ${list}`);
    }
    assert.match(list, /aria-label="[^"]+"/);
  }
  assert.match(page, /clay-card w-full min-w-0 max-w-full/);
  assert.equal(triggerTags.length, 26);
  for (const trigger of triggerTags) {
    for (const className of ['max-w-full', 'min-h-10', 'whitespace-normal']) {
      assert.ok(trigger.includes(className), `${className} missing in ${trigger}`);
    }
  }
});

test('Selected tab follows URL changes instead of being frozen at mount', () => {
  assert.match(page, /useSearchParams\(\)/);
  assert.match(page, /<Tabs value=\{selectedAdminTab\} onValueChange=\{handleAdminTabChange\}/);
  assert.match(page, /updated\.set\("tab", nextTab\)/);
});

test('Deep link selection respects current user role and unknown tabs', () => {
  for (const id of mainTabIds) {
    assert.equal(getAccessibleAdminTab(id, true), id);
  }
  for (const id of ['automations', 'users', 'task_assignments', 'calendar', 'activity']) {
    assert.equal(getAccessibleAdminTab(id, false), id);
  }
  for (const id of ['timeclock', 'backend', 'smartsheet', 'sync_conflicts', 'resources', 'permitting_tests']) {
    assert.equal(getAccessibleAdminTab(id, false), 'automations');
  }
  assert.equal(getAccessibleAdminTab('not_a_real_tab', true), 'automations');
  assert.equal(getAccessibleAdminTab(null, true), 'automations');
});
