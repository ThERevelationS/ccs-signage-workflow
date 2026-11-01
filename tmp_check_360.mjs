import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const out = resolve('tmp_wo_bundle.mjs');
const shims = new Map([
  ['@/api/base44Client', 'export const base44 = {};'],
  ['@/components/shared/trackedFieldPersistence', 'export const saveTrackedFields = async () => ({ updated: 1 });'],
  ['./workOrderCreationIdentity.mjs', 'export const stripInheritedWorkOrderSyncIdentity = (x) => x;'],
  ['@/components/workflow/NotificationService', 'export const NotificationTriggers = {};'],
  ['@/components/staff/staffEntities', 'export const staffEntities = {};'],
]);
buildSync({
  entryPoints: ['src/components/workflow/workOrderPersistence.js'],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  plugins: [{
    name: 'shims',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        if (shims.has(args.path)) return { path: args.path, namespace: 'shim' };
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'shim' }, (args) => ({ contents: shims.get(args.path) }));
    },
  }],
});
const mod = await import(pathToFileURL(out).href);
const { createWorkOrderArrayItemLocator, findOptionalWorkOrderArrayItemIndex, workOrderPatchMatches } = mod;

// #360 — numeric id coercion both directions
const loc123 = createWorkOrderArrayItemLocator({ id: 123, name: 'x' });
assert.equal(loc123.id, '123', 'numeric id coerced to string');
const items = [{ id: '122' }, { id: 123 }, { id: '456' }];
assert.equal(findOptionalWorkOrderArrayItemIndex(items, loc123), 1, 'numeric item id matches string locator');
const loc456 = createWorkOrderArrayItemLocator({ id: '456' });
assert.equal(findOptionalWorkOrderArrayItemIndex(items, loc456), 2, 'string locator matches numeric item id');
const loc0 = createWorkOrderArrayItemLocator({ id: 0 });
assert.equal(loc0.id, '0', 'zero id kept');
assert.equal(findOptionalWorkOrderArrayItemIndex([{ id: 0 }], loc0), 0, 'zero id matches');
assert.equal(findOptionalWorkOrderArrayItemIndex([{ id: 9 }], loc123), -1, 'no match -> -1');
assert.throws(() => findOptionalWorkOrderArrayItemIndex([{ id: 123 }, { id: '123' }], loc123), /ambiguous/, 'cross-type duplicates detected');
const snapLoc = createWorkOrderArrayItemLocator({ sku: 'A', qty: 2 });
assert.equal(findOptionalWorkOrderArrayItemIndex([{ sku: 'A', qty: 2 }], snapLoc), 0, 'snapshot fallback still matches');

// #352 — trimmed string compare through the real matcher
assert.equal(workOrderPatchMatches({ title: 'Job A' }, { title: '  Job A  ' }), true, 'untrimmed patch matches stored trimmed value');
assert.equal(workOrderPatchMatches({ title: 'Job A' }, { title: 'Job B' }), false, 'different strings still differ');
assert.equal(workOrderPatchMatches({ title: 'Job A' }, { title: 'job a' }), false, 'compare stays case-sensitive');
assert.equal(workOrderPatchMatches({ qty: 5 }, { qty: '5' }), true, 'numeric tolerance unchanged');

console.log('PASS #360/#352 work-order array locator + patch-match check');
