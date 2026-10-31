import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-builder-recovery.mjs');
const stub = resolve(here, '.tmp-builder-recovery-sdk.mjs');
writeFileSync(stub, 'export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }) };' + String.fromCharCode(10) + 'export const isRetryableFunction = () => false;');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/builderMutationRecovery.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub },
});
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { pendingBuilderMutation, builderMutationHash, pendingBuilderMutationAge, pendingBuilderMutationIsStale, STALE_PENDING_BUILDER_MUTATION_MS } = await import(pathToFileURL(out).href);

// pendingBuilderMutation: only a pending object WITH a key blocks edits.
assert.equal(pendingBuilderMutation({ line_id: 'x' }), null, 'no pending -> null');
assert.equal(pendingBuilderMutation({ price_acceptance_pending: { key: 'k1' } }).key, 'k1');
assert.equal(pendingBuilderMutation({ price_acceptance_pending: { key: '  ' } }), null, 'blank key ignored');
assert.equal(pendingBuilderMutation({ price_acceptance_pending: 'junk' }), null, 'non-object ignored');

// stale pending sweep helpers: surface >24h markers, never silently delete them.
{
  const now = Date.parse('2026-10-30T12:00:00Z');
  const fresh = { price_acceptance_pending: { key: 'k', started_at: '2026-10-30T11:00:00Z' } };
  const stale = { price_acceptance_pending: { key: 'k', started_at: '2026-10-29T11:59:00Z' } };
  const noStamp = { price_acceptance_pending: { key: 'k' } };
  assert.equal(pendingBuilderMutationAge(fresh, now), 60 * 60 * 1000, 'age is measured from started_at');
  assert.equal(pendingBuilderMutationAge(noStamp, now), null, 'missing started_at cannot be judged stale');
  assert.equal(pendingBuilderMutationIsStale(fresh, undefined, now), false, 'recent marker is not stale');
  assert.equal(pendingBuilderMutationIsStale(stale, undefined, now), true, '>24h marker is stale');
  assert.equal(pendingBuilderMutationIsStale(noStamp, undefined, now), false, 'unparseable timestamp is not stale');
  assert.equal(pendingBuilderMutationIsStale({ line_id: 'x' }, undefined, now), false, 'no pending is not stale');
  assert.equal(STALE_PENDING_BUILDER_MUTATION_MS, 24 * 60 * 60 * 1000, 'stale threshold is 24 hours');
}

// builderMutationHash: stable fnv1a over canonicalized value.
const h1 = builderMutationHash({ a: 1, b: 2 });
const h2 = builderMutationHash({ b: 2, a: 1 });
assert.equal(h1, h2, 'key order does not change hash');
assert.match(h1, /^fnv1a-[0-9a-f]{8}$/, 'hash shape');
assert.notEqual(builderMutationHash({ a: 1 }), builderMutationHash({ a: 2 }), 'value changes hash');
assert.equal(builderMutationHash(null), builderMutationHash(null), 'null deterministic');

// pricingSnapshot via partSync â€” pure field extraction.
const out2 = resolve(here, '.tmp-part-sync.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/partSync.js')],
  bundle: true, format: 'esm', outfile: out2, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/api/base44Client': stub },
});
const { pricingSnapshot } = await import(pathToFileURL(out2).href);

{
  const snap = pricingSnapshot({ id: 'p1', updated_date: 'v', unit_cost: 12, material_fee: 3, name: 'Acrylic', notes: 'x' });
  assert.equal(snap.unit_cost, 12, 'cost field kept');
  assert.equal(snap.material_fee, 3, 'fee field kept');
  assert.equal(snap.id, undefined, 'id excluded');
  assert.equal(snap.updated_date, undefined, 'version excluded');
  assert.equal(snap.name, undefined, 'non-pricing field excluded');
  assert.equal(snap.notes, undefined, 'notes excluded');
}
assert.deepEqual(pricingSnapshot(null), {}, 'null-safe');
assert.deepEqual(pricingSnapshot({ quantity_tiers: [1, 2] }), { quantity_tiers: [1, 2] }, 'tier list kept');

console.log('PASS builder recovery + pricing snapshot (22 cases)');
rmSync(out, { force: true });
rmSync(out2, { force: true });
rmSync(stub, { force: true });
process.exit(0);