import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-labor-levels.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/laborLevels.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  LABOR_RATE_BASIS, DEFAULT_LABOR_RATE_BASIS,
  normalizeLaborLevel, laborCost, pricePartLabor, resolvePartLaborLevels,
} = await import(pathToFileURL(out).href);

// --- normalizeLaborLevel: field mapping + validation -----------------------
{
  const lvl = normalizeLaborLevel({
    id: 'l1', name: '  Journeyman Installer ', hourly_rate: 65,
    rate_basis: 'sqft_per_hour', rate_value: 125,
    applies_to_categories: ['vinyl', ' banner ', ''],
    status: 'active', level_rank: 3, description: 'ignored extras',
  });
  assert.deepEqual(lvl, {
    id: 'l1', name: 'Journeyman Installer', rate_basis: 'sqft_per_hour',
    rate_value: 125, hourly_rate: 65, applies_to: ['vinyl', 'banner'],
    status: 'active',
  });
}
{
  // Defaults: missing basis → units_per_hour @ 1; missing status → active;
  // no applies_to key → property absent.
  const lvl = normalizeLaborLevel({ name: 'Apprentice', hourly_rate: 35 });
  assert.equal(lvl.rate_basis, 'units_per_hour');
  assert.equal(lvl.rate_value, 1);
  assert.equal(lvl.status, 'active');
  assert.equal(lvl.id, '');
  assert.equal('applies_to' in lvl, false);
}
{
  // Unusable rows → null (name + hourly_rate are entity-required).
  assert.equal(normalizeLaborLevel(null), null);
  assert.equal(normalizeLaborLevel('level-id'), null);
  assert.equal(normalizeLaborLevel({ hourly_rate: 40 }), null, 'blank name');
  assert.equal(normalizeLaborLevel({ name: 'X' }), null, 'missing hourly_rate');
  assert.equal(normalizeLaborLevel({ name: 'X', hourly_rate: 'abc' }), null);
}
{
  // Guards: negative rate fields clamp to 0; unknown basis/status coerced.
  const lvl = normalizeLaborLevel({
    id: 'g', name: 'G', hourly_rate: -10, rate_basis: 'PER_SHEET', rate_value: -5,
  });
  assert.equal(lvl.hourly_rate, 0);
  assert.equal(lvl.rate_value, 0);
  assert.equal(lvl.rate_basis, DEFAULT_LABOR_RATE_BASIS);
  assert.equal(normalizeLaborLevel({ name: 'S', hourly_rate: 1, status: 'archived' }).status, 'active');
}
{
  // Idempotent on already-normalized rows; alias inputs accepted.
  const once = normalizeLaborLevel({ id: 'i1', name: 'N', hourly_rate: 50, rate_basis: 'flat_hours', rate_value: 2 });
  assert.deepEqual(normalizeLaborLevel(once), once);
  const alias = normalizeLaborLevel({ _id: 'a1', name: 'A', hourly_rate: 40, basis: 'hours_per_unit', rate: 0.5 });
  assert.equal(alias.id, 'a1');
  assert.equal(alias.rate_basis, 'hours_per_unit');
  assert.equal(alias.rate_value, 0.5);
}

// --- laborCost: per-basis math ---------------------------------------------
{
  // sqft_per_hour: "Easy Weeding 125 SqFt/hr" — 250 sqft / 125 = 2h @ $50 = $100.
  const r = laborCost({ level: { name: 'Easy Weeding', hourly_rate: 50, rate_basis: 'sqft_per_hour', rate_value: 125 }, quantity: 5, area_sqft: 250 });
  assert.equal(r.hours_computed, 2);
  assert.equal(r.cost, 100);
  assert.equal(r.basis_used, 'sqft_per_hour');
}
{
  // units_per_hour: 30 units / 10 per hr = 3h @ $40 = $120 (masterplan qty÷rate×hourly).
  const r = laborCost({ level: { name: 'U', hourly_rate: 40, rate_basis: 'units_per_hour', rate_value: 10 }, quantity: 30 });
  assert.equal(r.hours_computed, 3);
  assert.equal(r.cost, 120);
}
{
  // hours_per_unit: 4 units × 0.5 h/unit = 2h @ $60 = $120.
  const r = laborCost({ level: { name: 'H', hourly_rate: 60, rate_basis: 'hours_per_unit', rate_value: 0.5 }, quantity: 4 });
  assert.equal(r.hours_computed, 2);
  assert.equal(r.cost, 120);
}
{
  // flat_hours: rate_value IS the hours. quantity irrelevant.
  const r = laborCost({ level: { name: 'F', hourly_rate: 50, rate_basis: 'flat_hours', rate_value: 3 }, quantity: 99 });
  assert.equal(r.hours_computed, 3);
  assert.equal(r.cost, 150);
}
{
  // hours override beats basis math.
  const r = laborCost({ level: { name: 'M', hourly_rate: 50, rate_basis: 'flat_hours', rate_value: 9 }, hours: 1.5 });
  assert.equal(r.hours_computed, 1.5);
  assert.equal(r.cost, 75);
  assert.equal(r.basis_used, 'manual_hours');
}

