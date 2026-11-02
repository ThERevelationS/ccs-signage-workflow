import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// F-06 — PricingTemplate application suite.
//
// Contract under test (base44/shared/pricingTemplateModel.ts):
//   - normalizePricingTemplate: canonical {qty, tier_markups} breaks plus
//     tolerated flat fields/aliases; malformed rows rejected with warnings;
//     rows sorted qty-ASC; idempotent.
//   - templateForPart: pricing_template_id link resolution (id > name; dup
//     names deterministic; embedded record fallback).
//   - resolveTemplatePrice: qty-bracket pick (highest qualifying min qty that
//     can price the customer tier), tier_markups key resolution (exact >
//     'default'/'*' > lone numeric), market_based retail/discount chart,
//     precedence chain part_fixed > template > tier_rule_set > part_chart >
//     part_market > default_markup > cost_passthrough, minimum-charge floor.
//   - templatePartDescriptor: engine-adapter folding.
//
// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-pricing-template.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingTemplateModel.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  normalizePricingTemplate, templateRefForPart, templateForPart,
  resolveTemplatePrice, templatePartDescriptor, round2, round4,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
// Node>=26 innerFail rejects an explicitly-passed undefined `message` — only
// forward the arg when it was supplied.
const eq = (a, b, msg) => { n += 1; return msg === undefined ? assert.equal(a, b) : assert.equal(a, b, msg); };
const ok = (v, msg) => { n += 1; return msg === undefined ? assert.ok(v) : assert.ok(v, msg); };
const deep = (a, b, msg) => { n += 1; return msg === undefined ? assert.deepEqual(a, b) : assert.deepEqual(a, b, msg); };

// Canonical PricingTemplate fixture (entity shape: ascending qty breaks,
// tier_markups keyed by MarkupTier.tier_name).
const TPL = {
  id: 'tpl-1', name: 'Banner SqFt - Standard', unit_category: 'SqFt',
  status: 'active',
  breaks: [
    { qty: 1, tier_markups: { Gold: 60, Silver: 80 } },
    { qty: 25, tier_markups: { Gold: 45, Silver: 60 } },
    { qty: 100, tier_markups: { Gold: 30, Silver: 40 } },
  ],
};
const PART = { id: 'p-1', part_name: '3x8 banner', unit: 'SqFt', pricing_template_id: 'tpl-1' };
const ALL = [TPL];

