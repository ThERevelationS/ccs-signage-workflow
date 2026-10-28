export const RECENT_CUSTOMERS_STORAGE_KEY = "ccs-estimator-recent-customer-ids-v1";
const MAX_RECENT_CUSTOMERS = 5;

export function normalizeRecentCustomerIds(value, limit = MAX_RECENT_CUSTOMERS) {
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (!Array.isArray(value) || max === 0) return [];
  const seen = new Set();
  const ids = [];
  for (const valueId of value) {
    const id = String(valueId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

export function loadRecentCustomerIds(storage = globalThis.localStorage) {
  try {
    return normalizeRecentCustomerIds(JSON.parse(storage?.getItem(RECENT_CUSTOMERS_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function addRecentCustomerId(recentIds, customerId, limit = MAX_RECENT_CUSTOMERS) {
  const id = String(customerId || "").trim();
  if (!id) return normalizeRecentCustomerIds(recentIds, limit);
  return normalizeRecentCustomerIds([id, ...(Array.isArray(recentIds) ? recentIds : [])], limit);
}

export function saveRecentCustomerIds(recentIds, storage = globalThis.localStorage) {
  try {
    storage?.setItem(RECENT_CUSTOMERS_STORAGE_KEY, JSON.stringify(normalizeRecentCustomerIds(recentIds)));
    return true;
  } catch {
    return false;
  }
}

export function resolveRecentCustomers(customers, recentIds) {
  const byId = new Map((Array.isArray(customers) ? customers : []).map((customer) => [String(customer?.id || ""), customer]));
  return normalizeRecentCustomerIds(recentIds).map((id) => byId.get(id)).filter(Boolean);
}
