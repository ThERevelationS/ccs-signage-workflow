import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { copyEstimateSections, copyComparableEstimate, estimateNumberLookups } from '../src/components/estimator/aio/copyFromEstimateService.js';

const stubs = {
  '@/components/estimator/products/snapshotUtils': 'export const cloneSnapshot = (value) => structuredClone(value);',
  '@/components/estimator/products/quickProductService': 'export const instantiateProductSnapshot = (...args) => globalThis.__copyTest.instantiate(...args);',
  '@/components/estimator/customerPricing': 'export const acceptedCustomerUnitPrice = () => 10; export const liveCustomerUnitPrice = () => 12; export const manualCustomerPriceState = () => ({});',
  '@/components/estimator/estimateMutationGuard': 'export const assertEstimateProductMutationAllowed = async () => {};',
  '@/components/estimator/builder/partSync': 'export const applyBuilderPartPriceAcceptancePlan = () => {};',
  '@/components/estimator/builder/builderMutationRecovery': 'export const assertNoPendingLinesForCopy = (lines) => { if (lines.some((line) => line.price_acceptance_pending?.key)) throw new Error("pending"); }; export const builderMutationHash = () => ""; export const markBuilderMutationPending = () => {}; export const pendingBuilderMutation = () => null; export const recoveryPatchDiffers = () => false; export const resumeBuilderMutation = () => {};',
  '@/components/estimator/loadAllEntityRows': 'export const loadAllEntityRows = ({ entity }) => entity.rows;',
  '@/components/estimator/estimatePersistence': 'export const expectedEstimateFields = () => ({}); export const replaceEstimateFieldsIfUnchanged = () => {};',
  '@/components/estimator/builder/builderEntityPersistence': 'export const expectedBuilderEntityFields = () => ({}); export const expectedEntityFields = () => ({}); export const replaceBuilderEntityFieldsIfUnchanged = () => {}; export const replaceEntityFieldsIfUnchanged = () => {};',
  '@/components/staff/staffEntities': 'export const staffEntities = globalThis.__copyTest.entities;',
};
const bundle = await build({
  entryPoints: ['src/components/estimator/products/productOperations.js'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'copy-test-stubs', setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'stub' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: stubs[args.path], loader: 'js' }));
  } }],
});
const sourceLine = { line_id: 'source-line', builder_product_id: 'source-builder', module_key: 'vinyl', project_id: 'source-project', client_product_name: 'Fresh source name', customer_quantity: 2 };
const builder = { id: 'source-builder', estimate_id: 'source', source_entity: 'VinylProject', source_project_id: 'source-project', client_product_name: 'Old name', frozen_cost: 40 };
const estimates = { source: { id: 'source', line_items: [sourceLine] }, target: { id: 'target', line_items: [] } };
const reads = [], calls = [];
globalThis.__copyTest = {
  entities: {
    AllInOneEstimate: { get: async (id) => { reads.push(id); return estimates[id]; } },
    BuilderProduct: { get: async (id) => id === builder.id ? builder : { ...builder, id } },
    BuilderPart: { rows: [{ id: 'part', builder_product_id: builder.id, part_group_id: 'group', is_active: true }] },
    BuilderPartGroup: { rows: [{ id: 'group', builder_product_id: builder.id, is_active: true }] },
    VinylProject: { get: async () => ({ id: 'source-project', project_name: 'Source' }) },
  },
  instantiate: async (args) => {
    calls.push(args);
    const line = { line_id: 'new-line', builder_product_id: 'new-builder', client_product_name: args.productSnapshot.product_name };
    estimates[args.estimateId].line_items.push(line);
    return { line };
  },
};
const { cloneProductInEstimate } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
await cloneProductInEstimate({ estimateId: 'target', sourceEstimateId: 'source', line: { ...sourceLine, client_product_name: 'stale' }, expectedEstimateUpdatedAt: 'target-v1' });
assert.deepEqual(reads, ['source']);
assert.equal(calls[0].sourceType, 'estimate_section_copy');
assert.equal(calls[0].expectedEstimateUpdatedAt, 'target-v1');
assert.equal(calls[0].productSnapshot.product_name, 'Fresh source name');
assert.equal(calls[0].productSnapshot.parts_snapshot[0].part_group_id, 'group');
assert.equal(calls[0].productSnapshot.part_groups_snapshot[0].snapshot_source_group_id, 'group');
assert.equal(estimates.target.line_items[0].client_product_name, 'Fresh source name');
await cloneProductInEstimate({ estimateId: 'source', line: sourceLine, expectedEstimateUpdatedAt: 'same-v1' });
assert.equal(calls[1].sourceType, 'product_clone');
assert.equal(calls[1].productSnapshot.product_name, 'Fresh source name — Copy');
assert.equal(estimates.source.line_items[1].client_product_name, 'Fresh source name — Copy');
await assert.rejects(cloneProductInEstimate({ estimateId: 'target', sourceEstimateId: 'source', line: { ...sourceLine, builder_product_id: 'wrong' } }), /no longer belongs/);
sourceLine.price_acceptance_pending = { key: 'pending' };
await assert.rejects(cloneProductInEstimate({ estimateId: 'target', sourceEstimateId: 'source', line: sourceLine }), /pending/);
delete sourceLine.price_acceptance_pending;
estimates.source.deleted = true;
await assert.rejects(cloneProductInEstimate({ estimateId: 'target', sourceEstimateId: 'source', line: sourceLine }), /source estimate is no longer available/);
delete estimates.source.deleted;
builder.source_project_id = '';
await assert.rejects(cloneProductInEstimate({ estimateId: 'target', sourceEstimateId: 'source', line: sourceLine }), /source project cannot be verified/);

