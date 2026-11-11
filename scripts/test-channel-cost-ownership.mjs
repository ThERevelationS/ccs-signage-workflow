// P-13 — channel-letter exact-once cost ownership / material / quantity fixture.
// Pure shared-wire asserts (no browser, no SDK, no network):
//   - every channelCostLines key is unique (no double-counted row)
//   - each source row emits exactly one owning line set (split replaces, not adds)
//   - labor ownership is exclusive (item labor XOR personnel, never both)
//   - dimensional fab_config splits conserve the purchase total exactly
//   - sell-side rollup preserves line count and verbatim cost on passthrough
//   - quantity is applied once (qty x marked-up unit, never qty x qty)
// Run: node scripts/test-channel-cost-ownership.mjs

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (entry, name) => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, entry)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return out;
};
const W = await import(pathToFileURL(bundle('../base44/shared/channelPricingWire.ts', 'channel-wire')).href);
const P = await import(pathToFileURL(bundle('../base44/shared/pricingEngine.ts', 'pe')).href);
const T = await import(pathToFileURL(bundle('../base44/shared/pricingTemplateModel.ts', 'ptm')).href);

const ENGINE = { pricePart: P.pricePart, resolveTemplatePrice: T.resolveTemplatePrice, templatePartDescriptor: T.templatePartDescriptor };

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };
const near = (a, b, m) => { n += 1; assert.ok(Math.abs(a - b) < 0.005, `${m}: expected ${b}, got ${a}`); };

const FIXTURE = {
  letter_purchases: [
    { id: 'p1', letter_type: 'channel_flush_mounted', description: 'Channel set', qty: 5, unit_cost: 100, total_cost: 500 },
    {
      id: 'p2', letter_type: 'dimensional_letters', description: 'Dim letters', qty: 2, unit_cost: 60, total_cost: 120,
      fab_config: { material_cost: 40, paint_material_cost: 10, cnc_labor_cost: 20, paint_labor_cost: 10 },
    },
  ],
  letters_delivery_fee: 90, letters_design_fee: 150,
  items: [
    { description: 'Flush install', labor_cost: 300, materials_cost: 100, item_total_cost: 400, qty_letters: 5 },
    { description: 'Raceway install', labor_cost: 200, materials_cost: 50, item_total_cost: 250, qty_letters: 4 },
  ],
  selected_equipment: [{ equipment_name: 'Boom lift', total_cost: 400 }],
  personnel: [],
  total_supplies_cost: 75, total_travel_cost: 60,
  letters_subtotal: 860, labor_cost_in_subtotal: 500, labor_priced_via_personnel: false,
  subtotal: 2260, markup_percent: 20, markup_amount: 452, total_cost: 2712,
};

// ===========================================================================
// 1. Key uniqueness — no cost row emits a duplicate deterministic key.
// ===========================================================================
{
  const lines = W.channelCostLines(FIXTURE);
  const keys = lines.map((l) => l.key);
  eq(new Set(keys).size, keys.length, 'every cost-line key unique (no double-counted row)');
}

// ===========================================================================
// 2. Deterministic projection — identical record, identical key sequence.
// ===========================================================================
{
  const a = W.channelCostLines(FIXTURE).map((l) => l.key);
  const b = W.channelCostLines(FIXTURE).map((l) => l.key);
  eq(a.join('|'), b.join('|'), 'same record -> same keys in same order');
}

// ===========================================================================
// 3. Source-row exact-once — a split purchase replaces its base line, it does
//    not add a duplicate `purchase:1` on top of `purchase:1:*`.
// ===========================================================================
{
  const lines = W.channelCostLines(FIXTURE);
  ok(lines.some((l) => l.key === 'purchase:0'), 'unsplit purchase keeps base line');
  ok(!lines.some((l) => l.key === 'purchase:1'), 'dimensional split has NO bare purchase:1');
  const split = lines.filter((l) => l.key.startsWith('purchase:1:'));
  eq(split.length, 3, 'dimensional purchase emits exactly material/labor/other');
  near(split.reduce((s, l) => s + l.cost, 0), 120, 'split shares conserve the purchase total');
}

// ===========================================================================
// 4. Material ownership — fab_config partitions, never double-charges.
//    Arbitrary shares still conserve; partial config leaves a remainder line.
// ===========================================================================
{
  const lines = W.channelCostLines({
    letter_purchases: [{
      letter_type: 'dimensional_letters', qty: 1, total_cost: 200,
      fab_config: { material_cost: 120, cnc_labor_cost: 30 },
    }],
    items: [], selected_equipment: [], personnel: [],
    total_supplies_cost: 0, total_travel_cost: 0,
  });
  const purchaseLines = lines.filter((l) => l.family === 'letter_purchase');
  near(purchaseLines.reduce((s, l) => s + l.cost, 0), 200, 'partial fab_config still conserves total');
  ok(purchaseLines.some((l) => l.key.endsWith(':other')), 'remainder owns the un-attributed share');
  near(purchaseLines.find((l) => l.key.endsWith(':material')).cost, 120, 'material share = authored material_cost');
}

