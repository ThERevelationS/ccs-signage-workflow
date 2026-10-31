// src/components/markup/markupEngine.jsx
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
function applyCostPlus(lines, config) {
  const cfg = config || {};
  const laborMult = Number(cfg.labor_multiplier) || 1;
  const overheadPct = Number(cfg.overhead_percent) || 0;
  const profitPct = Number(cfg.profit_percent) || 0;
  const catMarkups = cfg.category_markups || {};
  const marked = lines.map((line) => {
    const cost = Number(line.cost) || 0;
    const catPct = Number(catMarkups[line.category_key]) || 0;
    const afterCatMarkup = cost * (1 + catPct / 100);
    const afterBurden = line.is_labor ? afterCatMarkup * laborMult : afterCatMarkup;
    return {
      ...line,
      cost,
      category_markup_pct: catPct,
      labor_burden_applied: line.is_labor ? laborMult : 1,
      marked_up_cost: afterBurden
    };
  });
  const markedSubtotal = marked.reduce((s, l) => s + l.marked_up_cost, 0);
  const overheadAmount = markedSubtotal * (overheadPct / 100);
  const afterOverhead = markedSubtotal + overheadAmount;
  const profitAmount = afterOverhead * (profitPct / 100);
  const grandTotal = afterOverhead + profitAmount;
  const totalLift = markedSubtotal > 0 ? grandTotal / markedSubtotal : 1;
  const finalLines = marked.map((line) => ({
    ...line,
    volume_discount_applied: 0,
    final_cost: line.marked_up_cost * totalLift
  }));
  const rawSubtotal = finalLines.reduce((s, l) => s + l.cost, 0);
  return {
    lines: finalLines,
    totals: {
      raw_subtotal: rawSubtotal,
      marked_subtotal: markedSubtotal,
      overhead_pct: overheadPct,
      overhead_amount: overheadAmount,
      profit_pct: profitPct,
      profit_amount: profitAmount,
      grand_total: grandTotal
    }
  };
}
function priceForTargetMargin(cost, marginPct) {
  const c = Number(cost);
  const m = Number(marginPct);
  if (!Number.isFinite(c) || c <= 0) return 0;
  if (!Number.isFinite(m) || m < 0 || m >= 100) return null;
  return c / (1 - m / 100);
}
export {
  applyCostPlus,
  applyMarkups,
  getMarkup,
  getVolumeDiscountPct,
  parseVolumeDiscountBrackets,
  parseVolumeDiscountCategories,
  priceForTargetMargin
};
