// Pure notification-layer model — no I/O. Shared by AttentionBell,
// AttentionFeed, NotificationCenter and scripts/test-notification-center.mjs
// (esbuild-bundled under Node). The backend
// base44/functions/notificationAction/entry.ts reimplements the same
// transition + dedupe semantics server-side; keep the shapes aligned.

const clean = (v) => String(v ?? "").trim();
const num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

// Persisted-notification categories produced by notificationAction
// (record + evaluate_triggers). `icon` names are resolved by the UI.
export const NOTIFICATION_CATEGORIES = [
  { key: "quote_approved", label: "Quote approved", severity: "celebration" },
  { key: "estimate_sent", label: "Quote sent", severity: "info" },
  { key: "estimate_assigned", label: "Estimate assigned", severity: "info" },
  { key: "quote_expiring", label: "Quote expiring", severity: "warning" },
  { key: "invoice_overdue", label: "Invoice overdue", severity: "critical" },
  { key: "unassigned_escalation", label: "Unassigned escalation", severity: "critical" },
  { key: "sync_pending", label: "Sync pending", severity: "warning" },
  { key: "needs_recalc", label: "Needs recalc", severity: "warning" },
  { key: "watch_hit", label: "Watch hit", severity: "info" },
  { key: "digest", label: "Daily digest", severity: "info" },
  { key: "system", label: "Notification", severity: "info" },
];
export const NOTIFICATION_CATEGORY_MAP = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c]),
);

export function notificationCategoryLabel(key) {
  return NOTIFICATION_CATEGORY_MAP[clean(key)]?.label || "Notification";
}

// Deterministic dedupe key — the backend stores `${recipient}:${base}` so a
// single global index read dedupes every recipient's notifications.
export function notificationDedupeKey(base, recipient) {
  return `${clean(recipient).toLowerCase()}:${clean(base)}`.replace(/^:+|:+$/g, "");
}

// --- Row transitions (mirrored in entry.ts) -----------------------------------
export function applyMarkRead(notification, iso = new Date().toISOString()) {
  const n = { ...(notification || {}) };
  if (!clean(n.read_at)) n.read_at = iso;
  return n;
}

export function applySnooze(notification, untilIso) {
  const n = { ...(notification || {}) };
  n.snoozed_until = clean(untilIso);
  return n;
}

export function snoozeUntilForHours(hours = 4, now = Date.now()) {
  const h = Math.min(Math.max(num(hours, 4) || 4, 0.25), 24 * 30);
  return new Date(now + h * 3600000).toISOString();
}

export function applyMarkHandled(notification, iso = new Date().toISOString(), by = "") {
  const n = applyMarkRead(notification, iso);
  n.handled_at = iso;
  if (clean(by)) n.handled_by = clean(by);
  return n;
}

export function applyUnhandle(notification) {
  const n = { ...(notification || {}) };
  delete n.handled_at;
  delete n.handled_by;
  return n;
}

// A notification shows in the ACTIVE list when it is not handled and not
// currently snoozed. Unread is independent — a read notification stays
// listed until handled/snoozed.
export function isNotificationActive(notification, nowMs = Date.now()) {
  if (!notification || clean(notification.handled_at)) return false;
  const s = Date.parse(clean(notification.snoozed_until));
  if (Number.isFinite(s) && s > nowMs) return false;
  return true;
}

export function isNotificationUnread(notification, nowMs = Date.now()) {
  return isNotificationActive(notification, nowMs) && !clean(notification?.read_at);
}

export function unreadNotificationCount(rows = [], nowMs = Date.now()) {
  return (Array.isArray(rows) ? rows : []).filter((n) => isNotificationUnread(n, nowMs)).length;
}

export function sortNotificationsNewest(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
    clean(b?.created_date).localeCompare(clean(a?.created_date)));
}

// Unread first, then read-but-active, newest inside each group.
export function sortNotificationsForPanel(rows = [], nowMs = Date.now()) {
  return sortNotificationsNewest(rows).sort((a, b) => {
    const au = isNotificationUnread(a, nowMs) ? 0 : 1;
    const bu = isNotificationUnread(b, nowMs) ? 0 : 1;
    return au - bu;
  });
}

// --- Preferences ---------------------------------------------------------------
export const NOTIFICATION_PREF_DEFAULTS = {
  hidden_sections: [],
  section_snoozed_until: {},
  dismissed_feed_items: [],
  sound_on: true,
  digest_opt_in: false,
  last_digest_date: "",
  // K-03 — H-12 alert subscriptions ride the same preference row. Kept
  // verbatim here (bounded): the canonical normalization lives in
  // base44/shared/alertSubscriptionsModel.ts and its frontend parity copy
  // src/components/account/userPrefsModel.js — this model must stay
  // import-free, so it preserves rather than re-derives the shape.
  subscriptions: [],
};

