import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stub = resolve(here, '.tmp-entities-all.mjs');
writeFileSync(stub, `
export const DimensionalLetterMaterial = { __name: 'DimensionalLetterMaterial' };
export const VinylInventory = { __name: 'VinylInventory' };
export const SignLightingInventory = { __name: 'SignLightingInventory' };
export const SignHardwareInventory = { __name: 'SignHardwareInventory' };
export const LaborServiceInventory = { __name: 'LaborServiceInventory' };
export const SignPartsSuppliesInventory = { __name: 'SignPartsSuppliesInventory' };
`);
const out = resolve(here, '.tmp-import-mappers.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/masterInventory/importMappers.jsx')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/entities/all': stub, '@/api/gatedEntities': stub },
});
const { nameKey, groupKey, detectTarget, routeRow, validateColumns } = await import(pathToFileURL(out).href);
rmSync(stub, { force: true });
rmSync(out, { force: true });

// nameKey normalizes case + whitespace.
assert.equal(nameKey('  Cast   Vinyl 54"  '), 'cast vinyl 54"');

// groupKey strips dimensions/units for grouping.
assert.equal(groupKey('Acrylic 4x8 Sheet'), 'acrylic sheet');
assert.equal(groupKey('Vinyl 54in, glossy'), 'vinyl , glossy', 'dims stripped, mid-string comma kept');
assert.equal(groupKey('Vinyl 54in,'), 'vinyl', 'trailing comma trimmed');
assert.equal(groupKey('  Pole 20 ft '), 'pole');
assert.equal(groupKey(''), '');

// validateColumns requires the base set.
assert.equal(validateColumns(['Part Name', 'Part Group', 'Part Cost', 'Is Active']).ok, true);
const bad = validateColumns(['Part Name']);
assert.equal(bad.ok, false);
assert.ok(bad.missing.includes('Part Cost'));

// detectTarget: group mapping wins, then keywords, then catch-all.
const vinyl = detectTarget({ 'Part Name': 'Cast Vinyl', 'Part Group': 'Vinyl' });
assert.equal(vinyl, 'vinyl', 'vinyl group routes to vinyl');
const catchall = detectTarget({ 'Part Name': 'Misc fastener', 'Part Group': 'UnmappedThing' });
assert.equal(catchall, 'sign_parts_supplies', 'unmapped falls to catch-all');
const lighting = detectTarget({ 'Part Name': 'LED Module', 'Part Group': '' });
assert.equal(lighting, 'sign_lighting', 'LED keyword routes to lighting');

// "plastic" precedence: Part Group map hits first, sheet/plate keywords route to
// substrate, and a bare "plastic" name without a keyword must NOT jump ahead of
// the keyword rules — it falls through to the catch-all.
const plasticSheet = detectTarget({ 'Part Name': 'Clear plastic sheet 4x8', 'Part Group': '' });
assert.equal(plasticSheet, 'substrate', 'plastic sheet keyword routes to substrate');
const plasticGroup = detectTarget({ 'Part Name': 'Sheet goods', 'Part Group': 'plastic' });
assert.equal(plasticGroup, 'substrate', 'plastic Part Group maps to substrate');
const barePlastic = detectTarget({ 'Part Name': 'Misc plastic fastener', 'Part Group': '' });
assert.equal(barePlastic, 'sign_parts_supplies', 'bare plastic name falls to catch-all, not substrate');
const vinylGroupPlasticName = detectTarget({ 'Part Name': 'Plastic sheet', 'Part Group': 'Vinyl' });
assert.equal(vinylGroupPlasticName, 'vinyl', 'Part Group mapping outranks plastic keywords');

// routeRow returns target metadata + payload name.
{
  const r = routeRow({ 'Part Name': 'Cast Vinyl 54', 'Part Group': 'Vinyl', 'Part Cost': '10', 'Is Active': 'yes' });
  assert.equal(r.target_key, 'vinyl');
  assert.equal(r.nameField, 'vinyl_name');
  assert.ok(r.name, 'name extracted');
  assert.ok(r.payload && typeof r.payload === 'object');
}

console.log('PASS import mappers (16 cases)');
