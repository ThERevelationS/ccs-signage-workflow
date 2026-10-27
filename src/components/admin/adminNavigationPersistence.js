import { getAccessibleAdminSubtab, getAccessibleAdminTab } from "./adminTabNavigation.js";

// UI preference only: never store authentication data, capabilities or backend records.
const STORAGE_PREFIX = "ccs_admin_navigation:v1:";

export function getAdminNavigationStorageKey(user) {
  const identity = String(user?.id || user?.email || "").trim();
  return identity ? STORAGE_PREFIX + encodeURIComponent(identity.toLowerCase()) : null;
}

export function sanitizeAdminNavigation(value, isAdmin, user) {
  const tab = getAccessibleAdminTab(value?.tab, isAdmin, user);
  const subtab = getAccessibleAdminSubtab(tab, value?.subtab, user);
  return { tab, subtab };
}

export function readAdminNavigation(storage, key, isAdmin, user) {
  if (!key) return null;
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    // Stale or revoked tabs are always replaced with a currently accessible destination.
    return sanitizeAdminNavigation(parsed, isAdmin, user);
  } catch {
    // Private browsing / blocked storage / legacy corrupt preference must not break Admin.
    return null;
  }
}

export function storeAdminNavigation(storage, key, value, isAdmin, user) {
  if (!key) return false;
  try {
    storage?.setItem(key, JSON.stringify(sanitizeAdminNavigation(value, isAdmin, user)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function resolveAdminNavigation(searchParams, saved, isAdmin, user) {
  // Explicit links win, including invalid or newly restricted links, which fail closed.
  // A nested deep-link is meaningful only with its explicit parent tab.
  const requested = searchParams.has("tab")
    ? { tab: searchParams.get("tab"), subtab: searchParams.get("subtab") }
    : saved;
  return sanitizeAdminNavigation(requested, isAdmin, user);
}
