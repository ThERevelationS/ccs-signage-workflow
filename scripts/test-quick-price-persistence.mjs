import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-qp-persistence.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/quickPricePersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { createQuickPriceProjectWithRecovery } = await import(pathToFileURL(out).href);

const data = { project_name: 'Storefront', client_name: 'Acme', status: 'draft' };

// Happy path: create + verified get.
{
  const store = [];
  const entity = {
    filter: async () => store.slice(),
    create: async (d) => { const r = { ...d, id: 'p1' }; store.push(r); return r; },
    get: async (id) => store.find((r) => r.id === id) || null,
  };
  const res = await createQuickPriceProjectWithRecovery({ entity, data });
  assert.equal(res.status, 'created');
  assert.equal(res.record.id, 'p1');
}

// Response loss: create throws, recovery read finds exactly one new match.
{
  const store = [];
  const entity = {
    filter: async () => store.slice(),
    create: async (d) => { const r = { ...d, id: 'p2' }; store.push(r); throw new Error('network lost'); },
    get: async () => null,
  };
  const res = await createQuickPriceProjectWithRecovery({ entity, data });
  assert.equal(res.status, 'recovered', 'lost-create converges to recovered');
  assert.equal(res.record.id, 'p2');
}

// Idempotent retry: create throws AND a pre-existing match exists (beforeIds) → no new match → rethrows create error.
await assert.rejects(
  (async () => {
    const store = [{ ...data, id: 'existing' }];
    const entity = {
      filter: async () => store.slice(),
      create: async () => { throw new Error('server down'); },
      get: async () => null,
    };
    await createQuickPriceProjectWithRecovery({ entity, data });
  })(),
  /server down/, 'pre-existing match + failed create rethrows');

// Two new matches on recovery -> refuses to guess.
await assert.rejects(
  (async () => {
    const store = [];
    const entity = {
      filter: async () => store.slice(),
      create: async (d) => { store.push({ ...d, id: 'a' }); store.push({ ...d, id: 'b' }); return null; },
      get: async () => null,
    };
    await createQuickPriceProjectWithRecovery({ entity, data });
  })(),
  /more than once/, 'ambiguous recovery refuses to guess');

// Validation.
await assert.rejects(
  createQuickPriceProjectWithRecovery({ entity: { filter: async () => [], create: async () => ({}) }, data: { project_name: '', client_name: 'x' } }),
  /could not initialize/, 'missing fields fail fast');

console.log('PASS quick-price persistence (5 cases)');
