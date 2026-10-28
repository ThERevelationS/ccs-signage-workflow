import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-markup-engine.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/markup/markupEngine.jsx')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { getMarkup, parseVolumeDiscountBrackets, parseVolumeDiscountCategories, getVolumeDiscountPct, applyMarkups, priceForTargetMargin } = await import(pathToFileURL(out).href);

// getMarkup: configured value, missing-category fallback, missing-tier fallback.
assert.equal(getMarkup({ markups: { mat: 1.5 } }, 'mat'), 1.5);
assert.equal(getMarkup({ markups: { mat: 1.5 } }, 'other'), 1.0, 'unconfigured category -> 1.0');
assert.equal(getMarkup(null, 'mat'), 1.0);
assert.equal(getMarkup({ markups: { mat: 0 } }, 'mat'), 1.0, 'zero markup -> 1.0');

// Volume brackets: parse + sort + highest qualifying.
const settings = [
  { setting_name: 'volume_discount_bracket_1_min', setting_value: '1000' },
  { setting_name: 'volume_discount_bracket_1_pct', setting_value: '5' },
  { setting_name: 'volume_discount_bracket_2_min', setting_value: '5000' },
  { setting_name: 'volume_discount_bracket_2_pct', setting_value: '10' },
  { setting_name: 'volume_discount_applies_to', setting_value: 'materials, labor' },
];
const brackets = parseVolumeDiscountBrackets(settings);
assert.equal(brackets.length, 2);
assert.equal(brackets[0].min, 5000, 'sorted high-first');
assert.equal(getVolumeDiscountPct(600, brackets), 0);
assert.equal(getVolumeDiscountPct(1200, brackets), 5);
assert.equal(getVolumeDiscountPct(6000, brackets), 10);
assert.deepEqual(parseVolumeDiscountCategories(settings), ['materials', 'labor']);
assert.deepEqual(parseVolumeDiscountCategories([]), []);

// applyMarkups: markup then volume discount on eligible categories.
{
  const lines = [
    { label: 'A', cost: 100, category_key: 'materials', module: 'x' },
    { label: 'B', cost: 100, category_key: 'non_eligible', module: 'x' },
  ];
  const tier = { markups: { materials: 2, non_eligible: 1.5 } };
  const res = applyMarkups(lines, tier, { brackets: [{ min: 150, pct: 10 }], eligibleCategoryKeys: ['materials'] });
  const a = res.lines.find((l) => l.label === 'A');
  const b = res.lines.find((l) => l.label === 'B');
  assert.equal(a.markup_multiplier, 2);
  assert.equal(a.marked_up_cost, 200);
  assert.ok(a.volume_discount_applied > 0, 'eligible line got volume discount');
  assert.equal(b.volume_discount_applied, 0, 'ineligible line gets none');
  assert.ok(res.totals.grand_total > 0);
}

// applyMarkups: missing markups map -> all lines at 1.0.
{
  const res = applyMarkups([{ label: 'A', cost: 50, category_key: 'x' }], {}, {});
  assert.equal(res.lines[0].markup_multiplier, 1);
}

// priceForTargetMargin: 50% margin doubles the cost; invalid inputs guarded.
assert.equal(Math.round(priceForTargetMargin(100, 50) * 100) / 100, 200, '50% margin prices at 2x cost');
assert.equal(Math.round(priceForTargetMargin(60, 30) * 100) / 100, 85.71, '30% margin = cost / 0.7');
assert.equal(priceForTargetMargin(0, 50), 0, 'zero cost returns 0');
assert.equal(priceForTargetMargin(100, 100), null, '100% margin rejected');
assert.equal(priceForTargetMargin(100, -5), null, 'negative margin rejected');

console.log('PASS markup engine (20 cases)');
