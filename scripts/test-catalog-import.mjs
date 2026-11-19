import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// F-20 suite — part catalog import model (pure TS, zero imports).
// Bundle first: bare Node can't run .ts (sibling-suite convention).
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-catalog-import.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/catalogImportModel.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  parseCsvGrid,
  parseCsv,
  normalizeHeader,
  normalizeNameKey,
  normalizePartNumber,
  slugifyPartKey,
  CATALOG_PART_COLUMNS,
  CATALOG_CSV_HEADERS,
  columnForHeader,
  canonicalValues,
  rowsToPartPatches,
  catalogImportKey,
  matchExistingPart,
  diffPartFields,
  classifyImportRow,
  classifyImportRowDetail,
  importSummary,
  vendorAssociation,
  partGroupAssociation,
  updatePatchFor,
  importJobSummaryFields,
  IMPORT_SOURCE,
  IMPORT_KEY_PREFIX,
  CATALOG_IMPORT_ACTIONS,
  IMPORT_PART_SYSTEM_KEY,
  IMPORT_PART_CREATION_KEY,
  IMPORT_PART_DEFAULTS,
  importPartDefaults,
  isImportPart,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };

const NOW = '2026-11-02T12:00:00.000Z';

// ------------------------------------------------------------ parseCsvGrid
{
  const g = parseCsvGrid('a,b\n1,2\n3,4\n');
  assert.deepEqual(g, [['a', 'b'], ['1', '2'], ['3', '4']]); n += 1;
  eq(parseCsvGrid('').length, 0, 'empty text -> no rows');
  eq(parseCsvGrid('   \n \n').length, 0, 'blank-only text -> no rows');
}
{
  // quoted commas + escaped quotes + embedded newline
  const g = parseCsvGrid('h1,h2\n"say, ""hi""",x\nline1\nline2,end\n');
  eq(g[1][0], 'say, "hi"', 'quoted comma + escaped quotes');
  const g2 = parseCsvGrid('h\n"a\nb"\n');
  eq(g2.length, 2, 'embedded newline inside quotes stays one row');
  eq(g2[1][0], 'a\nb', 'newline preserved inside quotes');
}
{
  // CRLF + BOM + trailing blank rows
  const g = parseCsvGrid('﻿a,b\r\n1,2\r\n\r\n');
  eq(g.length, 2, 'BOM stripped + blank physical row dropped');
  eq(g[0][0], 'a', 'BOM row parses header cleanly');
  // lone CR endings
  const g2 = parseCsvGrid('a,b\r1,2\r');
  eq(g2.length, 2, 'lone-CR endings parse');
  // quoted empty field counts as a real row
  const g3 = parseCsvGrid('a\n""\n');
  eq(g3.length, 2, 'quoted-empty row kept');
}

// --------------------------------------------------------------- parseCsv
{
  const rows = parseCsv('Name,Part Number,Unit Cost\nWidget,ABC-123,10\n');
  eq(rows.length, 1, 'one data row');
  eq(rows[0].source_row, 2, 'source_row is 1-based past header');
  eq(rows[0].data.name, 'Widget', 'normalized header key');
  eq(rows[0].data.partnumber, 'ABC-123', 'spaces normalized out');
  eq(rows[0].data.unitcost, '10', 'unit-cost alias header');
}
{
  // duplicate + empty headers get stable generated keys
  const rows = parseCsv('a,,a\n1,2,3\n');
  eq(rows[0].data.a, '1');
  eq(rows[0].data.column_2, '2', 'empty header -> column_<n>');
  eq(rows[0].data.a_2, '3', 'dup header -> <h>_2');
}

// ------------------------------------------------- header normalization
eq(normalizeHeader(' Unit Cost '), 'unitcost');
eq(normalizeHeader('PART-NUMBER'), 'partnumber');
eq(normalizeHeader('part_number'), 'partnumber');
eq(normalizeHeader('SqFt Basis'), 'sqftbasis');
eq(normalizeNameKey('  Acme   Sign  Co '), 'acme sign co');
eq(normalizePartNumber(' ABC-123 x'), 'abc123x');
eq(slugifyPartKey('3" Angle  Iron!'), '3-angle-iron', 'name slug');
eq(slugifyPartKey('ABC-123'), 'abc-123', 'part-number slug lowercases');
ok(slugifyPartKey('x'.repeat(200)).length <= 80, 'slug capped at 80');

