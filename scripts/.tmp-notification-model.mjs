// src/components/workflow/notificationModel.mjs
var clean = (v) => String(v ?? "").trim();
var num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var NOTIFICATION_CATEGORIES = [
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
  { key: "system", label: "Notification", severity: "info" }
];
var NOTIFICATION_CATEGORY_MAP = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c])
);
function notificationCategoryLabel(key) {
  return NOTIFICATION_CATEGORY_MAP[clean(key)]?.label || "Notification";
}
function notificationDedupeKey(base, recipient) {
  return `${clean(recipient).toLowerCase()}:${clean(base)}`.replace(/^:+|:+$/g, "");
}
function applyMarkRead(notification, iso = (/* @__PURE__ */ new Date()).toISOString()) {
  const n = { ...notification || {} };
  if (!clean(n.read_at)) n.read_at = iso;
  return n;
}
function applySnooze(notification, untilIso) {
  const n = { ...notification || {} };
  n.snoozed_until = clean(untilIso);
  return n;
}
function snoozeUntilForHours(hours = 4, now = Date.now()) {
  const h = Math.min(Math.max(num(hours, 4) || 4, 0.25), 24 * 30);
  return new Date(now + h * 36e5).toISOString();
}
function applyMarkHandled(notification, iso = (/* @__PURE__ */ new Date()).toISOString(), by = "") {
  const n = applyMarkRead(notification, iso);
  n.handled_at = iso;
  if (clean(by)) n.handled_by = clean(by);
  return n;
}
function applyUnhandle(notification) {
  const n = { ...notification || {} };
  delete n.handled_at;
  delete n.handled_by;
  return n;
}
function isNotificationActive(notification, nowMs = Date.now()) {
  if (!notification || clean(notification.handled_at)) return false;
  const s = Date.parse(clean(notification.snoozed_until));
  if (Number.isFinite(s) && s > nowMs) return false;
  return true;
}
function isNotificationUnread(notification, nowMs = Date.now()) {
  return isNotificationActive(notification, nowMs) && !clean(notification?.read_at);
}
function unreadNotificationCount(rows = [], nowMs = Date.now()) {
  return (Array.isArray(rows) ? rows : []).filter((n) => isNotificationUnread(n, nowMs)).length;
}
function sortNotificationsNewest(rows = []) {
  return [...Array.isArray(rows) ? rows : []].sort((a, b) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
}
function sortNotificationsForPanel(rows = [], nowMs = Date.now()) {
  return sortNotificationsNewest(rows).sort((a, b) => {
    const au = isNotificationUnread(a, nowMs) ? 0 : 1;
    const bu = isNotificationUnread(b, nowMs) ? 0 : 1;
    return au - bu;
  });
}
var NOTIFICATION_PREF_DEFAULTS = {
  hidden_sections: [],
  section_snoozed_until: {},
  dismissed_feed_items: [],
  sound_on: true,
  digest_opt_in: false,
  last_digest_date: ""
};
function normalizeNotificationPrefs(raw) {
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
    last_digest_date: clean(p.last_digest_date).slice(0, 10)
  };
}
function normalizeDismissedFeedItems(value) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
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
function sectionHiddenByPrefs(prefs, sectionKey) {
  return normalizeNotificationPrefs(prefs).hidden_sections.includes(clean(sectionKey));
}
function sectionSnoozedByPrefs(prefs, sectionKey, nowMs = Date.now()) {
  const until = num(normalizeNotificationPrefs(prefs).section_snoozed_until[clean(sectionKey)]);
  return until > nowMs;
}
function sectionVisibleByPrefs(prefs, sectionKey, nowMs = Date.now()) {
  return !sectionHiddenByPrefs(prefs, sectionKey) && !sectionSnoozedByPrefs(prefs, sectionKey, nowMs);
}
function feedItemDismissed(dismissedItems, itemId, nowMs = Date.now()) {
  const id = clean(itemId);
  const entry = normalizeDismissedFeedItems(dismissedItems).find((i) => i.id === id);
  if (!entry) return false;
  if (clean(entry.handled_at)) return true;
  const s = Date.parse(clean(entry.snoozed_until));
  return Number.isFinite(s) && s > nowMs;
}
function filterVisibleFeedItems(items, dismissedItems, nowMs = Date.now()) {
  return (Array.isArray(items) ? items : []).filter((it) => !feedItemDismissed(dismissedItems, it?.id, nowMs));
}
function upsertDismissedFeedItem(dismissedItems, entry, cap = 300) {
  const items = normalizeDismissedFeedItems(dismissedItems).filter((i) => i.id !== clean(entry?.id));
  items.push({
    id: clean(entry?.id),
    ...clean(entry?.handled_at) ? { handled_at: clean(entry.handled_at) } : {},
    ...clean(entry?.snoozed_until) ? { snoozed_until: clean(entry.snoozed_until) } : {}
  });
  return items.slice(-Math.max(1, num(cap, 300)));
}
function buildDigestCounts(feed = {}) {
  const SECTION_KEYS = [
    "unread_portal_messages",
    "overdue_invoices",
    "overdue_pos",
    "proposed_cos",
    "overdue_follow_ups",
    "stale_sent_estimates",
    "quotes_expiring_soon",
    "quotes_expired",
    "open_estimating_requests",
    "estimate_requests",
    "unassigned_estimating_requests",
    "low_stock",
    "needs_recalc_parts",
    "sync_pending_estimates",
    "overdue_jobs",
    "expiring_permits",
    "permit_fees_due"
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
var latestPersisted = { notifications: [], unread_count: 0 };
function publishPersistedNotifications(notifications = [], unreadCount = null) {
  latestPersisted = {
    notifications: Array.isArray(notifications) ? notifications : [],
    unread_count: unreadCount == null ? unreadNotificationCount(notifications) : num(unreadCount)
  };
}
function persistedNotificationState() {
  return latestPersisted;
}
var latestFeed = null;
function publishAttentionFeed(feed) {
  latestFeed = feed && typeof feed === "object" ? feed : null;
}
function latestAttentionFeed() {
  return latestFeed;
}
export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_MAP,
  NOTIFICATION_PREF_DEFAULTS,
  applyMarkHandled,
  applyMarkRead,
  applySnooze,
  applyUnhandle,
  buildDigestCounts,
  feedItemDismissed,
  filterVisibleFeedItems,
  isNotificationActive,
  isNotificationUnread,
  latestAttentionFeed,
  normalizeDismissedFeedItems,
  normalizeNotificationPrefs,
  notificationCategoryLabel,
  notificationDedupeKey,
  persistedNotificationState,
  publishAttentionFeed,
  publishPersistedNotifications,
  sectionHiddenByPrefs,
  sectionSnoozedByPrefs,
  sectionVisibleByPrefs,
  snoozeUntilForHours,
  sortNotificationsForPanel,
  sortNotificationsNewest,
  unreadNotificationCount,
  upsertDismissedFeedItem
};
