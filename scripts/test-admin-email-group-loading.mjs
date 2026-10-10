import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manager = readFileSync('src/components/admin/EmailGroupsManager.jsx', 'utf8');
const admin = readFileSync('src/pages/AdminSettings.jsx', 'utf8');
const managerLoad = manager.slice(manager.indexOf('  const loadGroups = async () => {'), manager.indexOf('  const openNewGroup = () => {'));
const parentLoad = admin.slice(admin.indexOf('  const loadEmailGroups = async () => {'), admin.indexOf('  const loadAllUsers = async () => {'));

test('Email Groups manager never interprets read failure as verified zero groups', () => {
  assert.match(managerLoad, /requestSequence = \+\+loadSequence\.current/);
  assert.match(managerLoad, /await loadAllEntityRows/);
  assert.match(managerLoad, /setGroups\(data\)/);
  assert.match(managerLoad, /setLoadError\(false\)/);
  assert.match(managerLoad, /catch \{/);
  assert.match(managerLoad, /setLoadError\(true\)/);
  assert.match(managerLoad, /return null/);
  assert.match(manager, /\) : loadError \? \(/);
  assert.match(manager, /\) : groups\.length === 0 \? \(/);
  assert.match(manager, /role="alert" aria-label="Email groups unavailable"/);
  assert.match(manager, /Retry loading groups/);
  assert.doesNotMatch(managerLoad, /setPersistenceError\(error\?\.message/);
});

test('Email Groups manager disables CRUD while group data is unverified', () => {
  assert.match(manager, /disabled=\{isLoading \|\| loadError \|\| isSaving\}/);
  assert.match(manager, /if \(isLoading \|\| loadError \|\| isSaving\) return/);
  assert.match(manager, /if \(isSaving \|\| isLoading \|\| loadError \|\| !formData\.name/);
  assert.match(manager, /if \(!group\?\.id \|\| isSaving \|\| isLoading \|\| loadError\) return/);
  assert.match(manager, /const refreshed = await loadGroups\(\); if \(refreshed\) setPersistenceError\(""\)/);
});

test('Automations recipient-group loading handles initial failure and retries safely', () => {
  assert.match(parentLoad, /requestSequence = \+\+emailGroupsLoadSequence\.current/);
  assert.match(parentLoad, /setEmailGroupsLoading\(true\)/);
  assert.match(parentLoad, /setEmailGroups\(groups\)/);
  assert.match(parentLoad, /setEmailGroupsLoadError\(false\)/);
  assert.match(parentLoad, /catch \{/);
  assert.match(parentLoad, /setEmailGroupsLoadError\(true\)/);
  assert.match(parentLoad, /return null/);
  assert.match(parentLoad, /setEmailGroupsLoading\(false\)/);
  assert.match(admin, /role="alert" aria-label="Automation email groups unavailable"/);
  assert.match(admin, /Retry group choices/);
});

test('Automation editor opening and saving cannot use stale recipient-group choices', () => {
  for (const fn of ['openNewRule', 'openEditRule', 'duplicateRule']) {
    const start = admin.indexOf(`  const ${fn} = async`);
    assert.ok(start > -1);
    const end = admin.indexOf('  };', start);
    const body = admin.slice(start, end);
    assert.match(body, /if \(emailGroupsLoading\) return/);
    assert.match(body, /if \(!\(await loadEmailGroups\(\)\)\) return/);
  }
  assert.match(admin, /if \(automationSaving \|\| emailGroupsLoading \|\| emailGroupsLoadError\) return/);
  assert.match(admin, /disabled=\{automationSaving \|\| emailGroupsLoading \|\| emailGroupsLoadError/);
});
