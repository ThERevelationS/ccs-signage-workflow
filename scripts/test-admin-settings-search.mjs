import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ADMIN_NESTED_TABS,
  ADMIN_TAB_GROUPS,
  getAccessibleAdminSubtab,
  searchAdminSettings,
} from '../src/components/admin/adminTabNavigation.js';

const page = readFileSync(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8');
const searchUi = readFileSync(new URL('../src/components/admin/AdminSettingsSearch.jsx', import.meta.url), 'utf8');

test('Search indexes all 15 Admin pages and 11 real nested settings', () => {
  const pageValues = ADMIN_TAB_GROUPS.flatMap((group) => group.tabs);
  const nestedValues = Object.values(ADMIN_NESTED_TABS).flat();
  assert.equal(pageValues.length, 15);
  assert.equal(nestedValues.length, 11);
  for (const tab of pageValues) {
    const result = searchAdminSettings(tab.label, true, 26).find((entry) => entry.id === tab.value);
    assert.ok(result, `Missing search result for ${tab.value}`);
    assert.equal(result.tab, tab.value);
  }
  for (const [parent, nestedTabs] of Object.entries(ADMIN_NESTED_TABS)) {
    for (const nested of nestedTabs) {
      assert.match(page, new RegExp('<TabsTrigger value="' + nested.value + '"'));
      assert.match(page, new RegExp('<AdminPanelContent value="' + nested.value + '"'));
      const result = searchAdminSettings(nested.label, true, 26).find(
        (entry) => entry.id === `${parent}:${nested.value}`,
      );
      assert.ok(result, `Missing nested search result for ${parent}/${nested.value}`);
      assert.equal(result.tab, parent);
      assert.equal(result.subtab, nested.value);
    }
  }
});

test('Search matches natural terms and prioritizes directly named destinations', () => {
  assert.equal(searchAdminSettings('PTO', true)[0].id, 'timeclock:pto');
  assert.equal(searchAdminSettings('jurisdiction monitoring', true)[0].id, 'backend:monitoring');
  assert.equal(searchAdminSettings('smartsheet SYNC', true)[0].id, 'smartsheet');
  assert.equal(searchAdminSettings('paid time off', true)[0].id, 'timeclock:pto');
  assert.equal(searchAdminSettings('wip', true)[0].id, 'backend:wip_import');
  assert.equal(searchAdminSettings('time clock', true)[0].id, 'timeclock');
  assert.deepEqual(searchAdminSettings('', true), []);
  assert.deepEqual(searchAdminSettings('no-such-admin-setting', true), []);
  assert.ok(searchAdminSettings('time', true, 2).length <= 2);
});

test('Search never exposes restricted parent or nested destinations to non-admins', () => {
  for (const query of ['smartsheet', 'pto', 'backup', 'jurisdiction', 'corebridge', 'permitting']) {
    assert.deepEqual(searchAdminSettings(query, false, 26), [], `Leaked restricted result: ${query}`);
  }
  assert.equal(searchAdminSettings('users', false)[0].id, 'users');
  assert.equal(searchAdminSettings('calendar', false)[0].id, 'calendar');
  assert.ok(searchAdminSettings('staff', false).every((entry) => entry.tab === 'users'));
});

test('Nested routing validates available subtabs and defaults to existing panels', () => {
  assert.equal(getAccessibleAdminSubtab('timeclock', 'pto'), 'pto');
  assert.equal(getAccessibleAdminSubtab('backend', 'monitoring'), 'monitoring');
  assert.equal(getAccessibleAdminSubtab('timeclock', 'not-real'), 'entries');
  assert.equal(getAccessibleAdminSubtab('backend', null), 'backup');
  assert.equal(getAccessibleAdminSubtab('users', 'pto'), null);
  assert.match(page, /updated\.set\("subtab", validSubtab\)/);
  assert.match(page, /updated\.delete\("subtab"\)/);
  assert.match(page, /<Tabs value=\{selectedAdminTab === "timeclock" \? selectedAdminSubtab : "entries"\}/);
  assert.match(page, /<Tabs value=\{selectedAdminTab === "backend" \? selectedAdminSubtab : "backup"\}/);
  assert.match(page, /<AdminSettingsSearch isAdmin=\{isAdmin\} onNavigate=\{handleAdminTabChange\}/);
});

test('Search UI is keyboard-accessible and bounded in the Admin navigation card', () => {
  assert.match(searchUi, /role="search"/);
  assert.match(searchUi, /type="search"/);
  assert.match(searchUi, /onSubmit=/);
  assert.match(searchUi, /event\.key === "Escape"/);
  assert.match(searchUi, /onNavigate\(result\.tab, result\.subtab \|\| null\)/);
  assert.match(searchUi, /aria-live="polite"/);
  assert.match(searchUi, /max-h-60/);
  assert.match(searchUi, /grid-cols-1/);
  assert.match(searchUi, /sm:grid-cols-2/);
  assert.match(searchUi, /No matching Admin settings/);
});
