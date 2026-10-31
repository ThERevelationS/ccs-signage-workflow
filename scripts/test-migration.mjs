import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-migration.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/migrationMappers.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out).href);
const {
  MIGRATION_MAPPERS, getMapper, listMappers,
  autoMapColumns, applyMappingToRecord, normalizeRecordForMapper,
  validateRecordForMapper, resolveSourceId, buildMappingPreview,
  parseNumberValue, parseDateValue, parseBoolValue, normalizePhoneValue,
  clean,
} = M;

const entry = readFileSync(resolve(here, '../base44/functions/manageMigration/entry.ts'), 'utf8');

// --- 1. All seven required actions exist -----------------------------------
for (const action of ['start_batch', 'preview_mapping', 'import_rows', 'get_batch', 'report', 'unimport_batch', 'list_batches']) {
  assert.ok(entry.includes(`"${action}"`), `entry.ts is missing action "${action}"`);
}
assert.ok(entry.includes('"list_mappers"'), 'mapper registry listing action missing');

// --- 2. Admin gate on every action -----------------------------------------
assert.ok(entry.includes('authenticateSignShopSession'), 'session auth missing');
assert.match(entry, /role[^a-z]{0,20}!==\s*"admin"/, 'admin role gate missing');

// --- 3. Mapper coverage: real + stub ----------------------------------------
const REAL = {
  customers: 'Customer',
  contacts: 'CustomerContact',
  addresses: 'CustomerLocation',
  vendors: 'GlobalSettings',
  parts: 'Inventory',
  employees: 'AuthorizedEmail',
  estimates: 'AllInOneEstimate',
  work_orders: 'WorkOrder',
  invoices: 'Invoice',
  payments: 'Payment',
  purchase_orders: 'PurchaseOrder',
};
const STUB = {
  machines: 'MachineRate',
  pricing_tiers: 'MarkupTier',
  pricing_matrix: 'PricingTierMatrix',
  products: 'BuilderProduct',
  part_templates: 'PartTemplate',
  opportunities: 'Opportunity',
  activities: 'OpportunityActivity',
  locations: 'SalesLocation',
};
for (const [key, target] of Object.entries(REAL)) {
  const m = getMapper(key);
  assert.ok(m, `missing real mapper "${key}"`);
  assert.equal(m.target_entity, target, `${key} targets ${m.target_entity}, expected ${target}`);
  assert.equal(m.kind, 'real', `${key} should be kind=real`);
}
for (const [key, target] of Object.entries(STUB)) {
  const m = getMapper(key);
  assert.ok(m, `missing stub mapper "${key}"`);
  assert.equal(m.target_entity, target, `${key} targets ${m.target_entity}`);
  assert.equal(m.kind, 'stub', `${key} should be kind=stub`);
}
assert.ok(Object.keys(MIGRATION_MAPPERS).length >= 17, 'expected at least 17 registered mappers');
assert.ok(listMappers().length >= 17, 'listMappers should report the registry');

