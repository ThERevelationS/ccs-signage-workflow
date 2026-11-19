// F-23a — channel-module sell-price boundary for the shared pricing engine.
//
// customerPricing.sourceProjectEconomics calls this for every channel_letters
// record. It injects the shared engine (pricePart + the PricingTemplate seam
// from pricingTemplateModel) into base44/shared/channelPricingWire.ts and
// returns the wired economics, or null when the record carries no engine
// config — in which case the caller keeps today's numbers byte-identically.
//
// Config detection (see channelPricingWire.ts entity contract):
//   record.pricing_engine|engine_pricing|pricing_tier_config|pricing_context|
//   customer_pricing.engine_context|pricing_engine — context block;
//   per-line descriptors on items[]/letter_purchases[]/selected_equipment[]/
//   personnel[] — part/pricing/tier_ref/fixed_price/per_unit_breaks/
//   markup_pct/market_*/pricing_template(_id)/machine fields.
// Legacy customer_pricing/pricing_tier/customer_tier alone never engage —
// they only feed an explicit pricing_engine block as the customer-tier hint.

import { pricePart } from "../../../../base44/shared/pricingEngine.ts";
import { resolveTemplatePrice, templatePartDescriptor } from "../../../../base44/shared/pricingTemplateModel.ts";
import { channelEngineEconomics } from "../../../../base44/shared/channelPricingWire.ts";

const ENGINE = { pricePart, resolveTemplatePrice, templatePartDescriptor };

/**
 * @param {object} record  saved ChannelLetterInstallation record
 * @param {object} economics  { internalCost, customerPrice } — today's values
 * @returns {object|null}  wired economics ({wired, internalCost, customerPrice,
 *   sell, lines, context, chain}) or null when the record is not engine-configured
 */
export function channelSellEconomics(record, economics) {
  const wired = channelEngineEconomics({
    record,
    internalCost: economics?.internalCost,
    customerPrice: economics?.customerPrice,
    engine: ENGINE,
  });
  return wired?.wired === true ? wired : null;
}
