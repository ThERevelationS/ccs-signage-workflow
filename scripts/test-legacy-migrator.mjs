import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
import { writeFileSync } from 'node:fs';
const stub = resolve(here, '.tmp-entities-legacy.mjs');
writeFileSync(stub, `
export const LaborServiceInventory = {};
export const SignPartsSuppliesInventory = {};
export const DimensionalLetterMaterial = {};
export const Inventory = {};
export const LegacyMigrationMap = {};
`);
const out = resolve(here, '.tmp-legacy-migrator.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/masterInventory/legacyInventoryMigrator.jsx')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' }, alias: { '@/entities/all': stub } });
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, location: { href: "http://t/", search: "", pathname: "/", hash: "", origin: "http://t" }, history: { replaceState: () => {} } };
globalThis.document = { title: "" };
const { classifyLegacyRow, previewLegacyMigration } = await import(pathToFileURL(out).href);

// labor_service: permit/labor/freight signals.
assert.equal(classifyLegacyRow({ material_type: 'permit fee' }), 'labor_service');
assert.equal(classifyLegacyRow({ material_type: 'install labor' }), 'labor_service');
assert.equal(classifyLegacyRow({ supplier: 'crane co' }), 'labor_service');
assert.equal(classifyLegacyRow({ material_type: 'engineering review' }), 'labor_service');

// sign_parts_supplies: trim/paint/adhesive signals.
assert.equal(classifyLegacyRow({ material_type: 'trim cap' }), 'sign_parts_supplies');
assert.equal(classifyLegacyRow({ material_type: 'j-bar' }), 'sign_parts_supplies');
assert.equal(classifyLegacyRow({ material_type: 'sealant' }), 'sign_parts_supplies');
assert.equal(classifyLegacyRow({ material_type: 'adhesive cleaner' }), 'sign_parts_supplies');

// substrate: sheet/plastic-material signals.
assert.equal(classifyLegacyRow({ material_type: 'sintra sheet' }), 'substrate');
assert.equal(classifyLegacyRow({ material_type: 'acrylic panel' }), 'substrate');
assert.equal(classifyLegacyRow({ material_type: 'plastic' }), 'substrate', 'untyped plastic -> substrate');

// keep: valid extrusion types and unclassified rows.
assert.equal(classifyLegacyRow({ material_type: 'aluminum', product_type: 'extrusion' }), 'keep');
assert.equal(classifyLegacyRow({ material_type: 'unknown thing' }), 'keep');

// preview counts each bucket.
{
  const rows = [
    { material_type: 'permit' }, { material_type: 'trim cap' }, { material_type: 'acrylic' }, { material_type: 'other' },
  ];
  const p = previewLegacyMigration(rows);
  assert.equal(p.labor_service, 1);
  assert.equal(p.sign_parts_supplies, 1);
  assert.equal(p.substrate, 1);
  assert.equal(p.keep, 1);
}

console.log('PASS legacy migrator (13 cases)');
