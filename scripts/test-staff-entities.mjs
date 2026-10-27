import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-fleet-invoke.mjs');
writeFileSync(stub, `
globalThis.__calls = [];
globalThis.__response = {};
export const invokeFleet = async (fn, body) => {
  globalThis.__calls.push({ fn, body });
  return globalThis.__response;
};
`);
const out = resolve(here, '.tmp-staff-entities.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/staff/staffEntities.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/components/fleet/fleetInvoke': stub },
});
const { staffEntities } = await import(pathToFileURL(out).href);
const calls = globalThis.__calls;
const setRes = (r) => { globalThis.__response = r; calls.length = 0; };

// filter -> staffDataRead, returns items.
setRes({ items: [{ id: 'a' }, { id: 'b' }] });
assert.deepEqual(await staffEntities.Customer.filter({ company_name: 'X' }, '-created_date', 10), [{ id: 'a' }, { id: 'b' }]);
assert.equal(calls[0].fn, 'staffDataRead');
assert.equal(calls[0].body.entity, 'Customer');
assert.equal(calls[0].body.query.company_name, 'X');

// get -> staffDataRead, returns item ?? null.
setRes({ item: { id: 'c' } });
assert.equal((await staffEntities.Invoice.get('c')).id, 'c');
setRes({});
assert.equal(await staffEntities.Invoice.get('ghost'), null, 'missing -> null');

// count -> staffDataRead with count:true, returns count.
setRes({ count: 7 });
assert.equal(await staffEntities.WorkOrder.count({ deleted: false }), 7);
assert.equal(calls[0].body.count, true);

// list -> staffDataRead, returns items.
setRes({ items: [{ id: 'd' }] });
assert.equal((await staffEntities.Customer.list('-company_name', 50))[0].id, 'd');
assert.equal(calls[0].body.sort, '-company_name');

// create/update/delete -> staffEntityWrite with op.
setRes({ record: { id: 'new1' } });
assert.equal((await staffEntities.Customer.create({ company_name: 'N' })).id, 'new1');
assert.equal(calls[0].fn, 'staffEntityWrite');
assert.equal(calls[0].body.op, 'create');
setRes({ record: { id: 'u1' } });
assert.equal((await staffEntities.Customer.update('u1', { company_name: 'U' })).id, 'u1');
assert.equal(calls[0].body.op, 'update');
assert.equal(calls[0].body.id, 'u1');
setRes({ deleted: true });
assert.equal(await staffEntities.Customer.delete('d1'), true);
assert.equal(calls[0].body.op, 'delete');

// Unknown method -> rejects, does NOT route to any gateway.
calls.length = 0;
await assert.rejects(staffEntities.Customer.bulkDelete([1, 2]), /not available/);
assert.equal(calls.length, 0, 'unlisted methods never reach the gateway');

rmSync(stub, { force: true });
rmSync(out, { force: true });
console.log('PASS staff entities facade (18 cases)');
process.exit(0);
