import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';

const findArgs = (node) => {
  if (!node || typeof node !== 'object') return null;
  if (node.function_name === 'smartsheetSyncAction') return node.args;
  for (const value of Object.values(node)) {
    const found = findArgs(value);
    if (found) return found;
  }
  return null;
};

const SECRET_NAME = 'WORKFLOW_CAPABILITY_SMARTSHEET_SYNC_ACTION';
for (const [file, action] of [['Smartsheet Scheduled Sync.jsonc', 'run_sales_sync'], ['Smartsheet Scheduled Order Sync.jsonc', 'run_order_sync']]) {
  const workflow = JSON.parse(readFileSync(`base44/workflows/${file}`, 'utf8'));
  const args = findArgs(workflow.definition);
  assert.ok(args, `${file} must invoke smartsheetSyncAction`);
  assert.equal(args.action, action);
  assert.equal(args._workflow_capability, `\${secret:${SECRET_NAME}}`, `${file} must reference the deploy-time secret, not a raw capability`);
}

const entry = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.match(entry, /const scheduledRun = !hasSessionToken && \['run_sync', 'run_sales_sync', 'run_order_sync'\]\.includes\(action\) &&\s*await hasWorkflowInvocationCapability\(body, 'smartsheetSyncAction'\)/);
assert.match(entry, /else if \(!scheduledRun\)/);

const shared = readFileSync('base44/shared/workflowInvocationCapability.ts', 'utf8');
assert.doesNotMatch(shared, /\b[a-f0-9]{64}\b/, 'No capability verifiers may be committed');

const compiled = await build({ entryPoints: ['base44/shared/workflowInvocationCapability.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
globalThis.crypto ||= webcrypto;
const env = {};
globalThis.Deno = { env: { get: (key) => env[key] } };
const { hasWorkflowInvocationCapability: verify, workflowCapabilitySecretName, getWorkflowInvocationCapability } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

const token = 'synthetic-smartsheet-capability-0123456789abcdef';
const args = { action: 'run_sync', _workflow_capability: token };
assert.equal(workflowCapabilitySecretName('smartsheetSyncAction'), SECRET_NAME);
assert.equal(workflowCapabilitySecretName('sendGmail'), 'WORKFLOW_CAPABILITY_SEND_GMAIL');
assert.equal(await verify(args, 'smartsheetSyncAction'), false, 'Unset secret must deny (fail closed)');
assert.equal(getWorkflowInvocationCapability('smartsheetSyncAction'), '', 'Unset secret yields no caller capability');
env[SECRET_NAME] = 'too-short';
assert.equal(await verify({ _workflow_capability: 'too-short' }, 'smartsheetSyncAction'), false, 'Malformed secret must deny');
env[SECRET_NAME] = token;
assert.equal(getWorkflowInvocationCapability('smartsheetSyncAction'), token);
assert.equal(await verify(args, 'smartsheetSyncAction'), true, 'Scheduled run must be authorized');
assert.equal(await verify({}, 'smartsheetSyncAction'), false, 'Missing capability must be denied');
assert.equal(await verify({ _workflow_capability: token + 'x' }, 'smartsheetSyncAction'), false, 'Wrong capability must be denied');
assert.equal(await verify({ _workflow_capability: `\${secret:${SECRET_NAME}}` }, 'smartsheetSyncAction'), false, 'Uninjected placeholder must be denied');
assert.equal(await verify(args, 'checkDeadlineReminders'), false, 'Capability must not work for another workflow');
assert.equal(await verify({ _workflow_capability: 42 }, 'smartsheetSyncAction'), false, 'Malformed capability must be denied');
console.log('PASS Smartsheet workflow authorization (credential never displayed).');