// ============================================================ normalization
{
  eq(normalizePricingTemplate(null), null, 'non-record template -> null');
  eq(normalizePricingTemplate('x'), null, 'scalar -> null');
}
{
  const t = normalizePricingTemplate(TPL);
  eq(t.id, 'tpl-1');
  eq(t.name, 'Banner SqFt - Standard');
  eq(t.unit_category, 'SqFt');
  eq(t.active, true, 'active status');
  eq(t.market_based, false);
  eq(t.breaks.length, 3);
  eq(t.breaks[0].qty, 1);
  eq(t.breaks[2].tier_markups.Silver, 40);
  eq(t.rejected_breaks, 0);
}
{
  // Unsorted breaks normalize to ascending order.
  const t = normalizePricingTemplate({
    name: 'U', breaks: [
      { qty: 100, tier_markups: { A: 10 } },
      { qty: 1, tier_markups: { A: 50 } },
      { qty: 25, tier_markups: { A: 30 } },
    ],
  });
  deep(t.breaks.map((b) => b.qty), [1, 25, 100], 'breaks sorted qty-ASC');
}
{
  // qty aliases: min_qty / qty_from accepted.
  const t = normalizePricingTemplate({
    name: 'A', breaks: [
      { min_qty: 5, tier_markups: { A: 10 } },
      { qty_from: 20, tier_markups: { A: 5 } },
    ],
  });
  deep(t.breaks.map((b) => b.qty), [5, 20], 'min_qty/qty_from aliases');
}
{
  // Malformed rows rejected: bad qty, non-record, empty content.
  const t = normalizePricingTemplate({
    name: 'M', breaks: [
      { qty: 'abc', tier_markups: { A: 10 } },   // non-finite qty -> reject
      { qty: -4, tier_markups: { A: 10 } },      // negative qty -> reject
      'junk-row',                               // non-record -> reject
      { qty: 3 },                               // no pricing content -> reject
      { qty: 1, tier_markups: { A: 10 } },      // keeper
    ],
  });
  eq(t.breaks.length, 1, 'only the valid row survives');
  eq(t.rejected_breaks, 4, 'four malformed rows rejected');
  eq(t.warnings.length, 4, 'each rejection warns');
  ok(t.warnings.every((w) => /break/.test(w)), 'warnings name the row');
}
{
  // Non-finite tier_markups values drop per-key; a missing qty field means 0.
  const t = normalizePricingTemplate({
    name: 'N', breaks: [
      { qty: 1, tier_markups: { A: 10, B: 'soon', C: null } },
      { markup_pct: 15 }, // no qty field -> min 0 catch-all
    ],
  });
  deep(t.breaks[1].tier_markups, { A: 10 }, 'non-finite tier values dropped');
  eq(t.breaks[0].qty, 0, 'missing qty -> catch-all min 0');
}
{
  // tier_markups aliases + flat fields.
  const t = normalizePricingTemplate({
    name: 'F', breaks: [
      { qty: 1, tierMargins: { A: 20 } },
      { qty: 2, tiers: { A: 25 } },
      { qty: 3, unit_price: 4.5 },
      { qty: 4, markup: 33 },
      { qty: 5, discount: 10 },
    ],
  });
  eq(t.breaks[0].tier_markups.A, 20, 'tierMargins alias');
  eq(t.breaks[1].tier_markups.A, 25, 'tiers alias');
  eq(t.breaks[2].unit_price, 4.5, 'unit_price kept');
  eq(t.breaks[3].markup_pct, 33, 'markup alias');
  eq(t.breaks[4].discount_pct, 10, 'discount alias');
}
{
  const t = normalizePricingTemplate({ name: 'X', status: 'inactive', breaks: [] });
  eq(t.active, false, 'inactive detected');
  eq(t.status, 'inactive');
}
{
  const t = normalizePricingTemplate({ name: 'X', pricing_mode: 'market', breaks: [] });
  eq(t.market_based, true, 'pricing_mode market -> market_based');
  const t2 = normalizePricingTemplate({ name: 'X', market_based: 'true', breaks: [] });
  eq(t2.market_based, true, "market_based 'true' string");
}
{
  const once = normalizePricingTemplate(TPL);
  const twice = normalizePricingTemplate(once);
  eq(twice.breaks.length, once.breaks.length, 'normalize idempotent');
  eq(twice.breaks[0].qty, once.breaks[0].qty);
}

// ============================================================ templateForPart
{
  eq(templateForPart(PART, ALL), TPL, 'id link resolves record');
  eq(templateForPart({ pricing_template_name: 'Banner SqFt - Standard' }, ALL), TPL,
    'name link resolves');
  eq(templateForPart({ template_id: 'tpl-1' }, ALL), TPL, 'template_id alias');
  eq(templateForPart({ margin_template_id: 'tpl-1' }, ALL), TPL, 'margin_template_id alias');
  eq(templateForPart({ pricing_template_id: 'missing' }, ALL), null, 'dangling ref -> null');
  eq(templateForPart({ part_name: 'x' }, ALL), null, 'no ref -> null');
}
{
  // Embedded template record rides the part; ref still wins over snapshot.
  const embedded = { id: 'tpl-emb', name: 'Snap', breaks: [{ qty: 1, tier_markups: { A: 99 } }] };
  const p = { pricing_template: embedded };
  eq(templateForPart(p, ALL), embedded, 'embedded record resolves');
  const pBoth = { pricing_template_id: 'tpl-1', pricing_template: embedded };
  eq(templateForPart(pBoth, ALL), TPL, 'registry row outranks embedded');
  const pDangle = { pricing_template_id: 'gone', pricing_template: embedded };
  eq(templateForPart(pDangle, ALL), embedded, 'dangling ref falls back to embedded');
}
{
  // Duplicate names pick deterministically: active first, then lowest sort, then id.
  const dupes = [
    { id: 'b', name: 'Dup', sort: 5, status: 'active' },
    { id: 'a', name: 'Dup', sort: 5, status: 'active' },
    { id: 'c', name: 'Dup', sort: 1, status: 'inactive' },
  ];
  eq(templateForPart({ template_name: 'dup' }, dupes).id, 'a', 'active dupes -> lowest id on tie');
}
{
  const ref = templateRefForPart(PART);
  eq(ref.ref, 'tpl-1');
  eq(ref.via, 'pricing_template_id');
  eq(templateRefForPart(null), null);
}

