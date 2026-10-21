import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/pages/AdminSettings.jsx', 'utf8');
const loader = source.slice(source.indexOf('  const loadAutomations = async () => {'), source.indexOf('  useEffect(() => {\n    loadAutomations();'));

test('Automation reads track loading, error and latest-request ownership', () => {
  assert.match(loader, /requestSequence = \+\+automationLoadSequence\.current/);
  assert.match(loader, /await withAutomationReadDeadline\(\(\) => loadAllEntityRows\(/);
  assert.match(loader, /if \(requestSequence === automationLoadSequence\.current &&\s*ownerEpoch === automationSessionEpoch\.current\)/);
  assert.match(loader, /ownerEpoch !== automationSessionEpoch\.current/);
  assert.match(loader, /setAutomations\(rules\)/);
  assert.match(loader, /setAutomationLoadError\(false\)/);
  assert.match(loader, /catch \{/);
  assert.match(loader, /setAutomationLoadError\(true\)/);
  assert.match(loader, /return null/);
  assert.match(loader, /finally \{/);
  assert.match(loader, /setIsLoading\(false\)/);
});

test('Failed automation reads hide unverified rule counts and disable editing', () => {
  assert.match(source, /!isLoading && !automationLoadError && <div className="grid grid-cols-3/);
  assert.match(source, /disabled=\{isLoading \|\| automationLoadError \|\| emailGroupsLoading \|\| emailGroupsLoadError\}/);
  assert.match(source, /\) : automationLoadError \? \(/);
  assert.match(source, /role="alert" aria-label="Automation rules unavailable"/);
  assert.match(source, /Retry loading rules/);
  assert.match(source, /\) : automations\.length === 0 \? \(/);
  assert.doesNotMatch(source, /automationLoadError &&.*?error\.message/s);
});

test('A failed refresh cannot silently dismiss an earlier save error', () => {
  assert.match(source, /const refreshed = await loadAutomations\(\); if \(refreshed\) setAutomationSaveError\(""\)/);
});
