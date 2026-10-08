import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ADMIN_TAB_GROUPS,
  getAccessibleAdminGroups,
  getAccessibleAdminTab,
  getAdminGroupForTab,
} from '../src/components/admin/adminTabNavigation.js';

const page = readFileSync(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8');
const listTags = page.match(/<TabsList\b[^>]*>/g) || [];
const triggerTags = page.match(/<TabsTrigger\b[^>]*>/g) || [];
const mainNav = page.slice(page.indexOf('<Tabs value={selectedAdminTab}'), page.indexOf('<TabsContent value="users">'));
const allTabs = ADMIN_TAB_GROUPS.flatMap((group) => group.tabs);
const contentIds = new Set([...page.matchAll(/<TabsContent value="([^"]+)"/g)].map((match) => match[1]));

test('Five categorized groups preserve all 15 Admin pages and their panels', () => {
  assert.deepEqual(ADMIN_TAB_GROUPS.map((group) => group.id), ['workflow', 'people', 'integrations', 'permitting', 'system']);
  assert.equal(allTabs.length, 15);
  assert.equal(new Set(allTabs.map((tab) => tab.value)).size, allTabs.length);
  for (const tab of allTabs) {
    assert.ok(contentIds.has(tab.value), `Missing panel for ${tab.value}`);
    assert.equal(getAccessibleAdminTab(tab.value, true), tab.value);
    assert.ok(getAdminGroupForTab(tab.value, true));
  }
  assert.ok(Math.max(...ADMIN_TAB_GROUPS.map((group) => group.tabs.length)) <= 4);
});

test('Non-admin navigation omits restricted pages and empty categories', () => {
  const groups = getAccessibleAdminGroups(false);
  assert.deepEqual(groups.map((group) => group.id), ['workflow', 'people']);
  const available = groups.flatMap((group) => group.tabs.map((tab) => tab.value));
  assert.deepEqual(available, ['automations', 'task_assignments', 'calendar', 'activity', 'users']);
  for (const tab of allTabs) {
    assert.equal(getAccessibleAdminTab(tab.value, false), tab.adminOnly ? 'automations' : tab.value);
  }
  assert.equal(getAdminGroupForTab('smartsheet', false), 'workflow');
  assert.equal(getAccessibleAdminTab('missing', true), 'automations');
  assert.equal(getAccessibleAdminTab(null, true), 'automations');
});

test('Category navigation stays synchronized to the selected URL tab', () => {
  assert.match(page, /useSearchParams\(\)/);
  assert.match(page, /<Tabs value=\{selectedAdminTab\} onValueChange=\{handleAdminTabChange\}/);
  assert.match(page, /updated\.set\("tab", nextTab\)/);
  assert.match(mainNav, /role="group" aria-label="Admin navigation categories"/);
  assert.match(mainNav, /availableAdminGroups\.map\(\(group\) =>/);
  assert.match(mainNav, /aria-pressed=\{activeAdminGroup\.id === group\.id\}/);
  assert.match(mainNav, /handleAdminTabChange\(group\.tabs\[0\]\.value\)/);
  assert.match(mainNav, /activeAdminGroup\.tabs\.map\(\(tab\) =>/);
  assert.match(mainNav, /value=\{tab\.value\}/);
  assert.match(page, /getAdminGroupForTab\(selectedAdminTab, isAdmin\)/);
});

test('Category and nested tab bars remain bounded on small screens', () => {
  assert.equal(listTags.length, 3);
  for (const list of listTags) {
    for (const className of ['h-auto', 'w-full', 'max-w-full', 'flex-wrap', 'justify-start']) {
      assert.ok(list.includes(className), `${className} missing in ${list}`);
    }
    assert.match(list, /aria-label=/);
  }
  assert.match(mainNav, /flex min-w-0 flex-wrap items-center/);
  assert.match(mainNav, /clay-card w-full min-w-0 max-w-full/);
  assert.equal(triggerTags.length, 12); // One mapped main trigger plus eleven nested triggers.
  for (const trigger of triggerTags) {
    for (const className of ['max-w-full', 'min-h-10', 'whitespace-normal']) {
      assert.ok(trigger.includes(className), `${className} missing in ${trigger}`);
    }
  }
});