// ============================================================ bracket picks (markup chart)
{
  // qty exactly ON a break threshold -> that bracket.
  const r = resolveTemplatePrice({
    part: PART, qty: 25, base_price: 10, templates: ALL, customer_tier: 'Gold',
  });
  eq(r.applied, true, 'template priced');
  eq(r.source, 'template');
  eq(r.tier_row.qty, 25, 'exact break qty wins');
  eq(r.unit_price, 14.5, '10 x 1.45');
  eq(r.extended, 362.5, '14.5 x 25');
  eq(r.markup_pct, 45);
  eq(r.matched_tier.key, 'Gold');
  eq(r.pct_source, 'tier_markups');
  eq(r.pricing_mode, 'markup');
  eq(r.template_id, 'tpl-1');
}
{
  // qty between breaks -> highest qualifying bracket.
  const r = resolveTemplatePrice({
    part: PART, qty: 50, base_price: 10, templates: ALL, customer_tier: 'Gold',
  });
  eq(r.tier_row.qty, 25, 'between -> lower bracket');
  eq(r.unit_price, 14.5);
  // qty above max -> top bracket.
  const top = resolveTemplatePrice({
    part: PART, qty: 500, base_price: 10, templates: ALL, customer_tier: 'Silver',
  });
  eq(top.tier_row.qty, 100, 'above max -> top bracket');
  eq(top.unit_price, 14, 'Silver 40 -> x1.4');
  eq(top.extended, 7000);
}
{
  // qty below the first break -> no bracket qualifies -> default chain.
  const r = resolveTemplatePrice({
    part: PART, qty: 0.5, base_price: 10, templates: ALL,
    customer_tier: 'Gold', default_markup_pct: 70,
  });
  eq(r.applied, false, 'below first break -> template cannot price');
  eq(r.reason, 'no_qualifying_break');
  eq(r.source, 'default_markup');
  eq(r.unit_price, 17, 'shop default markup rescues');
}
{
  // qty <= 0 prices no bracket (engine pickUnitBreak parity).
  const r = resolveTemplatePrice({
    part: PART, qty: 0, base_price: 10, templates: ALL, customer_tier: 'Gold',
  });
  eq(r.applied, false);
  eq(r.reason, 'qty_not_positive');
  eq(r.unit_price, 10, 'cost passthrough');
  eq(r.source, 'cost_passthrough');
  eq(r.extended, 0);
}
{
  // Bracket that cannot price the tier is skipped — LOWER bracket that covers
  // the tier wins (machineCosts pickMarginBracket + F-27 shape-map parity).
  // NOTE: a ONE-entry tier_markups map is a lone-numeric catch-all
  // (tierMarkupsPct parity), so the qty-10 row needs >=2 entries to miss.
  const tpl = {
    name: 'T', breaks: [
      { qty: 1, tier_markups: { Gold: 50, Silver: 60 } },
      { qty: 10, tier_markups: { Gold: 30, Wholesale: 20 } }, // no Silver entry
    ],
  };
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 't' }, qty: 20, base_price: 10,
    templates: [tpl], customer_tier: 'Silver',
  });
  eq(r.tier_row.qty, 1, 'Silver skips the qty-10 bracket (no entry) -> qty-1');
  eq(r.unit_price, 16, 'Silver 60 -> x1.6');
  eq(r.applied, true);
  // ...but a single-entry map DOES cover every tier (lone catch-all).
  const loneTpl = { name: 'L', breaks: [
    { qty: 1, tier_markups: { Gold: 50, Silver: 60 } },
    { qty: 10, tier_markups: { Gold: 30 } },
  ] };
  const lone = resolveTemplatePrice({
    part: { pricing_template_id: 'l' }, qty: 20, base_price: 10,
    templates: [loneTpl], customer_tier: 'Silver',
  });
  eq(lone.tier_row.qty, 10, 'lone map entry prices any tier -> top bracket wins');
  eq(lone.unit_price, 13);
  eq(lone.pct_source, 'tier_markups_lone');
}
{
  // tier_markups 'default'/'*' fallback, then lone-numeric.
  const tpl = {
    name: 'D', breaks: [{ qty: 1, tier_markups: { default: 33, Gold: 50 } }],
  };
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'd' }, qty: 5, base_price: 10,
    templates: [tpl], customer_tier: 'Platinum',
  });
  eq(r.unit_price, 13.3, "'default' entry prices unknown tiers");
  eq(r.pct_source, 'tier_markups_default');
  const lone = resolveTemplatePrice({
    part: { pricing_template_id: 'd' }, qty: 5, base_price: 10,
    templates: [{ name: 'd', breaks: [{ qty: 1, tier_markups: { Gold: 25 } }] }],
    customer_tier: 'Platinum',
  });
  eq(lone.unit_price, 12.5, 'lone numeric entry prices any tier');
  eq(lone.pct_source, 'tier_markups_lone');
}
{
  // Customer tier keys expand through the MarkupTier catalog: customer '2'
  // matches a chart entry keyed by tier_name.
  const catalog = [{ id: 'mt-2', tier_name: 'Wholesale', tier_number: 2 }];
  const r = resolveTemplatePrice({
    part: PART, qty: 5, base_price: 10, templates: ALL,
    customer_tier: 2, tiers: catalog,
  });
  // TPL has no Wholesale/2 entry -> default chain... make one that does:
  const tpl2 = {
    name: 'W', breaks: [{ qty: 1, tier_markups: { Wholesale: 20 } }],
  };
  const hit = resolveTemplatePrice({
    part: { pricing_template_id: 'w' }, qty: 5, base_price: 10,
    templates: [tpl2], customer_tier: 2, tiers: catalog,
  });
  eq(hit.unit_price, 12, 'catalog expansion: tier 2 -> Wholesale key');
  eq(r.applied, false, 'no chart entry for expanded key -> fallback');
}
{
  // MarkupTier RECORD passed as the customer tier contributes all its keys.
  const r = resolveTemplatePrice({
    part: PART, qty: 5, base_price: 10, templates: ALL,
    customer_tier: { id: 'x', tier_name: 'Gold', tier_number: 3 },
  });
  eq(r.matched_tier.key, 'Gold', 'record tier_name key matches');
  eq(r.unit_price, 16);
}
{
  // Flat bracket fields: unit_price / markup_pct / discount_pct.
  const tpl = {
    name: 'FL', breaks: [
      { qty: 1, unit_price: 7.5 },
      { qty: 10, markup_pct: 40 },
      { qty: 20, discount_pct: 10 },
    ],
  };
  const price = (qty) => resolveTemplatePrice({
    part: { pricing_template_id: 'fl' }, qty, base_price: 10, templates: [tpl],
  });
  eq(price(5).unit_price, 7.5, 'unit_price bracket');
  eq(price(5).pricing_mode, 'fixed');
  eq(price(15).unit_price, 14, 'flat markup_pct bracket');
  eq(price(50).unit_price, 9, 'discount_pct off base (10 x 0.9)');
  eq(price(50).pct_source, 'discount_pct');
}
{
  // Within a bracket the tier-scoped entry beats flat fields — deliberate
  // deviation from machineCosts bracketPct (flat-first): there the map is a
  // tolerated extra on margin charts; here tier_markups is the DECLARED chart
  // ("that bracket's tier_markups chart applies"). NOTE a single-entry map
  // lone-catches every tier, so the miss case needs >=2 map entries.
  const tpl = {
    name: 'M', breaks: [{ qty: 1, tier_markups: { Gold: 50, Silver: 45 }, markup_pct: 10 }],
  };
  const gold = resolveTemplatePrice({
    part: { pricing_template_id: 'm' }, qty: 5, base_price: 10,
    templates: [tpl], customer_tier: 'Gold',
  });
  eq(gold.unit_price, 15, 'tier entry wins over flat markup_pct');
  const other = resolveTemplatePrice({
    part: { pricing_template_id: 'm' }, qty: 5, base_price: 10,
    templates: [tpl], customer_tier: 'Bronze',
  });
  eq(other.unit_price, 11, 'tier miss -> flat bracket markup');
  eq(other.pct_source, 'markup_pct');
}

