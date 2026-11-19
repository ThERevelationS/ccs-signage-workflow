import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => resolve(here, '../src', ...p);
const read = (p) => readFileSync(p, 'utf8');

const bundle = (entry, out) => {
  buildSync({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
};

const modelOut = resolve(here, '.tmp-mig-ui-model.mjs');
const csvOut = resolve(here, '.tmp-mig-ui-csv.mjs');
const M = await bundle(src('components/migration/migrationModel.js'), modelOut);
const C = await bundle(src('components/migration/csvParse.js'), csvOut);

const page = read(src('pages/CbMigration.jsx'));
const client = read(src('components/migration/migrationClient.js'));
const wizard = read(src('components/migration/MigrationWizard.jsx'));
const report = read(src('components/migration/MigrationReportStep.jsx'));
const upload = read(src('components/migration/MigrationUploadStep.jsx'));

// --- 1. Page is admin-gated with the ShieldAlert EmptyState -----------------
assert.ok(page.includes('role !== "admin"'), 'CbMigration.jsx must gate on role !== "admin"');
assert.ok(page.includes('ShieldAlert'), 'non-admin screen must use ShieldAlert icon');
assert.ok(page.includes('EmptyState'), 'non-admin screen must use kit EmptyState');
assert.ok(page.includes('useAuth'), 'page must read the signed-in user via useAuth');

// --- 2. All eight manageMigration actions are invoked -----------------------
for (const action of [
  'list_mappers', 'list_batches', 'start_batch', 'preview_mapping',
  'import_rows', 'get_batch', 'report', 'unimport_batch',
]) {
  assert.ok(client.includes(`"${action}"`), `migrationClient is missing action "${action}"`);
}
assert.ok(client.includes('functions.invoke'), 'client must go through base44.functions.invoke');
assert.ok(client.includes('manageMigration'), 'client must target manageMigration');
assert.ok(client.includes('session_token'), 'client must pass session_token');
// The named action wrappers must actually be called by the UI, not dead code.
for (const call of [
  'listMappers', 'listBatches', 'startBatch', 'previewMapping',
  'importRows', 'getBatch', 'getReport', 'unimportBatch',
]) {
  const used = wizard.includes(call) || read(src('components/migration/MigrationBatchesPanel.jsx')).includes(call);
  assert.ok(used, `migrationActions.${call} is never called by the UI`);
}

// --- 3. Stepper order is upload -> map -> dryrun -> import -> report --------
assert.deepEqual(
  M.WIZARD_STEPS.map((s) => s.key),
  ['upload', 'map', 'dryrun', 'import', 'report'],
  'wizard step order changed',
);
assert.equal(M.wizardStepIndex('dryrun'), 2);
assert.equal(M.wizardStepIndex('report'), 4);
assert.ok(wizard.includes('MigrationStepper'), 'wizard must render the stepper');

// --- 4. Chunking contract: <=500 rows per import_rows call ------------------
assert.equal(M.IMPORT_CHUNK_SIZE, 500, 'chunk size must stay aligned with backend MAX_ROWS_PER_CALL');
assert.ok(M.IMPORT_CHUNK_SIZE <= 500);
assert.deepEqual(M.chunkRows(new Array(1200).fill({})).map((c) => c.length), [500, 500, 200]);
assert.deepEqual(M.buildChunkPlan(1).length, 1);
assert.deepEqual(M.buildChunkPlan(0).length, 0);
// No UI code may raise the cap.
assert.ok(!/chunkSize:\s*(?!500)\d{3,}/.test(wizard), 'wizard must not override the 500-row chunk size');

// runImportPlan: sequential chunks, progress, counts, error rows, truncation.
{
  const rows = Array.from({ length: 1150 }, (_, i) => ({ __line: i + 2 }));
  const calls = [];
  const progressSeen = [];
  const final = await M.runImportPlan({
    rows,
    sendChunk: async (chunk, idx) => {
      calls.push(chunk.length);
      return {
        results: chunk.map((_, i) => (
          (idx === 1 && i === 0)
            ? { source_id: `s-${i}`, status: 'error', error: 'boom' }
            : { source_id: `s-${i}`, status: 'created', target_id: `t-${idx}-${i}` }
        )),
      };
    },
    onProgress: (p) => progressSeen.push(p.done),
  });
  assert.deepEqual(calls, [500, 500, 150], 'chunks must be sequential <=500 slices');
  assert.equal(final.counts.created, 1149);
  assert.equal(final.counts.errors, 1);
  assert.equal(final.done, 1150);
  assert.equal(final.running, false);
  assert.equal(final.errorRows.length, 1);
  assert.equal(final.errorRows[0].csv_line, 502, 'error rows must carry the source CSV line');
  assert.ok(final.recordRefs.length === 1149);
  assert.ok(progressSeen.length >= 4, 'progress must be emitted per chunk');
  assert.equal(progressSeen.at(-1), 1150);
}
// A rejected chunk aborts the plan -- later chunks never fire.
{
  const calls = [];
  const final = await M.runImportPlan({
    rows: new Array(700).fill({}),
    sendChunk: async (chunk, idx) => {
      calls.push(idx);
      if (idx === 1) throw new Error('server died');
      return { results: chunk.map(() => ({ status: 'created', target_id: 'x' })) };
    },
  });
  assert.deepEqual(calls, [0, 1]);
  assert.equal(final.error, 'server died');
  assert.equal(final.done, 500);
}
// shouldStop halts after the current chunk.
{
  const calls = [];
  const final = await M.runImportPlan({
    rows: new Array(1000).fill({}),
    shouldStop: () => calls.length >= 1,
    sendChunk: async (chunk, idx) => { calls.push(idx); return { results: [] }; },
  });
  assert.deepEqual(calls, [0]);
  assert.equal(final.stopped, true);
}
// A server-side truncation flag is surfaced, not swallowed.
{
  const final = await M.runImportPlan({
    rows: new Array(3).fill({}),
    sendChunk: async () => ({ truncated: true, results: [{ status: 'created' }] }),
  });
  assert.equal(final.truncatedChunks, 1);
}

// --- 5. Unimport is gated by a typed batch-tag confirm ----------------------
assert.equal(M.canUnimport('cb-customers-abc', 'cb-customers-abc'), true);
assert.equal(M.canUnimport(' cb-customers-abc ', 'cb-customers-abc'), true, 'trimmed input counts');
assert.equal(M.canUnimport('cb-customers-XYZ', 'cb-customers-abc'), false, 'exact match only');
assert.equal(M.canUnimport('', 'cb-customers-abc'), false);
assert.equal(M.canUnimport('anything', ''), false);
assert.ok(report.includes('canUnimport'), 'report step must gate the button on canUnimport');
assert.ok(report.includes('unimportBatch') === false, 'report step should not invoke directly (wizard does)');
assert.ok(wizard.includes('unimportBatch'), 'wizard must invoke unimportBatch');
assert.ok(report.includes('typed') && report.includes('Input'), 'typed-confirm input must exist in the report step');

// --- 6. Kit usage -----------------------------------------------------------
const allSources = [page, wizard, upload, report,
  read(src('components/migration/MigrationDryRunStep.jsx')),
  read(src('components/migration/MigrationImportStep.jsx')),
  read(src('components/migration/MigrationBatchesPanel.jsx')),
  read(src('components/migration/MigrationAttachmentsPanel.jsx')),
  read(src('components/migration/MigrationMappingStep.jsx')),
].join('\n');
assert.ok(allSources.includes('from "@/components/kit"'), 'migration UI must import from the kit barrel');
for (const kit of ['PageHeader', 'StatusChip', 'EmptyState', 'KpiStrip', 'FilterBar', 'RecordLink', 'DataTableShell']) {
  assert.ok(allSources.includes(kit), `kit component ${kit} is not used`);
}
assert.ok(page.includes('"Tools"') && page.includes('"Migration"'), 'Tools > Migration breadcrumbs expected');
assert.ok(allSources.includes('dark:'), 'dark: variants expected to match app styling');

// --- 7. Mapping model -------------------------------------------------------
{
  const preview = {
    required_fields: ['company_name'],
    proposed_mapping: { 'Customer Name': 'company_name', 'Cust ID': '__source_id__', Misc: 'notes' },
    default_suggestions: { customer_status: 'active', '<auto: cb:x>': 'ignored-sentinel-key' },
    unmapped_columns: ['Junk'],
  };
  const mapper = { parents: [{ field: 'customer_id', parent_key: 'customers', required: false }] };
  const opts = M.targetFieldOptions({ preview, mapper });
  assert.equal(opts[0], '__source_id__', 'source id option must be first');
  assert.ok(opts.includes('company_name') && opts.includes('customer_id') && opts.includes('notes'));
  const cov = M.requiredCoverage({ requiredFields: preview.required_fields, mapping: { 'Customer Name': 'company_name' } });
  assert.equal(cov.ok, true);
  assert.deepEqual(cov.missing, []);
  const cov2 = M.requiredCoverage({ requiredFields: ['company_name', 'email'], mapping: { 'Customer Name': 'company_name' }, defaults: {} });
  assert.equal(cov2.ok, false);
  assert.deepEqual(cov2.missing, ['email']);
  assert.equal(M.mappingHasSourceId({ A: '__source_id__' }), true);
  assert.equal(M.mappingHasSourceId({ A: 'name' }), false);
  assert.deepEqual(M.cleanMapping({ a: 'x', b: '', c: '  ' }), { a: 'x' });
}
// groupMappers splits real vs stub.
{
  const g = M.groupMappers([{ key: 'b', kind: 'stub' }, { key: 'a', kind: 'real' }, { key: 'c' }]);
  assert.deepEqual(g.real.map((m) => m.key), ['a', 'c']);
  assert.deepEqual(g.stub.map((m) => m.key), ['b']);
}
// entity -> recordRoutes kind map for created-record links.
assert.equal(M.entityRecordKind('Customer'), 'customer');
assert.equal(M.entityRecordKind('Invoice'), 'invoice');
assert.equal(M.entityRecordKind('PurchaseOrder'), 'po');
assert.equal(M.entityRecordKind('WorkOrder'), 'workorder');
assert.equal(M.entityRecordKind('AllInOneEstimate'), 'estimate');
assert.equal(M.entityRecordKind('Inventory'), '');

// --- 8. Error CSV builder ----------------------------------------------------
{
  const csv = M.buildErrorCsv([
    { row: 2, csv_line: 3, source_entity: 'customers', source_id: 'C-1,2', error: 'bad "value"' },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'row,csv_line,source_entity,source_id,error');
  assert.equal(lines[1], '2,3,customers,"C-1,2","bad ""value"""');
}

// --- 9. csvParse edge cases ---------------------------------------------------
{
  // Plain parse + \r\n endings.
  const r = C.parseCsv('a,b\r\n1,2\r\n3,4\r\n');
  assert.deepEqual(r.columns, ['a', 'b']);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.rows[0], { a: '1', b: '2' });
}
{
  // Quoted commas + escaped quotes + newline inside quotes.
  const r = C.parseCsv('name,notes\r\n"Smith, Bob","said ""hi""\r\nsecond line"\r\nx,y');
  assert.equal(r.rowCount, 2);
  assert.equal(r.rows[0].name, 'Smith, Bob');
  assert.equal(r.rows[0].notes, 'said "hi"\r\nsecond line');
  assert.equal(r.rows[1].name, 'x');
}
{
  // BOM + blank lines skipped + short/long rows flagged.
  const r = C.parseCsv('\uFEFFid,val\n\n1,a\n2,a,b,extra\n3\n');
  assert.equal(r.errors.length, 0);
  assert.equal(r.rowCount, 3);
  assert.equal(r.rows[0].id, '1');
  assert.equal(r.rows[1].val, 'a');
  assert.equal(r.rows[2].val, '', 'short row pads with ""');
  assert.ok(r.warnings.length >= 1, 'long/short rows produce warnings');
}
{
  // Duplicate + blank headers renamed, not silently kept.
  const r = C.parseCsv('id,id,\n1,2,3');
  assert.deepEqual(r.columns, ['id', 'id_2', 'column_3']);
  assert.equal(r.rows[0].id_2, '2');
  assert.equal(r.rows[0].column_3, '3');
  assert.ok(r.warnings.length >= 2);
}
{
  // Empty / headerless files fail honestly.
  assert.ok(C.parseCsv('').errors.length > 0);
  assert.ok(C.parseCsv('   \n  ').errors.length > 0);
}
{
  // Unclosed quote is an error, not silent data loss.
  const r = C.parseCsv('a,b\n1,"never ends');
  assert.ok(r.errors.length > 0);
  assert.equal(r.rowCount, 1);
  assert.equal(r.rows[0].b, 'never ends');
}
{
  // __line rides along non-enumerably (error tables) but never serializes.
  const r = C.parseCsv('a\nx\ny');
  assert.equal(r.rows[1].__line, 3);
  assert.equal(JSON.stringify(r.rows[1]), '{"a":"y"}', '__line must not leak into import_rows payloads');
}
{
  // Tab-delimited detection.
  const r = C.parseCsv('a\tb\n1\t2');
  assert.equal(r.delimiter, '\t');
  assert.deepEqual(r.rows[0], { a: '1', b: '2' });
}

rmSync(modelOut, { force: true });
rmSync(csvOut, { force: true });
console.log('PASS migration-ui');