// --- laborCost: zero/negative guards ---------------------------------------
{
  const div = { name: 'D', hourly_rate: 50, rate_basis: 'units_per_hour', rate_value: 0 };
  assert.deepEqual(laborCost({ level: div, quantity: 10 }), { cost: 0, hours_computed: 0, basis_used: 'units_per_hour' }, 'divisor basis rate 0 → 0');
  const sqft = { name: 'S', hourly_rate: 50, rate_basis: 'sqft_per_hour', rate_value: 100 };
  assert.equal(laborCost({ level: sqft }).cost, 0, 'no area → 0');
  assert.equal(laborCost({ level: sqft, area_sqft: -40 }).cost, 0, 'negative area clamps');
  assert.equal(laborCost({ level: { name: 'U', hourly_rate: 50, rate_basis: 'units_per_hour', rate_value: 10 }, quantity: -3 }).cost, 0, 'negative qty clamps');
  assert.equal(laborCost({ level: { name: 'F', hourly_rate: 50, rate_basis: 'flat_hours', rate_value: -2 } }).cost, 0, 'negative flat hours clamp');
  assert.deepEqual(laborCost({ level: null }), { cost: 0, hours_computed: 0, basis_used: 'none' });
  // Fractional hours round sanely; cost rounds to cents.
  const frac = laborCost({ level: { name: 'R', hourly_rate: 33.33, rate_basis: 'units_per_hour', rate_value: 3 }, quantity: 1 });
  assert.equal(frac.hours_computed, 0.333333);
  assert.equal(frac.cost, 11.11);
}

// --- resolvePartLaborLevels: id lookup + inline ----------------------------
{
  const catalog = [
    { id: 'l1', name: 'Weeding', hourly_rate: 50, rate_basis: 'sqft_per_hour', rate_value: 125 },
    { id: 'l2', name: 'Install', hourly_rate: 80, rate_basis: 'hours_per_unit', rate_value: 1 },
  ];
  const rows = resolvePartLaborLevels(
    { labor_level_id: 'l1', labor_levels: ['l2', { name: 'Rush', hourly_rate: 100, rate_basis: 'flat_hours', rate_value: 0.5 }, 'ghost'] },
    catalog,
  );
  assert.equal(rows.length, 3, 'id + array id + inline resolve; ghost dropped');
  assert.deepEqual(rows.map((r) => r.name), ['Weeding', 'Install', 'Rush']);
  assert.equal(rows[0].id, 'l1');
  assert.equal(resolvePartLaborLevels({}, catalog).length, 0);
  assert.equal(resolvePartLaborLevels({ labor_level_id: 'nope' }, catalog).length, 0);
  // {labor_level_id} ref object inside labor_levels resolves by id too.
  const refObj = resolvePartLaborLevels({ labor_levels: [{ labor_level_id: 'l2' }] }, catalog);
  assert.equal(refObj[0].name, 'Install');
}

