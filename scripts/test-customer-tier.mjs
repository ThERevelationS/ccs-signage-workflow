import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-tier.mjs');
const outEngine = resolve(here, '.tmp-customer-tier-engine.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerTierModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingEngine.ts')],
  bundle: true, format: 'esm', outfile: outEngine, logLevel: 'silent',
});
const {
  PRICING_TIERS, DEFAULT_TIER, TIER_NUMBER_MIN, TIER_NUMBER_MAX, TIER_WILDCARD,
  normalizeTierKey, tierKeys, knownTiers, isKnownTier, defaultTier, tierLabel,
  resolveCustomerTier, resolveCustomerTierInfo,
  tierRowApplies, tierAssignmentPatch,
  effectiveTierForQuote, effectiveTierForQuoteInfo,
} = await import(pathToFileURL(out).href);
const { resolveTier, pricePart } = await import(pathToFileURL(outEngine).href);

// --- enum sanity ------------------------------------------------------------
assert.deepEqual([...PRICING_TIERS], ['retail', 'wholesale', 'contract', 'vip']);
assert.equal(DEFAULT_TIER, 'retail');
assert.equal(TIER_NUMBER_MIN, 1);
assert.equal(TIER_NUMBER_MAX, 8);
assert.equal(TIER_WILDCARD, '*');

// --- normalizeTierKey --------------------------------------------------------
assert.equal(normalizeTierKey(' WHOLESALE '), 'wholesale', 'trim + lowercase');
assert.equal(normalizeTierKey(2), '2', 'number → canonical key');
assert.equal(normalizeTierKey('02'), '2', 'numeric spellings canonicalize');
assert.equal(normalizeTierKey('2.0'), '2', 'float spelling of int canonicalizes');
assert.equal(normalizeTierKey('Platinum'), 'platinum');
assert.equal(normalizeTierKey(''), '');
assert.equal(normalizeTierKey(null), '');
assert.equal(normalizeTierKey(undefined), '');
assert.equal(normalizeTierKey('  '), '');
assert.equal(normalizeTierKey('abc'), 'abc', 'non-numeric stays');
assert.equal(normalizeTierKey('2.5'), '2.5', 'non-integer numeric stays');
// MarkupTier-like objects → canonical key prefers tier_number (storage form).
assert.equal(normalizeTierKey({ tier_number: 3, tier_name: 'Contract' }), '3');
assert.equal(normalizeTierKey({ tier_name: 'Wholesale' }), 'wholesale');
assert.equal(normalizeTierKey({ name: 'Gold Tier' }), 'gold tier');
assert.equal(normalizeTierKey({ id: 'tier-abc' }), 'tier-abc');
assert.equal(normalizeTierKey({}), '');

// --- tierKeys (engine tierKeySet parity — every pin form) ---------------------
{
  const keys = tierKeys({ tier_number: 2, tier_name: 'Wholesale', id: 't9' });
  assert.deepEqual(keys.sort(), ['2', 't9', 'wholesale']);
  assert.deepEqual(tierKeys('Contract'), ['contract']);
  assert.deepEqual(tierKeys(4), ['4']);
  assert.deepEqual(tierKeys(null), []);
}

// --- knownTiers / isKnownTier -------------------------------------------------
{
  const known = knownTiers();
  assert.ok(known.has('retail') && known.has('vip'), 'fallback named list always known');
  for (let n = 1; n <= 8; n += 1) assert.ok(known.has(String(n)), `numeric tier ${n} known`);
  assert.ok(!known.has('9'), 'tier 9 outside persisted range');
  assert.ok(!known.has('platinum'), 'unconfigured named tier unknown');

  assert.equal(isKnownTier(8), true);
  assert.equal(isKnownTier('Wholesale'), true, 'case-insensitive');
  assert.equal(isKnownTier(9), false);
  assert.equal(isKnownTier(0), false);
  assert.equal(isKnownTier(''), false);
  assert.equal(isKnownTier(null), false);
  // MarkupTier catalog rows make their name/number/id keys known.
  const opts = { tiers: [{ tier_number: 2, tier_name: 'Wholesale' }, { tier_number: 5, tier_name: 'Charities' }] };
  assert.equal(isKnownTier('charities', opts), true, 'catalog tier_name key');
  assert.equal(isKnownTier('gold', opts), false, 'unconfigured name still unknown');
  assert.equal(isKnownTier({ id: 'x1', tier_name: 'Gold' }, { tiers: [{ tier_number: 9, id: 'x1', tier_name: 'Gold' }] }), true, 'object any-key hit');
  // settings.pricing_tiers explicit list (GlobalSettings setting_value wrapper).
  const gs = { settings: { setting_value: { pricing_tiers: ['gold', { tier_name: 'Platinum' }] } } };
  assert.equal(isKnownTier('gold', gs), true);
  assert.equal(isKnownTier('platinum', gs), true, 'object entries contribute keys');
}

