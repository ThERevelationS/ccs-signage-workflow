import { channelSellEconomics } from "./channel/channelSellPricing";

import { vinylEngineEconomics } from "./vinyl/vinylEnginePricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function hasNumericValue(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

export function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot)
    ? Number(line.customer_price_snapshot)
    : num(line?.total_snapshot);
}

export function liveCustomerUnitPrice(line) {
  if (hasNumericValue(line?.live_customer_price_snapshot)) return Number(line.live_customer_price_snapshot);
  if (hasNumericValue(line?.customer_price_snapshot)) return Number(line.customer_price_snapshot);
  return num(line?.live_total_snapshot, num(line?.total_snapshot));
}

export function acceptedInternalEstimateCost(lineItems = []) {
  return (lineItems || []).reduce((sum, line) => {
    const quantity = Math.max(0, num(line?.customer_quantity, 1));
    return sum + num(line?.total_snapshot) * quantity;
  }, 0);
}

export function manualCustomerPriceState({ detached = false, recalcRequired = false } = {}) {
  if (detached) return "detached_parts";
  if (recalcRequired) return "changed";
  return "manual";
}

// A Builder's source record may contain both shop/internal cost and an existing
// customer-facing sell-price calculation. Keep those concepts separate without
// changing the Builder's own established formulas.
export function sourceProjectEconomics(moduleKey, record, fallbackTotal = 0, pricingContext = null) {
  const fallback = num(fallbackTotal);
  if (!record) return { internalCost: fallback, customerPrice: fallback };

  const total = num(record.total_cost, fallback);
  const savedTierCustomerPrice = record?.customer_pricing?.applied === true && hasNumericValue(record?.customer_pricing?.total)
    ? num(record.customer_pricing.total)
    : null;
  const withSavedTier = (economics) => savedTierCustomerPrice === null
    ? economics
    : { ...economics, customerPrice: savedTierCustomerPrice };

  if (moduleKey === "foundation") {
    const cost = fallback;
    const markupPercent = num(record.customer_markup_percent);
    const override = num(record.customer_price_override);
    return withSavedTier({
      internalCost: cost,
      customerPrice: override > 0 ? override : cost * (1 + markupPercent / 100),
    });
  }

  if (["vinyl", "brick_stone", "maintenance"].includes(moduleKey)) {
    const internalCost = hasNumericValue(record.subtotal)
      ? num(record.subtotal)
      : total - num(record.markup_amount);
    // F-23b pricing-engine wire: when the saved vinyl record explicitly
    // carries engine config (pricing_engine/engine_pricing context block or
    // per-line tier/template descriptors), the shared engine owns the sell
    // side and wins over a legacy saved customer_pricing snapshot. The module
    // cost math above stays authoritative; with no config this returns null
    // and the record keeps today's numbers byte-identically.
    const wired = moduleKey === "vinyl"
      ? vinylEngineEconomics(record, { baselineSell: total, internalCost, pricingContext })
      : null;
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }

  if (moduleKey === "channel_letters") {
    const letterMarkup = num(record.total_letters_cost) - num(record.letters_subtotal);
    const projectSubtotal = hasNumericValue(record.subtotal)
      ? num(record.subtotal)
      : total - num(record.markup_amount);
    const internalCost = projectSubtotal - letterMarkup;
    // F-23a pricing-engine wire: when the saved record explicitly carries
    // engine config (pricing_engine context block or per-line tier/template
    // descriptors), the shared engine owns the sell side and wins over a
    // legacy saved customer_pricing snapshot. The module cost math above
    // stays authoritative; with no config this returns null and the record
    // keeps today's numbers byte-identically.
    const wired = channelSellEconomics(record, { internalCost, customerPrice: total });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired,
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }

  return withSavedTier({ internalCost: fallback, customerPrice: fallback });
}