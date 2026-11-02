import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-import.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerImportModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  CUSTOMER_COLUMNS,
  parseCsv,
  normalizeHeader,
  mapCustomerHeaders,
  canonicalizeCustomerRow,
  splitContactName,
  normalizeEmail,
  normalizeCompanyName,
  customerSlug,
  parseImportBool,
  customerImportKey,
  rowToCustomerPatch,
  contactRowsFor,
  locationRowsFor,
  matchCustomer,
  classifyCustomerRow,
  rowsToCustomerPatches,
  importSummary,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-02T11:00:00Z';
const canon = (obj, row = 2) => canonicalizeCustomerRow({ row, ...obj });

// --- CSV parsing ------------------------------------------------------------
const p1 = parseCsv('company,email\nAcme,a@x.com\nBeta,b@x.com');
assert.deepEqual(p1.headers, ['company', 'email']);
assert.equal(p1.records.length, 2);
assert.equal(p1.records[0].row, 2, 'header consumes row 1');
assert.equal(p1.records[0].data.company, 'Acme');
assert.equal(p1.records[1].data.email, 'b@x.com');

const p2 = parseCsv('﻿company,notes\r\n"Acme, Inc","line1\nline2"\r\n"Q""q""",x');
assert.equal(p2.records[0].data.company, 'Acme, Inc', 'quoted comma + BOM + CRLF');
assert.equal(p2.records[0].data.notes, 'line1\nline2', 'embedded newline');
assert.equal(p2.records[1].data.company, 'Q"q"', 'escaped double-quote');

const p3 = parseCsv('a,b\n1,2\n\n,,\n3,4');
assert.equal(p3.records.length, 2, 'fully blank rows skipped');
assert.equal(p3.records[1].row, 5, 'blank rows still consume row numbers');

const p4 = parseCsv('a,b\n1,2\r3,4'); // bare CR
assert.equal(p4.records.length, 2, 'bare CR line ending');
assert.deepEqual(parseCsv(''), { headers: [], records: [] }, 'empty input');
assert.deepEqual(parseCsv('only,header\n'), { headers: ['only', 'header'], records: [] });

// --- header mapping / aliases -------------------------------------------------
const { keyToHeader, unmappedHeaders, missingRequired } =
  mapCustomerHeaders(['Company', 'E-Mail', 'Sales Rep', 'ZIP Code', 'Tax Exempt?', 'zzz']);
assert.equal(keyToHeader.company_name, 'Company');
assert.equal(keyToHeader.email, 'E-Mail');
assert.equal(keyToHeader.sales_rep, 'Sales Rep');
assert.equal(keyToHeader.zip, 'ZIP Code');
assert.equal(keyToHeader.tax_exempt, 'Tax Exempt?', 'punctuation-insensitive alias hit');
assert.equal(unmappedHeaders.includes('zzz'), true);
assert.equal(missingRequired.length, 0);
const miss = mapCustomerHeaders(['foo', 'bar']);
assert.equal(miss.missingRequired.length, 1, 'file with no company/contact/email cols flagged');
assert.equal(normalizeHeader('  Sales-Rep!! '), 'sales_rep');
assert.ok(CUSTOMER_COLUMNS.length >= 30, 'column registry covers the spec map');

// --- canonicalization + name split --------------------------------------------
assert.deepEqual(splitContactName('Doe, Jane'), { first_name: 'Jane', last_name: 'Doe' });
assert.deepEqual(splitContactName('Jane Van Doe'), { first_name: 'Jane', last_name: 'Van Doe' });
assert.deepEqual(splitContactName('Madonna'), { first_name: 'Madonna', last_name: '' });
const c1 = canon({ 'Contact Name': 'Doe, Jane', Email: '  JANE@X.COM ' });
assert.equal(c1.first_name, 'Jane', 'contact_name splits when first/last absent');
assert.equal(c1.last_name, 'Doe');
assert.equal(c1.email, 'jane@x.com', 'email normalized lowercase');
const c2 = canon({ contact_name: 'Ignore Me', first_name: 'Bo', last_name: 'Peep' });
assert.equal(c2.first_name, 'Bo', 'explicit first/last beat contact_name');