// ============================================================ market_based
{
  const tpl = {
    name: 'MB', market_based: true,
    breaks: [
      { qty: 1, tier_markups: { Gold: 20, Silver: 18 } },
      { qty: 10, tier_markups: { Gold: 16, Silver: 15 } },
    ],
  };
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'mb' }, qty: 5, base_price: 10,
    templates: [tpl], customer_tier: 'Gold',
  });
  eq(r.unit_price, 20, 'market tier value = retail unit price');
  eq(r.pricing_mode, 'market_based');
  eq(r.market_retail, 20);
  const big = resolveTemplatePrice({
    part: { pricing_template_id: 'mb' }, qty: 50, base_price: 10,
    templates: [tpl], customer_tier: 'Silver',
  });
  eq(big.unit_price, 15, 'higher bracket retail');
}
{
  // Row-level market_retail + discount; template-level retail fallback.
  const tpl = {
    name: 'MB2', market_based: true,
    breaks: [
      { qty: 1, market_retail: 25, market_discount_pct: 20 },
      { qty: 10, tier_markups: { Gold: 30, Silver: 28 } },
    ],
    market_retail: 40, market_discount_pct: 10,
  };
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'mb2' }, qty: 5, base_price: 10,
    templates: [tpl], customer_tier: 'Gold',
  });
  eq(r.unit_price, 20, '25 x (1 - 0.20)');
  eq(r.pct_source, 'market_retail');
  const big = resolveTemplatePrice({
    part: { pricing_template_id: 'mb2' }, qty: 50, base_price: 10,
    templates: [tpl], customer_tier: 'Bronze',
  });
  eq(big.unit_price, 36, 'template market_retail 40 x (1 - 0.10)');
}
{
  // market chart with no resolvable retail -> markup fallback (F-27 i5 parity).
  const tpl = {
    name: 'MB3', market_based: true,
    breaks: [{ qty: 1, markup_pct: 50 }],
  };
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'mb3' }, qty: 4, base_price: 10,
    templates: [tpl], customer_tier: 'Gold',
  });
  eq(r.unit_price, 15, 'market chart markup fallback x1.5');
  eq(r.pricing_mode, 'markup');
}
{
  // Non-positive tier retail counts as absent -> flat fields rescue.
  const tpl = {
    name: 'MB4', market_based: true,
    breaks: [{ qty: 1, tier_markups: { Gold: 0 }, markup_pct: 25 }],
  };
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'mb4' }, qty: 4, base_price: 10,
    templates: [tpl], customer_tier: 'Gold',
  });
  eq(r.unit_price, 12.5, 'retail 0 absent -> markup_pct fallback');
}

