import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-sales-activity.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/estimateSalesActivity.mjs')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { hasVerifiedEstimateSalesActivity } = await import(pathToFileURL(out).href);

assert.equal(hasVerifiedEstimateSalesActivity(null), true, 'record creation counts');
assert.equal(hasVerifiedEstimateSalesActivity({ sales_status: 'lead' }, {}, { quoteDateVerificationRequested: true }), true, 'quote verification counts');
assert.equal(
  hasVerifiedEstimateSalesActivity({ sales_status: 'lead' }, { sales_status: 'quoted' }),
  true, 'sales field change counts');
assert.equal(
  hasVerifiedEstimateSalesActivity({ sales_status: 'lead' }, { sales_status: 'lead' }),
  false, 'same-value write is not activity');
assert.equal(
  hasVerifiedEstimateSalesActivity({ name: 'A' }, { name: 'B' }),
  false, 'non-sales field is not activity');
assert.equal(
  hasVerifiedEstimateSalesActivity({ sales_rep: 'Bob', client_name: 'X' }, { client_name: 'Y' }),
  false, 'generic contact refresh excluded');
assert.equal(
  hasVerifiedEstimateSalesActivity({ products: [1] }, { products: [1, 2] }, { includeProducts: true }),
  true, 'products count when opted in');
assert.equal(
  hasVerifiedEstimateSalesActivity({ products: [1] }, { products: [1, 2] }),
  false, 'products ignored by default');
assert.equal(
  hasVerifiedEstimateSalesActivity({ estimate_amount: 100 }, { estimate_amount: 100.0 }),
  false, 'numeric-equal is not activity');
assert.equal(
  hasVerifiedEstimateSalesActivity({ estimator: null }, { estimator: 'Kim' }),
  true, 'estimator assignment counts');

console.log('PASS sales activity detection (10 cases)');