// --- patch shaping ------------------------------------------------------------
const r1 = rowToCustomerPatch(canon({
  company: 'Acme Signs', email: 'A@X.COM', phone: '555-1', address1: '1 Main',
  city: 'Cincy', state: 'OH', zip: '45202', website: 'acme.com',
  tax_exempt: 'yes', sales_rep: 'Brett', notes: 'n1', tags: 'vip;wholesale',
}));
assert.equal(r1.errors.length, 0, JSON.stringify(r1.errors));
assert.equal(r1.patch.company_name, 'Acme Signs');
assert.equal(r1.patch.contact_email, 'a@x.com', 'email lowered into patch');
assert.equal(r1.patch.company_phone, '555-1');
assert.equal(r1.patch.billing_address_1, '1 Main');
assert.equal(r1.patch.billing_city, 'Cincy');
assert.equal(r1.patch.billing_state, 'OH');
assert.equal(r1.patch.billing_postal_code, '45202');
assert.equal(r1.patch.billing_country, 'United States', 'default country on address rows');
assert.equal(r1.patch.location_same_as_billing, true, 'no site cols → same as billing');
assert.equal(r1.patch.tax_exempt, true);
assert.equal(r1.patch.salesperson, 'Brett', 'sales_rep → salesperson');
assert.deepEqual(r1.patch.tags, ['vip', 'wholesale']);
assert.equal(r1.patch.website, 'acme.com');

const r2 = rowToCustomerPatch(canon({ email: 'only@x.com' }));
assert.equal(r2.errors.length, 1, 'company-only-less: needs company or contact+email');
const r3 = rowToCustomerPatch(canon({ contact_name: 'Jo Blow', email: 'JO@X.COM' }));
assert.equal(r3.errors.length, 0, 'contact_name + email satisfies requirement');
assert.equal(r3.patch.company_name, 'Jo Blow', 'person-only row falls back to contact name');
const r4 = rowToCustomerPatch(canon({ company: 'Bad Email Co', email: 'not-an-email' }));
assert.equal(r4.errors.length, 1, 'malformed email rejected');
const r5 = rowToCustomerPatch(canon({ company: 'T', tax_exempt: 'maybe' }));
assert.equal(r5.errors.length, 1, 'non-boolean tax_exempt rejected');
const r5b = rowToCustomerPatch(canon({ company: 'T', tax_exempt: 'no' }));
assert.equal(r5b.errors.length, 0);
assert.equal(r5b.patch.tax_exempt, false, 'explicit false lands on legacy flag');
assert.equal(parseImportBool('Y'), true);
assert.equal(parseImportBool('n'), false);
assert.equal(parseImportBool('huh'), null);

const r6 = rowToCustomerPatch(canon({
  company: 'ShipCo', address1: '1 Bill St', city: 'C', state: 'OH', zip: '1',
  shipping_address1: '9 Site Rd', shipping_city: 'S', shipping_state: 'KY', shipping_zip: '9',
}));
assert.equal(r6.patch.location_same_as_billing, false, 'distinct site → not same');
assert.equal(r6.patch.location_address_1, '9 Site Rd');
assert.equal(r6.patch.location_city, 'S');
assert.equal(r6.patch.location_postal_code, '9');
assert.equal(r6.patch.contact_name, undefined, 'contact_name never lands on patch');
assert.equal(r6.patch.billing_email, undefined, 'aliased billing email uses entity field');

// --- deterministic keys ---------------------------------------------------------
assert.equal(customerImportKey(canon({ company: 'Acme Signs, LLC!' })), 'custimp:acme-signs-llc:nophone');
assert.equal(customerImportKey(canon({ company: '  ACME   signs llc ' })), 'custimp:acme-signs-llc:nophone', 'slug normalized');
assert.equal(customerImportKey(canon({ company: 'Acme', email: 'A@X.com' })), 'custimp:acme:a@x.com');
assert.equal(customerImportKey(canon({ contact_name: 'Jo', email: 'j@x' })), 'custimp:jo:j@x', 'person-only slug from contact');
assert.notEqual(customerImportKey(canon({ company: 'Acme' })), customerImportKey(canon({ company: 'Beta' })));
assert.equal(customerSlug('A & B Co.'), 'a-and-b-co');
assert.equal(normalizeCompanyName('  ACME,  Inc. '), 'acme inc');

