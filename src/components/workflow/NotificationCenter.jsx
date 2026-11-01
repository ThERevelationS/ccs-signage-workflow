import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock,
  Gift,
  History,
  Inbox,
  Loader2,
  RefreshCw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/EmailGate";
import { base44 } from "@/api/base44Client";
import {
  dismissFeedItems,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationHandled,
  markNotificationRead,
  loadNotificationPrefs,
  saveNotificationPrefs,
  snoozeNotification,
  subscribeNotificationPrefs,
  getCachedNotificationPrefs,
} from "./notificationClient";
import {
  isNotificationUnread,
  latestAttentionFeed,
  notificationCategoryLabel,
  persistedNotificationState,
  sortNotificationsForPanel,
} from "./notificationModel.mjs";
import { buildAttentionCategories, PREF_SECTION_KEYS } from "./attentionFeedCategories";
import NotificationHistory from "./NotificationHistory";

const timeAgo = (isoDate) => {
  const t = Date.parse(String(isoDate || ""));
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const SEVERITY_TONE = {
  celebration: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
  critical: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  info: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
};

// Notification center panel (#326): persisted notifications + the live
// attention-feed sections in a bell dropdown. Tab "Alerts" = Notification
// entity rows (mark read / snooze / handled / deep-link), "Feed" = the live
// attention_feed categories, "Prefs" = per-user section toggles (#328)
// persisted through notificationAction.
export default function NotificationCenter({ open, onClose }) {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("alerts");
  const [notifications, setNotifications] = useState(() => persistedNotificationState().notifications);
  const [unread, setUnread] = useState(() => persistedNotificationState().unread_count);
  const [prefs, setPrefs] = useState(getCachedNotificationPrefs);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const panelRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const data = await listMyNotifications(sessionToken, { limit: 60 });
    if (data) {
      setNotifications(data.notifications || []);
      setUnread(data.unread_count ?? 0);
    }
    setLoading(false);
  }, [sessionToken]);

  useEffect(() => {
    const unsub = subscribeNotificationPrefs(setPrefs);
    return unsub;
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      loadNotificationPrefs(sessionToken).then(setPrefs).catch(() => {});
    }
  }, [open, refresh, sessionToken]);

  // Click-outside + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const feed = latestAttentionFeed();
  const feedCategories = useMemo(() => buildAttentionCategories({ feed }), [feed]);
  const visibleFeedCategories = feedCategories.filter((c) => c.count > 0);

  const openNotification = async (n) => {
    if (isNotificationUnread(n)) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationRead(sessionToken, n.id);
    }
    if (n.deep_link) {
      onClose?.();
      navigate(n.deep_link);
    }
  };

  const handleSnooze = async (n) => {
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    setUnread((u) => (isNotificationUnread(n) ? Math.max(0, u - 1) : u));
    await snoozeNotification(sessionToken, n.id, 4).catch(() => {});
  };

  const handleHandled = async (n) => {
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    setUnread((u) => (isNotificationUnread(n) ? Math.max(0, u - 1) : u));
    await markNotificationHandled(sessionToken, n.id).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnread(0);
    await markAllNotificationsRead(sessionToken).catch(() => {});
  };

  const markAllPortalRead = async () => {
    // Portal-message read state lives on PortalMessage.read_by_staff — the
    // existing customerPortalAction path stays the writer (#327 per-section).
    try {
      await base44.functions.invoke("customerPortalAction", {
        session_token: sessionToken,
        action: "mark_all_read",
      });
    } catch { /* non-fatal */ }
  };

  const dismissWholeSection = async (category) => {
    const ids = category.items.map((i) => i.id);
    await dismissFeedItems(sessionToken, ids, "handled").catch(() => {});
    onClose?.(); // the strip re-renders from its own prefs subscription
  };

  const togglePref = (key) => {
    const hidden = new Set(prefs.hidden_sections);
    if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
    const next = { ...prefs, hidden_sections: [...hidden] };
    setPrefs(next);
    void saveNotificationPrefs(sessionToken, { hidden_sections: next.hidden_sections });
  };

  const toggleSound = () => {
    const next = { ...prefs, sound_on: !prefs.sound_on };
    setPrefs(next);
    try { localStorage.setItem("attention_sound", next.sound_on ? "on" : "off"); } catch {}
    void saveNotificationPrefs(sessionToken, { sound_on: next.sound_on });
  };

  const toggleDigest = () => {
    const next = { ...prefs, digest_opt_in: !prefs.digest_opt_in };
    setPrefs(next);
    void saveNotificationPrefs(sessionToken, { digest_opt_in: next.digest_opt_in });
  };

  if (!open) return null;
  const sorted = sortNotificationsForPanel(notifications);
  const catLabel = (key) => feedCategories.find((c) => c.prefKey === key)?.label || notificationCategoryLabel(key) || key;

  return (
    <div ref={panelRef} className="absolute right-0 z-50 mt-2 w-[24rem] max-w-[92vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <Bell className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Notifications</span>
        {unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">{unread}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {[
            ["alerts", "Alerts"],
            ["feed", "Feed"],
            ["prefs", "Prefs"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${tab === key ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={refresh} disabled={loading} className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {tab === "alerts" && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                <Inbox className="mx-auto mb-1 h-5 w-5" />
                No notifications yet — assignments, approvals and escalations land here.
              </div>
            )}
            {sorted.map((n) => {
              const un = isNotificationUnread(n);
              const tone = SEVERITY_TONE[n.severity] || SEVERITY_TONE.info;
              return (
                <div key={n.id} className={`flex items-start gap-2 px-3 py-2 ${un ? "bg-violet-50/60 dark:bg-violet-950/20" : ""}`}>
                  <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone}`}>
                    {n.category === "quote_approved" ? <Gift className="h-3 w-3 text-emerald-600" />
                      : n.severity === "critical" ? <AlertTriangle className="h-3 w-3 text-red-600" />
                      : n.severity === "warning" ? <Clock className="h-3 w-3 text-amber-600" />
                      : <Bell className="h-3 w-3 text-slate-500" />}
                  </span>
                  <button type="button" onClick={() => openNotification(n)} className="min-w-0 flex-1 text-left">
                    <span className={`block truncate text-xs ${un ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-slate-300"}`}>
                      {n.title}
                    </span>
                    {n.body && <span className="block truncate text-[11px] text-slate-500">{n.body}</span>}
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                      {notificationCategoryLabel(n.category)} · {timeAgo(n.created_date)}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col gap-0.5">
                    <button type="button" title="Snooze 4 hours" onClick={() => handleSnooze(n)}
                      className="rounded p-0.5 text-slate-300 hover:bg-amber-50 hover:text-amber-600">
                      <Clock className="h-3 w-3" />
                    </button>
                    <button type="button" title="Mark as handled" onClick={() => handleHandled(n)}
                      className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              );
            })}
            {sorted.length > 0 && (
              <div className="flex items-center gap-1 px-3 py-1.5">
                <button type="button" onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-800">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
                <button type="button" onClick={() => setHistoryOpen(true)}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                  <History className="h-3 w-3" /> History
                </button>
              </div>
            )}
            {sorted.length === 0 && (
              <div className="px-3 py-1.5 text-right">
                <button type="button" onClick={() => setHistoryOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                  <History className="h-3 w-3" /> History
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "feed" && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleFeedCategories.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                The live attention feed is clear — nothing needs attention.
              </div>
            )}
            {visibleFeedCategories.map((c) => (
              <div key={c.key} className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <c.icon className="h-3 w-3" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c.count} {c.label}</span>
                  <button type="button" onClick={() => dismissWholeSection(c)} title="Mark every visible item handled"
                    className="ml-auto text-[10px] font-semibold text-slate-400 hover:text-red-600">
                    dismiss
                  </button>
                </div>
                {c.items.slice(0, 3).map((it) => (
                  <button key={it.id} type="button"
                    onClick={() => { onClose?.(); navigate(it.href); }}
                    className="mt-0.5 flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                    <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{it.primary}</span>
                    <span className="truncate text-[10px] text-slate-400">{it.secondary}</span>
                  </button>
                ))}
                {c.count > 3 && (
                  <button type="button" onClick={() => { onClose?.(); navigate("/MainWorkflow"); }}
                    className="mt-0.5 px-1.5 text-[10px] font-semibold text-violet-600 hover:text-violet-800">
                    +{c.count - 3} more in the attention feed
                  </button>
                )}
              </div>
            ))}
            {visibleFeedCategories.some((c) => c.key === "portal") && (
              <button type="button" onClick={markAllPortalRead}
                className="w-full px-3 py-1.5 text-left text-[11px] font-semibold text-violet-600 hover:bg-violet-50 dark:hover:bg-slate-800">
                Mark all portal messages read
              </button>
            )}
            <button type="button" onClick={() => { onClose?.(); navigate("/MainWorkflow"); }}
              className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
              Open the full attention feed
            </button>
          </div>
        )}

        {tab === "prefs" && (
          <div className="px-3 py-2">
            <label className="flex items-center gap-1.5 py-1 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={prefs.sound_on !== false} onChange={toggleSound} className="h-3 w-3" />
              {prefs.sound_on !== false ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              Notification sound
            </label>
            <label className="flex items-center gap-1.5 py-1 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={prefs.digest_opt_in === true} onChange={toggleDigest} className="h-3 w-3" />
              Daily in-app digest
            </label>
            <p className="mt-1 border-t border-slate-100 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <Settings className="mr-1 inline h-3 w-3" />Sections shown
            </p>
            <div className="max-h-56 overflow-y-auto">
              {PREF_SECTION_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1.5 px-1 py-0.5 text-xs text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={!prefs.hidden_sections.includes(key)} onChange={() => togglePref(key)} className="h-3 w-3" />
                  {catLabel(key)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Preferences save to your account and follow you across devices.</p>
          </div>
        )}
      </div>

      {historyOpen && <NotificationHistory onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
