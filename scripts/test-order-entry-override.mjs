// D-11 contract test: "Overridden during order entry" provenance — edit
// detection truth table, override stamp shape, history-row parity with
// productAuditModel.makeProductAuditEvent, and reprice clear semantics.
// Run: node scripts/test-order-entry-override.mjs
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// --- Bundle the pure models (esbuild resolves ./productAuditModel.js) -------
buildSync({
  entryPoints: [
    resolve(root, 'src/components/jobs/orderEntryOverrideModel.js'),
    resolve(root, 'src/components/jobs/productAuditModel.js'),
  ],
  bundle: true, format: 'esm', splitting: true,
  outdir: resolve(here, '.tmp-override-out'), logLevel: 'silent',
});
const m = await import(pathToFileURL(resolve(here, '.tmp-override-out/orderEntryOverrideModel.js')).href);
// Bundled sibling module so the parity asserts compare against the REAL
// makeProductAuditEvent output, not a hand-rolled expectation.
const audit = await import(pathToFileURL(resolve(here, '.tmp-override-out/productAuditModel.js')).href);
const {
  PRICE_FIELDS, WO_PRODUCT_PRICE_FIELDS, isPriceField, CONVERSION_MARKER_FIELDS,
  productConverted, detectOrderEntryEdits, overrideStamp, clearOverrideOnReprice,
  overrideHistoryRow, PRICE_OVERRIDE_EVENT_TYPE, OVERRIDE_STAMP_FIELDS,
  OVERRIDE_BADGE_TEXT, hasOrderEntryOverride, overrideBadgeLabel,
  overrideBadgeTooltip, overrideEditSummary, normalizeOverrideEdit, FLOAT_EPSILON,
} = m;

const NOW = '2026-11-02T07:19:35.000Z';
// A converted product (estimate_line_id is the canonical conversion marker
// buildEstimateWorkOrderProducts stamps at seeding).
const converted = {
  id: 'p1', work_order_id: 'wo-9', description: 'Channel Letters',
  estimate_line_id: 'L1', source_estimate_id: 'est-7',
  unit_price: 100, quantity: 3, discount_pct: 0,
};
const unconverted = { id: 'p2', work_order_id: 'wo-9', description: 'Banner', unit_price: 50, quantity: 2 };

// === Field vocabulary ========================================================
assert.deepEqual([...PRICE_FIELDS], ['unit_price', 'price', 'quantity', 'discount_pct']);
assert.ok(PRICE_FIELDS.every(isPriceField), 'every PRICE_FIELDS entry is a price field');
assert.ok(isPriceField(' Unit_Price '), 'isPriceField trims + lowercases');
assert.equal(isPriceField('operational_status'), false, 'ops field is not a price field');
assert.equal(isPriceField(''), false);
assert.equal(FLOAT_EPSILON, 1e-9, 'documented epsilon');
assert.deepEqual(OVERRIDE_STAMP_FIELDS,
  ['overridden', 'overridden_at', 'overridden_by', 'overridden_by_type', 'override_edits']);

// === Conversion markers ======================================================
assert.ok(productConverted(converted), 'estimate_line_id proves conversion');
assert.ok(productConverted({ source_estimate_line_id: 'L9' }), 'source_estimate_line_id alias');
assert.ok(productConverted({ source_estimate_id: 'e1' }), 'source_estimate_id');
assert.ok(productConverted({ converted_at: NOW }), 'converted_at field');
assert.ok(productConverted({}, { converted_at: NOW }), 'opts.converted_at');
assert.equal(productConverted(unconverted), false, 'bare product is not converted');
assert.equal(productConverted(null), false);
assert.ok(CONVERSION_MARKER_FIELDS.includes('estimate_line_id'));