// --- 4. creation_request_key usage ------------------------------------------
const CRK = ['customers', 'contacts', 'addresses', 'estimates', 'invoices', 'payments', 'purchase_orders', 'opportunities', 'activities'];
for (const key of CRK) {
  assert.equal(getMapper(key).idempotency_field, 'creation_request_key', `${key} should use creation_request_key`);
}
assert.equal(getMapper('part_templates').idempotency_field, 'idempotency_key');
for (const key of ['parts', 'work_orders', 'employees', 'machines', 'vendors']) {
  assert.equal(getMapper(key).idempotency_field, null, `${key} does not support an idempotency field`);
}
assert.ok(entry.includes('creation_request_key') || entry.includes('idempotency_field'), 'entry does not stamp idempotency keys');
assert.match(entry, /`cb:\$\{entityKey\}:\$\{sourceId\}`|cb:\$\{|creationKey\(/, 'cb: creation key format missing');

// --- 5. Map-dedupe logic present ---------------------------------------------
assert.ok(entry.includes('dedupeIndex'), 'dedupe index missing');
assert.ok(entry.includes('skipped_dup'), 'skipped_dup status missing');
assert.ok(entry.includes('on_duplicate'), 'on_duplicate option missing');
assert.ok(entry.includes('LegacyMigrationMap'), 'LegacyMigrationMap not used');
assert.ok(entry.includes('source_app_id'), 'source_app_id missing');
assert.ok(entry.includes('source_entity'), 'source_entity missing');
assert.ok(entry.includes('migration_batch'), 'migration_batch missing');
assert.ok(entry.includes('loadAllEntityRows'), 'paged reads required for map scans');

// --- 6. unimport only deletes created-status rows -----------------------------
assert.match(entry, /status\s*!==\s*"created"[\s\S]{0,200}skipped_non_created/, 'unimport must skip non-created rows');
assert.match(entry, /targetEntity\.delete\(/, 'unimport must delete created targets');
assert.match(entry, /MapEntity\.delete\(row\.id\)/, 'unimport should remove map rows after delete');

// --- 7. Row cap 500 ------------------------------------------------------------
assert.match(entry, /slice\(0,\s*MAX_ROWS_PER_CALL\)/, 'rows must be sliced to the cap');
assert.ok(entry.includes('truncated'), 'truncated flag missing');
assert.equal(M.MAX_ROWS_PER_CALL, 500, 'row cap must be 500');

// --- 8. Behavioral: normalization helpers ------------------------------------
assert.equal(parseNumberValue('$1,234.56'), 1234.56);
assert.equal(parseNumberValue('(250.00)'), -250);
assert.equal(parseNumberValue('abc'), null);
assert.equal(parseNumberValue(''), null);
assert.equal(parseDateValue('03/15/2024'), '2024-03-15');
assert.equal(parseDateValue('2024-03-15'), '2024-03-15');
assert.equal(parseDateValue('not a date'), '');
assert.equal(parseBoolValue('Yes'), true);
assert.equal(parseBoolValue('N'), false);
assert.equal(parseBoolValue('maybe'), null);
assert.equal(normalizePhoneValue('5135551234'), '(513) 555-1234');
assert.equal(normalizePhoneValue(''), '');

// --- 9. Behavioral: auto-map + record pipeline --------------------------------
const cust = getMapper('customers');
const { proposed, unmapped } = autoMapColumns(cust, ['Customer ID', 'Company Name', 'Phone', 'E-mail', 'Billing City', 'Zebra Column']);
assert.equal(proposed['Customer ID'], '__source_id__');
assert.equal(proposed['Company Name'], 'company_name');
assert.equal(proposed['Phone'], 'company_phone');
assert.equal(proposed['E-mail'], 'contact_email');
assert.equal(proposed['Billing City'], 'billing_city');
assert.deepEqual(unmapped, ['Zebra Column']);

const raw = { 'Customer ID': 'CB-100', 'Company Name': 'Acme Signs', 'Phone': '5135551234', 'Status': 'Active', 'Credit Limit': '$5,000' };
const cmap = { 'Customer ID': '__source_id__', 'Company Name': 'company_name', 'Phone': 'company_phone', 'Status': 'customer_status', 'Credit Limit': 'credit_limit' };
const sid = resolveSourceId(raw, cmap);
assert.equal(sid, 'CB-100');
const { record } = applyMappingToRecord(cust, raw, cmap);
const normalized = normalizeRecordForMapper(cust, record, raw, sid);
assert.equal(normalized.company_name, 'Acme Signs');
assert.equal(normalized.company_phone, '(513) 555-1234');
assert.equal(normalized.customer_status, 'active');
assert.equal(normalized.credit_limit, 5000);
assert.deepEqual(validateRecordForMapper(cust, normalized), []);
assert.deepEqual(validateRecordForMapper(cust, {}), ['missing required field "company_name"']);

// Enum coercion + fallback on a money/status-heavy entity.
const inv = getMapper('invoices');
const invRec = normalizeRecordForMapper(inv, { customer_id: 'x1', status: 'PAID', total: '$1,000.00', amount_paid: '$400' }, {}, 'INV-9');
assert.equal(invRec.status, 'paid');
assert.equal(invRec.total, 1000);
assert.equal(invRec.balance_due, 600);
const invErr = normalizeRecordForMapper(inv, { status: 'weird' }, {}, 'INV-10');
assert.equal(invErr.status, 'sent', 'unknown invoice status falls back to sent');

// Vendors assemble into GlobalSettings shape.
const vend = getMapper('vendors');
const vendRec = normalizeRecordForMapper(vend, { name: 'Tube Supply Co', phone: '5135557777' }, {}, 'V-22');
assert.equal(vendRec.setting_key, 'corebridge_vendor:V-22');
assert.equal(vendRec.setting_value.name, 'Tube Supply Co');
assert.equal(vendRec.setting_value.source_id, 'V-22');

// Employees: role never escalates beyond explicit admin.
const emp = getMapper('employees');
assert.equal(normalizeRecordForMapper(emp, { email: 'a@b.com', role: 'Manager' }, {}, 'E-1').role, 'user');
assert.equal(normalizeRecordForMapper(emp, { email: 'a@b.com', role: 'Admin' }, {}, 'E-2').role, 'admin');

// Preview is a pure dry-run report.
const prev = buildMappingPreview(getMapper('payments'), ['Payment ID', 'Amount', 'Junk'], [{ 'Payment ID': 'P1', Amount: 'ten bucks' }]);
assert.equal(prev.proposed_mapping['Payment ID'], '__source_id__');
assert.ok(prev.warnings.some((w) => w.includes('non-numeric')), 'preview should flag non-numeric amount');
assert.ok(prev.warnings.some((w) => w.includes('"invoice_id"')), 'preview should flag unmapped required parent');
assert.deepEqual(prev.unmapped_columns, ['Junk']);

rmSync(out, { force: true });
console.log('PASS migration');
