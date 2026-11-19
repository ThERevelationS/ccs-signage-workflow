import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-parent-sizes.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/parentSizeModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  DEFAULT_TOLERANCE_IN,
  PARENT_SIZE_ERROR_CODES,
  parentSizesFor,
  isOrderableSize,
  minQtyFor,
  validateOrderLine,
  nearestParentSuggestion,
} = await import(pathToFileURL(out).href);

// --- vocabulary -----------------------------------------------------------------
assert.equal(DEFAULT_TOLERANCE_IN, 0.125, 'default tolerance is ±0.125in');
assert.deepEqual([...PARENT_SIZE_ERROR_CODES], ['bad_dims', 'out_of_parent', 'below_min_qty']);

// --- parentSizesFor: normalization ------------------------------------------------
// Canonical object rows.
{
  const rows = parentSizesFor({
    parent_sizes: [
      { width_in: 48, height_in: 96, label: '4x8 sheet', min_qty: 5, price_override: 40 },
      { width_in: '60', height_in: '120' },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].width_in, 48);
  assert.equal(rows[0].min_qty, 5);
  assert.equal(rows[0].price_override, 40);
  assert.equal(rows[1].width_in, 60, 'string dims coerce');
  assert.equal(rows[1].label, '60 x 120', 'missing label generates W x H');
}
// Alias fields: w/h, width/height, name, min_quantity, fixed_price.
{
  const rows = parentSizesFor({
    parent_sizes: [
      { w: 24, h: 36, name: 'small', min_quantity: 3, fixed_price: 12.5 },
      { width: 12, height: 18 },
    ],
  });
  assert.equal(rows[0].width_in, 24, 'w alias');
  assert.equal(rows[0].height_in, 36, 'h alias');
  assert.equal(rows[0].label, 'small', 'name alias');
  assert.equal(rows[0].min_qty, 3, 'min_quantity alias');
  assert.equal(rows[0].price_override, 12.5, 'fixed_price alias');
  assert.equal(rows[1].height_in, 18, 'width/height aliases');
}
// String rows: A-03 schema is items:string — labels parse dims.
{
  const rows = parentSizesFor({
    parent_sizes: ['48x96', '48 x 96 coroplast', '60" x 120"', "4' x 8'", '48 1/2 x 96', '48×96', '24 by 36', 'A'],
  });
  assert.equal(rows.length, 8);
  assert.deepEqual([rows[0].width_in, rows[0].height_in], [48, 96], "'48x96' parses");
  assert.deepEqual([rows[1].width_in, rows[1].height_in], [48, 96], "'48 x 96 coroplast' parses, label kept");
  assert.equal(rows[1].label, '48 x 96 coroplast');
  assert.deepEqual([rows[2].width_in, rows[2].height_in], [60, 120], 'inch marks ignored');
  assert.deepEqual([rows[3].width_in, rows[3].height_in], [48, 96], "foot marks scale x12");
  assert.deepEqual([rows[4].width_in, rows[4].height_in], [48.5, 96], 'mixed fraction parses');
  assert.deepEqual([rows[5].width_in, rows[5].height_in], [48, 96], 'unicode × parses');
  assert.deepEqual([rows[6].width_in, rows[6].height_in], [24, 36], "'by' separator parses");
  assert.deepEqual([rows[7].width_in, rows[7].height_in, rows[7].label], [null, null, 'A'], "unparseable 'A' survives label-only");
}
// Junk drops; non-array / non-record -> [].
assert.deepEqual(parentSizesFor({ parent_sizes: [null, {}, '', '  '] }), [], 'empty/junk rows drop');
assert.deepEqual(parentSizesFor({}), [], 'missing field -> []');
assert.deepEqual(parentSizesFor({ parent_sizes: 'nope' }), [], 'non-array -> []');
assert.deepEqual(parentSizesFor(null), [], 'non-record part -> []');
assert.equal(parentSizesFor({ parentSizes: [{ w: 10, h: 20 }] })[0].width_in, 10, 'camelCase parentSizes alias');

// --- isOrderableSize: unconstrained passthrough -------------------------------------
assert.equal(isOrderableSize({}, { width_in: 10, height_in: 20 }).ok, true, 'empty parent_sizes -> unconstrained');
assert.equal(isOrderableSize({ parent_sizes: [] }, { width_in: 10, height_in: 20 }).ok, true);
assert.equal(
  isOrderableSize({ parent_sizes: ['A', 'B-stock'] }, { width_in: 10, height_in: 20 }).ok,
  true, 'label-only parents cannot constrain (would reject every line)');

// --- isOrderableSize: tolerance + matching ------------------------------------------
const sheet = { parent_sizes: ['48x96', { width_in: 60, height_in: 120, label: 'big' }] };
assert.equal(isOrderableSize(sheet, { width_in: 48, height_in: 96 }).ok, true, 'exact match');
{
  const r = isOrderableSize(sheet, { width_in: 48.06, height_in: 95.94 });
  assert.equal(r.ok, true, 'within ±0.125in matches');
  assert.equal(r.matched_parent.label, '48x96');
  assert.equal(r.matched_orientation, 'straight');
}
assert.equal(isOrderableSize(sheet, { width_in: 48.2, height_in: 96 }).ok, false, 'beyond ±0.125in rejects');
{
  const r = isOrderableSize(sheet, { width_in: 50, height_in: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'out_of_parent');
  assert.match(r.error.message, /50 x 100/);
  assert.equal(r.error.suggestion.width_in, 48, 'rejection carries nearest suggestion');
}
// Closest match wins when tolerance overlaps.
{
  const r = isOrderableSize(
    { parent_sizes: [{ width_in: 48, height_in: 48 }, { width_in: 48.1, height_in: 48 }] },
    { width_in: 48.08, height_in: 48 });
  assert.equal(r.matched_parent.width_in, 48.1, 'closest parent wins');
}

// --- isOrderableSize: orientation ----------------------------------------------------
{
  const r = isOrderableSize(sheet, { width_in: 96, height_in: 48 });
  assert.equal(r.ok, true, 'swapped w/h allowed by default');
  assert.equal(r.matched_orientation, 'swapped');
  assert.equal(r.matched_parent.label, '48x96');
}
assert.equal(
  isOrderableSize({ ...sheet, lock_orientation: true }, { width_in: 96, height_in: 48 }).ok,
  false, 'part.lock_orientation forbids swap');
assert.equal(
  isOrderableSize({ ...sheet, lock_orientation: true }, { width_in: 48, height_in: 96 }).ok,
  true, 'locked part still matches straight');
assert.equal(
  isOrderableSize(
    { parent_sizes: [{ width_in: 48, height_in: 96, lock_orientation: true }] },
    { width_in: 96, height_in: 48 }).ok,
  false, 'parent-row lock forbids its own swap');
// Non-boolean lock_orientation does NOT lock (spec: === true).
assert.equal(
  isOrderableSize({ ...sheet, lock_orientation: 'yes' }, { width_in: 96, height_in: 48 }).ok,
  true, "lock_orientation 'yes' is not === true");

// --- isOrderableSize: cfg tolerance ----------------------------------------------------
assert.equal(
  isOrderableSize({ parent_sizes: ['48x96'], tolerance_in: 0.5 }, { width_in: 48.3, height_in: 96 }).ok,
  true, 'part.tolerance_in widens the window');
assert.equal(
  isOrderableSize({ parent_sizes: [{ width_in: 48, height_in: 96, tolerance_in: 1 }] }, { width_in: 48.7, height_in: 96 }).ok,
  true, 'parent-row tolerance beats part/default');
assert.equal(
  isOrderableSize({ parent_sizes: ['48x96'], tolerance_in: 0 }, { width_in: 48.01, height_in: 96 }).ok,
  false, 'tolerance 0 = exact dims only');

// --- isOrderableSize: bad dims -----------------------------------------------------------
for (const dims of [
  { width_in: 0, height_in: 96 }, { width_in: -5, height_in: 96 },
  { width_in: 'abc', height_in: 96 }, { width_in: 48 },
  { height_in: 96 }, null, 'junk',
]) {
  const r = isOrderableSize(sheet, dims);
  assert.equal(r.ok, false, `bad dims ${JSON.stringify(dims)}`);
  assert.equal(r.error.code, 'bad_dims');
}
// bad_dims is reported even when the part is unconstrained.
assert.equal(isOrderableSize({}, { width_in: 0, height_in: 0 }).error.code, 'bad_dims');

// --- minQtyFor ---------------------------------------------------------------------------
assert.equal(minQtyFor({}), 1, 'default min is 1');
assert.equal(minQtyFor({ min_qty: 5 }), 5);
assert.equal(minQtyFor({ minimum_qty: 4 }), 4, 'minimum_qty alias');
assert.equal(minQtyFor({ min_quantity: 3 }), 3, 'min_quantity alias');
assert.equal(minQtyFor({ min_qty: '6' }), 6, 'string coerces');
assert.equal(minQtyFor({ min_qty: 0 }), 1, 'floor is always >= 1');
assert.equal(minQtyFor({ min_qty: 2 }, { min_qty: 10 }), 10, 'parent raises the floor');
assert.equal(minQtyFor({ min_qty: 10 }, { min_qty: 2 }), 10, 'parent never lowers it');
assert.equal(minQtyFor({}, null), 1, 'null parent -> part min only');

// --- validateOrderLine ---------------------------------------------------------------------
{
  const r = validateOrderLine({ part: sheet, width_in: 48, height_in: 96, quantity: 3 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.matched_parent.label, '48x96');
  assert.equal(r.min_qty, 1);
}
{
  const r = validateOrderLine({ part: sheet, width_in: 50, height_in: 100, quantity: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'out_of_parent', 'out-of-parent size rejected at line-add');
}
{
  const part = { ...sheet, min_qty: 5 };
  const r = validateOrderLine({ part, width_in: 48, height_in: 96, quantity: 2 });
  assert.equal(r.errors[0].code, 'below_min_qty');
  assert.equal(r.errors[0].min_qty, 5);
  assert.equal(r.errors[0].quantity, 2);
}
// Matched parent raises the enforced minimum.
{
  const part = { min_qty: 2, parent_sizes: [{ width_in: 48, height_in: 96, min_qty: 8 }] };
  const r = validateOrderLine({ part, width_in: 48, height_in: 96, quantity: 4 });
  assert.equal(r.errors[0].code, 'below_min_qty', 'parent min_qty enforces through the match');
  assert.equal(r.min_qty, 8);
}
{
  const r = validateOrderLine({ part: sheet, width_in: 'x', height_in: 96, quantity: 1 });
  assert.equal(r.errors[0].code, 'bad_dims');
}
// Non-finite/zero quantity counts as below_min_qty (floor is 1).
assert.equal(validateOrderLine({ part: sheet, width_in: 48, height_in: 96, quantity: 0 }).errors[0].code, 'below_min_qty');
assert.equal(validateOrderLine({ part: sheet, width_in: 48, height_in: 96, quantity: 'x' }).errors[0].code, 'below_min_qty');
// Multiple failures accumulate; quantity defaults to 1.
{
  const r = validateOrderLine({ part: { ...sheet, min_qty: 3 }, width_in: -1, height_in: 0 });
  assert.equal(r.errors.length, 2, 'bad_dims + below_min_qty both reported');
  assert.deepEqual(r.errors.map((e) => e.code), ['bad_dims', 'below_min_qty']);
}
// Unconstrained part: any positive dims pass, min still enforced.
assert.equal(validateOrderLine({ part: {}, width_in: 7, height_in: 9, quantity: 1 }).ok, true);
// Never throws on junk input.
assert.equal(validateOrderLine(null).ok, false);
assert.equal(validateOrderLine('junk').ok, false);
assert.equal(validateOrderLine({ part: 'junk', width_in: 1, height_in: 1, quantity: 1 }).ok, true, 'junk part is unconstrained');

// --- nearestParentSuggestion -----------------------------------------------------------------
{
  const s = nearestParentSuggestion(sheet, { width_in: 50, height_in: 90 });
  assert.equal(s.width_in, 48, 'closest parent dims suggested');
  assert.equal(s.height_in, 96);
  assert.equal(s.matched_orientation, 'straight');
  assert.ok(s.distance_in > 0);
}
{
  const s = nearestParentSuggestion(sheet, { width_in: 95, height_in: 50 });
  assert.equal(s.width_in, 48, 'suggestion considers swapped orientation');
  assert.equal(s.matched_orientation, 'swapped');
}
assert.equal(
  nearestParentSuggestion({ ...sheet, lock_orientation: true }, { width_in: 95, height_in: 50 }).matched_orientation,
  'straight', 'locked part suggests straight only');
assert.equal(nearestParentSuggestion({ parent_sizes: ['A'] }, { width_in: 1, height_in: 1 }), null, 'label-only -> null');
assert.equal(nearestParentSuggestion({}, { width_in: 1, height_in: 1 }), null, 'no parents -> null');
assert.equal(nearestParentSuggestion(sheet, { width_in: 'x', height_in: 1 }), null, 'non-finite request -> null');
// Object rows with label surface in the suggestion payload.
assert.equal(
  nearestParentSuggestion(
    { parent_sizes: [{ width_in: 60, height_in: 120, label: 'big sheet' }] },
    { width_in: 59, height_in: 118 }).label,
  'big sheet');

rmSync(out, { force: true });
console.log('PASS parent-sizes');
