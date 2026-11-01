// Client wrapper for the persisted-notification backend
// (base44/functions/notificationAction). Every call is fail-soft — a dead
// gateway degrades the notification layer, never the page hosting it.
import { base44 } from "@/api/base44Client";
import {
  normalizeNotificationPrefs,
  upsertDismissedFeedItem,
  NOTIFICATION_PREF_DEFAULTS,
} from "./notificationModel.mjs";

const invoke = async (sessionToken, action, extra = {}) => {
  if (!sessionToken) return null;
  try {
    const res = await base44.functions.invoke("notificationAction", {
      session_token: sessionToken,
      action,
      ...extra,
    });
    const data = res?.data || res;
    return data && data.success !== false ? data : null;
  } catch {
    return null;
  }
};

export const listMyNotifications = (sessionToken, opts = {}) =>
  invoke(sessionToken, "list_mine", opts);

export const getUnreadNotificationCount = (sessionToken) =>
  invoke(sessionToken, "unread_count");

export const markNotificationRead = (sessionToken, id) =>
  invoke(sessionToken, "mark_read", { id });

export const markAllNotificationsRead = (sessionToken, category = "") =>
  invoke(sessionToken, "mark_all_read", category ? { category } : {});

export const snoozeNotification = (sessionToken, id, hours = 4) =>
  invoke(sessionToken, "snooze", { id, hours });

export const markNotificationHandled = (sessionToken, id) =>
  invoke(sessionToken, "mark_handled", { id });

export const unhandleNotification = (sessionToken, id) =>
  invoke(sessionToken, "unhandle", { id });

export const recordNotification = (sessionToken, payload) =>
  invoke(sessionToken, "record", payload);

export const evaluateNotificationTriggers = (sessionToken, today, force = false) =>
  invoke(sessionToken, "evaluate_triggers", { today, force });

export const fetchNotificationHistory = (sessionToken, opts = {}) =>
  invoke(sessionToken, "history", opts);

export const requestDailyDigest = (sessionToken, today, counts) =>
  invoke(sessionToken, "daily_digest", { today, counts });

export const dismissFeedItems = async (sessionToken, itemIds, mode = "handled", hours = 4) => {
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  const entry = {
    ...(mode === "snooze"
      ? { snoozed_until: new Date(Date.now() + hours * 3600000).toISOString() }
      : { handled_at: new Date().toISOString() }),
  };
  // Keep the shared prefs cache in sync — a later unrelated prefs save must
  // not re-publish a stale dismissed list over these overlays.
  if (cachedPrefs) {
    let items = cachedPrefs.dismissed_feed_items || [];
    for (const id of ids) items = upsertDismissedFeedItem(items, { id, ...entry });
    publishPrefs({ ...cachedPrefs, dismissed_feed_items: items });
  }
  return invoke(sessionToken, "dismiss_feed_item", { item_ids: ids, mode, hours });
};

export const clearFeedItemDismissal = (sessionToken, itemId) =>
  invoke(sessionToken, "clear_feed_item", { item_id: itemId });

// --- Preferences ---------------------------------------------------------------
// Thin cache so AttentionFeed and NotificationCenter share one prefs read
// per session instead of each polling their own.
let cachedPrefs = null;
let prefsFetchedAt = 0;
const PREFS_CACHE_MS = 30000;
const subscribers = new Set();

export function subscribeNotificationPrefs(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function publishPrefs(prefs) {
  cachedPrefs = normalizeNotificationPrefs(prefs);
  prefsFetchedAt = Date.now();
  for (const fn of subscribers) {
    try { fn(cachedPrefs); } catch { /* listener errors must not break saves */ }
  }
}

export function getCachedNotificationPrefs() {
  return cachedPrefs || normalizeNotificationPrefs(null);
}

export async function loadNotificationPrefs(sessionToken, { force = false } = {}) {
  if (!sessionToken) return getCachedNotificationPrefs();
  if (!force && cachedPrefs && Date.now() - prefsFetchedAt < PREFS_CACHE_MS) return cachedPrefs;
  const data = await invoke(sessionToken, "get_preferences");
  if (data?.preferences) publishPrefs(data.preferences);
  return cachedPrefs || normalizeNotificationPrefs(data?.preferences || NOTIFICATION_PREF_DEFAULTS);
}

export async function saveNotificationPrefs(sessionToken, patch) {
  const next = normalizeNotificationPrefs({ ...getCachedNotificationPrefs(), ...(patch || {}) });
  publishPrefs(next); // optimistic — the UI updates immediately
  const data = await invoke(sessionToken, "save_preferences", {
    ...patch,
    request_id: `prefs:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!data) return next; // offline/failed — keep optimistic state + localStorage mirror
  return next;
}
