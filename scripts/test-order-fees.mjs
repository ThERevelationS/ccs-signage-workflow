import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// F-16/F-17 hardening suite — order fees engine + GL account resolution.
// Covers: normalizeFeeLines coercion, validateFeeLines error codes,
// feeTotals buckets, applyFeesToTotals tax math (taxable vs non-taxable
// fees, taxable vs non-taxable discounts, pro-rata cap, taxableSubtotal),
// resolveLineAccounts precedence chain, resolveFeeAccount, and
// splitInvoiceByAccount sum-exact rounding (largest-remainder).

const here = dirname(fileURLToPath(import.meta.url));
const outFees = resolve(here, '.tmp-order-fees.mjs');
const outAcct = resolve(here, '.tmp-line-accounts.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/orderFees.ts')],
  bundle: true, format: 'esm', outfile: outFees, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/lineAccountResolution.ts')],
  bundle: true, format: 'esm', outfile: outAcct, logLevel: 'silent',
});
const {
  normalizeFeeLines, validateFeeLines, feeTotals, applyFeesToTotals, FEE_KINDS,
} = await import(pathToFileURL(outFees).href);
const {
  resolveLineAccounts, resolveFeeAccount, splitInvoiceByAccount,
} = await import(pathToFileURL(outAcct).href);

// --- normalizeFeeLines -------------------------------------------------------
assert.deepEqual(FEE_KINDS, ['shipping', 'postage', 'discount', 'fee']);
assert.deepEqual(normalizeFeeLines(undefined), []);
assert.deepEqual(normalizeFeeLines('junk'), [], 'non-array input → empty list');
{
  const [l] = normalizeFeeLines([{ label: '  Freight ', kind: 'SHIPPING', amount: '12.5', taxable: 'true', income_account_code: ' 4100 ' }]);
  assert.deepEqual(l, { label: 'Freight', kind: 'shipping', amount: 12.5, taxable: true, income_account_code: '4100' },
    'coerces string amount/bool, trims strings, lowercases kind');
}
{
  const [d] = normalizeFeeLines([{ kind: 'discount', amount: 25 }]);
  assert.equal(d.amount, -25, 'positive discount coerced to canonical negative');
  assert.equal(d.taxable, true, 'missing taxable on a discount defaults true (flat-discount parity)');
}
{
  const [s] = normalizeFeeLines([{ kind: 'shipping', amount: 10 }]);
  assert.equal(s.taxable, false, 'missing taxable on non-discount defaults false');
}
{
  const [d2] = normalizeFeeLines([{ kind: 'discount', amount: -25, taxable: false }]);
  assert.equal(d2.taxable, false, 'explicit taxable flag respected on discount');
}
{
  const [bad] = normalizeFeeLines([{ kind: 'bogus', amount: 5 }]);
  assert.equal(bad.kind, 'fee', 'unknown kind repairs to fee in normalize (validate flags raw input)');
}
{
  const [neg] = normalizeFeeLines([{ kind: 'shipping', amount: -5 }]);
  assert.equal(neg.amount, -5, 'negative non-discount preserved for validate to flag');
}
{
  const [nonObj] = normalizeFeeLines([42]);
  assert.deepEqual(nonObj, { label: '', kind: 'fee', amount: 0, taxable: false, income_account_code: '' });
}

