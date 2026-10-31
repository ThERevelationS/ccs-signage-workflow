import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-imports.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/imports/importModel.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const M = await import(pathToFileURL(out).href);

const {
  parseCsvText, normalizeHeader, mapHeaders, extractRow, validateRows, validateImport,
  planImport, chunkRows, toCustomerPayload, toContactPayload, toLocationPayload,
  toInventoryPayload, customerRefMatches, locationDedupeKey, contactDedupeKey,
} = M;

let cases = 0;
const check = (cond, msg) => { assert.ok(cond, msg); cases += 1; };

// ---- CSV parsing edge cases ------------------------------------------------
{
  const { headers, records } = parseCsvText('a,b,c\n1,2,3\n4,5,6\n');
  assert.deepEqual(headers, ['a', 'b', 'c']);
  assert.equal(records.length, 2);
  assert.equal(records[0].row, 2);
  assert.equal(records[0].data.a, '1');
  cases += 1;
}
{
  // UTF-8 BOM stripped before headers.
  const { headers } = parseCsvText('﻿name,cost\nWidget,1.50\n');
  assert.deepEqual(headers, ['name', 'cost']);
  cases += 1;
}
{
  // Quoted fields: embedded comma, escaped quote, embedded newline.
  const { records } = parseCsvText('name,note\n"Acme, Inc","say ""hi""\nline2"\n');
  assert.equal(records.length, 1);
  assert.equal(records[0].data.name, 'Acme, Inc');
  assert.equal(records[0].data.note, 'say "hi"\nline2');
  cases += 1;
}
{
  // Blank rows skipped but record numbers stay aligned with the file.
  const { records } = parseCsvText('a,b\n1,2\n\n   \n3,4\n');
  assert.equal(records.length, 2);
  assert.equal(records[1].row, 5);
  assert.equal(records[1].data.a, '3');
  cases += 1;
}
{
  // CRLF + CR-only endings.
  const a = parseCsvText('a,b\r\n1,2\r\n');
  const b = parseCsvText('a,b\r1,2\r');
  assert.equal(a.records.length, 1);
  assert.equal(b.records.length, 1);
  cases += 1;
}
{
  // No trailing newline.
  const { records } = parseCsvText('a,b\n1,2');
  assert.equal(records.length, 1);
  cases += 1;
}

// ---- Header normalization + synonym mapping ---------------------------------
{
  assert.equal(normalizeHeader(' Product Name '), 'product_name');
  assert.equal(normalizeHeader('PART#'), 'part');
  assert.equal(normalizeHeader('E-Mail'), 'e_mail');
  cases += 1;
}
{
  // Synonyms: "Product Name" → parts.name, "Part Cost" → parts.cost.
  const { keyToHeader, missingRequired, unmappedHeaders } = mapHeaders(
    ['Product Name', 'Part Cost', 'Whatever'], 'parts');
  assert.equal(keyToHeader.name, 'Product Name');
  assert.equal(keyToHeader.cost, 'Part Cost');
  assert.deepEqual(missingRequired, []);
  assert.deepEqual(unmappedHeaders, ['Whatever']);
  cases += 1;
}
{
  // Missing required column reported by label.
  const { missingRequired } = mapHeaders(['Email'], 'customers');
  assert.deepEqual(missingRequired, ['Company']);
  cases += 1;
}

