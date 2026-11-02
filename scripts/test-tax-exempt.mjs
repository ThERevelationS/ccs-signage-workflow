// test-tax-exempt.mjs — worker w-72 (G-08)
// Asserts the tax-exemption registry schema landed on Customer.jsonc
// (tax_exemption object; legacy flats untouched) and that taxExemptModel.js
// normalizes object + flat aliases, resolves status (revoked > expired >
// active; no expires_on = perpetual), warns estimates on expired/expiring
// certs, taxes expired/revoked normally, and produces the exempt-customers
// report sorted by expiry (perpetual last).
// Run: node scripts/test-tax-exempt.mjs  →  prints PASS

import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const NOW = '2026-06-15'; // fixed "today" for every deterministic assert

function stripJsonc(src) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

const customer = JSON.parse(
  stripJsonc(readFileSync(join(root, 'base44', 'entities', 'Customer.jsonc'), 'utf8')));
const p = customer?.properties || {};

// ---------- schema checks ----------

assert.equal(p.tax_exemption?.type, 'object', 'Customer.tax_exemption is an object');
for (const f of ['reason', 'certificate_id', 'expires_on', 'issued_by']) {
  assert.equal(p.tax_exemption?.properties?.[f]?.type, 'string', `tax_exemption.${f} is a string`);
}
assert.deepEqual(p.tax_exemption?.properties?.status?.enum, ['active', 'expired', 'revoked'],
  'tax_exemption.status enum is active|expired|revoked');
// Legacy fields remain declared — normalization is additive, never a retype.
assert.equal(p.tax_exempt?.type, 'boolean', 'Customer.tax_exempt remains the legacy boolean');
assert.equal(p.tax_exempt_id?.type, 'string', 'Customer.tax_exempt_id still declared');
assert.equal(p.tax_exempt_expires?.type, 'string', 'Customer.tax_exempt_expires still declared');
assert.equal(p.tax_exempt_expiration?.type, 'string', 'Customer.tax_exempt_expiration still declared');
assert.equal(p.tax_exempt_reason?.type, 'string', 'Customer.tax_exempt_reason still declared');
assert.equal(p.tax_id_number?.type, 'string', 'Customer.tax_id_number still declared');

// ---------- model checks ----------

const bundlePath = resolve(here, '.tmp-tax-exempt.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/customer360/taxExemptModel.js')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const { taxExemption, estimateTaxWarning, taxableEstimate, exemptCustomersReport, EXEMPTION_EXPIRING_DAYS } =
  await import(pathToFileURL(bundlePath).href);
rmSync(bundlePath, { force: true });

// --- status matrix ---
assert.deepEqual(taxExemption(null, { now: NOW }), { status: 'none', record: null, days_until_expiry: null },
  'missing customer → none');
assert.equal(taxExemption({}, { now: NOW }).status, 'none', 'empty customer → none');
assert.equal(taxExemption({ tax_exempt: false }, { now: NOW }).status, 'none',
  'explicit false flag alone → none');
assert.equal(taxExemption({ tax_id_number: 'EIN-99' }, { now: NOW }).status, 'none',
  'tax_id_number alone is an EIN, not an exemption record');

const flagOnly = taxExemption({ tax_exempt: true }, { now: NOW });
assert.equal(flagOnly.status, 'active', 'legacy boolean flag → active');
assert.equal(flagOnly.record.perpetual, true, 'no expires_on → perpetual');
assert.equal(flagOnly.days_until_expiry, null, 'perpetual → null days_until_expiry');

const future = taxExemption({ tax_exemption: { certificate_id: 'C-1', expires_on: '2026-07-15' } }, { now: NOW });
assert.equal(future.status, 'active', 'future expiry → active');
assert.equal(future.days_until_expiry, 30, 'days_until_expiry computed in UTC days');
assert.equal(future.record.perpetual, false, 'dated cert is not perpetual');

// --- expiry boundary (valid THROUGH expires_on; expired the next day) ---
assert.equal(taxExemption({ tax_exempt_expires: '2026-06-14' }, { now: NOW }).status, 'expired',
  'yesterday → expired');
const today = taxExemption({ tax_exempt_expires: '2026-06-15' }, { now: NOW });
assert.equal(today.status, 'active', 'expiry date itself is still valid');
assert.equal(today.days_until_expiry, 0, 'expiry today → 0 days remain');
assert.equal(taxExemption({ tax_exempt_expires: '2026-06-16' }, { now: NOW }).days_until_expiry, 1,
  'tomorrow → 1 day');

// --- precedence: revoked beats expiry; stored expired wins; stale 'active' loses to a past date ---
assert.equal(taxExemption({ tax_exemption: { status: 'revoked', expires_on: '2027-01-01' } }, { now: NOW }).status,
  'revoked', 'revoked beats a future expiry date');
assert.equal(taxExemption({ tax_exemption: { status: 'revoked', expires_on: '2026-01-01' } }, { now: NOW }).status,
  'revoked', 'revoked beats a past expiry date');
assert.equal(taxExemption({ tax_exemption: { status: 'expired', expires_on: '2027-01-01' } }, { now: NOW }).status,
  'expired', 'stored expired wins over a future date');
assert.equal(taxExemption({ tax_exemption: { status: 'active', expires_on: '2026-01-01' } }, { now: NOW }).status,
  'expired', 'a past expires_on overrides a stale stored active');

