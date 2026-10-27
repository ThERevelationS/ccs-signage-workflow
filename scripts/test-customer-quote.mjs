import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-customer-quote.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/customerQuote.js')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const { buildCustomerQuoteRows, quoteRowsTotal } = await import(pathToFileURL(bundlePath).href);

// Bundled mode: single project-scope row carrying the subtotal.
{
  const rows = buildCustomerQuoteRows({ hide_section_prices: true, project_name: 'Pylon Sign' }, { subtotal: 5500 });
  assert.equal(rows.length, 1, 'bundled single row');
  assert.equal(rows[0].name, 'Project scope');
  assert.equal(rows[0].amount, 5500);
  assert.equal(rows[0].bundled, true);
  assert.equal(quoteRowsTotal(rows), 5500);
}

// Per-section rows; include_in_customer === false rolls into bundled scope row.
{
  const pricing = {
    subtotal: 0,
    sections: [
      { line_id: 'a', client_product_name: 'Channel Letters', adjusted: 1200, quantity: 1 },
      { line_id: 'b', project_name: 'Install', adjusted: 800, quantity: 2 },
      { line_id: 'c', project_name: 'Hidden Fee', adjusted: 300, include_in_customer: false },
    ],
  };
  const rows = buildCustomerQuoteRows({}, pricing);
  assert.equal(rows.length, 3, '2 visible + 1 bundled row');
  assert.equal(rows[2].name, 'Additional project scope');
  assert.equal(rows[2].amount, 300, 'hidden section bundled in');
  assert.equal(quoteRowsTotal(rows), 2300, 'total includes bundled');
  assert.equal(rows[0].category === undefined, false, 'category field present');
}

// No hidden sections -> no bundled row.
{
  const rows = buildCustomerQuoteRows({}, { sections: [{ line_id: 'x', adjusted: 100 }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bundled, false);
}

// Missing sections -> empty rows (not bundled, hide flag off).
{
  assert.equal(buildCustomerQuoteRows({}, {}).length, 0);
}

console.log('PASS customer quote rows (4 cases)');

const psBundle = resolve(here, '.tmp-pipeline-status.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/pipelineStatus.js')],
  bundle: true, format: 'esm', outfile: psBundle, logLevel: 'silent',
});
const { resolvePipelineSalesStatus, resolvePipelineLifecycleDates } = await import(pathToFileURL(psBundle).href);

assert.equal(resolvePipelineSalesStatus('approved'), 'won');
assert.equal(resolvePipelineSalesStatus('cancelled'), 'lost');
assert.equal(resolvePipelineSalesStatus('archived', 'won'), 'won', 'archived preserves won');
assert.equal(resolvePipelineSalesStatus('archived', ''), 'lead');
assert.equal(resolvePipelineSalesStatus('sent'), 'quoted');
assert.equal(resolvePipelineSalesStatus('sent', 'won'), 'won', 'sent preserves terminal outcome');
assert.equal(resolvePipelineSalesStatus('sent', 'on_hold'), 'on_hold');
assert.equal(resolvePipelineSalesStatus('draft', 'qualified'), 'qualified', 'draft preserves existing');
assert.equal(resolvePipelineSalesStatus('draft', ''), 'lead');

// Lifecycle dates: stamps only on real transition into sent.
assert.deepEqual(
  resolvePipelineLifecycleDates({ estimateStatus: 'sent', previousEstimateStatus: 'calculated', today: '2026-10-27' }),
  { date_estimate_sent: '2026-10-27' }, 'transition into sent stamps date');
assert.deepEqual(
  resolvePipelineLifecycleDates({ estimateStatus: 'sent', previousEstimateStatus: 'sent', today: '2026-10-27' }),
  {}, 'already-sent does not restamp');
assert.deepEqual(
  resolvePipelineLifecycleDates({ estimateStatus: 'sent', previousEstimateStatus: 'calculated', existingDateEstimateSent: '2026-10-01', today: '2026-10-27' }),
  {}, 'existing date is never replaced');
assert.deepEqual(
  resolvePipelineLifecycleDates({ estimateStatus: 'draft', previousEstimateStatus: 'draft', today: '2026-10-27' }),
  {}, 'draft never stamps');

console.log('PASS pipeline status + quote rows (18 cases)');
