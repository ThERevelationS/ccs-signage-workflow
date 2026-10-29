import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-foundation-schema.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/masterInventory/foundationFieldSchema.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { MATERIAL_TYPES, fieldsFor, typeLabel } = await import(pathToFileURL(out).href);

// Every declared type resolves a label and fields.
assert.ok(MATERIAL_TYPES.length >= 10, 'material type catalog is substantial');
for (const t of MATERIAL_TYPES) {
  assert.ok(t.value && t.label, `${t.value} fully declared`);
  assert.equal(typeLabel(t.value), t.label, `${t.value} label resolves`);
  const fields = fieldsFor(t.value);
  assert.ok(fields.length >= 5, `${t.value} has fields`);
  const keys = new Set(fields.map((f) => f.key));
  assert.equal(keys.size, fields.length, `${t.value} has no duplicate field keys`);
}

// Unknown type -> label falls back to the raw key, fields fall back to COMMON.
assert.equal(typeLabel('nonexistent'), 'nonexistent');
const common = fieldsFor('nonexistent');
assert.ok(common.length >= 5 && common.every((f) => f.key), 'unknown type gets COMMON fields');
assert.ok(common.some((f) => f.key === 'material_name'), 'COMMON includes material_name');

// Type-specific fields actually differ.
assert.notDeepEqual(fieldsFor('concrete_service'), common, 'concrete_service adds its own fields');
assert.ok(fieldsFor('concrete_service').some((f) => f.key === 'minimum_order_yards'));

console.log(`PASS foundation schema (${MATERIAL_TYPES.length * 4 + 8} assertions)`);
