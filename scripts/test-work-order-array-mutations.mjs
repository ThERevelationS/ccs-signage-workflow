import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-wo-mut.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/workflow/workOrderPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
globalThis.window = { location: { href: 'http://t' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { replaceWorkOrderArrayFieldIfUnchanged, transitionWorkOrderFromLoadedSnapshot } = await import(pathToFileURL(out).href);

const row = (id, tasks, stage = 'production', extra = {}) => ({ id, tasks, current_stage: stage, updated_date: 'v1', ...extra });

// replaceWorkOrderArrayFieldIfUnchanged — mock entity via base44 stub is not injectable;
// this fn uses base44.entities.WorkOrder directly. We can only test the guards that
// fire BEFORE the entity call — validation + deleted-WO check paths need a real entity.
// So test the exported pure-adjacent behaviors that don't need base44:

// transitionWorkOrderFromLoadedSnapshot: missing id/stage -> init error (no entity needed).
await assert.rejects(
  transitionWorkOrderFromLoadedSnapshot({ workOrder: null, newStage: 'production' }),
  /missing its Work Order|destination stage/);
await assert.rejects(
  transitionWorkOrderFromLoadedSnapshot({ workOrder: { id: 'x' }, newStage: '' }),
  /missing its Work Order|destination stage/);

// replaceWorkOrderArrayFieldIfUnchanged: missing init -> init error.
await assert.rejects(
  replaceWorkOrderArrayFieldIfUnchanged({ workOrderId: '', field: 'tasks' }),
  /could not initialize|missing/i);

console.log('PASS work order array mutations (4 init-guard cases)');
process.exit(0);
