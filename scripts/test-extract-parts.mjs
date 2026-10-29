import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-extract-parts.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/builder/partSync.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
});
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { extractBuilderParts } = await import(pathToFileURL(out).href);

// Null/empty input.
assert.deepEqual(extractBuilderParts('vinyl', null), []);
assert.deepEqual(extractBuilderParts('vinyl', {}, {}), []);

// Unknown module -> manual-items fallback keyed by module.
{
  const parts = extractBuilderParts('legacy_thing', { items: [{ description: 'Widget', quantity: 2, item_total_cost: 50 }] });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].part_key, 'legacy_thing:item:0');
  assert.equal(parts[0].part_name, 'Widget');
  assert.equal(parts[0].extended_cost, 50);
  assert.equal(parts[0].unit_cost, 25, 'unit cost = total / qty');
}

// Metal: per-item material part; unit cost = material_cost / length.
{
  const parts = extractBuilderParts('metal', {
    items: [{ description: 'Angle', quantity: 2, material_length_ft: 10, material_cost: 120 }],
  });
  const material = parts.find((p) => p.part_key.includes('material'));
  assert.ok(material, 'material part emitted');
  assert.equal(material.part_name.includes('Angle'), true);
}

// Metal: zero-cost item without inventory link emits no material part.
{
  const parts = extractBuilderParts('metal', { items: [{ description: 'Free', quantity: 1, material_cost: 0 }] });
  assert.equal(parts.filter((p) => p.part_key.includes('material')).length, 0);
}

console.log('PASS extract builder parts (8 cases)');
// The window shim makes the transitively bundled @base44/sdk take the browser
// code path, which leaves a handle alive — exit explicitly like customerSync.
process.exit(0);
