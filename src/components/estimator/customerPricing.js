import { channelSellEconomics } from "./channel/channelSellPricing";

import { vinylEngineEconomics } from "./vinyl/vinylEnginePricing";

import { brickEngineEconomics } from "./brick/brickSellPricing";

import { cncEngineEconomics } from "./cnc/cncSellPricing";

import { metalEngineEconomics } from "./metal/metalSellPricing";

import { laserEngineEconomics } from "./laser/laserSellPricing";

import { paintEngineEconomics } from "./paint/paintSellPricing";

import { foundationEngineEconomics } from "./foundation/foundationSellPricing";

import { customItemsEngineEconomics } from "./customItems/customItemsSellPricing";

import { maintenanceEngineEconomics } from "./maintenance/maintenanceSellPricing";

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
    const baselineSell = override > 0 ? override : cost * (1 + markupPercent / 100);
    // F-23h pricing-engine wire: when the saved foundation record explicitly
    // carries engine config (engine_pricing-style context block or component-
    // scoped descriptors on the persisted split-total cost components), the
    // shared engine owns the sell side and wins over a legacy saved
    // customer_pricing snapshot. The module cost math above stays
    // authoritative; with no config the wire returns null and the record
    // keeps today's numbers byte-identically — the manual markup/override
    // and the saved Markup-Tier snapshot still apply.
    const wired = foundationEngineEconomics(record, { baselineSell, internalCost: cost, markupPercent, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost: cost, customerPrice: baselineSell });
  }

  if (["vinyl", "brick_stone", "maintenance"].includes(moduleKey)) {
    const internalCost = hasNumericValue(record.subtotal)
      ? num(record.subtotal)
      : total - num(record.markup_amount);
    // F-23b/F-23c/F-23i pricing-engine wires: when the saved vinyl/brick/
    // maintenance record explicitly carries engine config (pricing_engine/
    // engine_pricing context block or per-line/component tier/template
    // descriptors), the shared engine owns the sell side and wins over a
    // legacy saved customer_pricing snapshot. The module cost math above
    // stays authoritative; with no config this returns null and the record
    // keeps today's numbers byte-identically.
    const wired = moduleKey === "vinyl"
      ? vinylEngineEconomics(record, { baselineSell: total, internalCost, pricingContext })
      : moduleKey === "brick_stone"
        ? brickEngineEconomics(record, { baselineSell: total, internalCost, pricingContext })
        : moduleKey === "maintenance"
          ? maintenanceEngineEconomics(record, { baselineSell: total, internalCost, pricingContext })
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

  if (moduleKey === "cnc") {
    // F-23d pricing-engine wire: when the saved CNC record explicitly carries
    // engine config (engine_pricing-style context block or per-line
    // tier/template descriptors on items[]), the shared engine owns the sell
    // side and wins over a legacy saved customer_pricing snapshot. CNC
    // total_cost is a pure cost total (no module markup), so the internal
    // cost and the sell baseline are the same number. With no config the
    // wire returns null and the record keeps today's numbers
    // byte-identically — the saved Markup-Tier snapshot still applies.
    const wired = cncEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }

  if (moduleKey === "laser") {
    // F-23e pricing-engine wire: when the saved laser record explicitly
    // carries engine config (engine_pricing-style context block or per-line
    // tier/template descriptors on items[]), the shared engine owns the sell
    // side and wins over a legacy saved customer_pricing snapshot. Laser
    // total_cost is a pure cost total (no module markup), so the internal
    // cost and the sell baseline are the same number. With no config the
    // wire returns null and the record keeps today's numbers
    // byte-identically — the saved Markup-Tier snapshot still applies.
    const wired = laserEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }

  if (moduleKey === "metal") {
    const internalCost = hasNumericValue(record.subtotal)
      ? num(record.subtotal)
      : total - num(record.markup_amount);
    // F-23f pricing-engine wire: when the saved metal record explicitly
    // carries engine config (engine_pricing-style context block or per-line
    // tier/template descriptors on items[]), the shared engine owns the sell
    // side and wins over a legacy saved customer_pricing snapshot. The
    // module cost math above stays authoritative; with no config the wire
    // returns null and the record keeps today's numbers byte-identically —
    // the saved Markup-Tier snapshot still applies.
    const wired = metalEngineEconomics(record, { baselineSell: total, internalCost, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost, customerPrice: total });
  }

  if (moduleKey === "painting") {
    // F-23g pricing-engine wire: when the saved paint record explicitly
    // carries engine config (engine_pricing-style context block or per-line
    // tier/template descriptors on items[]), the shared engine owns the sell
    // side and wins over a legacy saved customer_pricing snapshot. Paint
    // records have no total_cost field and no module markup — the baseline
    // sell is the pure cost sum (total_paint_mask_cost +
    // total_liquid_paint_and_supplies_cost + total_labor_cost via
    // sourceProjectTotal's painting branch, which `total` resolves to since
    // record.total_cost is absent) — so the internal cost and the sell
    // baseline are the same number. With no config the wire returns null
    // and the record keeps today's numbers byte-identically — the saved
    // Markup-Tier snapshot still applies.
    const wired = paintEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost: total, customerPrice: total });
  }

  if (moduleKey === "custom_items") {
    // F-23j pricing-engine wire: when the saved custom-items record explicitly
    // carries engine config (engine_pricing-style context block or per-line
    // tier/template descriptors on items[]), the shared engine owns the sell
    // side and wins over a legacy saved customer_pricing snapshot.
    // CustomItemsProject.total_cost is a pure cost total (sum of the
    // extended item_total_cost fields — no module markup), so the internal
    // cost and the sell baseline are the same number. With no config the
    // wire returns null and the record keeps today's numbers
    // byte-identically — the fallback economics and the saved Markup-Tier
    // snapshot still apply.
    const wired = customItemsEngineEconomics(record, { baselineSell: total, internalCost: total, pricingContext });
    if (wired) {
      return {
        internalCost: wired.internalCost,
        customerPrice: wired.customerPrice,
        pricing_engine: wired.resolution,
      };
    }
    return withSavedTier({ internalCost: fallback, customerPrice: fallback });
  }

  return withSavedTier({ internalCost: fallback, customerPrice: fallback });
}