import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-aio-pricing.mjs');
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'src/components/estimator/aioPricing.js', '--bundle', '--format=esm', `--outfile=${bundlePath}`], {
  cwd: resolve(here, '..'), stdio: 'pipe',
});
const { computePricing, money } = await import(pathToFileURL(bundlePath).href);

const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.005, `${label}: expected ${b}, got ${a}`);

// Basic waterfall: 2 sections, adjustments, discount, contingency, fees, tax, deposit.
{
  const p = computePricing({
    line_items: [
      { customer_price_snapshot: 100, customer_quantity: 2 },          // raw 200, adj 0% -> 200
      { customer_price_snapshot: 50, customer_quantity: 4, adjustment_percent: 10 }, // raw 200, +10% -> 220
    ],
    discount_percent: 10,      // 420 * .10 = 42  -> 378
    contingency_percent: 5,    // 378 * .05 = 18.9
    shipping_fee: 20,
    permit_fee: 30,
    tax_percent: 7,            // (378 + 18.9 + 50) * .07 = 31.283
    deposit_percent: 25,
  });
  near(p.rawTotal, 400, 'rawTotal');
  near(p.subtotal, 420, 'subtotal');
  near(p.discount, 42, 'discount');
  near(p.contingency, 18.9, 'contingency');
  near(p.fees, 50, 'fees');
  near(p.tax, 31.283, 'tax');
  near(p.quoteTotal, 478.183, 'quoteTotal');
  near(p.deposit, 119.54575, 'deposit');
  near(p.balance, 358.63725, 'balance');
}

// Legacy line without customer snapshot falls back to total_snapshot.
{
  const p = computePricing({ line_items: [{ total_snapshot: 80, customer_quantity: 3 }] });
  near(p.subtotal, 240, 'snapshot fallback subtotal');
  near(p.quoteTotal, 240, 'snapshot fallback total');
}

// Zero/negative quantity clamps to 0; missing estimate fields default safely.
{
  const p = computePricing({ line_items: [{ customer_price_snapshot: 100, customer_quantity: -5 }] });
  near(p.subtotal, 0, 'negative qty clamped');
  near(p.quoteTotal, 0, 'empty-safe total');
  near(p.balance, 0, 'empty-safe balance');
}

// Empty line_items.
{
  const p = computePricing({ line_items: [], discount_percent: 50 });
  near(p.subtotal, 0, 'empty subtotal');
  near(p.quoteTotal, 0, 'empty total');
  assert.equal(p.sections.length, 0, 'empty sections');
}

// customer_quantity defaults to 1 when absent.
{
  const p = computePricing({ line_items: [{ customer_price_snapshot: 250 }] });
  near(p.subtotal, 250, 'default qty 1');
}

// Discount applies before contingency+tax (order matters).
{
  const p = computePricing({
    line_items: [{ customer_price_snapshot: 1000 }],
    discount_percent: 20,
    contingency_percent: 10,
    tax_percent: 10,
  });
  // 1000 - 200 = 800; +80 = 880; tax 88 -> 968
  near(p.quoteTotal, 968, 'waterfall ordering');
}

assert.equal(money(1234.5), '$1,234.50', 'money formats to 2dp');
assert.equal(money(0), '$0.00', 'money zero');
assert.equal(money(undefined), '$0.00', 'money undefined-safe');

console.log('PASS aio pricing waterfall (7 cases)');