// --- validateFeeLines --------------------------------------------------------
assert.equal(validateFeeLines(undefined).valid, true, 'absent fee_lines is valid');
{
  const r = validateFeeLines('not-array');
  assert.equal(r.valid, false);
  assert.equal(r.errors[0].code, 'not_array');
}
{
  const r = validateFeeLines([{ kind: 'bogus', amount: 5 }]);
  assert.equal(r.valid, false);
  assert.equal(r.errors[0].code, 'unknown_kind');
}
{
  const r = validateFeeLines([{ kind: 'shipping', amount: -5 }]);
  assert.equal(r.valid, false);
  assert.equal(r.errors[0].code, 'negative_amount', 'negative non-discount amount errors');
}
{
  const r = validateFeeLines([{ kind: 'fee', amount: 'abc' }]);
  assert.equal(r.valid, false);
  assert.equal(r.errors[0].code, 'invalid_amount');
}
{
  const r = validateFeeLines([{ kind: 'discount', amount: -120 }], { subtotal: 100 });
  assert.equal(r.valid, false);
  assert.equal(r.errors[0].code, 'discount_exceeds_subtotal');
}
{
  const r = validateFeeLines([{ kind: 'discount', amount: -60 }, { kind: 'discount', amount: -50 }], { subtotal: 100 });
  assert.equal(r.valid, false, 'discount check applies to the SUM of discounts');
}
{
  const r = validateFeeLines([{ kind: 'discount', amount: -100 }], { subtotal: 100 });
  assert.equal(r.valid, true, 'discount == subtotal is allowed');
}
{
  const r = validateFeeLines([{ kind: 'discount', amount: -500 }]); // no subtotal → no check
  assert.equal(r.valid, true, 'discount check skipped without subtotal');
}
{
  const r = validateFeeLines([{ label: 'x', kind: 'shipping', amount: 10, taxable: true, income_account_code: '4100' }], { subtotal: 50 });
  assert.equal(r.valid, true);
  assert.equal(r.errors.length, 0);
}
{
  const r = validateFeeLines([null]);
  assert.equal(r.valid, false);
  assert.equal(r.errors[0].code, 'not_object');
}

// --- feeTotals ----------------------------------------------------------------
{
  const t = feeTotals([
    { kind: 'shipping', amount: 10, taxable: true },
    { kind: 'postage', amount: 5, taxable: false },
    { kind: 'fee', amount: 20, taxable: true },
    { kind: 'fee', amount: 3, taxable: false },
    { kind: 'discount', amount: -30, taxable: true },
  ]);
  assert.equal(t.shipping, 10);
  assert.equal(t.postage, 5);
  assert.equal(t.fees, 23);
  assert.equal(t.discount, 30, 'discount reported as positive magnitude');
  assert.equal(t.taxableFees, 30, 'taxableFees = non-discount taxable lines only');
  assert.equal(t.nontaxableFees, 8);
}
assert.deepEqual(feeTotals(null), { shipping: 0, postage: 0, discount: 0, fees: 0, taxableFees: 0, nontaxableFees: 0 });

