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

// ---------- #396: company_name is the Customer identity/dedupe CAS key ----------
// expectedCustomerFields always carries the loaded company_name baseline — even
// when the write never touches the name — so a concurrent rename fails closed
// instead of silently syncing fields onto a renamed record.
assert.deepEqual(
  expectedCustomerFields({ id: 'c1', company_name: 'Acme Signs', email: 'a@x' }, { email: 'b@x' }),
  { email: 'a@x', company_name: 'Acme Signs' }, 'company_name baseline carried on non-rename writes');
assert.deepEqual(
  expectedCustomerFields({ id: 'c1', company_name: 'Acme Signs' }, { company_name: 'Acme Sign Co' }),
  { company_name: 'Acme Signs' }, 'explicit rename still baselines the old name once');
assert.deepEqual(
  expectedCustomerFields({ id: 'c1', email: 'a@x' }, { email: 'b@x' }),
  { email: 'a@x' }, 'no stored name -> no name guard (pre-name rows)');

// Concurrent rename detected mid-write: current row renamed since load -> fail closed.
await assert.rejects(
  (async () => {
    let writes = 0;
    const rec = { id: 'c4', updated_date: 'v9', company_name: 'Renamed LLC', email: 'old@x.com' };
    const entity = { get: async () => ({ ...rec }), updateMany: async () => { writes += 1; return { updated: 1 }; } };
    try {
      await replaceCustomerFieldsIfUnchanged({
        entity, customerId: 'c4',
        expectedFields: { email: 'old@x.com', company_name: 'Acme Signs' },
        nextFields: { email: 'new@x.com' }, label: 'Test',
      });
    } finally {
      assert.equal(writes, 0, 'no updateMany attempted on a renamed record');
    }
  })(),
  /changed in another session \(company_name\)/, 'rename drift fails the CAS closed');

// An explicit rename write declares the name in nextFields and lands normally.
{
  const rec = { id: 'c5', updated_date: 'v4', company_name: 'Acme Signs' };
  const entity = {
    get: async () => ({ ...rec }),
    updateMany: async (q, set) => { Object.assign(rec, set.$set, { updated_date: 'v5' }); return { updated: 1 }; },
  };
  const saved = await replaceCustomerFieldsIfUnchanged({
    entity, customerId: 'c5',
    expectedFields: { company_name: 'Acme Signs' },
    nextFields: { company_name: 'Acme Sign Co' }, label: 'Test',
  });
  assert.equal(saved.company_name, 'Acme Sign Co', 'declared rename writes through');
}

// Missing loaded baseline for a desired field fails before any read/write.
await assert.rejects(
  replaceCustomerFieldsIfUnchanged({
    entity: { get: async () => ({}), updateMany: async () => ({ updated: 1 }) },
    customerId: 'c6', expectedFields: {}, nextFields: { email: 'x@x' }, label: 'Test',
  }),
  /missing the loaded baseline/, 'baseline must cover every desired field');

console.log('PASS customer persistence (13 cases)');
process.exit(0);