// ===========================================================================
// 5. Labor ownership exclusive — item labor XOR personnel, never both.
// ===========================================================================
{
  const flat = W.channelCostLines(FIXTURE);
  ok(flat.some((l) => l.key === 'item:0:labor'), 'no crew -> item labor present');
  ok(!flat.some((l) => l.family === 'personnel'), 'no crew -> no personnel lines');
  const crew = W.channelCostLines({
    ...FIXTURE,
    labor_priced_via_personnel: true, labor_cost_in_subtotal: 0,
    personnel: [{ name: 'Crew Lead', total_cost: 600 }],
  });
  ok(!crew.some((l) => l.key === 'item:0:labor' || l.key === 'item:1:labor'), 'crew-priced -> item labor gone');
  eq(crew.filter((l) => l.family === 'personnel').length, 1, 'exactly one personnel line');
  // never both families for the same labor dollars
  const laborOwners = crew.filter((l) => l.category === 'labor' || l.family === 'personnel' || l.key.includes('labor'));
  ok(laborOwners.length > 0 && !crew.some((l) => l.key.includes('item') && l.key.includes('labor')), 'labor owned once');
}

// ===========================================================================
// 6. Fee ownership — delivery+design aggregate to exactly ONE letter_fees
//    line (not one line per fee field).
// ===========================================================================
{
  const lines = W.channelCostLines(FIXTURE);
  eq(lines.filter((l) => l.key === 'letter_fees').length, 1, 'one aggregated fees line');
  eq(lines.find((l) => l.key === 'letter_fees').cost, 240, 'fees = delivery 90 + design 150');
}

// ===========================================================================
// 7. Absent families emit nothing — sparse record stays sparse.
// ===========================================================================
{
  const lines = W.channelCostLines({
    letter_purchases: [{ letter_type: 'channel_flush_mounted', qty: 2, total_cost: 300 }],
    items: [], selected_equipment: [], personnel: [],
    total_supplies_cost: 0, total_travel_cost: 0,
  });
  ok(lines.every((l) => l.family === 'letter_purchase' || l.family === 'letter_fees'),
    'sparse record emits only owned families');
  ok(!lines.some((l) => l.key.startsWith('item:')), 'no phantom install lines');
  ok(!lines.some((l) => l.key === 'supplies' || l.key === 'travel'), 'no phantom supplies/travel');
}

// ===========================================================================
// 8. Quantity applied once — cost lines keep real qty; the engine extends
//    qty x unit once (never qty x qty, never unit x unit again).
// ===========================================================================
{
  const lines = W.channelCostLines(FIXTURE);
  const p = lines.find((l) => l.key === 'purchase:0');
  eq(p.qty, 5, 'purchase line keeps real qty 5');
  eq(p.unitCost, 100, 'unitCost = cost/qty');
  // Engine sell: markup_pct 50 -> unit 150, extension 150 x 3 = 450 once.
  const r = W.wireChannelLineSell({ line: { markup_pct: 50 }, cost: 300, qty: 3, unitCost: 100, engine: ENGINE });
  eq(r.priced, true, 'markup line engine-priced');
  near(r.sellPrice, 450, 'sellPrice = unit x qty exactly once');
  near(r.extension, 450, 'extension echoes the same once-multiplied total');
}

// ===========================================================================
// 9. Sell-side rollup exact-once — wireChannelProjectSell preserves the cost
//    line count and the verbatim cost sum on all-passthrough.
// ===========================================================================
{
  const lines = W.channelCostLines(FIXTURE);
  const r = W.wireChannelProjectSell({ lines, engine: ENGINE });
  eq(r.lines.length, lines.length, 'rollup preserves line count — no line re-emitted');
  near(r.costTotal, lines.reduce((s, l) => s + l.cost, 0), 'costTotal == sum of line costs');
  eq(r.allPassthrough, true, 'unconfigured lines all passthrough');
  near(r.sellTotal, r.costTotal, 'all-passthrough sellTotal is the verbatim cost sum');
}

// ===========================================================================
// 10. Zero-qty validity — qty 0 purchase keeps its cost, qty normalizes to 1,
//     and no second row appears to carry the "real" quantity.
// ===========================================================================
{
  const lines = W.channelCostLines({
    letter_purchases: [{ letter_type: 'capsule_logo_pillbox', qty: 0, unit_cost: 0, total_cost: 300 }],
    items: [], selected_equipment: [], personnel: [], total_supplies_cost: 0, total_travel_cost: 0,
  });
  const purchaseLines = lines.filter((l) => l.family === 'letter_purchase');
  eq(purchaseLines.length, 1, 'zero-qty purchase emits one line, not a base+remainder pair');
  eq(purchaseLines[0].cost, 300, 'zero-qty cost preserved verbatim');
}

console.log(`PASS channel-cost-ownership (${n} asserts: key uniqueness, deterministic order, split-replaces-base, fab_config conservation, labor XOR, fee aggregation, sparse-family silence, qty-once extension, rollup exact-once, zero-qty validity)`);