// --- contacts / locations creates ------------------------------------------------
const patch = rowToCustomerPatch(canon({ company: 'Acme', contact_name: 'Doe, Jane', email: 'j@x.com', mobile_phone: '111', contact_title: 'Owner' })).patch;
const cts = contactRowsFor(patch, canon({ company: 'Acme', contact_name: 'Doe, Jane', email: 'j@x.com', mobile_phone: '111', contact_title: 'Owner' }), { now: NOW });
assert.equal(cts.length, 1);
assert.equal(cts[0].customer_id, `pending:${patch.creation_request_key}`, 'pending placeholder carries create key');
assert.equal(cts[0].first_name, 'Jane');
assert.equal(cts[0].last_name, 'Doe');
assert.equal(cts[0].email, 'j@x.com');
assert.equal(cts[0].role, 'primary');
assert.equal(cts[0].is_primary, true);
assert.equal(cts[0].mobile_phone, '111');
assert.equal(cts[0].position, 'Owner');
assert.equal(cts[0].source_summary.source, 'customer_csv_import');
assert.equal(cts[0].source_summary.imported_at, NOW);
assert.match(cts[0].creation_request_key, /^custimp-ct:acme:j@x\.com$/, 'contact key deterministic');
const cts2 = contactRowsFor(patch, canon({ company: 'Acme', billing_contact_name: 'Bill Ap', billing_email: 'ap@x.com' }), { now: NOW });
assert.equal(cts2.length, 1, 'billing-only person still emits a contact');
assert.equal(cts2[0].role, 'billing');
assert.equal(cts2[0].is_billing_contact, true);
assert.equal(cts2[0].authority_role, 'accounts_payable');
assert.equal(contactRowsFor(patch, canon({ company: 'Acme' }), {}).length, 0, 'no person data → no contact');

const locs = locationRowsFor(patch, canon({
  company: 'Acme', address1: '1 Main', city: 'C', state: 'OH', zip: '45202',
  shipping_address1: '9 Site', shipping_city: 'S', shipping_state: 'KY', shipping_zip: '41011',
}), { now: NOW });
assert.equal(locs.length, 2, 'billing + site location rows');
assert.equal(locs[0].site_type, 'billing');
assert.equal(locs[0].is_billing_address, true);
assert.equal(locs[0].is_primary_site, false);
assert.equal(locs[0].address_line_1, '1 Main');
assert.equal(locs[0].postal_code, '45202');
assert.equal(locs[1].site_type, 'install');
assert.equal(locs[1].is_primary_site, true);
assert.equal(locs[1].customer_id, `pending:${patch.creation_request_key}`);
assert.match(locs[0].creation_request_key, /^custimp-loc:acme:billing:/);
assert.equal(locationRowsFor(patch, canon({ company: 'Acme' }), {}).length, 0, 'no address → no location');
const locOnly = locationRowsFor(patch, canon({ company: 'A', address1: '1 M', city: 'C', state: 'OH' }), {});
assert.equal(locOnly[0].site_type, 'install_and_billing', 'sole address doubles as site');

// --- dedupe precedence ------------------------------------------------------------
const existing = [
  { id: 'c1', company_name: 'Acme Signs', contact_email: 'a@x.com' },
  { id: 'c2', company_name: 'Beta Co', contact_email: 'b@x.com' },
  { id: 'c3', company_name: 'Dup Co' },
  { id: 'c4', company_name: 'Dup Co' },
];
// email exact → merge regardless of name.
assert.equal(classifyCustomerRow(canon({ company: 'Renamed Co', email: 'a@x.com' }), existing), 'merge');
assert.equal(classifyCustomerRow(canon({ company: 'New Co', email: 'new@x.com' }), existing), 'create');
assert.equal(classifyCustomerRow(canon({ company: 'Beta Co' }), existing), 'merge', 'single name match merges');
assert.equal(classifyCustomerRow(canon({ company: 'dup co' }), existing), 'skip', 'multi name match → ambiguous skip');
assert.equal(classifyCustomerRow(canon({ contact_name: 'Solo Person' }), existing), 'error', 'contact without email or company → error');
const m1 = matchCustomer(canon({ company: 'Whatever', email: 'a@x.com' }), existing);
assert.equal(m1.action, 'merge');
assert.deepEqual(m1.matched_customer_ids, ['c1']);
assert.equal(m1.ambiguous, false);
const m2 = matchCustomer(canon({ company: 'Dup Co' }), existing);
assert.equal(m2.action, 'skip');
assert.equal(m2.ambiguous, true);
assert.deepEqual(m2.matched_customer_ids.sort(), ['c3', 'c4']);
// email-vs-name conflict → ambiguous skip.
const m3 = matchCustomer(canon({ company: 'Beta Co', email: 'a@x.com' }), existing);
assert.equal(m3.action, 'skip');
assert.equal(m3.ambiguous, true);
assert.equal(m3.reason.includes('different'), true, 'conflict documented');
// additional_contacts + billing email count for email dedupe.
const m4 = matchCustomer(canon({ company: 'X', email: 'deep@x.com' }), [
  { id: 'cx', company_name: 'Other', additional_contacts: [{ email: 'Deep@X.com' }] },
]);
assert.equal(m4.action, 'merge', 'nested contact email dedupes');
const m5 = matchCustomer(canon({ company: 'Legacy Name Row' }), [
  { id: 'cy', company_name: 'New Name', legacy_client_names: ['legacy name row'] },
]);
assert.equal(m5.action, 'merge', 'legacy_client_names count for name dedupe');
const m6 = matchCustomer(canon({ company: 'Acme Signs', email: 'b@x.com' }), existing);
assert.equal(m6.action, 'skip', 'email-vs-name split → ambiguous, never guessed');
assert.equal(m6.ambiguous, true);
assert.deepEqual(m6.matched_customer_ids, ['c2', 'c1'], 'email hit listed first');