// ---------------------------------------------------- column map / lookup
{
  eq(columnForHeader('Unit Cost').field, 'cost');
  eq(columnForHeader('COST').field, 'cost');
  eq(columnForHeader('Supplier').field, 'vendor_name');
  eq(columnForHeader('2 Sided').field, 'double_sided');
  eq(columnForHeader('SqFt').field, 'sqft_basis');
  eq(columnForHeader('MPN').field, 'mfg_part_number', 'mpn header hits mfg_part_number');
  eq(columnForHeader('Mfg Part #').field, 'mfg_part_number', 'mfg-part-# header hits mfg lane');
  eq(columnForHeader('bogus column'), null, 'unknown header -> null');
  eq(CATALOG_CSV_HEADERS.indexOf('part_name') !== -1, true, 'template headers present');
  ok(CATALOG_PART_COLUMNS.length >= 15, 'canonical map covers spec fields');
}

// ------------------------------------------------------ rowsToPartPatches
{
  const rows = parseCsv(
    'Name,Part Number,Unit Cost,Unit Price,Vendor,Category,Part Type,Double Sided,Min Charge,Setup Fee,SqFt Basis,Description\n' +
    'Banner,BNR-1,"$1,234.56",25.00,  Grimco ,Vinyl,material,yes,15,40,2.5,Outdoor banner\n',
  );
  const out = rowsToPartPatches(rows, { now: NOW });
  eq(out.length, 1);
  eq(out[0].errors.length, 0, `clean row has no errors (${out[0].errors.join(',')})`);
  const p = out[0].patch;
  eq(p.part_name, 'Banner');
  eq(p.part_number, 'BNR-1');
  eq(p.mfg_part_number, 'BNR-1', 'part_number mirrors mfg_part_number');
  eq(p.cost, 1234.56, 'money coercion strips $ and commas');
  eq(p.price, 25);
  eq(p.vendor_name, 'Grimco', 'vendor trimmed');
  eq(p.category, 'Vinyl');
  eq(p.part_type, 'material');
  eq(p.double_sided, true, 'yes -> true');
  eq(p.min_charge, 15);
  eq(p.setup_fee, 40);
  eq(p.sqft_basis, 2.5);
  eq(p.description, 'Outdoor banner');
  eq(p.is_imported, true, 'imported stamp');
  eq(p.imported_at, NOW, 'now param stamps imported_at');
  eq(p.import_source, 'catalog_csv', 'import_source stamp');
  eq(p.creation_request_key, 'catimp:bnr-1', 'deterministic key from part_number');
  eq(out[0].key, 'catimp:bnr-1');
}
{
  // name-only row -> name-slug key; part_number-only -> name falls back
  const [a] = rowsToPartPatches(
    parseCsv('Name\n3" Angle Iron\n'), { now: NOW },
  );
  eq(a.patch.creation_request_key, 'catimp:3-angle-iron', 'name-slug key');
  const [b] = rowsToPartPatches(
    parseCsv('Part Number\nXYZ 99\n'), { now: NOW },
  );
  eq(b.patch.part_name, 'XYZ 99', 'part_name falls back to part_number');
  eq(b.patch.creation_request_key, 'catimp:xyz-99');
}
{
  // required-field + invalid-scalar errors
  const [a] = rowsToPartPatches(parseCsv('Vendor,Cost\nGrimco,5\n'), { now: NOW });
  ok(a.errors.indexOf('missing_name_or_part_number') !== -1, 'no name+number -> error');
  eq(a.patch, null, 'error row carries null patch');
  const [b] = rowsToPartPatches(parseCsv('Name,Unit Cost\nX,abc\n'), { now: NOW });
  ok(b.errors.indexOf('invalid_number:cost') !== -1, 'junk cost -> invalid_number error');
  eq(b.patch.cost, undefined, 'invalid number field omitted');
  const [c] = rowsToPartPatches(parseCsv('Name,Double Sided\nX,maybe\n'), { now: NOW });
  ok(c.errors.indexOf('invalid_boolean:double_sided') !== -1, 'junk bool -> invalid_boolean');
}
{
  // boolean vocab + negative parens + defaults + column-over-default
  const mk = (ds) => rowsToPartPatches(parseCsv(`Name,Double Sided\nX,${ds}\n`), { now: NOW })[0].patch.double_sided;
  eq(mk('YES'), true); eq(mk('1'), true); eq(mk('true'), true);
  eq(mk('no'), false); eq(mk('0'), false); eq(mk('off'), false);
  eq(mk(''), undefined, 'blank bool -> field omitted');
  const [neg] = rowsToPartPatches(parseCsv('Name,Cost\nX,(12.50)\n'), { now: NOW });
  eq(neg.patch.cost, -12.5, 'accounting parens -> negative');
  const [d] = rowsToPartPatches(
    parseCsv('Name,Part Type\nX,\n'), { now: NOW, defaults: { part_type: 'material', unit: 'each' } },
  );
  eq(d.patch.part_type, 'material', 'default fills blank column');
  eq(d.patch.unit, 'each', 'default fills absent column');
  const [d2] = rowsToPartPatches(
    parseCsv('Name,Part Type\nX,labor\n'), { now: NOW, defaults: { part_type: 'material' } },
  );
  eq(d2.patch.part_type, 'labor', 'column wins over default');
}
{
  // determinism + in-file duplicate keys
  const csv = 'Name\nWidget\n';
  const k1 = rowsToPartPatches(parseCsv(csv), { now: NOW })[0].patch.creation_request_key;
  const k2 = rowsToPartPatches(parseCsv(csv), { now: NOW })[0].patch.creation_request_key;
  eq(k1, k2, 'same input -> same key (re-import dedupes)');
  const dup = rowsToPartPatches(
    parseCsv('Name,Part Number\nA,P-1\nB,P-1\n'), { now: NOW },
  );
  eq(dup[1].errors.some((e) => e.startsWith('duplicate_creation_request_key')), true,
    'second row with same key flagged');
}
{
  // explicit mfg column beats the mirror
  const [r] = rowsToPartPatches(
    parseCsv('Name,Part Number,Mfg Part Number\nX,P-1,MFG-9\n'), { now: NOW },
  );
  eq(r.patch.mfg_part_number, 'MFG-9', 'explicit mfg column wins');
  const [g] = rowsToPartPatches(
    parseCsv('Name,Part Group ID\nX,grp-42\n'), { now: NOW },
  );
  eq(g.patch.part_group_id, 'grp-42', 'direct group-id column binds');
}