assert.deepEqual(estimateNumberLookups('10'), ['EST-00010', '10']);
assert.deepEqual(estimateNumberLookups('EST-10'), ['EST-00010', 'EST-10']);
assert.deepEqual(estimateNumberLookups('est-00010'), ['EST-00010', 'est-00010']);
assert.deepEqual(estimateNumberLookups('shop'), []);
assert.deepEqual(copyComparableEstimate({ line_items: [{ line_id: 'l', last_price_check_at: 'now' }] }).line_items, [{ line_id: 'l' }]);
{
  const quickStubs = {
    ...stubs,
    '@/components/estimator/products/snapshotUtils': 'export const cloneSnapshot = (value) => structuredClone(value); export const stripEntitySystemFields = (value) => { const { id, updated_date, ...rest } = value; return structuredClone(rest); };',
    '@/components/auth/EmailGate': 'export const getSessionUser = () => null;',
    '@/components/estimator/products/libraryOwnership': 'export const canSeeLibraryItem = () => true;',
    '@/components/estimator/builder/builderService': 'export const snapshotHash = () => "hash";',
    '@/components/estimator/parts/partState': 'export const countBuilderReattachParts = () => 0;',
    '@/components/estimator/products/reusableSaveIdempotency': 'export const ensureReusableRecord = () => {};',
  };
  const quickBundle = await build({
    entryPoints: ['src/components/estimator/products/quickProductService.js'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
    plugins: [{ name: 'quick-copy-blueprint', setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(quickStubs, args.path) ? { path: args.path, namespace: 'stub' } : undefined);
      build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: quickStubs[args.path], loader: 'js' }));
      build.onLoad({ filter: /quickProductService\.js$/ }, (args) => ({ contents: `${readFileSync(args.path, 'utf8')}\nexport { buildV2QuickBlueprint as testBlueprint };`, loader: 'js' }));
    } }],
  });
  const { testBlueprint } = await import(`data:text/javascript;base64,${Buffer.from(quickBundle.outputFiles[0].text).toString('base64')}`);
  const blueprint = testBlueprint({
    estimate: { id: 'target', client_name: 'Target client' }, lineId: 'new-line', timestamp: 'now', operationKey: 'key', sourceType: 'estimate_section_copy',
    productPayload: {
      product_name: 'Fresh source name', source_product_class: 'builder', source_entity: 'VinylProject', source_module_key: 'vinyl',
      builder_snapshot: { id: 'source-project', estimate_id: 'source', project_name: 'Source' },
      product_snapshot: { line: sourceLine, builder_product: builder },
      part_groups_snapshot: [{ id: 'group', snapshot_source_group_id: 'group' }],
      parts_snapshot: [{ id: 'part', part_group_id: 'group', part_key: 'p1' }],
    },
  });
  assert.equal(blueprint.sourceExpectedData.estimate_id, 'target', 'cloned project points to target estimate');
  assert.equal(blueprint.builderCreateData.estimate_id, 'target');
  assert.equal(blueprint.builderCreateData.source_project_id, '');
  assert.equal(blueprint.finalLineBase.project_id, '');
  assert.equal(blueprint.partBlueprints[0].partGroupKeyRef, blueprint.groupBlueprints[0].groupKey);
  assert.equal(blueprint.partBlueprints[0].data.builder_product_id, '');
}
{
  const calls = [], progress = [];
  const lines = [{ line_id: 'one' }, { line_id: 'two' }, { line_id: 'three' }];
  const result = await copyEstimateSections({
    sourceEstimateId: 'source', estimateId: 'target', lines, expectedEstimateUpdatedAt: 'v1',
    clone: async (args) => { calls.push(args); if (args.line.line_id === 'two') throw new Error('not available'); return { line: args.line }; },
    getEstimate: async () => ({ id: 'target', updated_date: 'v2' }),
    onProgress: (value) => progress.push(value.index),
  });
  assert.deepEqual(calls.map((item) => item.expectedEstimateUpdatedAt), ['v1', 'v2', 'v2']);
  assert.deepEqual(progress, [1, 2, 3]);
  assert.equal(result.copied.length, 2);
  assert.equal(result.failures[0].message, 'not available');
}
{
  const calls = [];
  const result = await copyEstimateSections({
    sourceEstimateId: 'source', estimateId: 'target', lines: [{ line_id: 'one' }, { line_id: 'two' }], expectedEstimateUpdatedAt: 'v1',
    clone: async (args) => { calls.push(args); throw new Error('Changed elsewhere'); },
    getEstimate: async () => ({ id: 'target', updated_date: 'v-other' }),
  });
  assert.equal(calls.length, 1, 'a failed CAS cannot rebase later copies onto an unknown version');
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[1].message, /changed during the failed copy/);
}
console.log('PASS estimate product copy: source/target, names, pending guard, sequencing and lookup');
