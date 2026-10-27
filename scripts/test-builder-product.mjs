import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-builder-product.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/builder/builderProductPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { createBuilderProductWithRecovery } = await import(pathToFileURL(out).href);

const data = { estimate_id: 'e1', estimate_line_id: 'l1', product_name: 'Channel letters', total_snapshot: 100 };
const mk = (store) => ({
  filter: async () => store.slice(),
  create: async (d) => { const r = { ...d, id: 'bp1' }; store.push(r); return r; },
});

// Happy path.
{
  const store = [];
  const res = await createBuilderProductWithRecovery({ entity: mk(store), data, settleMs: 0 });
  assert.equal(res.status, 'created');
  assert.equal(res.record.id, 'bp1');
}

// Preflight single row -> refuses (another session owns the line).
await assert.rejects(
  createBuilderProductWithRecovery({ entity: mk([{ ...data, id: 'other' }]), data, settleMs: 0 }),
  /another session/, 'preflight row blocks');

// Preflight multiple -> refuses.
await assert.rejects(
  createBuilderProductWithRecovery({ entity: mk([{ ...data, id: 'a' }, { ...data, id: 'b' }]), data, settleMs: 0 }),
  /multiple Products/, 'preflight duplicates block');

// Create error + one matching row after -> recovered.
{
  const store = [];
  const entity = {
    filter: async () => store.slice(),
    create: async (d) => { store.push({ ...d, id: 'bp2' }); throw new Error('lost response'); },
  };
  const res = await createBuilderProductWithRecovery({ entity, data, settleMs: 0 });
  assert.equal(res.status, 'recovered');
  assert.equal(res.record.id, 'bp2');
}

// Create error + different-owner row after -> refuses to claim it.
await assert.rejects(
  (async () => {
    const store = [];
    const entity = {
      filter: async () => store.slice(),
      create: async () => { store.push({ ...data, id: 'rival', product_name: 'DIFFERENT' }); throw new Error('lost'); },
    };
    await createBuilderProductWithRecovery({ entity, data, settleMs: 0 });
  })(),
  /different Product now owns/, 'rival identity refuses');

// Multiple after create -> ambiguity refuses.
await assert.rejects(
  (async () => {
    const store = [];
    const entity = {
      filter: async () => store.slice(),
      create: async (d) => { store.push({ ...d, id: 'x1' }); store.push({ ...d, id: 'x2' }); return store[0]; },
    };
    await createBuilderProductWithRecovery({ entity, data, settleMs: 0 });
  })(),
  /more than once/, 'post-create ambiguity refuses');

// Created but recovery read fails -> unverified-identity status (safe).
{
  let reads = 0;
  const store = [];
  const entity = {
    filter: async () => { reads += 1; if (reads === 1) return store.slice(); throw new Error('read down'); },
    create: async (d) => { const r = { ...d, id: 'bp3' }; store.push(r); return r; },
  };
  const res = await createBuilderProductWithRecovery({ entity, data, settleMs: 0 });
  assert.equal(res.status, 'created_unverified_identity', 'unverified create is flagged, not retried');
}

console.log('PASS builder product persistence (7 cases)');
