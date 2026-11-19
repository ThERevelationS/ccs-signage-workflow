import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (name) => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, `../src/components/estimator/${name}.js`)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return out;
};

const rowsMod = await import(pathToFileURL(bundle('loadAllEntityRows')).href);
const { isRateLimitError, loadAllEntityRows } = rowsMod;
const idem = await import(pathToFileURL(bundle('idempotentEntityCreate')).href);
const { newCreationRequestKey, ensureIdempotentEntityCreate } = idem;

// --- isRateLimitError
assert.equal(isRateLimitError(new Error('Rate limit exceeded')), true);
assert.equal(isRateLimitError({ response: { data: { error: 'RATE LIMIT hit' } } }), true);
assert.equal(isRateLimitError(new Error('timeout')), false);
assert.equal(isRateLimitError(null), false);

// --- loadAllEntityRows: paging + dedupe + fail-closed
{
  const pages = [
    Array.from({ length: 3 }, (_, i) => ({ id: `r${i}` })),
    [{ id: 'r2' }, { id: 'r3' }], // duplicate id across pages is deduped
  ];
  const calls = [];
  const entity = { list: async (sort, limit, skip) => { calls.push(skip); return pages[Math.floor(skip / 3)] || []; } };
  const rows = await loadAllEntityRows({ entity, pageSize: 3 });
  assert.equal(rows.length, 4, 'deduped to unique ids');
  assert.deepEqual(calls, [0, 3], 'paged with skip');
}
{
  const entity = { filter: async (q) => (q.status === 'x' ? [{ id: 'a' }] : []) };
  const rows = await loadAllEntityRows({ entity, query: { status: 'x' } });
  assert.equal(rows.length, 1, 'filter path works');
}
await assert.rejects(
  loadAllEntityRows({ entity: { list: async () => 'not-an-array' } }),
  /blocked rather than using a partial catalog/, 'non-array page fails closed');
await assert.rejects(
  loadAllEntityRows({ entity: {} }),
  /could not initialize/, 'missing reader throws');

// --- newCreationRequestKey
{
  const k = newCreationRequestKey('estimate');
  assert.ok(k.startsWith('estimate:'), 'key carries prefix');
  assert.notEqual(newCreationRequestKey('a'), newCreationRequestKey('a'), 'keys unique');
}

// --- ensureIdempotentEntityCreate with an in-memory entity
const makeStore = () => {
  const store = [];
  return {
    store,
    entity: {
      filter: async (q) => store.filter((r) => Object.entries(q).every(([k, v]) => r[k] === v)),
      create: async (data) => { const r = { ...data, id: `id-${store.length + 1}`, created_date: new Date().toISOString() }; store.push(r); return r; },
    },
  };
};

{
  const { entity, store } = makeStore();
  const data = { name: 'Acme', qty: 2 };
  const first = await ensureIdempotentEntityCreate({ entity, keyField: 'creation_request_key', key: 'k1', data, label: 'Widget' });
  assert.equal(store.length, 1, 'created once');
  const second = await ensureIdempotentEntityCreate({ entity, keyField: 'creation_request_key', key: 'k1', data, label: 'Widget' });
  assert.equal(second.id, first.id, 'retry returns same record');
  assert.equal(store.length, 1, 'no duplicate created');
}

await assert.rejects(
  (async () => {
    const { entity } = makeStore();
    await ensureIdempotentEntityCreate({ entity, keyField: 'creation_request_key', key: 'k2', data: { name: 'A' }, label: 'Widget' });
    await ensureIdempotentEntityCreate({ entity, keyField: 'creation_request_key', key: 'k2', data: { name: 'B' }, label: 'Widget' });
  })(),
  /different data/, 'same key different payload throws');

await assert.rejects(
  (async () => {
    const entity = {
      filter: async () => [],
      create: async () => { throw new Error('server exploded'); },
    };
    await ensureIdempotentEntityCreate({ entity, keyField: 'creation_request_key', key: 'k3', data: {}, label: 'Widget' });
  })(),
  /Do not retry blindly/, 'unverifiable failed create refuses blind retry');

console.log('PASS entity persistence (16 cases)');