// === detectOrderEntryEdits — truth table =====================================
// converted + real price change → override
{
  const r = detectOrderEntryEdits(converted, { unit_price: 120 });
  assert.equal(r.overridden, true);
  assert.equal(r.converted, true);
  assert.deepEqual(r.edits, [{ field: 'unit_price', from: 100, to: 120 }]);
}
// converted + qty integer change → override
{
  const r = detectOrderEntryEdits(converted, { quantity: 4 });
  assert.equal(r.overridden, true);
  assert.deepEqual(r.edits, [{ field: 'quantity', from: 3, to: 4 }]);
}
// NOT converted + price change → change detected but NOT an override
{
  const r = detectOrderEntryEdits(unconverted, { unit_price: 75 });
  assert.equal(r.overridden, false, 'pre-conversion edits are baseline, not overrides');
  assert.equal(r.converted, false);
  assert.deepEqual(r.edits, [{ field: 'unit_price', from: 50, to: 75 }]);
}
// markerless before + explicit opts.converted_at → override
{
  const r = detectOrderEntryEdits({ unit_price: 50 }, { unit_price: 60 }, { converted_at: NOW });
  assert.equal(r.overridden, true, 'opts.converted_at is the marker authority');
}
// after-side markers do NOT convert — a conversion write is the baseline
{
  const r = detectOrderEntryEdits({ unit_price: 50 }, { unit_price: 60, estimate_line_id: 'L1' });
  assert.equal(r.overridden, false, 'markers on `after` never backdate conversion');
}
// converted + only non-price field → no override
{
  const r = detectOrderEntryEdits(converted, { description: 'Renamed', operational_status: 'in_production' });
  assert.equal(r.overridden, false);
  assert.deepEqual(r.edits, []);
}
// converted + price field present but unchanged → no edit
{
  const r = detectOrderEntryEdits(converted, { unit_price: 100, quantity: 3 });
  assert.deepEqual(r.edits, []);
  assert.equal(r.overridden, false);
}
// float-epsilon: 0.1 + 0.2 vs 0.3 repr noise → no edit; real cent change → edit
{
  const p = { ...converted, unit_price: 0.1 + 0.2 };
  assert.deepEqual(detectOrderEntryEdits(p, { unit_price: 0.3 }).edits, [], 'float repr noise ignored');
  assert.equal(detectOrderEntryEdits(converted, { unit_price: 100.01 }).edits.length, 1, 'cent change detected');
}
// qty integer compare: "3" === 3; 3.9 truncates to 3 → no edit; 3 vs 4 → edit
{
  assert.deepEqual(detectOrderEntryEdits(converted, { quantity: '3' }).edits, [], 'string qty equal');
  assert.deepEqual(detectOrderEntryEdits(converted, { quantity: 3.9 }).edits, [], 'fractional qty truncates equal');
  assert.equal(detectOrderEntryEdits(converted, { quantity: 4 }).edits.length, 1);
}
// patch semantics: absent keys are never compared
{
  const r = detectOrderEntryEdits(converted, { discount_pct: 5 });
  assert.deepEqual(r.edits, [{ field: 'discount_pct', from: 0, to: 5 }], 'only present patch keys diff');
}
// multi-field edits emit in PRICE_FIELDS order regardless of patch order
{
  const r = detectOrderEntryEdits(converted, { discount_pct: 10, unit_price: 90, quantity: 5 });
  assert.deepEqual(r.edits.map((e) => e.field), ['unit_price', 'quantity', 'discount_pct']);
  assert.equal(r.overridden, true);
}
// blank/valued edges: clearing a price is an edit; blank vs absent is not
{
  const r = detectOrderEntryEdits(converted, { unit_price: '' });
  assert.deepEqual(r.edits, [{ field: 'unit_price', from: 100, to: '' }], 'clearing a price overrides');
  const p = { ...converted, price: undefined };
  assert.deepEqual(detectOrderEntryEdits(p, { price: '' }).edits, [], 'absent vs blank both "no value"');
}
// non-object inputs degrade safely
{
  assert.deepEqual(detectOrderEntryEdits(null, null), { overridden: false, converted: false, edits: [] });
  assert.equal(detectOrderEntryEdits(converted, 'junk').overridden, false);
}
// extended allowlist: embedded WO products store money under quoted_* names
{
  const woProduct = {
    id: 'p3', work_order_id: 'wo-9', description: 'Monument Sign',
    estimate_line_id: 'L2', quantity: 2, quoted_unit_price: 100, quoted_total: 200,
  };
  const r = detectOrderEntryEdits(woProduct,
    { quoted_unit_price: 150, quoted_total: 300 }, { fields: WO_PRODUCT_PRICE_FIELDS });
  assert.equal(r.overridden, true, 'quoted_* edits count under the WO field list');
  assert.deepEqual(r.edits.map((e) => e.field), ['quoted_unit_price', 'quoted_total']);
  assert.deepEqual(detectOrderEntryEdits(woProduct, { quoted_unit_price: 150 }).edits, [],
    'default PRICE_FIELDS ignores quoted_* keys');
  // stamp keeps extended fields only when the same list is passed
  assert.equal(overrideStamp({ edits: r.edits, fields: WO_PRODUCT_PRICE_FIELDS }).override_edits.length, 2);
  assert.equal(overrideStamp({ edits: r.edits }).override_edits.length, 0,
    'default stamp filters extended-field edits');
  // history row + tooltip render extended-field edits verbatim
  const row = overrideHistoryRow({ product: woProduct, edits: r.edits, now: NOW });
  assert.equal(row.details.field, 'multiple');
  assert.match(row.label, /quoted_unit_price 100 → 150/);
  assert.equal(overrideEditSummary(r.edits), 'quoted_unit_price 100 → 150; quoted_total 200 → 300');
}

// === overrideStamp ============================================================
{
  const stamp = overrideStamp({
    actor: 'Brett H', actorType: 'staff', now: NOW,
    edits: [{ field: 'unit_price', from: 100, to: 120 }],
  });
  assert.equal(stamp.overridden, true);
  assert.equal(stamp.overridden_at, NOW);
  assert.equal(stamp.overridden_by, 'Brett H');
  assert.equal(stamp.overridden_by_type, 'staff');
  assert.deepEqual(stamp.override_edits, [{ field: 'unit_price', from: 100, to: 120 }]);
  // actorType normalization + default now
  const sys = overrideStamp({ actorType: 'bogus' });
  assert.equal(sys.overridden_by_type, 'staff', 'unknown actor type folds to staff');
  assert.equal(overrideStamp({ actorType: 'system' }).overridden_by_type, 'system');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(sys.overridden_at), 'now defaults to creation time');
  // non-price edit keys are filtered out of the stored trail
  assert.deepEqual(overrideStamp({ edits: [{ field: 'description', from: 'a', to: 'b' }] }).override_edits, []);
}

