import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-profitability.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/profitability.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { computeEstimateProfitability } = await import(pathToFileURL(out).href);

// Revenue = subtotal - discount + contingency (fees/tax intentionally excluded).
{
  const p = computeEstimateProfitability(
    { line_items: [{ total_snapshot: 600, customer_quantity: 1 }] },
    { subtotal: 1000, discount: 100, contingency: 50 });
  assert.equal(p.internalCost, 600);
  assert.equal(p.customerRevenueBeforeFeesTax, 950, 'fees/tax excluded');
  assert.equal(p.grossProfit, 350);
  assert.ok(Math.abs(p.grossMarginPercent - 36.8421) < 0.01, 'margin % of revenue');
  assert.ok(Math.abs(p.markupOnCostPercent - 58.3333) < 0.01, 'markup % of cost');
}

// Loss case.
{
  const p = computeEstimateProfitability(
    { line_items: [{ total_snapshot: 1000 }] },
    { subtotal: 800 });
  assert.equal(p.grossProfit, -200);
  assert.ok(p.grossMarginPercent < 0);
}

// Zero-revenue and zero-cost edge cases avoid NaN.
{
  const p = computeEstimateProfitability({}, {});
  assert.equal(p.grossMarginPercent, 0);
  assert.equal(p.markupOnCostPercent, 0);
  assert.equal(p.grossProfit, 0);
}

// Quantity multiplies internal cost.
{
  const p = computeEstimateProfitability(
    { line_items: [{ total_snapshot: 100, customer_quantity: 3 }] },
    { subtotal: 500 });
  assert.equal(p.internalCost, 300);
}

console.log('PASS estimate profitability (8 cases)');