// --- applyFeesToTotals ---------------------------------------------------------
{
  const r = applyFeesToTotals({ subtotal: 100, feeLines: [], taxRatePct: 10 });
  assert.equal(r.newSubtotal, 100);
  assert.equal(r.taxableBase, 100, 'subtotal is fully taxable by default');
  assert.equal(r.tax, 10);
  assert.equal(r.total, 110);
}
{
  const r = applyFeesToTotals({
    subtotal: 100, taxRatePct: 10,
    feeLines: [
      { kind: 'shipping', amount: 10, taxable: true },
      { kind: 'postage', amount: 5, taxable: false },
      { kind: 'fee', amount: 20, taxable: true },
      { kind: 'discount', amount: -30, taxable: true },
    ],
  });
  assert.equal(r.shipping, 10);
  assert.equal(r.postage, 5);
  assert.equal(r.fees, 20);
  assert.equal(r.discount, 30);
  assert.equal(r.newSubtotal, 105);
  assert.equal(r.taxableBase, 100, 'taxable discount reduces base dollar-for-dollar (130 − 30)');
  assert.equal(r.tax, 10);
  assert.equal(r.total, 115);
}
{
  const r = applyFeesToTotals({
    subtotal: 100, taxRatePct: 10,
    feeLines: [
      { kind: 'shipping', amount: 10, taxable: true },
      { kind: 'fee', amount: 20, taxable: true },
      { kind: 'discount', amount: -30, taxable: false },
    ],
  });
  assert.equal(r.taxableBase, 130, 'non-taxable discount does NOT reduce the taxable base');
  assert.equal(r.tax, 13);
  assert.equal(r.newSubtotal, 100);
  assert.equal(r.total, 113);
}
{
  // Pro-rata cap: taxable discount exceeds the taxable components → base clamps at 0.
  const r = applyFeesToTotals({
    subtotal: 100, taxableSubtotal: 40, taxRatePct: 10,
    feeLines: [{ kind: 'discount', amount: -80, taxable: true }],
  });
  assert.equal(r.taxableBase, 0, 'base clamps at 0 — excess discount still lowers total, not tax');
  assert.equal(r.tax, 0);
  assert.equal(r.newSubtotal, 20);
  assert.equal(r.total, 20);
}
{
  const r = applyFeesToTotals({
    subtotal: 100, taxableSubtotal: 60, taxRatePct: 10,
    feeLines: [{ kind: 'shipping', amount: 10, taxable: true }],
  });
  assert.equal(r.taxableBase, 70, 'taxableSubtotal option carries mixed-merch taxability');
  assert.equal(r.tax, 7);
}
{
  const r = applyFeesToTotals({ subtotal: 33.33, taxRatePct: 6.5, feeLines: [{ kind: 'fee', amount: 0.01, taxable: true }] });
  assert.equal(r.taxableBase, 33.34);
  assert.equal(r.tax, 2.17, 'cent-rounded tax (33.34 × 0.065 = 2.1671 → 2.17)');
  assert.equal(r.total, 35.51);
}
{
  const r = applyFeesToTotals({ subtotal: 0, taxRatePct: 8, feeLines: [{ kind: 'fee', amount: 50, taxable: true }] });
  assert.equal(r.newSubtotal, 50);
  assert.equal(r.taxableBase, 50, 'fees alone can form the taxable base');
  assert.equal(r.tax, 4);
}
{
  const r = applyFeesToTotals({ subtotal: 100, taxRatePct: -2 });
  assert.equal(r.tax, 0, 'negative rate clamps to 0');
}

// --- resolveLineAccounts -------------------------------------------------------
{
  const r = resolveLineAccounts({
    part: { income_account_code: '4100', cogs_account_code: '5100' },
    partTemplate: { income_account_code: '4200', cogs_account_code: '5200' },
    product: { income_account_code: '4300', cogs_account_code: '5300' },
    fallbackIncome: '4000', fallbackCogs: '5000',
  });
  assert.equal(r.income_account_code, '4100');
  assert.equal(r.cogs_account_code, '5100');
  assert.equal(r.source, 'part');
}
{
  const r = resolveLineAccounts({
    part: { income_account_code: '4100' }, // part supplies income only
    partTemplate: { income_account_code: '4200', cogs_account_code: '5200' },
    fallbackIncome: '4000', fallbackCogs: '5000',
  });
  assert.equal(r.income_account_code, '4100');
  assert.equal(r.cogs_account_code, '5200', 'COGS falls through to the template tier independently');
  assert.equal(r.income_source, 'part');
  assert.equal(r.cogs_source, 'template');
  assert.equal(r.source, 'part');
}
{
  const r = resolveLineAccounts({
    part: {},
    partTemplate: { income_account: '4400', cogs_account: '5400' }, // legacy spellings
  });
  assert.equal(r.income_account_code, '4400', 'legacy PartTemplate keys resolve');
  assert.equal(r.cogs_account_code, '5400');
  assert.equal(r.source, 'template');
}
{
  const r = resolveLineAccounts({
    partTemplate: { income_account_code: '4200', income_account: '4400' },
  });
  assert.equal(r.income_account_code, '4200', 'canonical *_code key beats the legacy spelling in-tier');
}
{
  const r = resolveLineAccounts({
    part: { income_account_code: '   ' }, // blank never satisfies a tier
    partTemplate: {},
    product: { income_account_code: '4300', cogs_account_code: '5300' },
  });
  assert.equal(r.income_account_code, '4300');
  assert.equal(r.source, 'product');
}
{
  const r = resolveLineAccounts({ fallbackIncome: '4000', fallbackCogs: '5000' });
  assert.equal(r.income_account_code, '4000');
  assert.equal(r.cogs_account_code, '5000');
  assert.equal(r.source, 'fallback');
  assert.equal(r.cogs_source, 'fallback');
}
{
  const r = resolveLineAccounts({});
  assert.equal(r.income_account_code, '');
  assert.equal(r.source, 'fallback', 'unresolved still reports fallback tier');
}