// --- full pipeline -----------------------------------------------------------------
const csv = [
  'company,email,contact_name,city,state',
  'Acme,a@x.com,"Doe, Jane",Cincy,OH',   // email hits existing c1 → merge
  'Freshco,fa@x.com,Ann A,,',           // no existing → create (registers pending)
  'Freshco,fb@x.com,Bob B,,',           // same company, new person → folds into row3
  ',,Solo Person,,',                     // contact w/o email, no company → error
].join('\n');
const plan = rowsToCustomerPatches(parseCsv(csv).records, { now: NOW, existingCustomers: existing });
assert.equal(plan.length, 4);
assert.equal(plan[0].action, 'merge', 'row2 email-matches existing c1');
assert.deepEqual(plan[0].matched_customer_ids, ['c1']);
assert.equal(plan[0].contacts[0].customer_id, 'c1', 'merge row children carry real id');
assert.equal(plan[0].contacts.length, 1);
assert.equal(plan[0].locations.length, 1, 'city/state emit a billing location');
assert.equal(plan[1].action, 'create');
assert.equal(plan[1].contacts[0].customer_id, `pending:${plan[1].key}`);
assert.equal(plan[2].action, 'merge', 'second Freshco contact folds into row3 pending create');
assert.equal(plan[2].matched_pending_key, plan[1].key);
assert.equal(plan[2].contacts[0].customer_id, `pending:${plan[1].key}`, 'fold children point at target key');
assert.equal(plan[2].errors.length, 0);
assert.equal(plan[3].action, 'error');
assert.equal(plan[3].errors[0].startsWith('row 5:'), true, 'errors prefixed with row number');

// in-file exact duplicate → skip.
const dupPlan = rowsToCustomerPatches(parseCsv('company,email\nAcme,z@x.com\nAcme,Z@X.COM').records, {});
assert.equal(dupPlan[0].action, 'create');
assert.equal(dupPlan[1].action, 'skip');
assert.match(dupPlan[1].reason, /duplicate in file of row 2/);
assert.equal(dupPlan[0].contacts[0].customer_id, `pending:${dupPlan[0].key}`);

// create row registers pending; ambiguous existing rows must NOT capture later rows.
const foldPlan = rowsToCustomerPatches(parseCsv('company,email,contact_name\nNewCo,x@n.com,Ann A\nNewCo,y@n.com,Bob B\nNewCo,x@n.com,Ann A').records, {});
assert.equal(foldPlan[0].action, 'create');
assert.equal(foldPlan[1].action, 'merge');
assert.equal(foldPlan[1].matched_pending_key, foldPlan[0].key);
assert.equal(foldPlan[2].action, 'skip', 'third row = dup of first');
const ambPlan = rowsToCustomerPatches(parseCsv('company,email,contact_name\nDup Co,,Ann\nDup Co,d@x.com,Bob').records, { existingCustomers: existing });
assert.equal(ambPlan[0].action, 'skip');
assert.equal(ambPlan[0].ambiguous, true);
assert.equal(ambPlan[1].action, 'skip', 'ambiguous target never becomes a fold destination');
assert.equal(ambPlan[1].ambiguous, true);

// --- summary / history -------------------------------------------------------------
const sum = importSummary(plan);
assert.equal(sum.import_type, 'customers');
assert.equal(sum.total_items, 4);
assert.equal(sum.created_items, 1);
assert.equal(sum.updated_items, 2);
assert.equal(sum.invalid_items, 1);
assert.equal(sum.ambiguous_items, 0);
assert.equal(sum.contact_creates, 3);
assert.equal(sum.location_creates, 1);
assert.match(sum.result_message, /customers: /);
const sum2 = importSummary(ambPlan);
assert.equal(sum2.ambiguous_items, 2);
assert.equal(sum2.skipped_items, 0, 'ambiguous counted separately from plain skips');
assert.equal(sum2.ambiguous.length, 2);
assert.deepEqual(sum2.ambiguous[0].matched_customer_ids.sort(), ['c3', 'c4']);
assert.equal(sum2.total_items, sum2.created_items + sum2.updated_items + sum2.skipped_items + sum2.ambiguous_items + sum2.invalid_items, 'disjoint counts sum to total');
assert.deepEqual(importSummary([]).ambiguous, []);

rmSync(out, { force: true });
console.log('PASS customer-import');
