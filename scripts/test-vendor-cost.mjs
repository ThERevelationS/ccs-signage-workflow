// Unit checks for base44/shared/vendorCostModel.ts (masterplan F-21):
// vendor cost/markup on vended parts — cost precedence chain
// (part.vendor_cost > vendor.default_cost > part.cost), cent-safe markupChain
// math incl. 0.005-round cases, §5 report row shape, stored-alias
// normalization, missing-vendor degradation, vended detection.
// esbuild-bundle pattern — same as test-size-discounts.mjs.
//
// Run: node scripts/test-vendor-cost.mjs  →  prints "PASS vendor-cost"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-vendor-cost-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/vendorCostModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  VENDOR_COST_SOURCES,
  VENDED_PART_WRITE_FIELDS,
  isVendedPart,
  vendedPartFields,
  markupChain,
  vendorNameFor,
  resolveVendorCost,
  vendorCostReportRow,
} = await import(pathToFileURL(out).href);

let n = 0;
const ok = (cond, msg) => { n += 1; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n += 1; assert.equal(a, b, msg); };
const deepEq = (a, b, msg) => { n += 1; assert.deepEqual(a, b, msg); };
const near = (a, b, msg) => { n += 1; assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`); };

// --- vocabulary -------------------------------------------------------------
deepEq([...VENDOR_COST_SOURCES], ['part_vendor_cost', 'vendor_default', 'part_cost', 'none']);
deepEq([...VENDED_PART_WRITE_FIELDS], [
  'is_vended', 'vendor_id', 'vendor_name',
  'vendor_cost', 'vendor_markup_percent', 'vendor_markup_flat',
]);

// --- markupChain: cent-safe money -------------------------------------------
eq(markupChain({ cost: 100, markup_percent: 50 }), 150, 'flat 50% markup');
eq(markupChain({ cost: 100, markup_percent: 50, markup_flat: 10 }), 160, 'pct then flat');
{
  // 33.33 * 1.15 = 38.3295 -> 38.33 half-up (the 0.005-round case).
  const r = markupChain({ cost: 33.33, markup_percent: 15 });
  eq(r, 38.33, '0.005 boundary rounds half-up to cents');
}
eq(markupChain({ cost: 0.105, markup_percent: 10 }), 0.12, 'sub-cent cost rounds to 0.12');
eq(markupChain({ cost: 10, markup_percent: 0, markup_flat: 0 }), 10, 'identity passthrough');
eq(markupChain({ cost: 10, markup_percent: -50 }), 5, 'negative markup = discount sell');
eq(markupChain({ cost: 10, markup_flat: -3 }), 7, 'negative flat reduces retail');
eq(markupChain({ cost: 5, markup_percent: -100, markup_flat: -10 }), 0, 'retail clamps >= 0');
eq(markupChain({ cost: -20, markup_percent: 10 }), 0, 'negative cost clamps to 0');
eq(markupChain({ cost: 'bogus', markup_percent: 'bogus' }), 0, 'NaN guards -> 0');
eq(markupChain({}), 0, 'empty args -> 0');
eq(markupChain(null), 0, 'non-record args -> 0');
{
  const raw = markupChain({ cost: 33.33, markup_percent: 15, rounding: 'none' });
  near(raw, 38.3295, 'rounding none returns raw float');
}
eq(markupChain({ cost: 12.34, markup_percent: 0, rounding: 'dollar' }), 12, 'dollar rounding');
eq(markupChain({ cost: 12.50, markup_percent: 0, rounding: 'dollar' }), 13, 'dollar half-up');
eq(markupChain({ cost: 12.00, markup_percent: 0, rounding: 'dollar_99' }), 12.99, 'dollar_99 lifts whole to .99');
eq(markupChain({ cost: 12.99, markup_percent: 0, rounding: 'dollar_99' }), 12.99, 'dollar_99 keeps .99');
eq(markupChain({ cost: 13.10, markup_percent: 0, rounding: 'dollar_99' }), 13.99, 'dollar_99 next .99 up');
eq(markupChain({ cost: 10, markup_percent: 50, markup_flat: '2.5', rounding: 'CENT' }), 17.5, 'string inputs coerce; rounding case-insensitive');

// --- isVendedPart -------------------------------------------------------------
ok(isVendedPart({ is_vended: true }), 'explicit flag vended');
ok(isVendedPart({ vended: 'yes' }), 'string flag alias vended');
ok(!isVendedPart({ is_vended: false }), 'false flag not vended');
ok(!isVendedPart({ is_vended: 'false' }), "'false' string not vended");
ok(isVendedPart({ vendor_id: 'v1' }), 'vendor_id vended');
ok(isVendedPart({ vendor_name: 'Acme' }), 'vendor_name vended');
ok(isVendedPart({ vendor_cost: 0 }), 'explicit zero vendor_cost still vended');
ok(isVendedPart({ detail_overrides: { vendor_name: 'Acme' } }), 'override-scope vendor_name vended');
ok(isVendedPart({ builder_data: { is_vended: true } }), 'builder_data flag vended');
ok(isVendedPart({ frozen_inventory_snapshot: { vendor_name: 'SubCo' } }), 'snapshot vendor_name = vended service');
ok(!isVendedPart({ frozen_inventory_snapshot: { supplier: '3M' } }), 'plain supplier NOT vended');
ok(!isVendedPart({}), 'empty part not vended');
ok(!isVendedPart(null), 'null not vended');
ok(!isVendedPart('junk'), 'junk not vended');
ok(!isVendedPart({ part_name: 'Banner', frozen_unit_cost: 40 }), 'costed part w/o vendor not vended');

// --- cost precedence chain ----------------------------------------------------
const vendor = { id: 'v1', name: 'Acme Wholesale', default_cost: 8, default_markup_percent: 40 };
{
  // part.vendor_cost override beats vendor.default_cost beats part.cost.
  const r = resolveVendorCost({
    part: { vendor_id: 'v1', vendor_cost: 5, cost: 12 },
    vendors: [vendor],
  });
  eq(r.unit_cost, 5, 'part.vendor_cost wins');
  eq(r.source, 'part_vendor_cost');
  eq(r.computed_retail, 7, '5 * 1.40 = 7');
  eq(r.markup_percent, 40, 'vendor default markup applies');
}
{
  const r = resolveVendorCost({
    part: { vendor_id: 'v1', cost: 12 },
    vendors: [vendor],
  });
  eq(r.unit_cost, 8, 'vendor.default_cost beats part.cost');
  eq(r.source, 'vendor_default');
}
{
  const r = resolveVendorCost({ part: { vendor_id: 'v1', cost: 12 }, vendors: [vendor] });
  eq(r.unit_cost, 8);
  eq(r.source, 'vendor_default');
}
{
  const r = resolveVendorCost({ part: { vendor_id: 'v9', cost: 12 }, vendors: [vendor] });
  eq(r.unit_cost, 12, 'unmatched vendor id -> part.cost');
  eq(r.source, 'part_cost');
}
{
  const r = resolveVendorCost({ part: { vendor_id: 'v9' }, vendors: [] });
  eq(r.unit_cost, 0, 'no cost anywhere -> 0');
  eq(r.source, 'none');
  eq(r.computed_retail, 0);
}
{
  // Snapshot fallback: root has no cost, frozen inventory snapshot does.
  const r = resolveVendorCost({
    part: { vendor_name: 'SubCo', frozen_inventory_snapshot: { cost_per_unit: 4.5, vendor_name: 'SubCo' } },
  });
  eq(r.unit_cost, 4.5, 'frozen snapshot cost feeds part_cost layer');
  eq(r.source, 'part_cost');
  eq(r.vendor_name, 'SubCo');
}
{
  // inventory_pricing bag: free-form *cost* keys resolve as last resort.
  const r = resolveVendorCost({
    part: { vendor_name: 'X', pricing_basis_snapshot: { inventory_pricing: { zz_cost_override: 6.25 } } },
  });
  eq(r.unit_cost, 6.25, 'inventory_pricing *cost* key resolves');
}
{
  // detail_overrides carries the vendor-cost override lane.
  const r = resolveVendorCost({
    part: { vendor_name: 'X', detail_overrides: { vendor_cost: 3.5 }, cost: 9 },
    vendors: [{ id: 'vx', name: 'X', default_cost: 7 }],
  });
  eq(r.unit_cost, 3.5, 'detail_overrides vendor_cost = part_vendor_cost layer');
  eq(r.source, 'part_vendor_cost');
}

// --- markup precedence --------------------------------------------------------
{
  const r = resolveVendorCost({
    part: { vendor_id: 'v1', vendor_cost: 10, vendor_markup_percent: 25, markup_percent: 90 },
    vendors: [vendor],
  });
  eq(r.markup_percent, 25, 'part vendor markup beats vendor default + generic');
  eq(r.computed_retail, 12.5);
}
{
  const r = resolveVendorCost({
    part: { vendor_id: 'v1', vendor_cost: 10, markup_percent: 90 },
    vendors: [vendor],
  });
  eq(r.markup_percent, 40, 'vendor default markup beats part generic');
}
{
  const r = resolveVendorCost({ part: { vendor_name: 'X', vendor_cost: 10, markup_pct: 33 } });
  eq(r.markup_percent, 33, 'part generic markup_pct alias');
  eq(r.computed_retail, 13.3);
}
{
  const r = resolveVendorCost({
    part: { vendor_id: 'v1', vendor_cost: 10 },
    vendors: [{ ...vendor, default_markup_flat: 4 }],
  });
  eq(r.markup_flat, 4, 'vendor default flat markup resolves');
  eq(r.computed_retail, 18, '10 * 1.40 + 4 = 18');
}
{
  const r = resolveVendorCost({ part: { vendor_name: 'X', vendor_cost: 10, vendor_markup_flat: 2 } });
  eq(r.markup_flat, 2, 'part flat markup alias');
  eq(r.computed_retail, 12, 'flat only, no percent');
}
{
  const r = resolveVendorCost({ part: { vendor_name: 'X', vendor_cost: 10, vendor_markup_percent: 10, vendor_markup_flat: 1 } });
  eq(r.computed_retail, 12, '10 * 1.10 + 1 = 12');
}

// --- alias normalization -------------------------------------------------------
{
  const r = resolveVendorCost({ part: { vendorId: 'v1', vendor_unit_cost: 6 }, vendors: [vendor] });
  eq(r.unit_cost, 6, 'camelCase vendorId + vendor_unit_cost');
  eq(r.vendor_id, 'v1');
}
{
  const r = resolveVendorCost({ part: { vendorName: 'Acme Wholesale', vendorCost: 7 } });
  eq(r.vendor_name, 'Acme Wholesale', 'vendorName alias');
  eq(r.unit_cost, 7, 'vendorCost alias');
}
{
  const r = resolveVendorCost({
    part: { vendor_name: 'x', supplier_id: 'v1' },
    vendors: [vendor],
  });
  eq(r.vendor_id, 'v1', 'supplier_id alias resolves vendor id');
  eq(r.vendor_name, 'Acme Wholesale', 'matched vendor record supplies name');
}
{
  // Name matching is case/punctuation-insensitive (vendorAssociation parity).
  const r = resolveVendorCost({
    part: { vendor_name: 'acme-wholesale', vendor_cost: 5 },
    vendors: [vendor],
  });
  eq(r.vendor_id, 'v1', 'normalized name match fills vendor_id');
}
{
  const r = resolveVendorCost({ part: { is_vended: true, unit_cost: 9 } });
  eq(r.unit_cost, 9, 'unit_cost alias in part_cost layer');
  eq(r.source, 'part_cost');
}
{
  const r = resolveVendorCost({ part: { is_vended: true, frozen_unit_cost: 11 } });
  eq(r.unit_cost, 11, 'frozen_unit_cost feeds part_cost');
}
{
  const r = resolveVendorCost({ part: { is_vended: true, calculation_snapshot: { unit_cost: 13 } } });
  eq(r.unit_cost, 13, 'calculation_snapshot.unit_cost resolves');
}
{
  const r = resolveVendorCost({
    part: { is_vended: true, current_inventory_snapshot: { default_rate: 14 } },
  });
  eq(r.unit_cost, 14, 'current snapshot default_rate resolves');
}
{
  const m = new Map([['v1', vendor]]);
  const r = resolveVendorCost({ part: { vendor_id: 'v1', vendor_cost: 4 }, vendors: m });
  eq(r.vendor_name, 'Acme Wholesale', 'Map-form vendors list works');
  eq(r.markup_percent, 40);
}
{
  // Inactive vendor loses the name match to nothing — still resolvable by id.
  const r = resolveVendorCost({
    part: { vendor_id: 'v2', vendor_name: 'Ghost' },
    vendors: [{ id: 'v2', name: 'Ghost', status: 'inactive', default_cost: 2 }],
  });
  eq(r.vendor_id, 'v2', 'id match still binds inactive vendor');
  eq(r.source, 'vendor_default');
}

// --- missing-vendor degradation -----------------------------------------------
{
  const r = resolveVendorCost({ part: { vendor_id: 'gone', vendor_name: 'Old Vendor', vendor_cost: 8 } });
  eq(r.vendor_name, 'Old Vendor', 'part-carried name survives missing record');
  eq(r.vendor_id, 'gone', 'part vendor_id preserved');
  eq(r.unit_cost, 8);
  ok(r.vended, 'still vended without registry record');
}
{
  const r = resolveVendorCost({ part: { vendor_name: 'SubCo', frozen_inventory_snapshot: { vendor_name: 'SubCo', default_rate: 22 } }, vendors: 'junk' });
  eq(r.unit_cost, 22, 'malformed vendors arg tolerated');
  eq(r.vendor_name, 'SubCo');
}
{
  const r = resolveVendorCost({ part: null, vendors: [vendor] });
  eq(r.unit_cost, 0, 'null part -> zero resolution');
  eq(r.source, 'none');
  ok(!r.vended);
}
eq(resolveVendorCost({}).source, 'none', 'empty args -> none, no throw');
eq(vendorNameFor({ vendor_name: 'Solo' }), 'Solo', 'vendorNameFor part fallback');
eq(vendorNameFor({ frozen_inventory_snapshot: { supplier: '3M' } }), '3M', 'supplier display fallback');
eq(vendorNameFor({}), '', 'vendorNameFor empty');

// --- margins -------------------------------------------------------------------
{
  const r = resolveVendorCost({ part: { vendor_cost: 10, vendor_markup_percent: 50 } });
  eq(r.computed_retail, 15);
  eq(r.margin_cents, 500, 'margin_cents integer cents');
  eq(r.margin_pct, 33.33, 'margin on retail (15-10)/15');
}
{
  const r = resolveVendorCost({ part: { vendor_cost: 0, vendor_markup_percent: 10 } });
  eq(r.margin_cents, 0, 'zero cost zero margin');
  eq(r.margin_pct, 0);
}

// --- vendorCostReportRow: §5 shape ---------------------------------------------
{
  const part = { id: 'p1', part_name: 'ACM Panel', vendor_id: 'v1', vendor_cost: 40, vendor_markup_percent: 50 };
  const row = vendorCostReportRow({ part, vendor });
  eq(row.part_id, 'p1');
  eq(row.part_name, 'ACM Panel');
  eq(row.vendor, 'Acme Wholesale');
  eq(row.vendor_id, 'v1');
  eq(row.cost, 40);
  eq(row.markup, 50, 'markup = resolved percent');
  eq(row.retail, 60, '40 * 1.5 = 60');
  eq(row.margin_cents, 2000);
  eq(row.margin_pct, 33.33);
  eq(row.source, 'part_vendor_cost');
  ok(row.vended);
}
{
  // Explicit vendor record beats list lookup; missing id falls to part_key.
  const row = vendorCostReportRow({
    part: { part_key: 'k9', client_label: 'Install svc', vendor_name: 'X', vendor_cost: 5 },
    vendor: { name: 'Explicit Co' },
  });
  eq(row.part_id, 'k9', 'part_key fallback for part_id');
  eq(row.vendor, 'Explicit Co', 'explicit vendor wins');
  eq(row.vendor_id, '', 'no id resolved');
}
{
  const row = vendorCostReportRow({ part: 'junk' });
  eq(row.part_id, '', 'junk part -> empty row, no throw');
  eq(row.cost, 0);
  ok(!row.vended);
}
{
  const row = vendorCostReportRow({
    part: { id: 'p2', vendor_name: 'FlatCo', vendor_cost: 10, vendor_markup_flat: 3 },
  });
  eq(row.markup, 0, 'flat-only markup reports 0 pct');
  eq(row.markup_flat, 3);
  eq(row.retail, 13);
  eq(row.margin_cents, 300);
}

// --- vendedPartFields: normalized write shape -----------------------------------
{
  const f = vendedPartFields({
    is_vended: true, vendorId: 'v1', vendorName: 'Acme',
    vendor_unit_cost: '6.5', vendor_markup: 25, vendor_markup_flat: 1.5,
  });
  deepEq(f, {
    is_vended: true, vendor_id: 'v1', vendor_name: 'Acme',
    vendor_cost: 6.5, vendor_markup_percent: 25, vendor_markup_flat: 1.5,
  }, 'every alias normalizes to canonical write fields');
}
{
  const f = vendedPartFields({ vendor_name: 'SubCo' });
  eq(f.is_vended, true);
  eq(f.vendor_cost, null, 'unset cost stays null — never aliases to 0');
  eq(f.vendor_markup_percent, null);
  eq(f.vendor_markup_flat, null);
}
{
  const f = vendedPartFields({ detail_overrides: { vendor_cost: 4, vendor_markup_percent: 15 } });
  eq(f.vendor_cost, 4, 'override-scope fields normalize');
  eq(f.vendor_markup_percent, 15);
}
{
  const f = vendedPartFields(null);
  deepEq(f, {
    is_vended: false, vendor_id: '', vendor_name: '',
    vendor_cost: null, vendor_markup_percent: null, vendor_markup_flat: null,
  }, 'null part -> empty canonical shape');
}
{
  const f = vendedPartFields({ frozen_inventory_snapshot: { vendor_name: 'Svc Vendor' } });
  eq(f.vendor_name, 'Svc Vendor', 'snapshot vendor_name fills write name');
  ok(f.is_vended);
}

rmSync(out, { force: true });
console.log(`PASS vendor-cost (${n} asserts)`);