// ============================================================ precedence chain
{
  // part_fixed outranks the bound template outright.
  const r = resolveTemplatePrice({
    part: { ...PART, fixed_price: 9.99 }, qty: 10, base_price: 10,
    templates: ALL, customer_tier: 'Gold',
  });
  eq(r.applied, false);
  eq(r.source, 'part_fixed');
  eq(r.unit_price, 9.99);
  eq(r.reason, 'fixed_price');
  eq(r.chain[0].layer, 'part_fixed');
  eq(r.chain[0].won, true);
}
{
  // Missing template ref -> default markup chain.
  const r = resolveTemplatePrice({
    part: { part_name: 'x' }, qty: 5, base_price: 10, default_markup_pct: 60,
  });
  eq(r.reason, 'no_template_ref');
  eq(r.source, 'default_markup');
  eq(r.unit_price, 16);
}
{
  // Dangling ref -> template_not_found; part.markup_pct rescues.
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'ghost', markup_pct: 35 }, qty: 5, base_price: 10,
    templates: ALL,
  });
  eq(r.reason, 'template_not_found');
  eq(r.source, 'default_markup');
  eq(r.markup_pct, 35);
  eq(r.unit_price, 13.5);
}
{
  // Inactive template cannot price.
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'dead' }, qty: 5, base_price: 10,
    templates: [{ id: 'dead', name: 'D', status: 'inactive', breaks: TPL.breaks }],
    default_markup_pct: 10,
  });
  eq(r.reason, 'template_inactive');
  eq(r.unit_price, 11);
}
{
  // unit_category gate: mismatched part unit -> template cannot price.
  const r = resolveTemplatePrice({
    part: { ...PART, unit: 'Each' }, qty: 30, base_price: 10,
    templates: ALL, customer_tier: 'Gold', default_markup_pct: 20,
  });
  eq(r.reason, 'unit_category_mismatch');
  eq(r.unit_price, 12);
  // Blank part unit cannot disprove the pick -> applies, flagged.
  const soft = resolveTemplatePrice({
    part: { id: 'p2', pricing_template_id: 'tpl-1' }, qty: 30, base_price: 10,
    templates: ALL, customer_tier: 'Gold',
  });
  eq(soft.applied, true, 'blank unit -> template applies');
  eq(soft.unit_unverified, true, 'flagged unverified');
  eq(soft.unit_price, 14.5);
}
{
  // Template miss -> part's own per_unit_breaks chart rescues (part_chart).
  const r = resolveTemplatePrice({
    part: {
      pricing_template_id: 'ghost',
      per_unit_breaks: [{ qty: 5, unit_price: 8 }, { qty: 20, unit_price: 6 }],
    },
    qty: 25, base_price: 10, templates: ALL,
  });
  eq(r.source, 'part_chart');
  eq(r.unit_price, 6, 'part chart bracket pick');
}
{
  // Part market_retail fallback.
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'ghost', market_retail: 20, market_discount_pct: 10 },
    qty: 4, base_price: 10, templates: ALL,
  });
  eq(r.source, 'part_market');
  eq(r.unit_price, 18);
}
{
  // Nothing at all -> cost passthrough.
  const r = resolveTemplatePrice({ part: {}, qty: 3, base_price: 7 });
  eq(r.source, 'cost_passthrough');
  eq(r.unit_price, 7);
  eq(r.extended, 21);
  const last = r.chain[r.chain.length - 1];
  eq(last.layer, 'cost_passthrough');
  eq(last.won, true);
}
{
  // GlobalPricingTier linked rule set rescues a template miss.
  const ruleSets = [{ id: 'gpt-1', name: 'Standard', rules: [
    { tier: 'Gold', markup_pct: 55 },
    { tier: 'Silver', markup_pct: 70 },
  ] }];
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'ghost', global_pricing_tier_id: 'gpt-1' },
    qty: 4, base_price: 10, templates: ALL,
    tiers: ruleSets, customer_tier: 'Gold',
  });
  eq(r.source, 'tier_rule_set');
  eq(r.unit_price, 15.5, 'linked set markup 55 -> x1.55');
  eq(r.markup_pct, 55);
  // Unlinked set is never consulted (fail closed).
  const closed = resolveTemplatePrice({
    part: { pricing_template_id: 'ghost' }, qty: 4, base_price: 10,
    templates: ALL, tiers: ruleSets, customer_tier: 'Gold',
  });
  eq(closed.source, 'cost_passthrough', 'unlinked rule set not consulted');
}
{
  // Template-root flat default = chart catch-all (chart_default parity).
  const r = resolveTemplatePrice({
    part: { pricing_template_id: 'fd' }, qty: 500, base_price: 10,
    templates: [{ id: 'fd', name: 'FD', markup_pct: 22, breaks: [{ qty: 100, tier_markups: { Gold: 1, Silver: 2 } }] }],
    customer_tier: 'Bronze',
  });
  eq(r.applied, true, 'template root default still belongs to the template');
  eq(r.pct_source, 'template_default');
  eq(r.unit_price, 12.2);
}

