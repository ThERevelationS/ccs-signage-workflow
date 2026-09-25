import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { build } from 'esbuild';

// Never print the credential or a workflow's private arguments.
const workflow = JSON.parse(readFileSync('base44/workflows/Smartsheet Scheduled Sync.jsonc', 'utf8'));
const args = workflow.definition.do[0].run_sync.with.args;
const token = args._workflow_capability;
const hashes = readFileSync('base44/shared/workflowInvocationCapability.ts', 'utf8');
const entry = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.equal(workflow.definition.do[0].run_sync.with.function_name, 'smartsheetSyncAction');
assert.equal(args.action, 'run_sync');
assert.match(token, /^[A-Za-z0-9_-]{40,128}$/);
const hash = hashes.match(/smartsheetSyncAction:\s*'([a-f0-9]{64})'/)?.[1];
assert.ok(hash, 'Dedicated Smartsheet verifier hash must exist');
assert.equal(createHash('sha256').update(token).digest('hex'), hash, 'Stored verifier must match scheduled capability');
assert.match(entry, /const scheduledRun = !hasSessionToken && action === 'run_sync' &&\s*await hasWorkflowInvocationCapability\(body, 'smartsheetSyncAction'\)/);
assert.match(entry, /else if \(!scheduledRun\)/);
assert.doesNotMatch(entry, /action !== 'run_sync' && action !== 'push_dataset'/);
assert.equal(workflow.trigger.config.cron_expression, '*/15 * * * *', 'Keep current scheduled cadence');
const compiled = await build({ entryPoints: ['base44/shared/workflowInvocationCapability.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
globalThis.crypto ||= webcrypto;
const { hasWorkflowInvocationCapability: verify } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
assert.equal(await verify(args, 'smartsheetSyncAction'), true, 'Scheduled run must be authorized');
assert.equal(await verify({}, 'smartsheetSyncAction'), false, 'Missing capability must be denied');
assert.equal(await verify({ _workflow_capability: token + 'x' }, 'smartsheetSyncAction'), false, 'Wrong capability must be denied');
assert.equal(await verify(args, 'checkDeadlineReminders'), false, 'Capability must not work for another workflow');
assert.equal(await verify({ _workflow_capability: 42 }, 'smartsheetSyncAction'), false, 'Malformed capability must be denied');
console.log('Smartsheet workflow authorization: 12/12 PASS (credential never displayed).');
