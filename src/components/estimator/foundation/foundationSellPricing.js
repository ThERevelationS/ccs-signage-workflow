// Foundation (Concrete | Masonry | Poles) sell-price engine wire (F-23h) —
// module-side glue.
//
// The shared wire (base44/shared/foundationPricingWire.ts) is intentionally
// import-free; this file is the composition root that injects the real engine
// functions and merges caller-supplied registries with the record-embedded
// engine context. Wired into customerPricing.sourceProjectEconomics for
// module_key "foundation" — when no foundation component carries
// pricing-engine config AND no context block exists the resolution is a
// passthrough and the module sell price is returned verbatim (zero
// regression).
//
// Registry context (`pricingContext`) is OPTIONAL today: config embedded on
// the record (component-scoped `<component>_pricing` blocks, `<component>_*
// ` flat fields, engine_pricing blocks w/ embedded registries) resolves
// without any entity reads. Callers that have PricingTierMatrix /
// PricingTemplate / GlobalPricingTier / MarkupTier rows loaded may pass them
// as { tierRules|tier_rules, templates, tiers, customerTier|customer_tier,
// defaultMarkupPct|default_markup_pct, now } to unlock registry-backed
// tier/template references.

import { pricePart, matrixRowsToRules } from "../../../../base44/shared/pricingEngine.ts";
import { resolveTemplatePrice, templatePartDescriptor } from "../../../../base44/shared/pricingTemplateModel.ts";
import {
  resolveFoundationSellPricing,
  foundationEngineConfigured,
  foundationPricingContextOf,
} from "../../../../base44/shared/foundationPricingWire.ts";

const ENGINE = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

/**
 * Full resolution — engine-priced sell for engine-configured foundation
 * projects. Never throws: malformed input/config degrades to a passthrough
 * result.
 *
 * @param {object} record       FoundationProject-like record
 * @param {object} opts
 * @param {number} opts.baselineSell  module sell price
 *        (customer_price_override, else cost x (1+customer_markup_percent/100))
 * @param {number} [opts.internalCost] module internal cost (split-total sum)
 * @param {number} [opts.markupPercent] baseline sell factor
 *        (default record.customer_markup_percent)
 * @param {object} [opts.pricingContext] caller-loaded registries (optional)
 * @param {*}      [opts.now]    effective-window override (tests)
 * @returns {object} resolveFoundationSellPricing result ({applied,
 *          customer_price, passthrough, context_engaged, lines, chain,
 *          warnings, ...})
 */
export function resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    // Normalize caller chart rows through the engine's entity adapter so
    // PricingTierMatrix spellings (unit_breaks aliases, status windows) resolve
    // exactly like the pricing admin path.
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = foundationPricingContextOf(record, caller);
    return resolveFoundationSellPricing({ record, baselineSell, internalCost, markupPercent, context, engine: ENGINE, now });
  } catch {
    // The sell-price seam must never break estimate rendering — a malformed
    // record or config degrades to the module baseline, not an exception.
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}

/**
 * Seam helper — engine-owned economics for a foundation source record.
 * Returns null when the record carries no engine config (the caller then
 * keeps today's numbers byte-identically); when config resolves the engine
 * owns the sell side — including over a legacy saved customer_pricing
 * snapshot (parity with the F-23a..F-23g channel/vinyl/brick/cnc/laser/metal
 * wires).
 */
export function foundationEngineEconomics(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  const res = resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now });
  return res && res.applied === true
    ? { internalCost, customerPrice: res.customer_price, resolution: res }
    : null;
}

/**
 * Convenience — the customer-facing sell price for a foundation source
 * record. Returns the engine total when config resolves, else `baselineSell`
 * verbatim (=== passthrough; the byte-identical zero-regression path).
 */
export function foundationEngineCustomerPrice(record, { baselineSell, internalCost, markupPercent, pricingContext, now } = {}) {
  const res = resolveFoundationEngineSell(record, { baselineSell, internalCost, markupPercent, pricingContext, now });
  return res && res.applied === true ? res.customer_price : baselineSell;
}

/**
 * Detection only — does this foundation record carry engine config (a
 * context block or at least one configured component)? Useful for
 * badges/tests without running the full resolution.
 */
export function foundationHasEnginePricing(record) {
  try {
    return foundationEngineConfigured(record) === true;
  } catch {
    return false;
  }
}
