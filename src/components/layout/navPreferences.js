// Per-user navigation preferences: page-button order and collapsed groups.
// Order is stored per signed-in user so each person keeps their own layout.

const ORDER_KEY_PREFIX = "ccsNavOrder:";
const GROUPS_KEY = "ccsNavGroupsCollapsed";

function orderKey(userEmail) {
  return `${ORDER_KEY_PREFIX}${String(userEmail || "guest").trim().toLowerCase()}`;
}

export function hexToRgbTuple(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return "148 163 184";
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function loadNavOrder(userEmail) {
  try {
    const parsed = JSON.parse(localStorage.getItem(orderKey(userEmail)) || "null");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function saveNavOrder(userEmail, order) {
  try {
    localStorage.setItem(orderKey(userEmail), JSON.stringify(order));
  } catch {
    // Storage may be unavailable; the in-memory order still applies for this session.
  }
}

// Applies a saved order to the page buttons. Buttons the saved order does not
// mention (new pages) keep their default position at the end.
export function applyNavOrder(items, order) {
  if (!order?.length) return items;
  const rank = new Map(order.map((url, index) => [url, index]));
  return [...items].sort((a, b) => {
    const rankA = rank.has(a.url) ? rank.get(a.url) : Number.MAX_SAFE_INTEGER;
    const rankB = rank.has(b.url) ? rank.get(b.url) : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

export function loadCollapsedGroups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCollapsedGroups(groups) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // Ignore storage failures; the state still applies for this session.
  }
}