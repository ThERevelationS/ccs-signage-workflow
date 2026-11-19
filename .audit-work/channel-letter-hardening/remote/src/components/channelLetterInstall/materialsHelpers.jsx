// Helpers for materials inventory: price history, usage counts, relative dates.

const PRICE_FIELDS = [
  "cost_per_letter", "cost_extra_small", "cost_small", "cost_medium",
  "cost_large", "cost_extra_large", "cost_extra_extra_large",
  "cost_per_foot", "cost_flat",
];

export const extractPriceSnapshot = (item) => {
  const snap = { pricing_mode: item.pricing_mode };
  for (const f of PRICE_FIELDS) snap[f] = parseFloat(item[f]) || 0;
  return snap;
};

export const pricingChanged = (a, b) => {
  if (!a || !b) return true;
  if (a.pricing_mode !== b.pricing_mode) return true;
  for (const f of PRICE_FIELDS) {
    if ((parseFloat(a[f]) || 0) !== (parseFloat(b[f]) || 0)) return true;
  }
  return false;
};

// Append a price history entry if pricing changed compared to lastSavedSnapshot.
export const buildPriceHistoryUpdate = (item, lastSavedSnapshot, userEmail) => {
  const currentSnap = extractPriceSnapshot(item);
  if (!pricingChanged(currentSnap, lastSavedSnapshot)) return null;
  const entry = {
    changed_at: new Date().toISOString(),
    changed_by: userEmail || "unknown",
    pricing_mode: lastSavedSnapshot?.pricing_mode || item.pricing_mode,
    snapshot: lastSavedSnapshot || currentSnap,
  };
  const history = Array.isArray(item.price_history) ? item.price_history : [];
  // keep last 25 entries
  return [...history, entry].slice(-25);
};

// Format "2 days ago" style relative date.
export const formatRelative = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day !== 1 ? "s" : ""} ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} month${mon !== 1 ? "s" : ""} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr !== 1 ? "s" : ""} ago`;
};

export const isStale = (iso, days = 180) => {
  if (!iso) return false;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
};

// Count how many times each inventory item id is referenced across projects.
export const countInventoryUsage = (projects) => {
  const counts = {};
  for (const proj of projects || []) {
    for (const item of proj.items || []) {
      for (const mat of item.materials || []) {
        if (mat.inventory_item_id) {
          counts[mat.inventory_item_id] = (counts[mat.inventory_item_id] || 0) + 1;
        }
      }
    }
  }
  return counts;
};

// Apply a percentage adjustment to all price fields on a single item.
export const adjustItemPricing = (item, percent) => {
  const factor = 1 + (percent / 100);
  const patch = {};
  for (const f of PRICE_FIELDS) {
    const v = parseFloat(item[f]) || 0;
    if (v !== 0) patch[f] = Math.round(v * factor * 100) / 100;
  }
  // Also adjust quantity tiers if present
  if (Array.isArray(item.quantity_tiers) && item.quantity_tiers.length > 0) {
    patch.quantity_tiers = item.quantity_tiers.map(t => ({
      ...t,
      unit_cost: Math.round(((parseFloat(t.unit_cost) || 0) * factor) * 100) / 100,
    }));
  }
  return patch;
};