import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-entities-src.mjs');
writeFileSync(stub, `
export const DimensionalLetterMaterial = { __name: 'DimensionalLetterMaterial' };
export const SignLightingInventory = { __name: 'SignLightingInventory' };
export const SignHardwareInventory = { __name: 'SignHardwareInventory' };
export const LaborServiceInventory = { __name: 'LaborServiceInventory' };
export const SignPartsSuppliesInventory = { __name: 'SignPartsSuppliesInventory' };
export const VinylInventory = { __name: 'VinylInventory' };
`);
const out = resolve(here, '.tmp-inventory-sources.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/masterInventory/inventorySources.jsx')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  loader: { '.jsx': 'jsx' },
  alias: { '@/entities/all': stub },
});
const { INVENTORY_SOURCES, SOURCE_BY_KEY } = await import(pathToFileURL(out).href);
rmSync(stub, { force: true });
rmSync(out, { force: true });

assert.ok(INVENTORY_SOURCES.length >= 5, 'inventory sources registered');
const keys = new Set();
for (const s of INVENTORY_SOURCES) {
  assert.ok(s.key && s.label, `${s.key} declares key+label`);
  assert.ok(!keys.has(s.key), `${s.key} unique`);
  keys.add(s.key);
  assert.equal(SOURCE_BY_KEY[s.key], s, `${s.key} in SOURCE_BY_KEY`);
  if (!s.custom) {
    assert.ok(s.entity, `${s.key} declarative source has an entity`);
    for (const f of s.fields || []) {
      assert.ok(f.name && f.label, `${s.key}.${f.name} field declared`);
    }
    const names = new Set((s.fields || []).map((f) => f.name));
    assert.equal(names.size, (s.fields || []).length, `${s.key} field names unique`);
  }
}

// Table fields must reference declared names.
for (const s of INVENTORY_SOURCES.filter((x) => !x.custom && x.fields)) {
  for (const f of s.fields.filter((x) => x.table)) {
    assert.ok(f.name, `${s.key} table field has a name`);
  }
}

console.log(`PASS inventory sources (${INVENTORY_SOURCES.length} sources)`);
