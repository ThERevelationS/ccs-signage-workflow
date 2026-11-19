import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-size-discounts.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/sizeDiscounts.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  SIZE_DISCOUNT_BASES,
  measureFor,
  resolveSizeDiscount,
  sizeDiscountsFor,
  applyPostTier,
} = await import(pathToFileURL(out).href);

// --- vocabulary ---------------------------------------------------------------
assert.deepEqual([...SIZE_DISCOUNT_BASES], ['sqft', 'width_in', 'height_in', 'area_sqin', 'perimeter_in']);

// --- measureFor: per-basis math -------------------------------------------------
{
  const m = measureFor({}, { width_in: 24, height_in: 24 });
  assert.equal(m.sqft, 4, 'sqft derives w*h/144');
  assert.equal(m.width_in, 24);
  assert.equal(m.height_in, 24);
  assert.equal(m.area_sqin, 576, 'area_sqin = w*h');
  assert.equal(m.perimeter_in, 96, 'perimeter = 2*(w+h)');
}
assert.equal(measureFor({}, { width_in: 10, height_in: 10, sqft: 9 }).sqft, 9, 'supplied sqft wins over derived');
assert.equal(measureFor({}, { width_in: '36', height_in: 12 }).sqft, 3, 'string dims coerce');
// Missing one dimension → derived measures fail closed to 0, direct width kept.
{
  const m = measureFor({}, { width_in: 24 });
  assert.equal(m.width_in, 24);
  assert.equal(m.sqft, 0, 'sqft needs both dims when not supplied');
  assert.equal(m.area_sqin, 0);
  assert.equal(m.perimeter_in, 0);
}
// Fallback chain: dims arg > part root > part.dims.
assert.equal(measureFor({ width_in: 48, height_in: 24 }, {}).sqft, 8, 'part root dims fallback');
assert.equal(measureFor({ dims: { width_in: 20, height_in: 20 } }, {}).area_sqin, 400, 'part.dims fallback');
assert.equal(measureFor({ width_in: 48, height_in: 24 }, { width_in: 12 }).width_in, 12, 'dims arg beats part root');
assert.equal(measureFor({}, { width_in: -5, height_in: 24 }).width_in, 0, 'negative dims clamp to 0');
assert.equal(measureFor(null, null).sqft, 0, 'null inputs -> zero measures');
assert.deepEqual(measureFor({}, { width_in: NaN, height_in: 'x' }).area_sqin, 0, 'non-finite dims -> 0');

// --- sizeDiscountsFor: normalization ---------------------------------------------
{
  const rows = sizeDiscountsFor({
    size_discounts: [
      { threshold_basis: 'sqft', threshold_value: '4', discount_pct: '10', label: 'mid' },
      { threshold: 8, discount_pct: 20, basis: 'square_feet', name: 'big' },
      { threshold_sqft: 2, discount_percent: '15%', measure: 'sqft' },
    ],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].threshold_value, 2, 'sorted threshold ASC');
  assert.equal(rows[1].threshold_value, 4);
  assert.equal(rows[2].threshold_value, 8);
  assert.equal(rows[0].discount_pct, 15, "'15%' string coerces");
  assert.equal(rows[1].label, 'mid');
  assert.equal(rows[2].label, 'big', 'label alias name');
  assert.equal(rows[2].threshold_basis, 'sqft', 'basis alias square_feet');
}
// Equal thresholds sort pct DESC (highest pct first = tie-break winner).
{
  const rows = sizeDiscountsFor({
    size_discounts: [
      { threshold_basis: 'width_in', threshold_value: 24, discount_pct: 5 },
      { threshold_basis: 'width_in', threshold_value: 24, discount_pct: 12 },
    ],
  });
  assert.deepEqual(rows.map((r) => r.discount_pct), [12, 5]);
}
// Unusable rows drop: non-record, unknown basis, non-finite threshold/pct.
{
  const rows = sizeDiscountsFor({
    size_discounts: [
      'junk',
      { threshold_basis: 'bogus', threshold_value: 1, discount_pct: 5 },
      { threshold_basis: 'sqft', threshold_value: 'abc', discount_pct: 5 },
      { threshold_basis: 'sqft', threshold_value: 1, discount_pct: 'xyz' },
      { threshold_basis: 'perimeter', threshold_value: 10, discount_pct: 7 },
    ],
  });
  assert.equal(rows.length, 1, 'only the valid row survives');
  assert.equal(rows[0].threshold_basis, 'perimeter_in', 'basis alias perimeter');
}
// Clamps: pct >100 -> 100, negative pct -> 0, negative threshold -> 0.
{
  const rows = sizeDiscountsFor({
    size_discounts: [
      { threshold_basis: 'sqft', threshold_value: -3, discount_pct: 150 },
      { threshold_basis: 'sqft', threshold_value: 5, discount_pct: -8 },
    ],
  });
  assert.equal(rows[0].threshold_value, 0);
  assert.equal(rows[0].discount_pct, 100);
  assert.equal(rows[1].discount_pct, 0);
}
assert.deepEqual(sizeDiscountsFor({}), [], 'no rows -> []');
assert.deepEqual(sizeDiscountsFor(null), [], 'non-record part -> []');
assert.deepEqual(sizeDiscountsFor({ size_discounts: 'nope' }), [], 'non-array field -> []');

