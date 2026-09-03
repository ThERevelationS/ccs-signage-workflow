import { base44 } from "@/api/base44Client";
import { applyMarkups, parseVolumeDiscountBrackets, parseVolumeDiscountCategories } from "./markupEngine";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function resolveTierNumber({ project, customer, requestedTierNumber, tiers }) {
  const candidates = [
    requestedTierNumber,
    project?.customer_pricing?.tier_number,
    project?.customer_pricing_tier,
    customer?.pricing_tier,
    1,
  ];
  for (const candidate of candidates) {
    const tierNumber = num(candidate, NaN);
    if (Number.isFinite(tierNumber) && (tiers || []).some((tier) => num(tier.tier_number) === tierNumber)) {
      return tierNumber;
    }
  }
  return num(tiers?.[0]?.tier_number, 1);
}

const isNotFoundError = (error) => Number(error?.response?.status || error?.status || error?.statusCode || 0) === 404;

export async function loadCustomerPricingConfig(project = {}) {
  try {
    const [tiers, categories, settings, customer] = await Promise.all([
      // Tier definitions and pricing Settings directly change customer selling
      // price, so a read failure must never masquerade as "not configured".
      base44.entities.MarkupTier.list("sort_order"),
      // Category records only provide display labels; pricing lines already carry
      // their category keys, so this metadata may remain non-blocking.
      base44.entities.MarkupCategory.list("sort_order").catch(() => []),
      base44.entities.Settings.filter({ category: "pricing" }),
      project?.customer_id
        ? base44.entities.Customer.get(project.customer_id).catch((error) => {
            // Preserve legacy projects whose historical Customer record no longer
            // exists, but fail closed on permission/network/service read errors.
            if (isNotFoundError(error)) return null;
            throw error;
          })
        : Promise.resolve(null),
    ]);

    const defaultTierNumber = resolveTierNumber({ project, customer, tiers });
    return { tiers: tiers || [], categories: categories || [], settings: settings || [], customer, defaultTierNumber };
  } catch (error) {
    throw new Error(`Customer pricing configuration could not be verified: ${error?.message || "unknown read error"}`);
  }
}

export function calculateCustomerPricingFromConfig({ project, categorize, tierNumber, tiers = [], settings = [], customer = null }) {
  if (!project || typeof categorize !== "function" || !tiers.length) return null;
  const resolvedTierNumber = resolveTierNumber({ project, customer, requestedTierNumber: tierNumber, tiers });
  const selectedTier = tiers.find((tier) => num(tier.tier_number) === resolvedTierNumber) || tiers[0];
  const lines = categorize(project) || [];
  if (!selectedTier || !lines.length) return null;

  const result = applyMarkups(lines, selectedTier, {
    brackets: parseVolumeDiscountBrackets(settings),
    eligibleCategoryKeys: parseVolumeDiscountCategories(settings),
  });

  return {
    applied: true,
    tier_number: num(selectedTier.tier_number, resolvedTierNumber),
    tier_name: selectedTier.tier_name || `Tier ${resolvedTierNumber}`,
    customer_default_tier: num(customer?.pricing_tier, 1),
    raw_subtotal: num(result?.totals?.raw_subtotal),
    marked_subtotal: num(result?.totals?.marked_subtotal),
    eligible_subtotal: num(result?.totals?.eligible_subtotal),
    volume_discount_pct: num(result?.totals?.volume_discount_pct),
    total: num(result?.totals?.grand_total),
    saved_at: new Date().toISOString(),
    lines: (result?.lines || []).map((line) => ({
      module: line.module || "",
      label: line.label || "",
      category_key: line.category_key || "",
      cost: num(line.cost),
      markup_multiplier: num(line.markup_multiplier, 1),
      marked_up_cost: num(line.marked_up_cost),
      volume_discount_applied: num(line.volume_discount_applied),
      final_cost: num(line.final_cost),
    })),
  };
}

export async function calculateSavedCustomerPricing({ project, categorize, tierNumber }) {
  const config = await loadCustomerPricingConfig(project);
  return calculateCustomerPricingFromConfig({
    project,
    categorize,
    tierNumber,
    tiers: config.tiers,
    settings: config.settings,
    customer: config.customer,
  });
}
