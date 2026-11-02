// Custom-items sell-price engine wire (F-23j) — module-side glue.
//
// The shared wire (base44/shared/customItemsPricingWire.ts) is intentionally
// import-free; this file is the composition root that injects the real engine
// functions and merges caller-supplied registries with the record-embedded
// engine context. Wired into customerPricing.sourceProjectEconomics for
// module_key "custom_items" — when no custom-items line carries
// pricing-engine config the resolution is a passthrough and the module sell
// price is returned verbatim (zero regression).
//
// Registry context (`pricingContext`) is OPTIONAL today: config embedded on
// the record/items (item pricing fields, engine_pricing blocks, embedded
// templates/tier rules) resolves without any entity reads. Callers that have
// PricingTierMatrix / PricingTemplate / GlobalPricingTier / MarkupTier rows
// loaded may pass them as { tierRules|tier_rules, templates, tiers,
// customerTier|customer_tier, defaultMarkupPct|default_markup_pct, now } to
// unlock registry-backed tier/template references.

import { pricePart, matrixRowsToRules } from "../../../../base44/shared/pricingEngine.ts";
import { resolveTemplatePrice, templatePartDescriptor } from "../../../../base44/shared/pricingTemplateModel.ts";
import {
  resolveCustomItemsSellPricing,
  customItemsConfigScan,
  customItemsPricingContextOf,
} from "../../../../base44/shared/customItemsPricingWire.ts";

const ENGINE = Object.freeze({ pricePart, resolveTemplatePrice, templatePartDescriptor });

/**
 * Full resolution — engine-priced sell for config-carrying custom-items
 * lines. Never throws: malformed input/config degrades to a passthrough
 * result.
 *
 * @param {object} record       CustomItemsProject-like record
 * @param {object} opts
 * @param {number} opts.baselineSell  module sell price (record.total_cost)
 * @param {number} [opts.internalCost] module internal cost (record.total_cost)
 * @param {object} [opts.pricingContext] caller-loaded registries (optional)
 * @param {*}      [opts.now]    effective-window override (tests)
 * @returns {object} resolveCustomItemsSellPricing result ({applied,
 *          customer_price, passthrough, lines, chain, warnings, ...})
 */
export function resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  try {
    const caller = pricingContext && typeof pricingContext === "object" ? { ...pricingContext } : {};
    // Normalize caller chart rows through the engine's entity adapter so
    // PricingTierMatrix spellings (unit_breaks aliases, status windows) resolve
    // exactly like the pricing admin path.
    const rawRules = caller.tierRules ?? caller.tier_rules ?? caller.tier_matrix;
    if (Array.isArray(rawRules) && rawRules.length) {
      caller.tierRules = matrixRowsToRules(rawRules, { now: caller.now ?? now });
    }
    const context = customItemsPricingContextOf(record, caller);
    return resolveCustomItemsSellPricing({ record, baselineSell, internalCost, context, engine: ENGINE, now });
  } catch {
    // The sell-price seam must never break estimate rendering — a malformed
    // record or config degrades to the module baseline, not an exception.
    return { applied: false, passthrough: true, reason: "no_engine", customer_price: baselineSell, warnings: [] };
  }
}

/**
 * Seam helper — engine-owned economics for a custom-items source record.
 * Returns null when no custom-items line carries pricing config (the caller
 * then keeps today's numbers byte-identically); when config resolves the
 * engine owns the sell side — including over a legacy saved customer_pricing
 * snapshot (parity with the F-23a..F-23i channel/vinyl/brick/cnc/laser/metal/
 * paint/foundation wires).
 */
export function customItemsEngineEconomics(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true
    ? { internalCost, customerPrice: res.customer_price, resolution: res }
    : null;
}

/**
 * Convenience — the customer-facing sell price for a custom-items source
 * record. Returns the engine total when config resolves, else `baselineSell`
 * verbatim (=== passthrough; the byte-identical zero-regression path).
 */
export function customItemsEngineCustomerPrice(record, { baselineSell, internalCost, pricingContext, now } = {}) {
  const res = resolveCustomItemsEngineSell(record, { baselineSell, internalCost, pricingContext, now });
  return res && res.applied === true ? res.customer_price : baselineSell;
}

/**
 * Detection only — does any custom-items line on this record carry
 * pricing-engine config? Useful for badges/tests without running the full
 * resolution.
 */
export function customItemsHasEnginePricing(record) {
  try {
    return customItemsConfigScan(record).configured === true;
  } catch {
    return false;
  }
}