// Tolerates a raw NotificationPreference row, a partial blob, or junk.
export function normalizeNotificationPrefs(raw) {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    hidden_sections: [...new Set((Array.isArray(p.hidden_sections) ? p.hidden_sections : []).map(clean).filter(Boolean))],
    section_snoozed_until: (() => {
      const out = {};
      const src = p.section_snoozed_until && typeof p.section_snoozed_until === "object" ? p.section_snoozed_until : {};
      for (const [k, v] of Object.entries(src)) {
        const t = num(v);
        if (t > 0) out[clean(k)] = t;
      }
      return out;
    })(),
    dismissed_feed_items: normalizeDismissedFeedItems(p.dismissed_feed_items),
    sound_on: p.sound_on !== false,
    digest_opt_in: p.digest_opt_in === true,
    last_digest_date: clean(p.last_digest_date).slice(0, 10),
    // Pass-through, not re-normalized — see NOTIFICATION_PREF_DEFAULTS note.
    // Bounded so a hostile/buggy blob cannot grow the shared cache forever.
    subscriptions: (Array.isArray(p.subscriptions) ? p.subscriptions : [])
      .filter((s) => s && typeof s === "object").slice(0, 200)
      .map((s) => ({ ...s })),
  };
}

export function normalizeDismissedFeedItems(value) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const id = clean(raw?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const entry = { id };
    if (clean(raw?.handled_at)) entry.handled_at = clean(raw.handled_at);
    if (clean(raw?.snoozed_until)) entry.snoozed_until = clean(raw.snoozed_until);
    out.push(entry);
  }
  return out;
}

// Preference lookups ------------------------------------------------------------
export function sectionHiddenByPrefs(prefs, sectionKey) {
  return normalizeNotificationPrefs(prefs).hidden_sections.includes(clean(sectionKey));
}

export function sectionSnoozedByPrefs(prefs, sectionKey, nowMs = Date.now()) {
  const until = num(normalizeNotificationPrefs(prefs).section_snoozed_until[clean(sectionKey)]);
  return until > nowMs;
}

export function sectionVisibleByPrefs(prefs, sectionKey, nowMs = Date.now()) {
  return !sectionHiddenByPrefs(prefs, sectionKey) && !sectionSnoozedByPrefs(prefs, sectionKey, nowMs);
}

// Feed-item overlay (#332/#340): a dismissed entry hides the item while its
// snooze is live or forever once handled.
export function feedItemDismissed(dismissedItems, itemId, nowMs = Date.now()) {
  const id = clean(itemId);
  const entry = normalizeDismissedFeedItems(dismissedItems).find((i) => i.id === id);
  if (!entry) return false;
  if (clean(entry.handled_at)) return true;
  const s = Date.parse(clean(entry.snoozed_until));
  return Number.isFinite(s) && s > nowMs;
}

export function filterVisibleFeedItems(items, dismissedItems, nowMs = Date.now()) {
  return (Array.isArray(items) ? items : []).filter((it) => !feedItemDismissed(dismissedItems, it?.id, nowMs));
}

export function upsertDismissedFeedItem(dismissedItems, entry, cap = 300) {
  const items = normalizeDismissedFeedItems(dismissedItems).filter((i) => i.id !== clean(entry?.id));
  items.push({
    id: clean(entry?.id),
    ...(clean(entry?.handled_at) ? { handled_at: clean(entry.handled_at) } : {}),
    ...(clean(entry?.snoozed_until) ? { snoozed_until: clean(entry.snoozed_until) } : {}),
  });
  return items.slice(-Math.max(1, num(cap, 300)));
}

// --- Digest -------------------------------------------------------------------
// Counts for the once-a-day in-app digest: section key -> matched total
// (matched_totals cover rows beyond the display cap).
export function buildDigestCounts(feed = {}) {
  const SECTION_KEYS = [
    "unread_portal_messages", "overdue_invoices", "overdue_pos", "proposed_cos",
    "overdue_follow_ups", "stale_sent_estimates", "quotes_expiring_soon",
    "quotes_expired", "open_estimating_requests", "estimate_requests",
    "unassigned_estimating_requests", "low_stock", "needs_recalc_parts",
    "sync_pending_estimates", "overdue_jobs", "expiring_permits", "permit_fees_due",
  ];
  const counts = {};
  for (const key of SECTION_KEYS) {
    const matched = num(feed?.matched_totals?.[key]);
    const rows = Array.isArray(feed?.[key]) ? feed[key].length : 0;
    const count = matched > 0 ? matched : rows;
    if (count > 0) counts[key] = count;
  }
  return counts;
}

// --- Bell badge ----------------------------------------------------------------
// Latest-persisted snapshot published by AttentionBell so the dropdown panel
// renders without a second fetch (same pattern as publishComputedAttention).
let latestPersisted = { notifications: [], unread_count: 0 };
export function publishPersistedNotifications(notifications = [], unreadCount = null) {
  latestPersisted = {
    notifications: Array.isArray(notifications) ? notifications : [],
    unread_count: unreadCount == null ? unreadNotificationCount(notifications) : num(unreadCount),
  };
}
export function persistedNotificationState() {
  return latestPersisted;
}

// Latest attention_feed payload — published by whoever fetched it most
// recently (AttentionBell badge poll or AttentionFeed load) so the bell
// dropdown's Feed tab never refetches.
let latestFeed = null;
export function publishAttentionFeed(feed) {
  latestFeed = feed && typeof feed === "object" ? feed : null;
}
export function latestAttentionFeed() {
  return latestFeed;
}