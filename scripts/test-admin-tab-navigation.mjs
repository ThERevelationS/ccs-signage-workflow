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
// Callback refs include `=>`, so collect each opening tag through className.
const listTags = page.match(/<TabsList\b[\s\S]*?className="[^"]*"/g) || [];
const triggerTags = page.match(/<TabsTrigger\b[^>]*>/g) || [];
const mainNav = page.slice(page.indexOf('<Tabs value={selectedAdminTab}'), page.indexOf('<AdminPanelContent value="users">'));
const allTabs = ADMIN_TAB_GROUPS.flatMap((group) => group.tabs);
const contentIds = new Set([...page.matchAll(/<AdminPanelContent value="([^"]+)"/g)].map((match) => match[1]));

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

test('Nested active tabs are scrolled into the Admin viewport without stealing search focus', () => {
  assert.match(page, /const adminScrollRef = useRef\(null\)/);
  assert.match(page, /const nestedTabListsRef = useRef\(\{\}\)/);
  assert.match(page, /nestedTabListsRef\.current\[selectedAdminTab\]/);
  assert.match(page, /querySelector\('\[role="tab"\]\[data-state="active"\]'\)/);
  assert.match(page, /list\.contains\(focused\) && focused !== active/);
  assert.match(page, /active\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /scrollArea\.scrollTop \+= tabBounds\.bottom - areaBounds\.bottom \+ margin/);
  assert.match(page, /ref=\{adminScrollRef\}/);
  assert.match(page, /nestedTabListsRef\.current\.timeclock = node/);
  assert.match(page, /nestedTabListsRef\.current\.backend = node/);
});

test('Resize observers keep responsive Admin tabs visible without overriding user focus', () => {
  assert.match(page, /new ResizeObserver\(onLayoutChange\)/);
  assert.match(page, /window\.addEventListener\("orientationchange", onLayoutChange\)/);
  assert.match(page, /window\.addEventListener\("resize", onLayoutChange\)/);
  assert.match(page, /observer\?\.observe\(scroller\)/);
  assert.match(page, /categoryScrollerRef\.current\?\.parentElement/);
  assert.match(page, /list\.closest\('\[role="tabpanel"\]'\)/);
  assert.match(page, /let keepVisible = activeIsVisible\(\)/);
  assert.match(page, /if \(frame !== null \|\| !keepVisible\) return/);
  assert.match(page, /!list\.contains\(currentFocus\)\) return/);
  assert.match(page, /scroller\.addEventListener\("touchmove", onExplore/);
  assert.match(page, /scrollArea\.addEventListener\("wheel", onUserScroll/);
  assert.match(page, /observer\?\.disconnect\(\)/);
  assert.match(page, /cancelAnimationFrame\(userScrollFrame\)/);
});

test('Category scroll and responsive grid tabs remain bounded on phones and desktop', () => {
  assert.equal(listTags.length, 3);
  for (const list of listTags) {
    for (const className of ['grid', 'h-auto', 'w-full', 'min-w-0', 'max-w-full', 'grid-cols-2', 'items-stretch']) {
      assert.ok(list.includes(className), `${className} missing in ${list}`);
    }
    assert.match(list, /aria-label=/);
  }
  assert.match(listTags[0], /sm:grid-cols-3 lg:grid-cols-4/);
  assert.match(listTags[1], /sm:grid-cols-4/);
  assert.match(listTags[2], /sm:grid-cols-3 lg:grid-cols-4/);
  assert.match(mainNav, /ref=\{categoryScrollerRef\} role="group"/);
  assert.match(mainNav, /flex-nowrap items-center.*overflow-x-auto overscroll-x-contain/);
  assert.match(mainNav, /min-h-10 shrink-0.*whitespace-nowrap/);
  assert.match(mainNav, /clay-card w-full min-w-0 max-w-full/);
  assert.match(page, /getBoundingClientRect\(\)/);
  assert.match(page, /scroller\.scrollLeft \+= target\.right - bounds\.right/);
  assert.equal(triggerTags.length, 12); // One mapped main trigger plus eleven nested triggers.
  for (const trigger of triggerTags) {
    for (const className of ['max-w-full', 'min-w-0', 'min-h-11', 'whitespace-normal', 'break-words']) {
      assert.ok(trigger.includes(className), `${className} missing in ${trigger}`);
    }
  }
});