// --- resolveCustomerTier chain order ------------------------------------------
{
  // pricing_tier wins over tier.
  assert.equal(resolveCustomerTier({ pricing_tier: 'WHOLESALE', tier: 'contract' }), 'wholesale');
  // tier used when pricing_tier absent/blank.
  assert.equal(resolveCustomerTier({ tier: ' Contract ' }), 'contract');
  // settings.default_tier when customer fields blank.
  assert.equal(resolveCustomerTier({}, { settings: { default_tier: 'VIP' } }), 'vip');
  // hard default.
  assert.equal(resolveCustomerTier({}), 'retail');
  assert.equal(resolveCustomerTier(null), 'retail');
  assert.equal(resolveCustomerTier('not-an-object'), 'retail');
  // numeric storage form resolves to its key.
  assert.equal(resolveCustomerTier({ pricing_tier: 2 }), '2');
  assert.equal(resolveCustomerTier({ pricing_tier: 8 }), '8');
}

// --- unknown-tier skip + flag (legacy resolveTierNumber parity) ---------------
{
  const info = resolveCustomerTierInfo({ pricing_tier: 'gold' });
  assert.equal(info.tier, 'retail', 'unknown pricing_tier falls to hard default');
  assert.equal(info.unknown, true, 'flag raised');
  assert.deepEqual(info.unknown_tiers, ['gold']);
  assert.equal(info.source, 'hard_default');
  assert.equal(info.known, true, 'resolved default is known');

  // Unknown first candidate falls THROUGH to a valid tier field.
  const skip = resolveCustomerTierInfo({ pricing_tier: 'platinum', tier: 'wholesale' });
  assert.equal(skip.tier, 'wholesale');
  assert.equal(skip.source, 'tier');
  assert.deepEqual(skip.unknown_tiers, ['platinum']);

  // Unknown customer fields → configured default_tier beats hard default.
  const cfg = resolveCustomerTierInfo({ pricing_tier: 9 }, { settings: { default_tier: 'contract' } });
  assert.equal(cfg.tier, 'contract');
  assert.equal(cfg.source, 'settings_default');
  assert.equal(cfg.unknown, true);
  assert.deepEqual(cfg.unknown_tiers, ['9']);

  // Out-of-range numerics are unknown; in-range always resolves.
  assert.equal(resolveCustomerTier({ pricing_tier: 0 }), 'retail');
  assert.equal(resolveCustomerTierInfo({ pricing_tier: 0 }).unknown, true);
  assert.equal(resolveCustomerTier({ pricing_tier: 9 }), 'retail');
  assert.equal(resolveCustomerTierInfo({ pricing_tier: 5 }).source, 'pricing_tier');

  // Catalog-configured unknown name becomes resolvable.
  const catalog = { tiers: [{ tier_number: 9, tier_name: 'Gold' }] };
  const viaCatalog = resolveCustomerTierInfo({ pricing_tier: 'gold' }, catalog);
  assert.equal(viaCatalog.tier, 'gold');
  assert.equal(viaCatalog.unknown, false);

  // Info echo fields.
  const plain = resolveCustomerTierInfo({ pricing_tier: 'VIP' });
  assert.equal(plain.source, 'pricing_tier');
  assert.equal(plain.raw, 'VIP');
  assert.equal(plain.default_tier, 'retail');
  assert.equal(plain.unknown, false);
}

