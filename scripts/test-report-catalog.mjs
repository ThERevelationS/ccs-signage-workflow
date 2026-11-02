// Contract checks for masterplan item J-02 (w-142): reportCatalogModel.ts.
// Bundles the shared TS model + the real J-spec modules + the J-01 engine
// through esbuild and asserts the merge/group/validate/run-guard contract:
//   - catalogEntryFromSpec normalizes every real spec (all 41 registry rows)
//   - db definition wins display fields; enabled:false hides (grouping)
//   - validateReportDefinition rejects bad shapes, normalizes aliases
//   - catalogGrouping ordering stable (category order → sort → title)
//   - runRequestValidate guards the run form's param shapes
//   - end-to-end: catalog entry → defineReport → runReport proves the
//     registry drives the catalog UI
//
// Run: node scripts/test-report-catalog.mjs  →  prints "PASS report-catalog"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (entry, name) => {
  const out = resolve(here, name);
  buildSync({ entryPoints: [resolve(here, entry)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return out;
};

const modelOut = bundle('../base44/shared/reportCatalogModel.ts', '.tmp-report-catalog-model.mjs');
const M = await import(pathToFileURL(modelOut).href);
const engine = await import(pathToFileURL(resolve(here, '../src/components/reports/reportEngine.js')).href);
const { defineReport, runReport } = engine;

const {
  CATALOG_CATEGORIES, CATALOG_CATEGORY_LABELS, CATALOG_PARAM_TYPES,
  CATALOG_EXPORT_FORMATS, CATALOG_DATA_NEEDS, REPORT_KEY_PATTERN,
  canonicalCategory, parametersSchemaFor, specDrillTarget, specDataNeeds,
  catalogEntryFromSpec, isDefinitionRow, normalizeDefinitionRow,
  validateReportDefinition, definitionPatchFromForm, definitionForEntry,
  catalogFromDefinitions, catalogGrouping, catalogSearch, runRequestValidate,
} = M;

// Real spec modules — the code registry the catalog must render.
const specFiles = [
  '../base44/shared/arAgingReports.ts',
  '../base44/shared/customerReports.ts',
  '../base44/shared/estimateReports.ts',
  '../base44/shared/financialReports.ts',
  '../base44/shared/productionReports.ts',
  '../base44/shared/salesReports.ts',
];
const specBundles = await Promise.all(specFiles.map(async (f) => {
  const out = bundle(f, `.tmp-report-catalog-${f.split('/').pop().replace(/\.ts$/, '')}.mjs`);
  return import(pathToFileURL(out).href);
}));
const [AR, CUST, EST, FIN, PROD, SALES] = specBundles;
const REGISTRY_SPECS = [
  ...AR.AR_AGING_REPORTS, ...CUST.CUSTOMER_REPORTS, ...EST.ESTIMATE_REPORTS,
  ...FIN.FINANCIAL_REPORTS, ...PROD.PRODUCTION_REPORTS, ...SALES.SALES_REPORTS,
];

// ===========================================================================
// constants + category/label helpers
// ===========================================================================
assert.deepEqual([...CATALOG_CATEGORIES], ['customers', 'sales', 'production', 'estimates', 'financial', 'activity']);
assert.equal(CATALOG_CATEGORY_LABELS.financial, 'Financial');
assert.equal(CATALOG_CATEGORY_LABELS.customers, 'Customers');
assert.deepEqual([...CATALOG_PARAM_TYPES], ['date_range', 'date_basis', 'select', 'multiselect', 'boolean', 'text', 'number']);
assert.ok(CATALOG_EXPORT_FORMATS.includes('csv'));
assert.ok(CATALOG_DATA_NEEDS.includes('invoices') && CATALOG_DATA_NEEDS.includes('work_orders'));
assert.ok(REPORT_KEY_PATTERN.test('ar_aging_summary'));
assert.ok(REPORT_KEY_PATTERN.test('sales-by-customer'));
assert.ok(!REPORT_KEY_PATTERN.test('Bad Key'));
assert.ok(!REPORT_KEY_PATTERN.test('9leading_digit'));
assert.equal(canonicalCategory('Financial'), 'financial');
assert.equal(canonicalCategory('SALES'), 'sales');
assert.equal(canonicalCategory('not-a-cat'), '');

// ===========================================================================
// catalogEntryFromSpec — every real registry spec normalizes
// ===========================================================================
assert.equal(REGISTRY_SPECS.length, 41, 'registry holds all 41 J-spec rows');
const allEntries = REGISTRY_SPECS.map((s, i) => catalogEntryFromSpec(s, i));
assert.ok(allEntries.every(Boolean), 'every registry spec produces a catalog entry');
assert.equal(new Set(allEntries.map((e) => e.key)).size, 41, 'catalog keys unique');
assert.ok(allEntries.every((e) => CATALOG_CATEGORIES.includes(e.category)), 'every entry has a canonical category');
assert.ok(allEntries.every((e) => e.title && e.has_spec), 'every entry has a title + runnable spec');
assert.ok(allEntries.every((e) => e.source === 'registry' && e.enabled && e.admin_visible));

const arDetail = allEntries.find((e) => e.key === 'ar_aging_detail');
assert.equal(arDetail.title, 'AR Aging Detail');
assert.equal(arDetail.category, 'financial');
assert.equal(arDetail.drill_target, 'invoice', 'number column → invoice drill');
assert.deepEqual(arDetail.parameters_schema.map((p) => p.key), ['as_of', 'salesperson', 'customer', 'buckets']);
assert.equal(arDetail.parameters_schema[3].type, 'multiselect');
assert.deepEqual(arDetail.parameters_schema[3].options.map((o) => o.value), ['current', '1-30', '31-60', '61-90', '90+']);
assert.deepEqual(arDetail.export_formats, ['csv']);
assert.equal(arDetail.sort_order, 1, 'registry index seeds sort_order');

const salesByCust = allEntries.find((e) => e.key === 'sales_by_customer');
assert.equal(salesByCust.drill_target, 'customer', 'customer_name first col → customer drill');
assert.equal(salesByCust.category, 'sales');

const wipStatus = allEntries.find((e) => e.key === 'wip_by_product_status');
assert.equal(wipStatus.category, 'production');

// specDataNeeds — declared needs ∪ run-source scan.
assert.ok(specDataNeeds(SALES.SALES_REPORTS_BY_ID.sales_by_income_account).includes('income_accounts'),
  'sales income-account spec scans its data.accounts read');
assert.ok(specDataNeeds(PROD.PRODUCTION_REPORTS_BY_ID.wip_by_responsibility).includes('responsibilities'));
assert.deepEqual(specDataNeeds({ run: (p, data) => data.workOrders.filter((w) => data.customers.length) }), ['customers', 'work_orders'],
  'alias spellings collapse to canonical need keys');
assert.deepEqual(specDataNeeds({ data_needs: ['invoices'] }), ['invoices'], 'declared data_needs honored');
assert.deepEqual(specDataNeeds({}), [], 'no spec fns → no needs');

// parametersSchemaFor — engine spec → JSON-safe schema.
const asOfParam = parametersSchemaFor(AR.AR_AGING_REPORTS_BY_ID.ar_aging_summary).find((p) => p.key === 'as_of');
assert.equal(asOfParam.type, 'text');
assert.equal(asOfParam.label, 'As-of Date');
assert.equal(asOfParam.default, '');
assert.deepEqual(parametersSchemaFor({ params: [{ key: 'x' }, { key: 's', type: 'select' }] }), [],
  'params without valid type/options drop out');
assert.equal(parametersSchemaFor({ params: [{ key: 'd', type: 'date_basis', default: 'bogus' }] })[0].default, 'created',
  'bad date_basis default falls back');
assert.deepEqual(parametersSchemaFor(null), []);
assert.equal(parametersSchemaFor({ params: [{ key: 'b', type: 'boolean' }] })[0].default, false);
assert.equal(parametersSchemaFor({ params: [{ key: 'n', type: 'number', default: 'abc' }] })[0].default, null);

// bad specs → null entry.
assert.equal(catalogEntryFromSpec(null), null);
assert.equal(catalogEntryFromSpec({}), null);
assert.equal(catalogEntryFromSpec({ name: 'No id' }), null);
assert.equal(catalogEntryFromSpec({ id: 'x', name: 'X', category: 'bogus', run: () => [] }).category, 'activity',
  'unknown spec category lands in activity bucket');
assert.equal(catalogEntryFromSpec({ id: 'h', admin_visible: false }).admin_visible, false);

// ===========================================================================
// isDefinitionRow / normalizeDefinitionRow / validateReportDefinition
// ===========================================================================
assert.ok(isDefinitionRow({ report_key: 'ar_aging_summary' }));
assert.ok(!isDefinitionRow({ title: 'feedback bug', type: 'bug' }));
assert.ok(!isDefinitionRow({ report_key: '  ' }));
assert.ok(!isDefinitionRow(null));

const defRow = normalizeDefinitionRow({
  id: 'fr-1', report_key: 'ar_aging_summary', title: 'AR Summary (alt)',
  category: 'financial', description: 'Admin override', enabled: false,
  sort_order: 7, export_formats: ['csv', 'gl'], updated_date: '2026-11-02T01:00:00Z',
});
assert.equal(defRow.report_key, 'ar_aging_summary');
assert.equal(defRow.enabled, false);
assert.equal(defRow.sort, 7, 'sort_order alias → sort');
assert.deepEqual(defRow.export_formats, ['csv', 'gl']);
assert.equal(defRow.definition_id, 'fr-1');
assert.equal(defRow.updated_date, '2026-11-02T01:00:00Z');
assert.equal(normalizeDefinitionRow({ parameters_schema: { disabled: true }, report_key: 'k' }).enabled, false,
  'parameters_schema.disabled alias honored');
assert.equal(normalizeDefinitionRow({ default_filters: { disabled: true }, report_key: 'k' }).enabled, false,
  'default_filters.disabled alias honored');
assert.equal(normalizeDefinitionRow({ title: 'x' }), null, 'no report_key → null');

// validateReportDefinition — rejects bad shapes.
assert.equal(validateReportDefinition(null).ok, false);
assert.equal(validateReportDefinition({}).ok, false, 'missing report_key + title');
assert.ok(validateReportDefinition({}).errors.some((e) => e.includes('report_key')));
assert.equal(validateReportDefinition({ report_key: 'Bad Key', title: 'x' }).ok, false);
assert.equal(validateReportDefinition({ report_key: 'k', title: '' }).ok, false, 'blank title rejected');
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', category: 'nope' }).ok, false, 'unknown category rejected');
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', enabled: 'yes' }).ok, false, 'non-boolean enabled rejected');
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', parameters_schema: 'junk' }).ok, false);
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', parameters_schema: [{ key: 'a' }] }).ok, false,
  'param spec without valid type rejected');
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', default_filters: [1] }).ok, false);
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', export_formats: 'csv' }).ok, false);
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', sort_order: 'abc' }).ok, false);
assert.equal(validateReportDefinition({ report_key: 'k', title: 't', description: 'x'.repeat(2001) }).ok, false);

// validates + normalizes a good row (aliases → canonical fields).
const good = validateReportDefinition({
  report_key: 'sales_by_customer', title: 'Sales by Customer', category: 'SALES',
  description: 'd', enabled: true, sort_order: '3', export_formats: ['csv'],
  parameters_schema: { date_range: { default: 'this_year' } }, default_filters: { salesperson: 'Sam' },
});
assert.equal(good.ok, true, JSON.stringify(good.errors));
assert.equal(good.definition.category, 'sales');
assert.equal(good.definition.sort, 3, 'sort_order alias + numeric string coerce');
assert.deepEqual(good.definition.default_filters, { salesperson: 'Sam' });
assert.equal(good.definition.enabled, true);
assert.ok(good.warnings.length === 0);
const warn = validateReportDefinition({ report_key: 'k', title: 't', export_formats: ['csv', 'teleport'] });
assert.equal(warn.ok, true);
assert.ok(warn.warnings.some((w) => w.includes('teleport')), 'unknown export format warns, does not error');
const arrSchema = validateReportDefinition({
  report_key: 'k', title: 't',
  parameters_schema: [{ key: 'as_of', type: 'text', label: 'As Of' }, { key: 'v', type: 'select', options: ['a', 'b'] }],
});
assert.equal(arrSchema.ok, true);
assert.equal(arrSchema.definition.parameters_schema[1].type, 'select');
assert.deepEqual(arrSchema.definition.parameters_schema[1].options.map((o) => o.value), ['a', 'b']);

// definitionPatchFromForm — drawer fields → FeatureReport payload.
const patch = definitionPatchFromForm({
  report_key: 'ar_aging_summary', title: 'AR Summary', category: 'financial',
  description: '', enabled: false, sort: 5,
});
assert.equal(patch.report_key, 'ar_aging_summary');
assert.equal(patch.enabled, false);
assert.equal(patch.default_filters.disabled, true, 'disable mirrored into default_filters alias');
assert.equal(patch.sort, 5);
assert.deepEqual(definitionPatchFromForm({ report_key: 'Bad', title: '' }), {}, 'invalid form → empty patch');
const patchEnabled = definitionPatchFromForm({ report_key: 'k', title: 't', enabled: true, default_filters: { disabled: true } });
assert.equal(patchEnabled.default_filters?.disabled, undefined, 're-enable clears the disabled alias');
assert.equal(patchEnabled.enabled, true);

// ===========================================================================
// catalogFromDefinitions — merge precedence
// ===========================================================================
const overrides = [
  { report_key: 'ar_aging_summary', title: 'AR Summary (admin)', description: 'Admin desc', sort_order: -5 },
  { report_key: 'ar_aging_detail', enabled: false },
  { report_key: 'sales_by_customer', category: 'customers' },
  { report_key: 'nonexistent_report', title: 'Typo Key' },
];
const merged = catalogFromDefinitions(REGISTRY_SPECS, overrides);
assert.equal(merged.length, 42, '41 registry + 1 orphan definition');
const arSummary = merged.find((e) => e.key === 'ar_aging_summary');
assert.equal(arSummary.title, 'AR Summary (admin)', 'db title wins over registry');
assert.equal(arSummary.description, 'Admin desc', 'db description wins');
assert.equal(arSummary.sort_order, -5, 'db sort_order wins');
assert.equal(arSummary.source, 'override');
assert.equal(arSummary.overridden, true);
assert.ok(arSummary.has_spec, 'override keeps the runnable spec');
assert.equal(merged.find((e) => e.key === 'ar_aging_detail').enabled, false, 'db enabled:false lands');
assert.equal(merged.find((e) => e.key === 'sales_by_customer').category, 'customers', 'db category wins');
const orphan = merged.find((e) => e.key === 'nonexistent_report');
assert.equal(orphan.orphaned, true);
assert.equal(orphan.source, 'orphan');
assert.equal(orphan.enabled, false, 'orphan never runnable');
assert.equal(orphan.title, 'Typo Key');

// no overrides → pure registry catalog, keys preserved in order.
const pure = catalogFromDefinitions(REGISTRY_SPECS, []);
assert.equal(pure.length, 41);
assert.deepEqual(pure.slice(0, 4).map((e) => e.key), AR.AR_AGING_REPORTS.map((s) => s.id));
assert.ok(catalogFromDefinitions(REGISTRY_SPECS, null).length === 41);
assert.ok(catalogFromDefinitions(null, overrides).every((e) => e.orphaned), 'no registry → all defs orphan');

// parameters_schema merge: object map patches defaults; array replaces.
const patched = catalogFromDefinitions([AR.AR_AGING_REPORTS_BY_ID.ar_aging_summary], [{
  report_key: 'ar_aging_summary',
  parameters_schema: { as_of: { default: '2026-01-01', label: 'As Of!' } },
  default_filters: { salesperson: 'Brett' },
}])[0];
assert.equal(patched.parameters_schema.find((p) => p.key === 'as_of').default, '2026-01-01');
assert.equal(patched.parameters_schema.find((p) => p.key === 'as_of').label, 'As Of!');
assert.equal(patched.parameters_schema.find((p) => p.key === 'salesperson').default, 'Brett',
  'default_filters patch param defaults');
const replaced = catalogFromDefinitions([AR.AR_AGING_REPORTS_BY_ID.ar_aging_summary], [{
  report_key: 'ar_aging_summary',
  parameters_schema: [{ key: 'only_param', type: 'text', default: 'x' }],
}])[0];
assert.deepEqual(replaced.parameters_schema.map((p) => p.key), ['only_param'], 'schema array replaces');

// dropDisabled option prunes disabled entries entirely.
const dropped = catalogFromDefinitions(REGISTRY_SPECS, overrides, { dropDisabled: true });
assert.equal(dropped.find((e) => e.key === 'ar_aging_detail'), undefined);
assert.equal(dropped.find((e) => e.key === 'nonexistent_report'), undefined);

// definitionForEntry — inverse shape for the drawer.
const back = definitionForEntry(arSummary);
assert.equal(back.report_key, 'ar_aging_summary');
assert.equal(back.title, 'AR Summary (admin)');
assert.equal(back.sort, -5);

// ===========================================================================
// catalogGrouping — stable category grouping
// ===========================================================================
const groups = catalogGrouping(merged);
assert.deepEqual(groups.map((g) => g.category), ['customers', 'sales', 'production', 'estimates', 'financial'],
  'groups emit in canonical category order; orphan-only group hidden while disabled');
const finGroup = groups.find((g) => g.category === 'financial');
assert.equal(finGroup.label, 'Financial');
assert.equal(finGroup.entries.find((e) => e.key === 'ar_aging_detail'), undefined, 'disabled hidden by default');
assert.equal(finGroup.entries[0].key, 'ar_aging_summary', 'sort_order -5 sorts first');
assert.equal(groups.find((g) => g.category === 'customers').entries.some((e) => e.key === 'sales_by_customer'), true,
  'db category override moves the card');
const withDisabled = catalogGrouping(merged, { includeDisabled: true });
assert.equal(withDisabled.find((g) => g.category === 'financial').entries.some((e) => e.key === 'ar_aging_detail'), true);
assert.equal(withDisabled.find((g) => g.category === 'activity').entries.some((e) => e.key === 'nonexistent_report'), true,
  'orphan visible to admin view');
const hiddenEntry = catalogEntryFromSpec({ id: 'hidden', name: 'H', admin_visible: false });
assert.equal(catalogGrouping([hiddenEntry], { includeDisabled: true }).length, 0, 'admin_visible:false never groups');
// Deterministic ordering inside a group: sort then title then key.
const tie = catalogGrouping([
  catalogEntryFromSpec({ id: 'zzz', name: 'Zulu', category: 'sales', run: () => [] }),
  catalogEntryFromSpec({ id: 'aaa', name: 'Alpha', category: 'sales', run: () => [] }),
]);
assert.deepEqual(tie[0].entries.map((e) => e.key), ['aaa', 'zzz'], 'title sort inside a group');

// catalogSearch — title/key/description/category match.
const found = catalogSearch(merged, 'aging');
assert.ok(found.length >= 4 && found.every((e) => /aging/i.test(e.title + e.description + e.key)));
assert.deepEqual(catalogSearch(merged, 'sales').length > 0, true);
assert.equal(catalogSearch(merged, 'zzz-no-match').length, 0);
assert.equal(catalogSearch(merged, '').length, merged.length, 'blank query returns all');

// ===========================================================================
// runRequestValidate — param shape guard
// ===========================================================================
const runEntry = merged.find((e) => e.key === 'ar_aging_detail');
assert.equal(runRequestValidate(runEntry, null).ok, true);
assert.equal(runRequestValidate(runEntry, {}).ok, true);
assert.equal(runRequestValidate(runEntry, { as_of: '2026-11-01' }).ok, true);
assert.equal(runRequestValidate(runEntry, { bogus_key: 'x' }).ok, false, 'unknown key rejected');
assert.equal(runRequestValidate(runEntry, { buckets: 'current' }).ok, true, 'scalar multiselect coerces to array');
assert.deepEqual(runRequestValidate(runEntry, { buckets: 'current' }).params.buckets, ['current']);
assert.equal(runRequestValidate(runEntry, { buckets: ['current', 'bogus'] }).ok, false, 'invalid option rejected');
assert.deepEqual(runRequestValidate(runEntry, { buckets: ['current', '90+'] }).params.buckets, ['current', '90+']);
assert.equal(runRequestValidate(runEntry, 'not-an-object').ok, false);

const salesEntry = merged.find((e) => e.key === 'sales_by_customer');
const salesKeys = salesEntry.parameters_schema.map((p) => p.key);
assert.ok(salesKeys.includes('date_basis') && salesKeys.includes('date_range'), 'sales spec carries basis + range params');
assert.equal(runRequestValidate(salesEntry, { date_basis: 'bogus' }).ok, false);
assert.equal(runRequestValidate(salesEntry, { date_basis: 'completed' }).ok, true);
assert.equal(runRequestValidate(salesEntry, { date_basis: 'COMPLETED' }).params.date_basis, 'completed', 'case-normalized');
assert.equal(runRequestValidate(salesEntry, { date_range: 'this_year' }).ok, true);
assert.equal(runRequestValidate(salesEntry, { date_range: 'last_decade' }).ok, false);
assert.equal(runRequestValidate(salesEntry, { date_range: { preset: 'custom', from: '2026-01-01' } }).ok, true);
assert.equal(runRequestValidate(salesEntry, { date_range: { preset: 'bogus' } }).ok, false);
assert.equal(runRequestValidate(salesEntry, { date_range: 42 }).ok, false);

const boolEntry = catalogEntryFromSpec({
  id: 't', name: 'T', category: 'sales', run: () => [],
  params: [
    { key: 'flag', type: 'boolean' },
    { key: 'qty', type: 'number' },
    { key: 'who', type: 'multiselect', options: ['a', 'b'] },
    { key: 'req', type: 'text', required: true },
  ],
});
assert.equal(runRequestValidate(boolEntry, { flag: 'true' }).params.flag, true);
assert.equal(runRequestValidate(boolEntry, { flag: 0 }).params.flag, false);
assert.equal(runRequestValidate(boolEntry, { flag: 'maybe' }).ok, false);
assert.equal(runRequestValidate(boolEntry, { qty: '12.5' }).params.qty, 12.5);
assert.equal(runRequestValidate(boolEntry, { qty: 'abc' }).ok, false);
assert.equal(runRequestValidate(boolEntry, {}).ok, false, 'required param with no default blocks');
assert.ok(runRequestValidate(boolEntry, {}).errors.some((e) => e.includes('"req" is required')));
assert.equal(runRequestValidate(boolEntry, { req: 'x' }).ok, true);

// ===========================================================================
// end-to-end: registry entry → engine run (the verify: "registry drives UI")
// ===========================================================================
{
  const NOW = new Date(2026, 10, 15, 12, 0, 0);
  const inv = (id, over = {}) => ({
    id, invoice_number: `INV-${id}`, status: 'sent', customer_id: 'c1',
    issue_date: '2026-10-01', due_date: '2026-10-10', total: 100, balance_due: 100, ...over,
  });
  const data = {
    invoices: [inv('i1'), inv('i2', { balance_due: 50 }), inv('i3', { status: 'void' }), inv('i4', { balance_due: 0, total: 80, amount_paid: 80 })],
    customers: [{ id: 'c1', company_name: 'Acme Sign Co' }],
  };
  const valid = runRequestValidate(runEntry, { as_of: '2026-11-15' });
  const def = defineReport(runEntry.spec);
  const result = runReport(def, { params: valid.params, data, now: NOW });
  assert.equal(result.meta.reportId, 'ar_aging_detail');
  assert.equal(result.rows.length, 2, 'open-balance rows only');
  assert.equal(result.rows[0].customer_name, 'Acme Sign Co');
  assert.ok(result.summary.totals.balance > 0);

  // db-disabled entry → the panel filters it before ever reaching runReport.
  assert.equal(catalogGrouping(merged).some((g) => g.entries.some((e) => e.key === 'ar_aging_detail')), false);

  // override title flows into the displayed catalog but the spec still runs.
  const defOverride = catalogFromDefinitions(REGISTRY_SPECS, overrides)
    .find((e) => e.key === 'ar_aging_summary');
  const res2 = runReport(defineReport(defOverride.spec), { params: {}, data, now: NOW });
  assert.equal(res2.meta.reportId, 'ar_aging_summary');
  assert.equal(res2.rows.length, 5, '5 aging buckets emitted');
  assert.equal(defOverride.title, 'AR Summary (admin)', 'admin title displays while registry spec runs');
}

// ---------------------------------------------------------------------------
rmSync(modelOut, { force: true });
for (const f of specFiles) {
  rmSync(resolve(here, `.tmp-report-catalog-${f.split('/').pop().replace(/\.ts$/, '')}.mjs`), { force: true });
}
console.log('PASS report-catalog');
