import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-labor-schema.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/masterInventory/laborServiceCategorySchema.jsx')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { LABOR_SERVICE_CATEGORY_FIELDS, LABOR_SERVICE_CATEGORY_FIELD_NAMES } = await import(pathToFileURL(out).href);

const cats = Object.entries(LABOR_SERVICE_CATEGORY_FIELDS);
assert.ok(cats.length >= 5, 'labor categories registered');
const allNames = new Set();
for (const [key, cat] of cats) {
  assert.ok(cat.label && Array.isArray(cat.fields), `${key} declares label + fields`);
  for (const f of cat.fields) {
    assert.ok(f.name && f.label && f.type, `${key}.${f.name} fully declared`);
    if (f.type === 'select') assert.ok(Array.isArray(f.options) && f.options.length, `${key}.${f.name} select needs options`);
    assert.ok(!allNames.has(f.name), `${f.name} unique across categories`);
    allNames.add(f.name);
  }
}
// FIELD_NAMES is exactly the union, deduped.
assert.deepEqual([...LABOR_SERVICE_CATEGORY_FIELD_NAMES].sort(), [...allNames].sort());
assert.equal(LABOR_SERVICE_CATEGORY_FIELD_NAMES.length, new Set(LABOR_SERVICE_CATEGORY_FIELD_NAMES).size);

console.log(`PASS labor schema (${cats.length} categories, ${allNames.size} fields)`);