// --- pricePartLabor: single + multi compose --------------------------------
{
  const catalog = [
    { id: 'l1', name: 'Weeding', hourly_rate: 50, rate_basis: 'sqft_per_hour', rate_value: 125 },
    { id: 'l2', name: 'Install', hourly_rate: 80, rate_basis: 'hours_per_unit', rate_value: 1 },
    { id: 'l3', name: 'Retired', hourly_rate: 10, rate_basis: 'flat_hours', rate_value: 5, status: 'inactive' },
  ];
  // Single level via labor_level_id.
  const single = pricePartLabor({ part: { labor_level_id: 'l2', quantity: 2 }, levels: catalog });
  assert.equal(single.total_cost, 160);
  assert.equal(single.breakdown.length, 1);
  assert.deepEqual(single.breakdown[0], { level_id: 'l2', name: 'Install', cost: 160, hours: 2 });
  assert.deepEqual(single.warnings, []);
}
{
  const catalog = [
    { id: 'l1', name: 'Weeding', hourly_rate: 50, rate_basis: 'sqft_per_hour', rate_value: 125 },
    { id: 'l2', name: 'Install', hourly_rate: 80, rate_basis: 'hours_per_unit', rate_value: 1 },
  ];
  // Multi compose: single id + array id + inline row → costs sum.
  const multi = pricePartLabor({
    part: {
      labor_level_id: 'l1', quantity: 2, area_sqft: 250,
      labor_levels: ['l2', { name: 'Rush Fee', hourly_rate: 100, rate_basis: 'flat_hours', rate_value: 0.5 }],
    },
    levels: catalog,
  });
  assert.equal(multi.breakdown.length, 3);
  assert.equal(multi.breakdown[0].cost, 100, 'weeding 2h @50');
  assert.equal(multi.breakdown[1].cost, 160, 'install 2h @80');
  assert.equal(multi.breakdown[2].cost, 50, 'rush 0.5h @100');
  assert.equal(multi.total_cost, 310);
  // part.quantity fallback used when param omitted; explicit quantity wins.
  const qOverride = pricePartLabor({ part: { labor_level_id: 'l2', quantity: 2 }, levels: catalog, quantity: 3 });
  assert.equal(qOverride.total_cost, 240);
}

// --- pricePartLabor: dangling ids, dupes, inactive, category gating --------
{
  const catalog = [
    { id: 'l1', name: 'Weeding', hourly_rate: 50, rate_basis: 'units_per_hour', rate_value: 10 },
    { id: 'l3', name: 'Retired', hourly_rate: 10, rate_basis: 'flat_hours', rate_value: 5, status: 'inactive' },
    { id: 'l4', name: 'VinylOnly', hourly_rate: 60, rate_basis: 'flat_hours', rate_value: 1, applies_to_categories: ['vinyl'] },
  ];
  const r = pricePartLabor({
    part: {
      labor_level_id: 'l1', quantity: 10,
      labor_levels: ['l1', 'ghost-id', { hourly_rate: 5 }, 'l3', 'l4'],
      category: 'banners',
    },
    levels: catalog,
  });
  assert.equal(r.total_cost, 50, 'only l1 prices: 1h @50');
  assert.equal(r.breakdown.length, 1);
  assert.equal(r.warnings.length, 5);
  assert.ok(r.warnings[0].includes('duplicate'), 'dup id warning');
  assert.ok(r.warnings[1].includes('"ghost-id" not found'), 'dangling id warning');
  assert.ok(r.warnings[2].includes('invalid'), 'inline row missing name');
  assert.ok(r.warnings[3].includes('inactive'), 'inactive skipped');
  assert.ok(r.warnings[4].includes('category'), 'applies_to mismatch skipped');
  // Category match DOES price; no-category part is unrestricted.
  const ok = pricePartLabor({ part: { labor_level_id: 'l4', category: 'Vinyl' }, levels: catalog });
  assert.equal(ok.total_cost, 60);
  const noCat = pricePartLabor({ part: { labor_level_id: 'l4' }, levels: catalog });
  assert.equal(noCat.total_cost, 60);
}
{
  // Empty part / empty catalog → clean zero result, no throw.
  assert.deepEqual(pricePartLabor({ part: {}, levels: [] }), { total_cost: 0, breakdown: [], warnings: [] });
  assert.deepEqual(pricePartLabor({ part: null, levels: null }), { total_cost: 0, breakdown: [], warnings: [] });
  // labor_level_id pointing nowhere → warning only.
  const dangle = pricePartLabor({ part: { labor_level_id: 'gone' }, levels: [{ id: 'x', name: 'X', hourly_rate: 1 }] });
  assert.equal(dangle.total_cost, 0);
  assert.ok(dangle.warnings[0].includes('"gone" not found'));
}

// --- enum sanity ------------------------------------------------------------
assert.deepEqual([...LABOR_RATE_BASIS], ['sqft_per_hour', 'units_per_hour', 'hours_per_unit', 'flat_hours']);

rmSync(out, { force: true });
console.log('PASS labor-levels');