// --- alias reads ---
const alias = taxExemption({ tax_exempt_id: 'TX-77', exempt_reason: 'resale' }, { now: NOW });
assert.equal(alias.status, 'active', 'flat aliases alone create a record');
assert.equal(alias.record.certificate_id, 'TX-77', 'tax_exempt_id feeds certificate_id');
assert.equal(alias.record.reason, 'resale', 'exempt_reason feeds reason');
assert.equal(alias.record.source, 'legacy', 'flat-only record reports legacy source');
assert.equal(taxExemption({ tax_exempt_expiration: '2026-06-01' }, { now: NOW }).status, 'expired',
  'older tax_exempt_expiration alias drives expiry');
const precedence = taxExemption(
  { tax_exemption: { certificate_id: 'OBJ-1' }, tax_exempt_id: 'FLAT-9' }, { now: NOW });
assert.equal(precedence.record.certificate_id, 'OBJ-1', 'object field wins over flat alias');
assert.equal(precedence.record.source, 'mixed', 'object + flats report mixed source');
const einFallback = taxExemption({ tax_exempt: true, tax_id_number: 'EIN-9' }, { now: NOW });
assert.equal(einFallback.record.certificate_id, 'EIN-9', 'tax_id_number is a certificate fallback once a record exists');
assert.equal(taxExemption({ tax_exempt: true, tax_exempt_expires: '2026-06-14' },
  { now: new Date(Date.UTC(2026, 5, 15)) }).status, 'expired', 'Date `now` works');

// --- estimateTaxWarning ---
const expiredWarn = estimateTaxWarning({ customer: { tax_exempt_expires: '2026-06-01' }, estimate: {}, now: NOW });
assert.equal(expiredWarn.code, 'exemption_expired', 'expired cert → exemption_expired warning');
assert.ok(expiredWarn.message.includes('expired 2026-06-01') && expiredWarn.message.includes('applying tax'),
  'expired warning names the date and the tax consequence');
assert.equal(estimateTaxWarning({ customer: { tax_exempt_expires: '2026-06-15' }, estimate: {}, now: NOW }).code,
  'exemption_expiring', 'expiry today → soft expiring warning');
assert.equal(estimateTaxWarning({ customer: { tax_exempt_expires: '2026-07-15' }, estimate: {}, now: NOW }).code,
  'exemption_expiring', 'day-30 boundary still warns');
assert.equal(estimateTaxWarning({ customer: { tax_exempt_expires: '2026-07-16' }, estimate: {}, now: NOW }),
  null, 'day-31 is outside the window → no warning');
assert.equal(estimateTaxWarning({ customer: { tax_exempt: true }, estimate: {}, now: NOW }),
  null, 'perpetual cert never warns');
assert.equal(estimateTaxWarning({ customer: {}, estimate: {}, now: NOW }), null, 'no record → no warning');
assert.equal(estimateTaxWarning({ customer: { tax_exemption: { status: 'revoked' } }, estimate: {}, now: NOW }),
  null, 'revoked yields no warning code (taxable path handles it)');
assert.equal(EXEMPTION_EXPIRING_DAYS, 30, 'expiring window is 30 days');

// --- taxableEstimate truth table ---
assert.deepEqual(taxableEstimate({ customer: {}, estimate: {}, now: NOW }),
  { taxable: true, reason: 'no_exemption' }, 'no record → taxable');
assert.deepEqual(taxableEstimate({ customer: { tax_exempt: true }, estimate: {}, now: NOW }),
  { taxable: false, reason: 'exempt_active' }, 'live cert → not taxable');
assert.deepEqual(taxableEstimate({ customer: { tax_exemption: { certificate_id: 'C', expires_on: '2027-01-01' } }, estimate: {}, now: NOW }),
  { taxable: false, reason: 'exempt_active' }, 'future cert → not taxable');
assert.deepEqual(taxableEstimate({ customer: { tax_exempt_expires: '2026-06-01' }, estimate: {}, now: NOW }),
  { taxable: true, reason: 'exemption_expired' }, 'expired → taxed normally');
assert.deepEqual(taxableEstimate({ customer: { tax_exemption: { status: 'revoked' } }, estimate: {}, now: NOW }),
  { taxable: true, reason: 'exemption_revoked' }, 'revoked → taxed normally');

// --- exemptCustomersReport ---
const report = exemptCustomersReport([
  { id: 'c4', company_name: 'Delta Nonprofit', tax_exempt: true },                    // perpetual → last
  { id: 'c1', company_name: 'Alpha Resale', tax_exemption: { certificate_id: 'CERT-A', expires_on: '2027-03-01' } },
  { id: 'c2', company_name: 'Bravo Church', tax_exempt_id: 'CERT-B', tax_exempt_expires: '2026-01-15' }, // expired
  { id: 'c3', company_name: 'Charlie Retail' },                                       // no record → excluded
  { id: 'c5', company_name: 'Echo Gov', tax_exemption: { status: 'revoked', certificate_id: 'CERT-E' } }, // revoked, perpetual
], { now: NOW });
assert.equal(report.length, 4, 'report lists only customers with a record');
assert.deepEqual(report.map((r) => r.customer_id), ['c2', 'c1', 'c4', 'c5'],
  'rows sorted expires_on asc, perpetual/undated last');
assert.equal(report[0].status, 'expired', 'report carries computed status');
assert.deepEqual(Object.keys(report[0]).sort(), ['certificate_id', 'company', 'customer_id', 'expires_on', 'status'],
  'row shape is exactly the report contract');
assert.equal(report[0].certificate_id, 'CERT-B', 'report surfaces the flat-alias certificate id');
assert.equal(report[2].expires_on, null, 'perpetual row emits null expires_on');
assert.deepEqual(exemptCustomersReport(null, { now: NOW }), [], 'non-array input → empty report');

console.log('PASS tax-exempt (60 asserts)');
