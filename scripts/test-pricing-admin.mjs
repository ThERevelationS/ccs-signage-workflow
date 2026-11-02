// F-24 suite — PricingAdminTabs pure surface: tab registry, schema parity,
// WRITE_OPS mirror, draft normalizers, CAS helpers, per-entity JSON
// validators, variables normalization, paging, error surfacing.
//
// Bundles the .jsx with esbuild; react/lucide and every '@/…' app import are
// stubbed to proxies (the component layer never renders here). The real
// base44/shared/pricingVariables.ts bundles in — it is pure TS.
//
// Run: node scripts/test-pricing-admin.mjs  →  prints "PASS pricing-admin (N asserts)"

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-pricing-admin.mjs');
const stub = {
  name: 'pricing-admin-stubs',
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react\/jsx-runtime|lucide-react|@\/.*)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const p = new Proxy(function(){ return null }, { get: (t, k) => (k === "__esModule" ? true : (k === "default" ? p : p)), apply: () => p }); module.exports = p;',
      loader: 'js',
    }));
  },
};
await build({
  entryPoints: [resolve(here, '../src/components/estimator/settings/PricingAdminTabs.jsx')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent', plugins: [stub],
});
const M = await import(pathToFileURL(out).href);
const {
  PRICING_ADMIN_TABS, REGISTRY_WRITE_OPS, REGISTRY_PAGE_SIZE, IMPORT_JOBS_LIMIT,
  PRICING_VARIABLES_SETTING_KEY, STATUS_OPTIONS, INPUT_TYPE_OPTIONS,
  MACHINE_TYPE_OPTIONS, RATE_BASIS_OPTIONS,
  registryTab, registryByEntity, registryWriteOps,
  validateTierRules, validateTemplateBreaks, validateModifierRates, validateMachineProfiles,
  blankDraft, draftFromRow, recordFromDraft, validateDraft, cleanRecord,
  casQueryFor, setPatchFor, stampUpdatedBy, cellSummary, importJobProgress,
  pickPricingVariablesRow, validatePricingVariablesDraft,
  pageCountFor, pageSlice, isForbidden, friendlyRegistryError,
} = M;

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const deepEq = (a, b, m) => { n += 1; assert.deepEqual(a, b, m); };
const tabFor = (key) => PRICING_ADMIN_TABS.find((t) => t.key === key);

// ===========================================================================
// 1. Tab registry — 8 tabs in spec order, unique keys, icon per tab.
// ===========================================================================
eq(PRICING_ADMIN_TABS.length, 8, 'exactly 8 tabs');
deepEq(
  PRICING_ADMIN_TABS.map((t) => t.key),
  ['tiers', 'templates', 'variables', 'modifiers', 'machines', 'labor', 'partGroups', 'imports'],
  'tab order matches the F-24 brief',
);
eq(new Set(PRICING_ADMIN_TABS.map((t) => t.key)).size, 8, 'tab keys unique');
for (const t of PRICING_ADMIN_TABS) {
  ok(typeof t.label === 'string' && t.label.length > 0, `label present: ${t.key}`);
  ok(typeof t.icon === 'string' && t.icon.length > 0, `icon present: ${t.key}`);
  ok(typeof t.hint === 'string' && t.hint.length > 0, `hint present: ${t.key}`);
}
deepEq(PRICING_ADMIN_TABS.map((t) => t.entity).filter(Boolean).sort(),
  ['BuilderPartGroup', 'GlobalPricingTier', 'ImportJob', 'LaborLevel', 'Machine', 'PricingModifier', 'PricingTemplate'],
  'exactly the 7 registry entities');
eq(tabFor('variables').kind, 'variables', 'variables tab is the bespoke kind');
eq(tabFor('imports').readOnly, true, 'imports tab read-only');
eq(registryTab('machines').entity, 'Machine', 'registryTab lookup');
eq(registryByEntity('LaborLevel').key, 'labor', 'registryByEntity lookup');
eq(registryTab('nope'), null, 'registryTab miss -> null');

// ===========================================================================
// 2. Schema parity — every configured field/column key is a declared property,
//    and every schema-required field is required in config.
// ===========================================================================
const schemaOf = (entity) => JSON.parse(readFileSync(resolve(here, `../base44/entities/${entity}.jsonc`), 'utf8'));
for (const t of PRICING_ADMIN_TABS) {
  if (!t.entity) continue;
  const schema = schemaOf(t.entity);
  const declared = new Set(Object.keys(schema.properties || {}));
  for (const f of t.fields || []) {
    ok(declared.has(f.key), `${t.entity} field '${f.key}' is a declared schema property`);
  }
  for (const c of t.columns || []) {
    if (c.type === 'render' || c.key.startsWith('_')) continue;
    ok(declared.has(c.key), `${t.entity} column '${c.key}' is a declared schema property`);
  }
  if (!t.readOnly) {
    for (const req of schema.required || []) {
      const f = (t.fields || []).find((x) => x.key === req);
      ok(f && f.required === true, `${t.entity} schema-required '${req}' is required in config`);
    }
  }
}
// ImportJob columns cover the importer-facing audit fields
{
  const cols = new Set(tabFor('imports').columns.map((c) => c.key));
  for (const k of ['import_type', 'status', 'user_email', 'file_name', 'phase']) {
    ok(cols.has(k), `ImportJob column '${k}' present`);
  }
}

// ===========================================================================
// 3. WRITE_OPS mirror — component ops ⊆ deployed gateway ops; updateMany-only
//    entities have no create/delete affordance.
// ===========================================================================
{
  const src = readFileSync(resolve(here, '../base44/functions/staffEntityWrite/entry.ts'), 'utf8');
  const serverOps = {};
  for (const m of src.matchAll(/^\s*([A-Za-z0-9_]+):\s*new Set\(\[([^\]]*)\]\)/gm)) {
    serverOps[m[1]] = new Set([...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  }
  for (const [entity, ops] of Object.entries(REGISTRY_WRITE_OPS)) {
    const srv = serverOps[entity];
    ok(srv, `${entity} exists in deployed WRITE_OPS`);
    if (!srv) continue;
    for (const [op, allowed] of Object.entries(ops)) {
      if (allowed) ok(srv.has(op), `${entity}.${op} is a real gateway op`);
      else ok(!srv.has(op) || entity === 'ImportJob',
        `${entity}.${op} correctly hidden (gateway lacks it)`);
    }
    // UI never offers an op the gateway would 403 (ImportJob is intentionally
    // read-only despite the gateway's create/update ops).
    for (const op of srv) {
      if (entity === 'ImportJob') continue; // read-only by design
      ok(ops[op] === true, `${entity}.${op} exposed by the tab (gateway allows it)`);
    }
  }
  deepEq(REGISTRY_WRITE_OPS.BuilderPartGroup, { create: false, updateMany: true, delete: false },
    'BuilderPartGroup is updateMany-only');
  eq(registryWriteOps('UnlistedEntity').create, false, 'unknown entity -> all ops false');
}

// ===========================================================================
// 4. Enum/select options stay inside the declared vocabularies.
// ===========================================================================
{
  deepEq(STATUS_OPTIONS.map((o) => o.value), ['active', 'inactive'], 'status options');
  const inputEnum = ['text', 'number', 'select', 'checkbox', 'formula'];
  deepEq(INPUT_TYPE_OPTIONS.map((o) => o.value), inputEnum, 'modifier input_type vocabulary');
  const rateEnum = schemaOf('LaborLevel').properties.rate_basis.enum;
  deepEq(RATE_BASIS_OPTIONS.map((o) => o.value), rateEnum, 'labor rate_basis matches schema enum');
  const machineEnum = schemaOf('Machine').properties.machine_type;
  ok(machineEnum.type === 'string', 'Machine.machine_type is a free-form string per schema');
  for (const v of ['roll_fed', 'sheet_fed', 'other']) {
    ok(MACHINE_TYPE_OPTIONS.some((o) => o.value === v), `machine_type option '${v}' present`);
  }
}

// ===========================================================================
// 5. JSON validators.
// ===========================================================================
eq(validateTierRules([{ tier: 'Wholesale', markup_pct: 30 }]), null, 'tier rule ok');
eq(validateTierRules([{ tier: 'VIP', market_based: true }]), null, 'market_based rule w/o markup ok');
ok(/array/.test(validateTierRules({})), 'rules non-array rejected');
ok(/"tier"/.test(validateTierRules([{ markup_pct: 10 }])), 'rule without tier rejected');
ok(/markup_pct/.test(validateTierRules([{ tier: 'A' }])), 'rule without markup_pct rejected');
ok(/true or false/.test(validateTierRules([{ tier: 'A', market_based: 'yes' }])), 'non-bool market_based rejected');
eq(validateTierRules([]), null, 'empty rules array valid');

eq(validateTemplateBreaks([{ qty: 1, tier_markups: { 'General Public': 50 } }, { qty: 10, tier_markups: { 'General Public': 40 } }]), null, 'ascending breaks ok');
ok(/greater than/.test(validateTemplateBreaks([{ qty: 10 }, { qty: 5 }])), 'descending breaks rejected');
ok(/non-negative/.test(validateTemplateBreaks([{ qty: -1 }])), 'negative qty rejected');
ok(/object/.test(validateTemplateBreaks(['x'])), 'non-object break rejected');
ok(/tier_markups.*object/.test(validateTemplateBreaks([{ qty: 1, tier_markups: [1, 2] }])), 'array tier_markups rejected');
ok(/must be a number/.test(validateTemplateBreaks([{ qty: 1, tier_markups: { A: 'x' } }])), 'non-numeric markup rejected');
eq(validateTemplateBreaks([]), null, 'empty breaks valid');

eq(validateModifierRates([{ label: 'Std', retail: 1.5, cost: 0.9, per_unit: 'sqft' }]), null, 'rate row ok');
ok(/retail/.test(validateModifierRates([{ retail: 'abc' }])), 'non-numeric retail rejected');
ok(/cost/.test(validateModifierRates([{ cost: 'x' }])), 'non-numeric cost rejected');
ok(/object/.test(validateModifierRates([42])), 'non-object rate rejected');

eq(validateMachineProfiles([{ name: 'draft' }, { name: 'production', speed_settings: { sqft_per_hour: 180 } }]), null, 'profiles ok');
ok(/duplicated/.test(validateMachineProfiles([{ name: 'A' }, { name: 'a' }])), 'ci duplicate profile rejected');
ok(/name/.test(validateMachineProfiles([{ speed_settings: {} }])), 'profile without name rejected');
ok(/speed_settings/.test(validateMachineProfiles([{ name: 'x', speed_settings: 5 }])), 'non-object speed_settings rejected');

// ===========================================================================
// 6. Draft lifecycle — blank -> row -> record round-trips.
// ===========================================================================
{
  const tiers = tabFor('tiers');
  const blank = blankDraft(tiers);
  eq(blank.status, 'active', 'select default applied');
  eq(blank.rules, '[]', 'json array field blanks to []');
  eq(blankDraft(tabFor('partGroups')).group_snapshot, '{}', 'json object field blanks to {}');
  eq(blankDraft(tabFor('partGroups')).copy_as_unit, true, 'checkbox default true honored');
  eq(blankDraft(tabFor('modifiers')).input_type, 'number', 'modifier input_type default');
  eq(blankDraft(tabFor('labor')).rate_basis, 'units_per_hour', 'labor basis default');
}
{
  const tiers = tabFor('tiers');
  const row = { id: 'r1', name: 'Standard', status: 'active', description: 'd', rules: [{ tier: 'GP', markup_pct: 50 }] };
  const d = draftFromRow(tiers, row);
  eq(d.name, 'Standard', 'text passthrough');
  eq(d.rules, JSON.stringify(row.rules, null, 2), 'rules pretty-printed');
  const { record, errors } = recordFromDraft(tiers, d);
  eq(errors.length, 0, 'round-trip clean');
  deepEq(record.rules, row.rules, 'rules parse back');
  eq(record.name, 'Standard');
}
{
  const labor = tabFor('labor');
  const d = { name: ' Lead ', level_rank: '3', hourly_rate: '95.5', rate_basis: 'sqft_per_hour', rate_value: '125', applies_to_categories: 'install, fab ,', status: 'active', description: '' };
  const { record, errors } = recordFromDraft(labor, d);
  eq(errors.length, 0, 'labor record clean');
  eq(record.level_rank, 3, 'numeric string coerces');
  eq(record.hourly_rate, 95.5);
  deepEq(record.applies_to_categories, ['install', 'fab'], 'comma list trims + drops empties');
  eq(record.description, undefined, 'blank optional text omitted (leave-unset, not wipe)');
}
{
  const tiers = tabFor('tiers');
  const bad = recordFromDraft(tiers, { name: '', status: 'active', rules: '{oops' });
  ok(bad.errors.some((e) => e.field === 'name'), 'required name flagged');
  ok(bad.errors.some((e) => e.field === 'rules' && /JSON/.test(e.message)), 'bad JSON flagged');
  const notArr = recordFromDraft(tiers, { name: 'x', rules: '{"a":1}' });
  ok(notArr.errors.some((e) => /array/.test(e.message)), 'non-array JSON flagged');
  const badShape = recordFromDraft(tiers, { name: 'x', rules: '[{"tier":"A"}]' });
  ok(badShape.errors.some((e) => /markup_pct/.test(e.message)), 'json shape validator runs');
  const badObj = recordFromDraft(tabFor('partGroups'), { group_name: 'g', builder_product_id: 'p', group_snapshot: '[1]' });
  ok(badObj.errors.some((e) => /object/.test(e.message)), 'object-kind json rejects arrays');
}
{
  const machines = tabFor('machines');
  const { errors } = validateDraft(machines, { name: 'M1', labor_pct: '140' }, { rows: [] });
  ok(errors.some((e) => e.field === 'labor_pct' && /at most/.test(e.message)), 'labor_pct max enforced');
  const { errors: e2 } = validateDraft(machines, { name: 'M1', labor_pct: '-1' }, { rows: [] });
  ok(e2.some((e) => e.field === 'labor_pct'), 'labor_pct min enforced');
}
{
  const tiers = tabFor('tiers');
  const rows = [{ id: 'a', name: 'Standard' }, { id: 'b', name: 'Wholesale' }];
  const dup = validateDraft(tiers, { name: 'standard', status: 'active', rules: '[]' }, { rows, editingId: '' });
  ok(dup.errors.some((e) => e.field === 'name' && /already exists/.test(e.message)), 'ci duplicate name flagged');
  const same = validateDraft(tiers, { name: 'standard', status: 'active', rules: '[]' }, { rows, editingId: 'a' });
  eq(same.errors.length, 0, 'same-row rename allowed');
  const free = validateDraft(tiers, { name: 'NewTier', status: 'active', rules: '[]' }, { rows });
  eq(free.errors.length, 0, 'unique name passes');
}

// ===========================================================================
// 7. CAS + payload hygiene.
// ===========================================================================
{
  deepEq(casQueryFor({ id: 'x', updated_date: '2026-01-01T00:00:00Z' }),
    { id: 'x', updated_date: '2026-01-01T00:00:00Z' }, 'cas anchor shape');
  eq(casQueryFor({ id: 'x' }), null, 'missing updated_date -> null anchor');
  eq(casQueryFor({}), null, 'missing id -> null anchor');
  const patch = setPatchFor({ name: 'A', id: 'strip-me', updated_date: 'x', ghost: undefined });
  deepEq(patch, { $set: { name: 'A' } }, '$set wrapper strips system + undefined fields');
  const stamped = stampUpdatedBy(tabFor('labor'), { name: 'L' }, 'admin@x.com');
  eq(stamped.updated_by, 'admin@x.com', 'labor stamps updated_by');
  const notStamped = stampUpdatedBy(tabFor('machines'), { name: 'M' }, 'admin@x.com');
  ok(!('updated_by' in notStamped), 'machines do not stamp updated_by');
}

// ===========================================================================
// 8. Cell summaries + import helpers.
// ===========================================================================
{
  eq(cellSummary({ status: 'inactive' }, { key: 'status', type: 'status' }), 'inactive');
  eq(cellSummary({}, { key: 'status', type: 'status' }), 'active', 'unset status reads active');
  eq(cellSummary({ copy_as_unit: true }, { key: 'copy_as_unit', type: 'bool' }), 'Yes');
  eq(cellSummary({ rules: [{}, {}] }, { key: 'rules', type: 'json' }), '2 entries');
  eq(cellSummary({ group_snapshot: { a: 1 } }, { key: 'group_snapshot', type: 'json' }), '1 key');
  eq(cellSummary({ applies_to_categories: ['a', 'b'] }, { key: 'applies_to_categories', type: 'list' }), 'a, b');
  eq(cellSummary({ x: 'y'.repeat(80) }, { key: 'x' }).length, 58, 'long text truncates to 57+ellipsis');
  eq(cellSummary({}, { key: 'x' }), '—', 'empty -> dash');
  eq(importJobProgress({ total_items: 200, processed_items: 50 }).pct, 25, 'progress pct');
  eq(importJobProgress({ total_items: 0, processed_items: 0 }).pct, 0, 'zero-total progress');
}

// ===========================================================================
// 9. Pricing-variables helpers.
// ===========================================================================
{
  eq(PRICING_VARIABLES_SETTING_KEY, 'pricingVariables', 'canonical carrier key');
  const rows = [
    { setting_key: 'other', pricing_variables: [{ name: 'X', default_value: 1 }] },
    { setting_key: 'pricingVariables', pricing_variables: [] },
  ];
  eq(pickPricingVariablesRow(rows).setting_key, 'pricingVariables', 'canonical key wins');
  eq(pickPricingVariablesRow([rows[0]]).setting_key, 'other', 'field-carrier fallback');
  eq(pickPricingVariablesRow([{ setting_key: 'none' }]), null, 'no carrier -> null');
  eq(pickPricingVariablesRow('junk'), null, 'non-array -> null');
}
{
  const good = validatePricingVariablesDraft([{ name: 'SqFtRate', default_value: 1.5 }]);
  eq(good.errors.length, 0, 'clean variable list');
  eq(good.rows[0].status, 'active', 'valid row normalizes active');
  const bad = validatePricingVariablesDraft([
    { name: 'Quantity', default_value: 1 },
    { name: 'has space', default_value: 1 },
    { name: 'Dup', default_value: 1 }, { name: 'dup', default_value: 2 },
  ]);
  eq(bad.errors.length, 3, 'reserved + invalid + duplicate flagged');
  ok(bad.errors.some((e) => /reserved|builtin/.test(e.error)), 'builtin collision explained');
  ok(bad.errors.some((e) => /duplicate/.test(e.error)), 'duplicate explained');
}

// ===========================================================================
// 10. Paging + error surfacing.
// ===========================================================================
{
  eq(REGISTRY_PAGE_SIZE, 25, 'page size');
  eq(IMPORT_JOBS_LIMIT, 200, 'import bound');
  eq(pageCountFor([]), 1, 'empty -> 1 page');
  eq(pageCountFor(new Array(26).fill(0)), 2, 'ceil page count');
  eq(pageSlice(new Array(60).fill(0).map((_, i) => i), 2, 25)[0], 50, 'page slice offset');
  eq(pageSlice([1, 2], 9, 25).length, 2, 'out-of-range page clamps');
  eq(isForbidden({ status: 403 }), true, '403 detected');
  eq(isForbidden({ response: { status: 403 } }), true, 'envelope 403 detected');
  eq(isForbidden({ status: 500 }), false, '500 not forbidden');
  ok(/administrators/.test(friendlyRegistryError({ status: 403 }, 'machine')), '403 surfaces admin gate');
  eq(friendlyRegistryError({ message: 'boom' }, 'machine'), 'boom', 'plain errors pass through');
  ok(/refused \(403\)/.test(friendlyRegistryError({ status: 403 })), '403 message names refusal');
}

rmSync(out, { force: true });
console.log(`PASS pricing-admin (${n} asserts: registry/schema-parity/write-ops/enums/validators/drafts/CAS/cells/variables/paging/errors)`);
