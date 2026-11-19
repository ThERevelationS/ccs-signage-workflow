import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-persistence.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/customerPersistence.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { expectedCustomerFields, replaceCustomerFieldsIfUnchanged } = await import(pathToFileURL(out).href);

assert.deepEqual(
  expectedCustomerFields({ a: 1, b: 2, c: 3 }, { a: 9 }),
  { a: 1 }, 'baseline snapshots only desired fields');

{
  let rec = { id: 'c1', updated_date: 'v1', email: 'old@x.com' };
  const entity = {
    get: async () => ({ ...rec }),
    updateMany: async (q, set) => { assert.equal(q.updated_date, 'v1'); rec = { ...rec, ...set.$set, updated_date: 'v2' }; return { updated: 1 }; },
  };
  const saved = await replaceCustomerFieldsIfUnchanged({
    entity, customerId: 'c1', expectedFields: { email: 'old@x.com' }, nextFields: { email: 'new@x.com' }, label: 'Test',
  });
  assert.equal(saved.email, 'new@x.com', 'CAS update landed + re-read');
}

await assert.rejects(
  (async () => {
    const rec = { id: 'c2', updated_date: 'v2', email: 'other@x.com' };
    const entity = { get: async () => ({ ...rec }), updateMany: async () => ({ updated: 1 }) };
    await replaceCustomerFieldsIfUnchanged({
      entity, customerId: 'c2', expectedFields: { email: 'old@x.com' }, nextFields: { email: 'new@x.com' }, label: 'Test',
    });
  })(),
  /changed|reload/i, 'drifted field blocks customer write');

{
  let writes = 0;
  const rec = { id: 'c3', updated_date: 'v3', email: 'same@x.com' };
  const entity = { get: async () => ({ ...rec }), updateMany: async () => { writes += 1; return { updated: 1 }; } };
  const res = await replaceCustomerFieldsIfUnchanged({
    entity, customerId: 'c3', expectedFields: { email: 'old@x.com' }, nextFields: { email: 'same@x.com' }, label: 'Test',
  });
  assert.equal(writes, 0, 'already-desired skips write');
  assert.equal(res.email, 'same@x.com');
}

console.log('PASS customer persistence (7 cases)');