// --- applyPostTier: cent-safe money -----------------------------------------------
assert.deepEqual(applyPostTier(100, 10), { discount_amount: 10, final_price: 90 });
{
  const r = applyPostTier(33.33, 15);
  assert.equal(r.discount_amount, 5, 'round half-up: 4.9995 -> 5.00');
  assert.equal(r.final_price, 28.33);
  assert.equal(r.discount_amount + r.final_price, 33.33, 'split never drifts a cent');
}
assert.deepEqual(applyPostTier(10, 100), { discount_amount: 10, final_price: 0 });
assert.deepEqual(applyPostTier('bogus', 'bogus'), { discount_amount: 0, final_price: 0 }, 'NaN guards -> zeros');
assert.equal(applyPostTier(50, 999).final_price, 0, 'pct clamps to 100 — never negative');
assert.equal(applyPostTier(-20, 10).final_price, 0, 'negative base clamps to 0');

// --- resolveSizeDiscount: threshold selection + application -------------------------
const part = {
  size_discounts: [
    { threshold_basis: 'sqft', threshold_value: 2, discount_pct: 5, label: 'small' },
    { threshold_basis: 'sqft', threshold_value: 4, discount_pct: 10, label: 'medium' },
    { threshold_basis: 'sqft', threshold_value: 8, discount_pct: 20, label: 'large' },
  ],
};
{
  // 4 sqft qualifies rows @2 and @4 — largest qualifying threshold wins.
  const r = resolveSizeDiscount({ part, dims: { width_in: 24, height_in: 24 }, base_price: 200 });
  assert.equal(r.discount_pct, 10, 'largest qualifying threshold wins');
  assert.equal(r.applied_threshold.label, 'medium');
  assert.equal(r.discount_amount, 20);
  assert.equal(r.final_price, 180);
  assert.equal(r.measure.sqft, 4);
}
// Boundary is inclusive: exactly 8 sqft hits the top row.
assert.equal(
  resolveSizeDiscount({ part, dims: { sqft: 8 }, base_price: 100 }).applied_threshold.label,
  'large', 'threshold boundary inclusive');
// Just under 4 sqft -> only the @2 row qualifies.
assert.equal(
  resolveSizeDiscount({ part, dims: { width_in: 23, height_in: 24 }, base_price: 100 }).discount_pct,
  5, 'sub-threshold measure picks the lower row');
// Tied thresholds -> highest pct wins.
assert.equal(
  resolveSizeDiscount({
    part: { size_discounts: [
      { threshold_basis: 'sqft', threshold_value: 4, discount_pct: 6 },
      { threshold_basis: 'sqft', threshold_value: 4, discount_pct: 14 },
    ] },
    dims: { width_in: 24, height_in: 24 }, base_price: 100,
  }).discount_pct, 14, 'equal threshold -> highest pct');
// No qualifying row -> clean passthrough.
{
  const r = resolveSizeDiscount({ part, dims: { width_in: 5, height_in: 5 }, base_price: 123.45 });
  assert.equal(r.discount_pct, 0);
  assert.equal(r.discount_amount, 0);
  assert.equal(r.final_price, 123.45);
  assert.equal(r.applied_threshold, null, 'no-match passthrough keeps base');
}
// Other bases select independently.
assert.equal(
  resolveSizeDiscount({
    part: { size_discounts: [
      { threshold_basis: 'width_in', threshold_value: 36, discount_pct: 8 },
      { threshold_basis: 'perimeter_in', threshold_value: 100, discount_pct: 12 },
    ] },
    dims: { width_in: 40, height_in: 10 }, base_price: 50,
  }).discount_pct, 12, 'perimeter 100 <= 2*(40+10) beats width break');
// Aliased stored rows resolve identically.
assert.equal(
  resolveSizeDiscount({
    part: { size_discounts: [{ threshold: '6', pct: '25', basis: 'SQFT' }] },
    dims: { width_in: 30, height_in: 30 }, base_price: 80,
  }).final_price, 60, 'aliases + case-insensitive basis still price');
// Part-carried dims feed resolution when dims arg is empty.
assert.equal(
  resolveSizeDiscount({
    part: { ...part, width_in: 48, height_in: 24 },
    dims: {}, base_price: 100,
  }).discount_pct, 20, 'part root dims satisfy thresholds');
// Guards: non-record args never throw and never discount.
{
  const r = resolveSizeDiscount({ part: 'junk', dims: 'junk', base_price: 50 });
  assert.equal(r.final_price, 50);
  assert.equal(r.applied_threshold, null);
}
assert.equal(resolveSizeDiscount({}).final_price, 0, 'empty args -> 0, no throw');
assert.equal(resolveSizeDiscount({ part, dims: null, base_price: 'x' }).final_price, 0, 'non-finite base -> 0');

rmSync(out, { force: true });
console.log('PASS size-discounts');