// ============================================================ minimum charge
{
  const r = resolveTemplatePrice({
    part: { ...PART, min_charge: 100 }, qty: 5, base_price: 10,
    templates: ALL, customer_tier: 'Gold',
  });
  eq(r.extended, 100, 'part.min_charge floors the extension');
  eq(r.minimum_applied, true);
  // Highest floor across row/template/part/opts wins.
  const t = { name: 'MC', minimum_charge: 40, breaks: [
    { qty: 1, tier_markups: { A: 50 }, minimum_charge: 75 },
  ] };
  const r2 = resolveTemplatePrice({
    part: { pricing_template_id: 'mc', min_charge: 20 }, qty: 5, base_price: 10,
    templates: [t], customer_tier: 'A', minimum_charge: 60,
  });
  eq(r2.minimum_charge, 75, 'bracket row floor is the max candidate');
  eq(r2.extended, 75);
  // Minimum never fires on a non-positive extension.
  const r3 = resolveTemplatePrice({
    part: { pricing_template_id: 'mc', min_charge: 50 }, qty: 0, base_price: 10,
    templates: [t], customer_tier: 'A',
  });
  eq(r3.minimum_applied, false);
  eq(r3.extended, 0);
}

// ============================================================ determinism / swap
{
  // Swapping templates re-prices deterministically: same call -> same result,
  // different template -> different price.
  const a = { id: 'tA', name: 'A', breaks: [{ qty: 1, tier_markups: { Gold: 50 } }] };
  const b = { id: 'tB', name: 'B', breaks: [{ qty: 1, tier_markups: { Gold: 20 } }] };
  const call = (part) => resolveTemplatePrice({
    part, qty: 10, base_price: 10, templates: [a, b], customer_tier: 'Gold',
  });
  const r1 = call({ pricing_template_id: 'tA' });
  const r2 = call({ pricing_template_id: 'tA' });
  deep(r2, r1, 'same inputs -> identical result');
  const r3 = call({ pricing_template_id: 'tB' });
  eq(r1.unit_price, 15);
  eq(r3.unit_price, 12);
  ok(r1.unit_price !== r3.unit_price, 'swap changes price');
  const r4 = call({ pricing_template_id: 'tA' });
  eq(r4.unit_price, r1.unit_price, 'swap back restores price');
}
{
  // Registry order does not matter (id match is positional-independent).
  const a = { id: 'x1', name: 'X1', breaks: [{ qty: 1, tier_markups: { G: 10 } }] };
  const b = { id: 'x2', name: 'X2', breaks: [{ qty: 1, tier_markups: { G: 20 } }] };
  const fwd = resolveTemplatePrice({ part: { pricing_template_id: 'x2' }, qty: 2, base_price: 10, templates: [a, b], customer_tier: 'G' });
  const rev = resolveTemplatePrice({ part: { pricing_template_id: 'x2' }, qty: 2, base_price: 10, templates: [b, a], customer_tier: 'G' });
  eq(fwd.unit_price, rev.unit_price, 'registry order independent');
}
{
  // chain audit: every result walks all layers; exactly one won.
  const r = resolveTemplatePrice({
    part: PART, qty: 30, base_price: 10, templates: ALL, customer_tier: 'Gold',
  });
  deep(r.chain.map((c) => c.layer), [
    'part_fixed', 'template', 'tier_rule_set', 'part_chart', 'part_market',
    'default_markup', 'cost_passthrough',
  ], 'chain walks all layers');
  eq(r.chain.filter((c) => c.won).length, 1, 'exactly one winner');
  eq(r.chain[1].won, true, 'template layer won');
}

