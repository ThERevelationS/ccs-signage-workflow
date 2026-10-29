import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { build } from 'esbuild';

// Never print the credential or a workflow's private arguments.
const salesWorkflow = JSON.parse(readFileSync('base44/workflows/Smartsheet Scheduled Sync.jsonc', 'utf8'));
const orderWorkflow = JSON.parse(readFileSync('base44/workflows/Smartsheet Scheduled Order Sync.jsonc', 'utf8'));
const salesArgs = salesWorkflow.definition.do[0].run_sales_sync.with.args;
const orderArgs = orderWorkflow.definition.do[0].run_order_sync.with.args;
const token = salesArgs._workflow_capability;
const hashes = readFileSync('base44/shared/workflowInvocationCapability.ts', 'utf8');
const entry = readFileSync('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
assert.equal(salesWorkflow.definition.do[0].run_sales_sync.with.function_name, 'smartsheetSyncAction');
assert.equal(orderWorkflow.definition.do[0].run_order_sync.with.function_name, 'smartsheetSyncAction');
assert.equal(salesArgs.action, 'run_sales_sync');
assert.equal(orderArgs.action, 'run_order_sync');
assert.equal(orderArgs._workflow_capability, token, 'Both scheduled pipelines share the function-scoped capability');
assert.match(token, /^[A-Za-z0-9_-]{40,128}$/);
const hash = hashes.match(/smartsheetSyncAction:\s*'([a-f0-9]{64})'/)?.[1];
assert.ok(hash, 'Dedicated Smartsheet verifier hash must exist');
assert.equal(createHash('sha256').update(token).digest('hex'), hash, 'Stored verifier must match scheduled capability');
assert.match(entry, /const scheduledRun = !hasSessionToken && \['run_sync', 'run_sales_sync', 'run_order_sync'\]\.includes\(action\) &&\s*await hasWorkflowInvocationCapability\(body, 'smartsheetSyncAction'\)/);
assert.match(entry, /else if \(!scheduledRun\)/);
assert.doesNotMatch(entry, /action !== 'run_sync' && action !== 'push_dataset'/);
assert.equal(salesWorkflow.trigger.config.cron_expression, '*/15 * * * *', 'Keep current Sales scheduled cadence');
assert.equal(orderWorkflow.trigger.config.cron_expression, '8,23,38,53 * * * *', 'Order pull runs on the offset cadence');
const compiled = await build({ entryPoints: ['base44/shared/workflowInvocationCapability.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
globalThis.crypto ||= webcrypto;
const { hasWorkflowInvocationCapability: verify } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
assert.equal(await verify(salesArgs, 'smartsheetSyncAction'), true, 'Scheduled Sales run must be authorized');
assert.equal(await verify(orderArgs, 'smartsheetSyncAction'), true, 'Scheduled Order run must be authorized');
assert.equal(await verify({}, 'smartsheetSyncAction'), false, 'Missing capability must be denied');
assert.equal(await verify({ _workflow_capability: token + 'x' }, 'smartsheetSyncAction'), false, 'Wrong capability must be denied');
assert.equal(await verify(salesArgs, 'checkDeadlineReminders'), false, 'Capability must not work for another workflow');
assert.equal(await verify({ _workflow_capability: 42 }, 'smartsheetSyncAction'), false, 'Malformed capability must be denied');
console.log('Smartsheet workflow authorization: 18/18 PASS (credential never displayed).');