// --- tierRowApplies -------------------------------------------------------------
{
  assert.equal(tierRowApplies({ customer_tier: 'wholesale' }, 'wholesale'), true, 'exact');
  assert.equal(tierRowApplies({ customer_tier: 'Wholesale' }, 'WHOLESALE'), true, 'normalized');
  assert.equal(tierRowApplies({ customer_tier: '2' }, 2), true, 'numeric pin vs numeric tier');
  assert.equal(tierRowApplies({ customer_tier: 'wholesale' }, 'retail'), false, 'mismatch');
  assert.equal(tierRowApplies({ customer_tier: '*' }, 'anything'), true, 'wildcard');
  assert.equal(tierRowApplies({ customer_tier: ' * ' }, 3), true, 'wildcard trims');
  assert.equal(tierRowApplies({ customer_tier: '' }, 'vip'), true, 'blank pin = all tiers');
  assert.equal(tierRowApplies({}, 'vip'), true, 'missing pin = all tiers');
  // GlobalPricingTier.rules[] pin field `tier` is honored too.
  assert.equal(tierRowApplies({ tier: 'contract' }, 'contract'), true, 'tier-field pin');
  assert.equal(tierRowApplies({ tier: '*' }, 'retail'), true, 'tier-field wildcard');
  assert.equal(tierRowApplies({ customer_tier: '2' }, { tier_number: 2, tier_name: 'Wholesale' }), true, 'object tier key set');
  assert.equal(tierRowApplies({ customer_tier: 'wholesale' }, { tier_number: 2, tier_name: 'Wholesale' }), true, 'name pin vs object');
  assert.equal(tierRowApplies(null, 'retail'), false, 'non-row');
  assert.equal(tierRowApplies('row', 'retail'), false);
  assert.equal(tierRowApplies({ customer_tier: 'wholesale' }, ''), false, 'blank tier never matches a pin');
}