// === overrideHistoryRow — shape parity vs makeProductAuditEvent ==============
{
  const edits = [{ field: 'unit_price', from: 100, to: 120 }];
  const row = overrideHistoryRow({ product: converted, edits, actor: 'Brett H', actorType: 'staff', now: NOW });
  assert.equal(row.event_type, 'price_override', 'money-trail event type');
  assert.equal(row.event_type, PRICE_OVERRIDE_EVENT_TYPE);
  // exact key parity with the canonical audit row (plus the feed `label`)
  const canonical = audit.makeProductAuditEvent({ event_type: 'override', now: NOW });
  assert.deepEqual(Object.keys(row).sort(), [...Object.keys(canonical), 'label'].sort(),
    'row keys = makeProductAuditEvent keys + label');
  assert.equal(row.schema_version, 1);
  assert.equal(row.work_order_id, 'wo-9');
  assert.equal(row.product_id, 'p1');
  assert.equal(row.product_label, 'Channel Letters');
  assert.equal(row.actor_type, 'staff');
  assert.equal(row.actor_label, 'Brett H');
  assert.equal(row.from_value, '100');
  assert.equal(row.to_value, '120');
  assert.equal(row.occurred_at, NOW);
  assert.equal(row.details.field, 'unit_price');
  assert.equal(row.details.override_type, 'price_override');
  assert.deepEqual(row.details.edits, edits);
  assert.match(row.label, /Overridden during order entry/, 'feed label carries badge text');
  assert.match(row.label, /unit_price 100 → 120/);
  // asEntityEvent keeps the row insertable into ProductActivity today
  const entityRow = overrideHistoryRow({ product: converted, edits, now: NOW, asEntityEvent: true });
  assert.equal(entityRow.event_type, 'override', 'entity-valid variant');
  assert.equal(entityRow.details.override_type, 'price_override', 'type preserved in details');
  // multi-edit row: field 'multiple' + paired from/to lists
  const multi = overrideHistoryRow({
    product: converted, now: NOW,
    edits: [
      { field: 'unit_price', from: 100, to: 120 },
      { field: 'quantity', from: 3, to: 5 },
    ],
  });
  assert.equal(multi.details.field, 'multiple');
  assert.equal(multi.from_value, 'unit_price=100; quantity=3');
  assert.equal(multi.to_value, 'unit_price=120; quantity=5');
  // renders a sensible line through the shared formatter
  assert.match(audit.formatAuditLine(row), /Price override: 100 → 120/, 'formatAuditLine renders the row');
}

// === clearOverrideOnReprice ===================================================
{
  assert.deepEqual(clearOverrideOnReprice({ description: 'x' }), {}, 'unflagged product → empty patch');
  assert.deepEqual(clearOverrideOnReprice(null), {});
  const flagged = { ...converted, ...overrideStamp({ actor: 'Brett', now: NOW, edits: [{ field: 'quantity', from: 3, to: 5 }] }) };
  const patch = clearOverrideOnReprice(flagged);
  assert.deepEqual(patch, {
    overridden: false, overridden_at: '', overridden_by: '', overridden_by_type: '', override_edits: [],
  });
  const merged = { ...flagged, ...patch };
  assert.equal(hasOrderEntryOverride(merged), false, 'merged patch clears the badge');
}

// === badge helpers ============================================================
{
  const flagged = {
    ...converted,
    ...overrideStamp({ actor: 'Brett H', now: NOW, edits: [{ field: 'unit_price', from: 100, to: 120 }] }),
  };
  assert.equal(hasOrderEntryOverride(flagged), true);
  assert.equal(hasOrderEntryOverride(converted), false);
  assert.equal(overrideBadgeLabel(flagged), OVERRIDE_BADGE_TEXT);
  assert.equal(overrideBadgeLabel(converted), '', 'unflagged renders no badge');
  assert.equal(OVERRIDE_BADGE_TEXT, 'Overridden during order entry');
  const tip = overrideBadgeTooltip(flagged);
  assert.match(tip, /unit_price 100 → 120/, 'tooltip carries the edit');
  assert.match(tip, /Brett H/, 'tooltip carries the actor');
  assert.match(tip, /2026-11-02 07:19/, 'tooltip carries the timestamp');
  assert.equal(overrideEditSummary([{ field: 'quantity', from: 3, to: 5 }]), 'quantity 3 → 5');
  assert.equal(normalizeOverrideEdit({ field: 'bogus', from: 1, to: 2 }), null, 'non-price edits rejected');
}

rmSync(resolve(here, '.tmp-override-out'), { recursive: true, force: true });
console.log('PASS order-entry-override');