// ---- Validation -------------------------------------------------------------
{
  const csv = 'Company,Email\nAcme,ops@acme.com\n,bad row\nBeta,not-an-email\nAcme,dup@acme.com\n';
  const parsed = parseCsvText(csv);
  const res = validateImport(parsed, 'customers');
  assert.equal(res.valid.length, 1, 'only the fully-valid row survives');
  const rowsWithErrors = res.errors.map((e) => e.row);
  assert.ok(rowsWithErrors.includes(3), 'missing company flagged');
  assert.ok(rowsWithErrors.includes(4), 'bad email flagged');
  assert.ok(rowsWithErrors.includes(5), 'duplicate company flagged');
  const dupMsg = res.errors.find((e) => e.row === 5);
  assert.match(dupMsg.message, /duplicate of row 2/i);
  cases += 1;
}
{
  // Contacts need a customer ref + at least one identity field.
  const csv = 'Company,First,Email\nAcme,,\nAcme,Pat,pat@acme.com\n';
  const res = validateImport(parseCsvText(csv), 'customer_contacts');
  assert.equal(res.valid.length, 1);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0].message, /first name, last name, or email/i);
  cases += 1;
}
{
  // Addresses require street + city + state.
  const csv = 'Customer,Address,City,State\nAcme,100 Main St,Cincinnati,OH\nAcme,,Cincinnati,OH\n';
  const res = validateImport(parseCsvText(csv), 'customer_addresses');
  assert.equal(res.valid.length, 1);
  assert.equal(res.errors.length, 1);
  cases += 1;
}
{
  // Parts: cost must be numeric ≥ 0; unit synonyms map to enum.
  const csv = 'Name,Cost,Unit,Material\nAngle,$12.50,each,stainless\nBad,-1,each,steel\nWidget,abc,each,steel\n';
  const res = validateImport(parseCsvText(csv), 'parts');
  assert.equal(res.valid.length, 1);
  assert.equal(res.valid[0].data.cost, 12.5);
  assert.equal(res.valid[0].data.unit, 'per_piece');
  assert.equal(res.valid[0].data.material, 'Stainless_Steel');
  assert.equal(res.errors.length, 2);
  cases += 1;
}
{
  // Vendor associations dedupe on vendor+part.
  const csv = 'Vendor,Part,Cost\nKeller,Angle,4.00\nKeller,Angle,4.25\nKeller,Tube,2.00\n';
  const res = validateImport(parseCsvText(csv), 'vendor_associations');
  assert.equal(res.valid.length, 2);
  assert.equal(res.errors.length, 1);
  cases += 1;
}
{
  // Missing required header → every row errors with the same column message.
  const res = validateImport(parseCsvText('Foo,Bar\n1,2\n3,4\n'), 'customers');
  assert.equal(res.valid.length, 0);
  assert.equal(res.errors.length, 2);
  assert.match(res.errors[0].message, /missing required column/i);
  cases += 1;
}

// ---- planImport + chunkRows -------------------------------------------------
{
  const parsed = parseCsvText('Company\nA\nB\nC\n');
  const validation = validateImport(parsed, 'customers');
  const plan = planImport(parsed.records, validation, { matchedRows: [2] });
  assert.deepEqual(plan, { total: 3, valid: 3, invalid: 0, matched: 1, toCreate: 2 });
  cases += 1;
}
{
  const plan = planImport(
    parseCsvText('Company\nA\n\nB\n').records,
    { valid: [{ row: 2, data: {} }], errors: [{ row: 4, message: 'x' }] });
  assert.deepEqual(plan, { total: 2, valid: 1, invalid: 1, matched: 0, toCreate: 1 });
  cases += 1;
}
{
  const chunks = chunkRows([1, 2, 3, 4, 5], 2);
  assert.deepEqual(chunks, [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkRows([], 10), []);
  cases += 1;
}

// ---- Payload shaping ---------------------------------------------------------
{
  const p = toCustomerPayload({ company_name: 'Acme', contact_email: 'a@b.com', website: '', credit_limit: 500 });
  assert.deepEqual(p, { company_name: 'Acme', contact_email: 'a@b.com', credit_limit: 500 });
  cases += 1;
}
{
  const c = toContactPayload({ first_name: 'Pat', email: 'p@x.com' });
  assert.equal(c.is_active, true);
  assert.equal(c.first_name, 'Pat');
  cases += 1;
}
{
  const l = toLocationPayload({ address_line_1: '100 Main', city: 'Cincy', state: 'OH' }, 'cust1', { source: 'csv_import' });
  assert.equal(l.customer_id, 'cust1');
  assert.equal(l.label, '100 Main');
  assert.equal(l.country, 'US');
  assert.equal(l.site_type, 'unknown');
  cases += 1;
}
{
  const inv = toInventoryPayload({ name: 'Sq Tube 2x2', category: 'aluminum tube', material: 'Aluminum', cost: 9.5, unit: 'per_foot' });
  assert.equal(inv.size, 'Sq Tube 2x2');
  assert.equal(inv.material_type, 'Aluminum');
  assert.equal(inv.cost_per_unit, 9.5);
  assert.match(inv.notes, /Part: Sq Tube 2x2/);
  cases += 1;
}

// ---- Match helpers -----------------------------------------------------------
{
  const cust = { id: 'c1', company_name: 'Acme Signs', legacy_client_names: ['ACME LLC'] };
  assert.ok(customerRefMatches(cust, 'acme signs'));
  assert.ok(customerRefMatches(cust, 'acme llc'));
  assert.ok(customerRefMatches(cust, 'c1'));
  assert.ok(!customerRefMatches(cust, 'other'));
  cases += 1;
}
{
  assert.equal(
    locationDedupeKey('C1', { address_line_1: '100  Main', city: 'Cincy', state: 'oh', postal_code: '45202' }),
    'c1|100 main|cincy|oh|45202');
  cases += 1;
}
{
  assert.equal(contactDedupeKey({ email: 'P@X.com' }), 'email:p@x.com');
  assert.equal(contactDedupeKey({ first_name: 'Pat', last_name: 'Lee' }), 'name:pat|lee');
  cases += 1;
}

console.log(`PASS imports (${cases} cases)`);