// --- resolveFeeAccount -----------------------------------------------------------
assert.equal(resolveFeeAccount({ income_account_code: '4600' }, '4000'), '4600');
assert.equal(resolveFeeAccount({ income_account_code: ' ' }, '4000'), '4000', 'blank fee account → fallback');
assert.equal(resolveFeeAccount(null), '', 'no row, no fallback → empty');

// --- splitInvoiceByAccount --------------------------------------------------------
{
  const s = splitInvoiceByAccount([
    { line_total: 60, income_account_code: '4100' },
    { line_total: 40, income_account_code: '4100' },
    { line_total: 25, income_account_code: '4200' },
  ]);
  assert.deepEqual(s, [
    { income_account_code: '4100', amount: 100 },
    { income_account_code: '4200', amount: 25 },
  ], 'same-account lines group; first-seen order preserved');
}
{
  // Largest-remainder: 33.335 + 33.335 + 33.33 = 100.00 exact.
  const s = splitInvoiceByAccount([
    { line_total: 33.335, income_account_code: 'A' },
    { line_total: 33.335, income_account_code: 'B' },
    { line_total: 33.33, income_account_code: 'C' },
  ]);
  const sum = s.reduce((t, x) => t + x.amount, 0);
  assert.equal(Math.round(sum * 100), 10000, 'splits foot exactly to the cent-rounded total');
  assert.equal(s[0].amount, 33.34, 'leftover penny goes to the largest remainder (earliest on tie)');
  assert.equal(s[1].amount, 33.33);
  assert.equal(s[2].amount, 33.33);
}
{
  const s = splitInvoiceByAccount(
    [{ line_total: 100, income_account_code: '4000' }],
    [{ kind: 'discount', amount: -10, taxable: true, income_account_code: '4900' },
     { kind: 'shipping', amount: 15, taxable: true, income_account_code: '4500' }],
  );
  const sum = s.reduce((t, x) => t + x.amount, 0);
  assert.equal(sum, 105, 'fee lines join splits; discount posts negative');
  assert.deepEqual(s.find((x) => x.income_account_code === '4900'), { income_account_code: '4900', amount: -10 });
}
{
  // Positive discount amount still posts negative (canonical sign coercion).
  const s = splitInvoiceByAccount([], [{ kind: 'discount', amount: 12, income_account_code: '4900' }]);
  assert.deepEqual(s, [{ income_account_code: '4900', amount: -12 }]);
}
{
  const s = splitInvoiceByAccount([
    { quantity: 3, unit_price: 10, income_account_code: '4100' }, // qty×unit fallback
    { description: 'no amount, no account' },
  ], undefined, { fallbackIncome: '4000' });
  assert.deepEqual(s, [{ income_account_code: '4100', amount: 30 }], 'qty×unit used; account-less zero row ignored');
}
{
  const s = splitInvoiceByAccount([{ line_total: 50 }], undefined, { fallbackIncome: '4000' });
  assert.deepEqual(s, [{ income_account_code: '4000', amount: 50 }], 'fallbackIncome buckets unmapped rows');
}
{
  const s = splitInvoiceByAccount([{ amount: 0, income_account_code: '4100' }]);
  assert.deepEqual(s, [], 'zero-amount splits drop (nothing posts to GL)');
}
{
  const s = splitInvoiceByAccount('garbage', 'garbage');
  assert.deepEqual(s, [], 'garbage inputs → empty splits, never throws');
}

rmSync(outFees, { force: true });
rmSync(outAcct, { force: true });
console.log('PASS order-fees');
