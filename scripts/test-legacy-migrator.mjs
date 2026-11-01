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
const sdkStub = resolve(here, '.tmp-sdk-legacy.mjs');
writeFileSync(sdkStub, 'export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }), functions: new Proxy({}, { get: () => async () => ({}) }), integrations: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), auth: new Proxy({}, { get: () => async () => null }) }; export const isRetryableFunction = () => false; export const requestGovernor = {};');
const out = resolve(here, '.tmp-legacy-migrator.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/masterInventory/legacyInventoryMigrator.jsx')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', alias: { '@/entities/all': stub, '@/api/base44Client': sdkStub }, define: { 'import.meta.env': '{}' } });
globalThis.window = { location: { href: 'http://test.local' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { title: '', createElement: () => ({}), querySelector: () => null };
globalThis.localStorage = window.localStorage;
const { classifyLegacyRow, previewLegacyMigration, buildPayload, TARGET_ENTITY } = await import(pathToFileURL(out).href);

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

// #466 — buildPayload must produce a valid payload for EVERY target
// classifyLegacyRow can emit (labor_service | sign_parts_supplies | substrate |
// keep), and fail closed (null) on anything else.

// TARGET_ENTITY covers exactly the three migration targets — keep/unknown
// targets must have no entity to write to.
assert.deepEqual(Object.keys(TARGET_ENTITY).sort(), ['labor_service', 'sign_parts_supplies', 'substrate']);

// labor_service — permit-vs-labor branch and cost mapping.
{
  const row = { material_type: 'permit fee', product_type: 'variance', cost_per_unit: '250', supplier: 'City', notes: 'n' };
  assert.equal(classifyLegacyRow(row), 'labor_service');
  const p = buildPayload(row, 'labor_service');
  assert.equal(p.service_category, 'permitting', 'permit branch');
  assert.equal(p.pricing_mode, 'flat');
  assert.equal(p.default_rate, 250);
  assert.equal(p.service_name, 'variance');
  const labor = buildPayload({ material_type: 'install labor', cost_per_unit: '95' }, 'labor_service');
  assert.equal(labor.service_category, 'subcontractor_labor');
  assert.equal(labor.pricing_mode, 'per_hour');
  assert.equal(labor.is_active, true);
}

// sign_parts_supplies — category + pricing-mode mapping.
{
  const row = { material_type: 'trim cap', product_type: 'trim cap black', cost_per_unit: '2.5', unit_type: 'per_foot' };
  assert.equal(classifyLegacyRow(row), 'sign_parts_supplies');
  const p = buildPayload(row, 'sign_parts_supplies');
  assert.equal(p.category, 'trim_cap');
  assert.equal(p.pricing_mode, 'per_foot');
  assert.equal(p.cost_per_unit, 2.5);
  const paint = buildPayload({ material_type: 'paint', product_type: 'matthews paint', cost_per_unit: '30', unit_type: 'per_piece' }, 'sign_parts_supplies');
  assert.equal(paint.category, 'paint_ink');
  assert.equal(paint.pricing_mode, 'per_piece');
}

// substrate — material_type + thickness + cost-per-sheet math.
{
  const row = { material_type: 'plastic', product_type: 'acrylic 0.125', cost_per_unit: '10', unit_type: 'per_sqft', size: '4x8' };
  assert.equal(classifyLegacyRow(row), 'substrate');
  const p = buildPayload(row, 'substrate');
  assert.equal(p.material_type, 'acrylic');
  assert.equal(p.thickness_inches, 0.125, 'thickness parsed from product_type');
  assert.equal(p.cost_per_sheet, 320, 'per_sqft cost ×32 → per-sheet');
  const steel = buildPayload({ material_type: 'x', product_type: 'steel sheet .5', cost_per_unit: '9', unit_type: 'per_piece' }, 'substrate');
  assert.equal(steel.material_type, 'steel_sheet');
  assert.equal(steel.cost_per_sheet, 9, 'per_piece cost stays as-sheet');
}

// keep — classified rows stay in Inventory; buildPayload must NOT fabricate
// a payload for a non-migration target.
{
  const row = { material_type: 'aluminum', product_type: 'extrusion' };
  assert.equal(classifyLegacyRow(row), 'keep');
  assert.equal(buildPayload(row, 'keep'), null, 'keep has no migration payload');
}

// Unknown/bogus target fails closed.
assert.equal(buildPayload({ material_type: 'x' }, 'nowhere'), null);
assert.equal(buildPayload({}, 'labor_service').service_name, 'Imported Item', 'fallback name when row is bare');

console.log('PASS legacy migrator (33 cases)');
