import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const temp = mkdtempSync(resolve(tmpdir(), 'ccs-quote-defaults-'));
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
const out = resolve(temp, 'quote-defaults.mjs');
const stub = resolve(temp, 'sdk-stub.mjs');
writeFileSync(stub, 'export const base44 = {}; export const staffEntities = {};');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/quoteDefaults.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@/api/base44Client': stub, '@/components/staff/staffEntities': stub },
});
// Pure helper tests must not initialize the live SDK or issue network requests.
const { QUOTE_DEFAULT_KEYS, DEFAULT_QUOTE_SETTINGS, quoteDefaultsPayload, quoteDefaultsForm, canonicalQuoteDefaults } =
  await import(pathToFileURL(out).href);

// Keys and defaults stay in sync.
for (const key of QUOTE_DEFAULT_KEYS) assert.ok(key in DEFAULT_QUOTE_SETTINGS, `${key} has a default`);

// Payload whitelists known keys only; null/undefined dropped.
{
  const p = quoteDefaultsPayload({ company_name: 'CCS', quote_valid_days: 45, hacker: true, show_logo: undefined, terms: null });
  assert.equal(p.company_name, 'CCS');
  assert.equal(p.quote_valid_days, 45);
  assert.equal(p.hacker, undefined, 'unknown keys excluded');
  assert.equal(p.show_logo, undefined, 'undefined dropped');
  assert.equal(p.terms, undefined, 'null dropped');
}

// Form = defaults + saved payload; round-trip preserves values.
{
  const f = quoteDefaultsForm({ company_name: 'CCS', quote_valid_days: 60 });
  assert.equal(f.company_name, 'CCS');
  assert.equal(f.quote_valid_days, 60);
  assert.equal(f.quote_title, 'Project Estimate', 'unset keys fall back to defaults');
  assert.deepEqual(quoteDefaultsForm(null).company_name, DEFAULT_QUOTE_SETTINGS.company_name);
}

// Canonical = oldest row (first created wins; same idempotency convention as estimates).
{
  const rows = [
    { id: 'b', created_date: '2026-02-01' },
    { id: 'a', created_date: '2026-01-01' },
  ];
  assert.equal(canonicalQuoteDefaults(rows).id, 'a');
  assert.equal(canonicalQuoteDefaults([]), null);
  assert.equal(canonicalQuoteDefaults(null), null);
}

console.log('PASS quote defaults (40+ assertions)');
