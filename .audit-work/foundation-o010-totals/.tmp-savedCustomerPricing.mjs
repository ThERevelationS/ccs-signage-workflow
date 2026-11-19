// .audit-work/foundation-o010-totals/fixture/stubs/base44Client.mjs
var registry = globalThis.__b44EntityRegistry ??= /* @__PURE__ */ new Map();
var emptyEntity = () => ({
  get: async () => null,
  filter: async () => [],
  list: async () => [],
  create: async (row) => ({ id: "stub", ...row }),
  update: async (_id, row) => row,
  delete: async () => ({})
});
var base44 = {
  entities: new Proxy({}, {
    get: (_t, name) => registry.get(name) || emptyEntity()
  }),
  functions: { invoke: async () => ({ data: {} }) }
};

// .audit-work/foundation-o010-totals/fixture/src/components/markup/markupEngine.jsx
function getMarkup(tier, categoryKey) {
  if (!tier || !tier.markups) return 1;
  const v = tier.markups[categoryKey];
  return typeof v === "number" && v > 0 ? v : 1;
}
function parseVolumeDiscountBrackets(settings) {
  const get = (name) => {
    const s = settings.find((x) => x.setting_name === name);
    return s ? parseFloat(s.setting_value) : null;
  };
  const brackets = [];
  for (let i = 1; i <= 4; i++) {
    const min = get(`volume_discount_bracket_${i}_min`);
    const pct = get(`volume_discount_bracket_${i}_pct`);
    if (min !== null && pct !== null) brackets.push({ min, pct });
  }
  return brackets.sort((a, b) => b.min - a.min);
}
function parseVolumeDiscountCategories(settings) {
  const s = settings.find((x) => x.setting_name === "volume_discount_applies_to");
  if (!s) return [];
  return s.setting_value.split(",").map((x) => x.trim()).filter(Boolean);
}
function getVolumeDiscountPct(eligibleSubtotal, brackets) {
  for (const b of brackets) {
    if (eligibleSubtotal >= b.min) return b.pct;
  }
  return 0;
}
var _applyCache = /* @__PURE__ */ new WeakMap();
function applyMarkups(lines, tier, settings) {
  if (!lines || typeof lines !== "object") return _applyMarkupsComputed(lines, tier, settings);
  const settingsKey = JSON.stringify(settings || {});
  let byTier = _applyCache.get(lines);
  const hit = byTier?.get(tier);
  if (hit && hit.key === settingsKey) return hit.out;
  const out = _applyMarkupsComputed(lines, tier, settings);
  if (!byTier) {
    byTier = /* @__PURE__ */ new Map();
    _applyCache.set(lines, byTier);
  }
  byTier.set(tier, { key: settingsKey, out });
  return out;
}
function _applyMarkupsComputed(lines, tier, settings) {
  const { brackets = [], eligibleCategoryKeys = [], categoryFlags = {} } = settings || {};
  const isDiscountEligible = (key) => eligibleCategoryKeys.includes(key) && categoryFlags[key] !== false;
  const marked = lines.map((line) => {
    const cost = Number(line.cost) || 0;
    const markup = getMarkup(tier, line.category_key);
    const markedCost = cost * markup;
    return {
      ...line,
      cost,
      markup_multiplier: markup,
      marked_up_cost: markedCost
    };
  });
  const eligibleSubtotal = marked.filter((l) => isDiscountEligible(l.category_key)).reduce((sum, l) => sum + l.marked_up_cost, 0);
  const volumeDiscountPct = getVolumeDiscountPct(eligibleSubtotal, brackets);
  const volumeDiscountFactor = 1 - volumeDiscountPct / 100;
  const finalLines = marked.map((line) => {
    const isEligible = isDiscountEligible(line.category_key);
    const final = isEligible ? line.marked_up_cost * volumeDiscountFactor : line.marked_up_cost;
    return {
      ...line,
      volume_discount_applied: isEligible ? volumeDiscountPct : 0,
      final_cost: final
    };
  });
  const rawSubtotal = finalLines.reduce((s, l) => s + l.cost, 0);
  const markedSubtotal = finalLines.reduce((s, l) => s + l.marked_up_cost, 0);
  const grandTotal = finalLines.reduce((s, l) => s + l.final_cost, 0);
  const mergedLines = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const l of finalLines) {
    const key = l.category_key || "";
    const existing = byKey.get(key);
    if (!existing) {
      const g = { ...l, merged_count: 1, base_label: l.label };
      byKey.set(key, g);
      mergedLines.push(g);
    } else {
      existing.merged_count += 1;
      existing.cost += l.cost;
      existing.marked_up_cost += l.marked_up_cost;
      existing.final_cost += l.final_cost;
      existing.label = `${existing.base_label} (+${existing.merged_count - 1} merged)`;
    }
  }
  return {
    lines: mergedLines,
    detail_lines: finalLines,
    totals: {
      raw_subtotal: rawSubtotal,
      marked_subtotal: markedSubtotal,
      eligible_subtotal: eligibleSubtotal,
      volume_discount_pct: volumeDiscountPct,
      grand_total: grandTotal
    }
  };
}

