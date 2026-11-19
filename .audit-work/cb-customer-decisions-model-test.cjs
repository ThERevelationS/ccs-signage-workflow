const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const original = fs.readFileSync('.audit-work/cb-build.cjs', 'utf8');
const cutoff = original.indexOf('const newRows =');
assert.ok(cutoff > 0);
const originalModule = { exports: {} };
vm.runInNewContext(`${original.slice(0, cutoff)}\nmodule.exports={customerRow,cbById};`, {
  require, module: originalModule, exports: originalModule.exports, console,
});
for (const id of [61, 2886, 424, 2701, 1036, 2608, 1926, 488, 1810, 2767, 2944, 447, 3284, 531, 2606]) {
  const account = originalModule.exports.cbById.get(id);
  assert.ok(account, `archive ${id}`);
  assert.equal(originalModule.exports.customerRow(account).__source_id__, String(id));
}
const source = fs.readFileSync('.audit-work/cb-customer-decisions-apply.mjs', 'utf8');
const start = source.indexOf('const empty =');
const end = source.indexOf('async function importRow');
assert.ok(start > 0 && end > start);
const resultModule = { exports: {} };
const full = { __source_id__: '1', company_name: 'CB', company_phone: 'new', customer_status: 'inactive', is_active: false, pricing_tier: 3, billing_country: 'United States', notes: 'CB note' };
vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports={updateRow};`, { module: resultModule, exports: resultModule.exports, customerRow: () => full, Object, Set });
const result = resultModule.exports.updateRow({}, { company_name: 'Keep', company_phone: 'existing', billing_country: 'Canada', notes: 'existing' });
assert.equal(result.company_name, 'Keep');
assert.equal(result.company_phone, undefined);
assert.equal(result.billing_country, 'Canada');
assert.equal(result.customer_status, 'inactive');
assert.equal(result.is_active, false);
assert.equal(result.pricing_tier, 3);
assert.equal(result.notes, 'existing\nCB note');
console.log('PASS customer decisions model: all 15 archive rows resolve; fill-empty and authoritative fields preserve existing data');