// ----------------------------------------------------------- matching
const EXISTING = [
  { id: 'e1', part_name: 'Banner', part_number: 'BNR-1', cost: 10, price: 25, vendor_name: 'Grimco' },
  { id: 'e2', template_name: 'Legacy Tpl', part_snapshot: { part_name: 'Angle', mfg_part_number: 'ANG-7', cost: 3 } },
  { id: 'e3', part_name: 'Dupes', mfg_part_number: 'M-100' },
  { id: 'e4', part_name: 'Keyed', creation_request_key: 'catimp:p-1' },
];
{
  const [row] = rowsToPartPatches(
    parseCsv('Name,Part Number,Unit Cost\nBanner,BNR-1,99\n'), { now: NOW },
  );
  const m = matchExistingPart(row.patch, EXISTING);
  eq(m.match.id, 'e1', 'part_number lane matches');
  eq(m.by, 'part_number');
  eq(classifyImportRow(row, EXISTING), 'update', 'changed cost -> update');
  const d = classifyImportRowDetail(row, EXISTING);
  assert.deepEqual(d.changed_fields, ['cost'], 'diff reports only changed field');
}
{
  // skip-when-identical (number equality vs string cell, stamps excluded)
  const [row] = rowsToPartPatches(
    parseCsv('Name,Part Number,Unit Cost,Unit Price,Vendor\nBanner,BNR-1,10,25,Grimco\n'), { now: NOW },
  );
  eq(classifyImportRow(row, EXISTING), 'skip', 'identical values -> skip');
}
{
  // name lane (no part_number on either side) + snapshot fields read
  const [row] = rowsToPartPatches(parseCsv('Name\nangle\n'), { now: NOW });
  const m = matchExistingPart(row.patch, EXISTING);
  eq(m.match.id, 'e2', 'name lane matches template snapshot part_name');
  eq(m.by, 'name');
}
{
  // part_number matches mfg_part_number on existing
  const [row] = rowsToPartPatches(parseCsv('Part Number\nM-100\n'), { now: NOW });
  eq(matchExistingPart(row.patch, EXISTING).match.id, 'e3', 'mfg_part_number lane');
}
{
  // creation_request_key receipt beats a different part_number
  const [row] = rowsToPartPatches(parseCsv('Part Number\nP-1\n'), { now: NOW });
  const m = matchExistingPart(row.patch, EXISTING);
  eq(m.match.id, 'e4', 'key receipt lane');
  eq(m.by, 'creation_request_key');
}
{
  // part_number lane wins over a name collision
  const [row] = rowsToPartPatches(
    parseCsv('Name,Part Number\nKeyed,BNR-1\n'), { now: NOW },
  );
  const m = matchExistingPart(row.patch, EXISTING);
  eq(m.match.id, 'e1', 'part_number lane beats name lane');
  eq(m.by, 'part_number');
}
{
  eq(classifyImportRow({ patch: null, source_row: 2, errors: ['x'] }, EXISTING), 'error');
  eq(classifyImportRow({ patch: null, source_row: 2, errors: [] }, EXISTING), 'error', 'null patch -> error');
  const [fresh] = rowsToPartPatches(parseCsv('Name\nNever Seen\n'), { now: NOW });
  eq(classifyImportRow(fresh, EXISTING), 'create', 'no match -> create');
  eq(classifyImportRow(fresh, []), 'create', 'empty catalog -> create');
  eq(classifyImportRow(fresh, null), 'create', 'null catalog -> create');
}
{
  // part_number case fold: 'bnr-1' vs 'BNR-1' identical -> skip
  const [row] = rowsToPartPatches(
    parseCsv('Name,Part Number,Unit Cost,Unit Price,Vendor\nBanner,bnr-1,10,25,Grimco\n'), { now: NOW },
  );
  eq(classifyImportRow(row, EXISTING), 'skip', 'part_number compares case-folded');
  ok(CATALOG_IMPORT_ACTIONS.length === 4, 'action vocab');
  eq(IMPORT_SOURCE, 'catalog_csv');
  eq(IMPORT_KEY_PREFIX, 'catimp:');
}