// .audit-work/foundation-o010-totals/fixture/stubs/loadAllEntityRows.mjs
async function loadAllEntityRows({ entity } = {}) {
  return entity?.__rows ?? [];
}

// .audit-work/foundation-o010-totals/fixture/src/components/markup/savedCustomerPricing.js
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function resolveTierNumber({ project, customer, requestedTierNumber, tiers }) {
  const candidates = [
    requestedTierNumber,
    project?.customer_pricing?.tier_number,
    project?.customer_pricing_tier,
    customer?.pricing_tier,
    1
  ];
  for (const candidate of candidates) {
    const tierNumber = num(candidate, NaN);
    if (Number.isFinite(tierNumber) && (tiers || []).some((tier) => num(tier.tier_number) === tierNumber)) {
      return tierNumber;
    }
  }
  return num(tiers?.[0]?.tier_number, 1);
}
var isNotFoundError = (error) => Number(error?.response?.status || error?.status || error?.statusCode || 0) === 404;
async function loadCustomerPricingConfig(project = {}) {
  try {
    const [tiers, categories, settings, customer] = await Promise.all([
      // Tier definitions and pricing Settings directly change customer selling
      // price, so a read failure must never masquerade as "not configured".
      loadAllEntityRows({ entity: base44.entities.MarkupTier, sort: "sort_order", label: "Customer pricing markup tiers" }),
      // Category records only provide display labels; pricing lines already carry
      // their category keys, so this metadata may remain non-blocking.
      loadAllEntityRows({ entity: base44.entities.MarkupCategory, sort: "sort_order", label: "Customer pricing markup categories" }).catch(() => []),
      loadAllEntityRows({ entity: base44.entities.Settings, query: { category: "pricing" }, sort: null, label: "Customer pricing settings" }),
      project?.customer_id ? base44.entities.Customer.get(project.customer_id).catch((error) => {
        if (isNotFoundError(error)) return null;
        throw error;
      }) : Promise.resolve(null)
    ]);
    const defaultTierNumber = resolveTierNumber({ project, customer, tiers });
    return { tiers: tiers || [], categories: categories || [], settings: settings || [], customer, defaultTierNumber };
  } catch (error) {
    throw new Error(`Customer pricing configuration could not be verified: ${error?.message || "unknown read error"}`);
  }
}
function calculateCustomerPricingFromConfig({ project, categorize, tierNumber, tiers = [], settings = [], customer = null, categories = [] }) {
  if (!project || typeof categorize !== "function" || !tiers.length) return null;
  const resolvedTierNumber = resolveTierNumber({ project, customer, requestedTierNumber: tierNumber, tiers });
  const selectedTier = tiers.find((tier) => num(tier.tier_number) === resolvedTierNumber) || tiers[0];
  const lines = categorize(project) || [];
  if (!selectedTier || !lines.length) return null;
  const categoryFlags = Object.fromEntries(
    (categories || []).map((c) => [c?.category_key, c?.volume_discount_eligible]).filter(([k]) => k)
  );
  const result = applyMarkups(lines, selectedTier, {
    brackets: parseVolumeDiscountBrackets(settings),
    eligibleCategoryKeys: parseVolumeDiscountCategories(settings),
    categoryFlags
  });
  return {
    applied: true,
    tier_number: num(selectedTier.tier_number, resolvedTierNumber),
    tier_name: selectedTier.tier_name || `Tier ${resolvedTierNumber}`,
    tier_updated_date: String(selectedTier?.updated_date || ""),
    customer_default_tier: num(customer?.pricing_tier, 1),
    raw_subtotal: num(result?.totals?.raw_subtotal),
    marked_subtotal: num(result?.totals?.marked_subtotal),
    eligible_subtotal: num(result?.totals?.eligible_subtotal),
    volume_discount_pct: num(result?.totals?.volume_discount_pct),
    total: num(result?.totals?.grand_total),
    saved_at: (/* @__PURE__ */ new Date()).toISOString(),
    lines: (result?.lines || []).map((line) => ({
      module: line.module || "",
      label: line.label || "",
      category_key: line.category_key || "",
      cost: num(line.cost),
      markup_multiplier: num(line.markup_multiplier, 1),
      marked_up_cost: num(line.marked_up_cost),
      volume_discount_applied: num(line.volume_discount_applied),
      final_cost: num(line.final_cost)
    }))
  };
}
async function calculateSavedCustomerPricing({ project, categorize, tierNumber }) {
  const config = await loadCustomerPricingConfig(project);
  return calculateCustomerPricingFromConfig({
    project,
    categorize,
    tierNumber,
    tiers: config.tiers,
    settings: config.settings,
    customer: config.customer,
    categories: config.categories
  });
}
export {
  calculateCustomerPricingFromConfig,
  calculateSavedCustomerPricing,
  loadCustomerPricingConfig
};