// ============================================================ opts.template override
{
  // Caller's pre-resolved template beats the part ref.
  const other = { id: 'o', name: 'O', breaks: [{ qty: 1, tier_markups: { Gold: 90 } }] };
  const r = resolveTemplatePrice({
    part: PART, qty: 5, base_price: 10, templates: ALL,
    template: other, customer_tier: 'Gold',
  });
  eq(r.unit_price, 19, 'opts.template record wins');
  eq(r.template_id, 'o');
  // A scalar template ref resolves against the pool.
  const r2 = resolveTemplatePrice({
    part: { part_name: 'x' }, qty: 5, base_price: 10,
    templates: ALL, template: 'tpl-1', customer_tier: 'Gold',
  });
  eq(r2.unit_price, 16, 'scalar template ref resolves');
}

// ============================================================ engine adapter
{
  // markup hit -> markup_pct injected, part chart fields stripped.
  const res = resolveTemplatePrice({
    part: PART, qty: 30, base_price: 10, templates: ALL, customer_tier: 'Gold',
  });
  const d = templatePartDescriptor({ ...PART, per_unit_breaks: [{ qty: 1, unit_price: 99 }], markup_pct: 5 }, res);
  eq(d.markup_pct, 45, 'template pct injected');
  eq(d.per_unit_breaks, undefined, 'part chart stripped');
  eq(d.pricing_template_id, 'tpl-1', 'link field preserved');
}
{
  // market hit -> market_* fields injected.
  const res = resolveTemplatePrice({
    part: { pricing_template_id: 'm' }, qty: 5, base_price: 10,
    templates: [{ id: 'm', name: 'M', market_based: true, breaks: [{ qty: 1, market_retail: 25, market_discount_pct: 20 }] }],
    customer_tier: 'G',
  });
  const d = templatePartDescriptor({ pricing_template_id: 'm' }, res);
  eq(d.pricing_mode, 'market_based');
  eq(d.market_retail, 25);
  eq(d.market_discount_pct, 20);
}
{
  // unit_price hit -> qty-break pin at the order qty.
  const res = resolveTemplatePrice({
    part: { pricing_template_id: 'f' }, qty: 7, base_price: 10,
    templates: [{ id: 'f', name: 'F', breaks: [{ qty: 1, unit_price: 6.25 }] }],
  });
  const d = templatePartDescriptor({ pricing_template_id: 'f' }, res);
  deep(d.per_unit_breaks, [{ qty: 7, unit_price: 6.25 }], 'unit price pinned at order qty');
}
{
  // miss -> descriptor returns the part VERBATIM (identity preserved).
  const p = { pricing_template_id: 'ghost', markup_pct: 12 };
  const res = resolveTemplatePrice({ part: p, qty: 5, base_price: 10, templates: [] });
  const d = templatePartDescriptor(p, res);
  eq(d, p, 'miss returns the same object');
}
{
  // discount_pct hit -> negative markup fold (10 x (1-0.10) == 10 x (1 + -10/100)).
  const res = resolveTemplatePrice({
    part: { pricing_template_id: 'd' }, qty: 5, base_price: 10,
    templates: [{ id: 'd', name: 'D', breaks: [{ qty: 1, discount_pct: 10 }] }],
  });
  eq(res.unit_price, 9);
  const d = templatePartDescriptor({ pricing_template_id: 'd' }, res);
  eq(d.markup_pct, -10, 'discount expressed as negative markup');
}

// ============================================================ rounding + edge safety
{
  const r = resolveTemplatePrice({
    part: PART, qty: 3, base_price: 9.99, templates: ALL, customer_tier: 'Gold',
  });
  eq(r.unit_price, round4(9.99 * 1.6), 'unit rounds to 4 decimals');
  eq(r.extended, round2(round4(9.99 * 1.6) * 3), 'extended rounds to cents');
  const junk = resolveTemplatePrice({ part: 42, qty: 'x', base_price: 'y', templates: 'z' });
  eq(junk.unit_price, 0, 'garbage in -> zero out, never throws');
  eq(junk.source, 'cost_passthrough');
}
{
  // qty strings coerce; negative base allowed through (engine parity).
  const r = resolveTemplatePrice({
    part: PART, qty: '30', base_price: '10', templates: ALL, customer_tier: 'Gold',
  });
  eq(r.unit_price, 14.5, 'string qty/base coerce');
  eq(r.extended, 435);
}

console.log(`PASS pricing-template (${n} asserts)`);