// ------------------------------------------------------------ diff fields
{
  const changed = diffPartFields(
    { part_name: 'Banner', cost: 11, description: 'new' },
    EXISTING[0],
  );
  assert.deepEqual(changed, ['cost', 'description'], 'changed only');
  eq(diffPartFields({ is_imported: true, imported_at: NOW }, EXISTING[0]).length, 0,
    'stamps never diff');
}

// ----------------------------------------------------------- importSummary
{
  const rows = rowsToPartPatches(
    parseCsv('Name,Part Number,Unit Cost,Unit Price,Vendor\nBanner,BNR-1,10,25,Grimco\nFresh,FR-9,1,2,\nBad Row,,\n'),
    { now: NOW },
  );
  // row 3: name present ('Bad Row') so it's valid -> 'create'
  const s = importSummary(rows, EXISTING);
  eq(s.total, 3);
  eq(s.skips, 1, 'identical row skipped');
  eq(s.creates, 2, 'new rows count as creates');
  eq(s.errors, 0);
  assert.deepEqual(s.error_rows, [], 'no error rows');
  const s2 = importSummary(
    [{ patch: null, source_row: 5, errors: ['missing_name_or_part_number'] }],
    EXISTING,
  );
  eq(s2.errors, 1);
  assert.deepEqual(s2.error_rows, [5], 'error_rows lists source_row');
  // pre-classified actions honored
  const s3 = importSummary([{ action: 'update' }, { action: 'skip' }, { action: 'create' }]);
  eq(s3.updates, 1); eq(s3.skips, 1); eq(s3.creates, 1);
}

// -------------------------------------------------------- vendorAssociation
const VENDORS = [
  { id: 'v1', name: 'Grimco', status: 'active' },
  { id: 'v2', name: 'Old Grimco', status: 'inactive' },
  { id: 'v3', name: 'Grimco', status: 'inactive' },
];
{
  const r = vendorAssociation({ vendor_name: '  grimco ' }, VENDORS);
  eq(r.status, 'matched', 'name resolves case-insensitive + trimmed');
  eq(r.patch.vendor_id, 'v1', 'active vendor preferred over inactive dupe');
  eq(r.patch.vendor_name, 'Grimco', 'canonical vendor name');
  eq(r.vendor.id, 'v1');
}
{
  const r = vendorAssociation({ vendor_id: 'v2', vendor_name: 'Whatever' }, VENDORS);
  eq(r.status, 'matched', 'known vendor_id passes through');
  eq(r.patch.vendor_id, 'v2');
  const r2 = vendorAssociation({ vendor_name: 'v3' }, VENDORS);
  eq(r2.patch.vendor_id, 'v3', 'raw id in the name slot binds');
}
{
  const orig = { vendor_name: 'Nobody Co' };
  const r = vendorAssociation(orig, VENDORS);
  eq(r.status, 'unresolved');
  eq(r.patch.vendor_unresolved, true, 'unknown vendor flags, not rejects');
  eq(r.patch.vendor_name, 'Nobody Co', 'name retained for review');
  eq(orig.vendor_unresolved, undefined, 'input patch not mutated');
  eq(vendorAssociation({ part_name: 'x' }, VENDORS).status, 'none', 'no vendor info -> none');
  eq(vendorAssociation({ vendor_id: 'ghost' }, VENDORS).status, 'unresolved',
    'unknown id also flags');
}

