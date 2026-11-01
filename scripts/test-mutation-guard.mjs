import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// estimateRevisionService is stubbed so the protected-status seam
// (getOpenEstimateRevision) is controllable without a network read.
// estimateLifecycle stays real — isEstimateProtected is pure.
const stub = resolve(here, '.tmp-mutation-guard-stub.mjs');
writeFileSync(stub, `
globalThis.__openRevision = null;
export async function getOpenEstimateRevision() { return globalThis.__openRevision; }
`);

const out = resolve(here, '.tmp-mutation-guard.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/estimateMutationGuard.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
  alias: { '@/components/estimator/estimateRevisionService': stub },
});
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { assertEstimateProductMutationAllowed, getPendingEstimatePriceAcceptance } = await import(pathToFileURL(out).href);

await assert.rejects(
  assertEstimateProductMutationAllowed(null),
  /could not be verified/, 'missing estimate throws');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', updated_date: 'v-new' }, { expectedUpdatedAt: 'v-old' }),
  /changed in another session/, 'version drift throws');
assert.equal(
  await assertEstimateProductMutationAllowed({ id: 'e1', updated_date: 'v1', status: 'draft' }, { expectedUpdatedAt: 'v1' }),
  null, 'draft passes, no revision needed');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'cancelled' }),
  /cancelled and permanently locked/, 'cancelled is hard-locked');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'draft', line_items: [{ price_acceptance_pending: { key: 'k-pending' } }] }),
  /still being recovered/, 'pending builder mutation blocks');
assert.equal(
  await assertEstimateProductMutationAllowed(
    { id: 'e1', status: 'draft', line_items: [{ price_acceptance_pending: { key: 'k-pending' } }] },
    { allowPriceAcceptanceKey: 'k-pending' }),
  null, 'matching pending key resumes instead of blocking');
assert.equal(
  getPendingEstimatePriceAcceptance({ line_items: [{ price_acceptance_pending: { key: 'k' } }] }).pending.key, 'k');

// ---------- #400: deleted / archived / sent / sent-revision-required ----------

// Trash: a deleted estimate can never take a Product/Part mutation.
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'draft', deleted: true }),
  /in Trash/, 'deleted estimate is hard-locked');
// Deleted wins over version drift? No — the version check runs first and a
// stale caller hears about the drift, not the trash state.
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'draft', deleted: true, updated_date: 'v2' }, { expectedUpdatedAt: 'v1' }),
  /changed in another session/, 'stale version reported before trash state');

// Archived: permanently locked until the lifecycle restores it.
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'archived' }),
  /archived and locked/, 'archived is hard-locked');

// Sent, no open revision -> protected gate blocks.
globalThis.__openRevision = null;
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'sent' }),
  /sent and protected.*Estimate Revision/, 'sent without an open revision is protected');
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'approved' }),
  /approved and protected/, 'approved without an open revision is protected');

// Sent WITH an open revision -> the guard returns the revision (edit allowed).
globalThis.__openRevision = { id: 'rev-1', estimate_id: 'e1', revision_status: 'open' };
{
  const rev = await assertEstimateProductMutationAllowed({ id: 'e1', status: 'sent' });
  assert.equal(rev?.id, 'rev-1', 'open revision unblocks a sent estimate');
}
globalThis.__openRevision = null;

// Stale pending entries expire after the TTL instead of locking forever.
{
  const stale = { key: 'k-old', started_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
  assert.equal(
    await assertEstimateProductMutationAllowed({ id: 'e1', status: 'draft', line_items: [{ price_acceptance_pending: stale }] }),
    null, 'expired pending entry no longer blocks');
  assert.equal(getPendingEstimatePriceAcceptance({ line_items: [{ price_acceptance_pending: stale }] }), null, 'expired pending is not returned');
}
// A pending entry without a parseable start never expires — it blocks.
await assert.rejects(
  assertEstimateProductMutationAllowed({ id: 'e1', status: 'draft', line_items: [{ price_acceptance_pending: { key: 'k-t', started_at: 'not-a-date' } }] }),
  /still being recovered/, 'unparseable pending start still blocks');

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS estimate mutation guard (16 cases)');
process.exit(0);