// --- tierAssignmentPatch ---------------------------------------------------------
{
  const p = tierAssignmentPatch({ id: 'c1' }, 3, { actor_id: 'admin@x.com', now: '2026-11-02T12:00:00Z' });
  assert.deepEqual(p, {
    pricing_tier: 3,
    pricing_tier_set_by: 'admin@x.com',
    pricing_tier_set_at: '2026-11-02T12:00:00Z',
  }, 'numeric tier writes the schema number');

  const named = tierAssignmentPatch({ id: 'c1' }, 'WHOLESALE', { actor_id: 'a@b', now: '2026-01-01' });
  assert.equal(named.pricing_tier, 'wholesale', 'named tier writes normalized key');
  assert.equal(named.pricing_tier_set_at, '2026-01-01');
  assert.equal(named.pricing_tier_set_by, 'a@b');

  assert.throws(() => tierAssignmentPatch({ id: 'c1' }, 'platinum'), /unknown pricing tier "platinum"/);
  assert.throws(() => tierAssignmentPatch({ id: 'c1' }, 9), /unknown pricing tier "9"/);
  assert.throws(() => tierAssignmentPatch({ id: 'c1' }, ''), /required/);
  assert.throws(() => tierAssignmentPatch({ id: 'c1' }, null), /required/);

  // Catalog-configured tier passes validation.
  const cfg = tierAssignmentPatch({ id: 'c1' }, 'gold', { tiers: [{ tier_number: 9, tier_name: 'Gold' }], actor_id: 'a', now: '2026-02-02' });
  assert.equal(cfg.pricing_tier, 'gold');

  // now omitted → ISO stamp generated.
  const stamped = tierAssignmentPatch({ id: 'c1' }, 1, { actor_id: 'a' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(stamped.pricing_tier_set_at), 'default ISO stamp');
}

// --- effectiveTierForQuote ---------------------------------------------------------
{
  // Estimate override wins over customer default.
  assert.equal(effectiveTierForQuote({ pricing_tier: 1 }, { estimate: { pricing_tier: 4 } }), '4');
  assert.equal(effectiveTierForQuote({ pricing_tier: 'retail' }, { estimate: { pricing_tier: 'VIP' } }), 'vip');
  // Blank estimate → customer resolution.
  assert.equal(effectiveTierForQuote({ pricing_tier: 2 }, { estimate: {} }), '2');
  assert.equal(effectiveTierForQuote({ pricing_tier: 2 }, { estimate: null }), '2');
  assert.equal(effectiveTierForQuote({ pricing_tier: 2 }, {}), '2');
  assert.equal(effectiveTierForQuote({}, { estimate: { pricing_tier: '' } }), 'retail');
  // Aliases tolerated on estimate-likes.
  assert.equal(effectiveTierForQuote({}, { estimate: { customer_pricing_tier: 5 } }), '5');

  const info = effectiveTierForQuoteInfo({ pricing_tier: 1 }, { estimate: { pricing_tier: 'gold' } });
  assert.equal(info.tier, 'gold', 'present override honored verbatim');
  assert.equal(info.source, 'estimate');
  assert.equal(info.estimate_known, false, 'unknown override flagged for UI');
  assert.equal(info.customer.tier, '1', 'customer default still resolved for audit');

  const noEst = effectiveTierForQuoteInfo({ pricing_tier: 'contract' }, { estimate: {} });
  assert.equal(noEst.source, 'customer');
  assert.equal(noEst.tier, 'contract');
}

// --- defaultTier / tierLabel ---------------------------------------------------------
{
  assert.equal(defaultTier({ settings: { default_tier: 'Contract' } }), 'contract');
  assert.equal(defaultTier({ settings: { setting_value: { default_tier: 3 } } }), '3');
  assert.equal(defaultTier({}), 'retail');
  assert.equal(tierLabel(2, { tiers: [{ tier_number: 2, tier_name: 'Wholesale' }] }), 'Wholesale');
  assert.equal(tierLabel(4), 'Tier 4', 'numeric with no catalog → Tier N');
  assert.equal(tierLabel('vip'), 'VIP');
  assert.equal(tierLabel('friends & family'), 'Friends & Family');
  assert.equal(tierLabel(''), '');
}

// --- F-03 engine interop: resolved tier feeds resolveTier precedence --------------
// The resolved key drops into resolveTier.customerTier and promotes tier-pinned
// chart rows into the customer_tier layer (F-27 specificity: cat+tier 3 >
// cat-only 2 > tier-only 1 > blank 0).
{
  const rules = [
    { name: 'blank default', markup_pct: 50 },
    { name: 'tier2 chart', customer_tier: '2', markup_pct: 30 },
  ];
  const customer = { pricing_tier: 2 };
  const tier = resolveCustomerTier(customer);
  const res = resolveTier({ customerTier: tier, tierRules: rules });
  assert.equal(res.source, 'customer_tier', 'tier key promotes the tier-pinned row');
  assert.equal(res.rule.markupPct, 30);
  assert.equal(res.matchedRow.name, 'tier2 chart');

  // pricePart end-to-end: unitCost 2 x 1.30 = 2.6 unit; qty 10 → 26.00.
  const priced = pricePart({ qty: 10, unitCost: 2, customerTier: effectiveTierForQuote(customer, {}), tierRules: rules });
  assert.equal(priced.tier.source, 'customer_tier');
  assert.equal(priced.unitPrice, 2.6);
  assert.equal(priced.total, 26);

  // Estimate-level override re-keys the engine pick — tier '5' chart row wins.
  const estRules = [...rules, { name: 'tier5 chart', customer_tier: '5', markup_pct: 10 }];
  const estPriced = pricePart({
    qty: 10, unitCost: 2,
    customerTier: effectiveTierForQuote(customer, { estimate: { pricing_tier: 5 } }),
    tierRules: estRules,
  });
  assert.equal(estPriced.tier.matchedRow.name, 'tier5 chart');
  assert.equal(estPriced.unitPrice, 2.2);

  // F-27 parity: category-only row outranks a BARE tier row inside the chart.
  const catRules = [
    { name: 'tier2 bare', customer_tier: '2', markup_pct: 30 },
    { name: 'banners default', category: 'banners', markup_pct: 55 },
    { name: 'banners tier2', category: 'banners', customer_tier: '2', markup_pct: 25 },
    { name: 'blank global', markup_pct: 50 },
  ];
  const catRes = resolveTier({ customerTier: '2', category: 'banners', tierRules: catRules });
  assert.equal(catRes.matchedRow.name, 'banners tier2', 'cat+tier (3) beats cat-only (2)');
  const catOnly = resolveTier({ customerTier: '7', category: 'banners', tierRules: catRules.filter((r) => r.name !== 'banners tier2') });
  assert.equal(catOnly.matchedRow.name, 'banners default', 'cat-only (2) beats unmatched tier + blank');
  const bareBeats = resolveTier({ customerTier: '2', category: 'posters', tierRules: catRules });
  assert.equal(bareBeats.matchedRow.name, 'tier2 bare', 'tier-only (1) beats blank (0) — cat rows out of scope');
}

rmSync(out, { force: true });
rmSync(outEngine, { force: true });
console.log('PASS customer-tier');