// ------------------------------------------------------ partGroupAssociation
const GROUPS = [
  { id: 'g1', name: 'Vinyl' },
  { id: 'g2', name: 'Hardware' },
];
{
  const r = partGroupAssociation({ category: ' vinyl ' }, GROUPS);
  eq(r.status, 'matched');
  eq(r.patch.part_group_id, 'g1', 'category name -> group id');
  eq(partGroupAssociation({ part_group_id: 'g2' }, GROUPS).status, 'matched',
    'known group id passes');
  const miss = partGroupAssociation({ category: 'Nowhere' }, GROUPS);
  eq(miss.status, 'unresolved');
  eq(miss.patch.group_unresolved, true, 'unmatched group flags');
  eq(partGroupAssociation({ part_name: 'x' }, GROUPS).status, 'none');
}

// ------------------------------------------------------------ updatePatchFor
{
  const existing = { id: 'e1', part_name: 'Banner', part_number: 'BNR-1', cost: 10 };
  const patch = { part_name: 'Banner', part_number: 'BNR-1', cost: 12, imported_at: NOW, creation_request_key: 'catimp:bnr-1' };
  const up = updatePatchFor(existing, patch);
  eq(up.cost, 12, 'changed field written');
  eq(up.part_name, undefined, 'unchanged field not written');
  eq(up.is_imported, true);
  eq(up.imported_at, NOW, 're-stamps imported_at');
  eq(up.import_source, 'catalog_csv');
  eq(up.creation_request_key, 'catimp:bnr-1', 'key back-filled on legacy row');
  const up2 = updatePatchFor({ ...existing, creation_request_key: 'other' }, patch);
  eq(up2.creation_request_key, undefined, 'existing key never overwritten');
}

// ------------------------------------------------------ importJobSummaryFields
{
  const f = importJobSummaryFields(
    { total: 4, creates: 2, updates: 1, skips: 0, errors: 1, error_rows: [9] },
    { user_email: 'admin@x.test', file_name: 'parts.csv', duration_ms: 120 },
  );
  eq(f.import_type, 'parts');
  eq(f.status, 'completed', 'partial errors still complete');
  eq(f.total_items, 4);
  eq(f.created_items, 2);
  eq(f.updated_items, 1);
  eq(f.invalid_items, 1);
  eq(f.user_email, 'admin@x.test');
  ok(f.result_message.includes('2 created'), 'result_message narrates counts');
  const allBad = importJobSummaryFields(
    { total: 2, creates: 0, updates: 0, skips: 0, errors: 2, error_rows: [2, 3] }, {},
  );
  eq(allBad.status, 'failed', 'every row failing -> job failed');
}

// ------------------------------------------------------- Import Part system
{
  eq(IMPORT_PART_SYSTEM_KEY, 'import_part');
  eq(IMPORT_PART_CREATION_KEY, 'catimp:system:import_part');
  eq(IMPORT_PART_DEFAULTS.part_name, 'Import Part');
  eq(IMPORT_PART_DEFAULTS.creation_request_key, IMPORT_PART_CREATION_KEY);
  const d = importPartDefaults({ now: NOW });
  eq(d.seeded_at, NOW, 'seed timestamp param');
  eq(d.is_system_part, true);
  ok(isImportPart({ system_part_key: 'import_part' }), 'key detection');
  ok(isImportPart({ creation_request_key: IMPORT_PART_CREATION_KEY }), 'receipt detection');
  ok(isImportPart({ is_system_part: true, part_name: 'import part' }), 'name detection');
  ok(!isImportPart({ part_name: 'Import Part' }), 'plain name alone is not the system part');
  ok(!isImportPart(null) && !isImportPart('x'), 'junk safe');
}

rmSync(bundlePath, { force: true });
console.log(`PASS catalog-import (${n} asserts)`);
