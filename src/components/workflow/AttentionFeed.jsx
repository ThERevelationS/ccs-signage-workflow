import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { useAllWorkOrders } from "@/lib/workOrderCache";
import { AllInOneEstimate, GlobalSettings, OpportunityActivity } from "@/api/gatedEntities";
import {
  dedupeById,
  dueCommsFollowups,
  dueCrmEvents,
  overdueInvoices,
  overdueOpenPos,
  overdueProducts,
  publishComputedAttention,
  varianceBatches,
} from "./attentionComputedModel";
import { buildAttentionCategories, PREF_SECTION_KEYS } from "./attentionFeedCategories";
import {
  dismissFeedItems,
  listMyNotifications,
  loadNotificationPrefs,
  markAllNotificationsRead,
  markNotificationHandled,
  markNotificationRead,
  saveNotificationPrefs,
  snoozeNotification,
  subscribeNotificationPrefs,
} from "./notificationClient";
import {
  filterVisibleFeedItems,
  isNotificationUnread,
  publishAttentionFeed,
} from "./notificationModel.mjs";

const todayLocal = () => new Date().toLocaleDateString("en-CA");
const DISMISS_CAP = 300;

// Dismissal overlay stored in localStorage for instant boot; the backend
// NotificationPreference.dismissed_feed_items is the same shape and wins
// once loaded (per-user, cross-device).
const readLocalDismissed = () => {
  try { return JSON.parse(localStorage.getItem("attention_dismissed") || "[]"); } catch { return []; }
};
const readLegacyHandled = () => {
  // Migrate the old attention_handled id-set into dismissal entries.
  try { return JSON.parse(localStorage.getItem("attention_handled") || "[]").map((id) => ({ id: String(id), handled_at: "migrated" })); } catch { return []; }
};

export default function AttentionFeed() {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [feed, setFeed] = useState(null);
  const [computed, setComputed] = useState(null);
  const [persisted, setPersisted] = useState([]);
  const { data: allWorkOrders = [] } = useAllWorkOrders({ enabled: !!sessionToken });
  const overdueProductRows = useMemo(() => overdueProducts(allWorkOrders), [allWorkOrders]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("");
  const [dismissed, setDismissed] = useState(() => [...readLocalDismissed(), ...readLegacyHandled()]);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("attention_sound") !== "off");
  // Per-user notification prefs (#328): localStorage hydrates instantly; the
  // NotificationPreference row syncs them to the account.
  const [hiddenSections, setHiddenSections] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("attention_hidden_sections") || "[]")); } catch { return new Set(); }
  });
  const [digestOn, setDigestOn] = useState(() => { try { return localStorage.getItem("attention_digest_opt_in") === "1"; } catch { return false; } });
  const [snoozed, setSnoozed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("attention_snoozed") || "{}"); } catch { return {}; }
  });
  const [watchHits, setWatchHits] = useState([]);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const persistDismissed = useCallback((next) => {
    const capped = next.slice(-DISMISS_CAP);
    setDismissed(capped);
    try {
      localStorage.setItem("attention_dismissed", JSON.stringify(capped));
      // Legacy mirror — older builds/tests still read this key.
      localStorage.setItem("attention_handled", JSON.stringify(capped.filter((d) => d.handled_at).map((d) => d.id)));
    } catch { /* quota — non-fatal */ }
  }, []);

  // Backend prefs → local state. One subscription keeps this strip, the bell
  // dropdown prefs tab, and any other mounted surface in sync. Dismissals
  // union-merge rather than replace — a stale publish must never un-dismiss
  // an item a newer overlay already hid.
  useEffect(() => {
    const apply = (prefs) => {
      if (!prefs) return;
      const p = prefs;
      setHiddenSections(new Set(p.hidden_sections || []));
      setSnoozed(p.section_snoozed_until || {});
      setSoundOn(p.sound_on !== false);
      setDigestOn(p.digest_opt_in === true);
      if (Array.isArray(p.dismissed_feed_items)) {
        setDismissed((local) => {
          const byId = new Map();
          for (const d of [...local, ...p.dismissed_feed_items]) {
            if (!d?.id) continue;
            const prev = byId.get(d.id);
            if (!prev) { byId.set(d.id, d); continue; }
            byId.set(d.id, {
              id: d.id,
              handled_at: prev.handled_at || d.handled_at || undefined,
              snoozed_until: [prev.snoozed_until, d.snoozed_until].filter(Boolean).sort().pop(),
            });
          }
          const merged = [...byId.values()].slice(-DISMISS_CAP);
          try {
            localStorage.setItem("attention_dismissed", JSON.stringify(merged));
            localStorage.setItem("attention_handled", JSON.stringify(merged.filter((d) => d.handled_at).map((d) => d.id)));
          } catch { /* non-fatal */ }
          return merged;
        });
      }
      try {
        localStorage.setItem("attention_hidden_sections", JSON.stringify(p.hidden_sections || []));
        localStorage.setItem("attention_snoozed", JSON.stringify(p.section_snoozed_until || {}));
        localStorage.setItem("attention_sound", p.sound_on !== false ? "on" : "off");
        localStorage.setItem("attention_digest_opt_in", p.digest_opt_in === true ? "1" : "0");
      } catch { /* non-fatal */ }
    };
    const unsub = subscribeNotificationPrefs(apply);
    if (sessionToken) loadNotificationPrefs(sessionToken).then(apply).catch(() => {});
    return unsub;
  }, [sessionToken, persistDismissed]);

  const savePrefPatch = useCallback((patch) => {
    void saveNotificationPrefs(sessionToken, patch);
  }, [sessionToken]);

  const markItemHandled = (id) => {
    persistDismissed([...dismissed.filter((d) => d.id !== id), { id, handled_at: new Date().toISOString() }]);
    void dismissFeedItems(sessionToken, [id], "handled");
  };

  const snoozeItem = (id, hours = 4) => {
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    persistDismissed([...dismissed.filter((d) => d.id !== id), { id, snoozed_until: until }]);
    void dismissFeedItems(sessionToken, [id], "snooze", hours);
  };

  const toggleDigest = () => {
    const next = !digestOn;
    setDigestOn(next);
    try { localStorage.setItem("attention_digest_opt_in", next ? "1" : "0"); } catch {}
    savePrefPatch({ digest_opt_in: next });
  };

  const toggleHidden = (prefKey) => {
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(prefKey)) next.delete(prefKey); else next.add(prefKey);
      try { localStorage.setItem("attention_hidden_sections", JSON.stringify([...next])); } catch {}
      savePrefPatch({ hidden_sections: [...next] });
      return next;
    });
    if (section === prefKey) setSection("");
  };

  const snoozeSection = (prefKey, hours = 4) => {
    setSnoozed((prev) => {
      const next = { ...prev, [prefKey]: Date.now() + hours * 3600000 };
      try { localStorage.setItem("attention_snoozed", JSON.stringify(next)); } catch {}
      savePrefPatch({ section_snoozed_until: next });
      return next;
    });
    if (section === prefKey) setSection("");
  };

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      try { localStorage.setItem("attention_sound", next ? "on" : "off"); } catch {}
      savePrefPatch({ sound_on: next });
      return next;
    });
  };

  // Computed sections (unified alerts): rows the server attention_feed does
  // not cover. Every source fails soft — one dead gateway never blanks the
  // strip.
  const loadComputed = useCallback(async () => {
    if (!sessionToken) return;
    const soft = (p) => p.catch(() => null);
    const [activities, estimates, rulesRow, invoiceRes, poRes, reconRes] = await Promise.all([
      soft(loadAllEntityRows({ entity: OpportunityActivity, sort: "-updated_date", label: "Attention feed activities" })),
      soft(loadAllEntityRows({ entity: AllInOneEstimate, query: { status: "sent" }, sort: "-updated_date", label: "Attention feed estimates" })),
      soft(loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: "followupAutomationRules", label: "Attention feed follow-up rules" })),
      soft(base44.functions.invoke("invoicingAction", { session_token: sessionToken, action: "list_invoices" })),
      soft(base44.functions.invoke("purchaseOrderAction", { session_token: sessionToken, action: "list_purchase_orders" })),
      soft(base44.functions.invoke("manageReconciliation", { session_token: sessionToken, action: "bootstrap" })),
    ]);
    const invoices = (invoiceRes?.data || invoiceRes)?.invoices || [];
    const purchaseOrders = (poRes?.data || poRes)?.purchase_orders || [];
    const batches = (reconRes?.data || reconRes)?.batches || [];
    const now = new Date();
    setComputed({
      crm_events_due: dueCrmEvents(activities || [], now),
      comms_followups_due: dueCommsFollowups({
        estimates: estimates || [],
        invoices,
        activities: activities || [],
        rules: rulesRow?.setting_value,
        now,
      }),
      overdue_invoices: overdueInvoices(invoices, now),
      overdue_open_pos: overdueOpenPos(purchaseOrders, now),
      recon_variance_batches: varianceBatches(batches),
    });
  }, [sessionToken]);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [r, watchRes, notifRes] = await Promise.all([
        base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken,
          action: "attention_feed",
          today: todayLocal(),
        }),
        // Watch-rule hits (#349): "tell me when X reaches state Y" — the
        // dispatcher surfaces matching watched records here.
        base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken,
          action: "check_watches",
        }).catch(() => null),
        listMyNotifications(sessionToken, { limit: 40 }),
      ]);
      const d = r?.data || r;
      if (d?.success) {
        setFeed(d);
        publishAttentionFeed(d); // the bell dropdown's Feed tab reuses it
      }
      const hits = (watchRes?.data || watchRes)?.hits;
      setWatchHits(Array.isArray(hits) ? hits : []);
      if (notifRes) setPersisted(notifRes.notifications || []);
      void loadComputed();
    } catch { /* fail-soft — strip hides itself */ }
    finally { setLoading(false); }
  }, [sessionToken, loadComputed]);

  useEffect(() => { load(); }, [load]);

  // Share the latest computed sections with the bell badge — invoice/PO rows
  // the server feed already reports are excluded so the badge never
  // double-counts.
  useEffect(() => {
    const serverInvoiceIds = new Set((feed?.overdue_invoices || []).map((i) => String(i?.id || "")));
    const serverPoIds = new Set((feed?.overdue_pos || []).map((p) => String(p?.id || "")));
    publishComputedAttention({
      overdue_products: overdueProductRows,
      crm_events_due: computed?.crm_events_due || [],
      comms_followups_due: computed?.comms_followups_due || [],
      recon_variance_batches: computed?.recon_variance_batches || [],
      overdue_invoices_extra: (computed?.overdue_invoices || []).filter((i) => !serverInvoiceIds.has(String(i?.id || ""))),
      overdue_open_pos_extra: (computed?.overdue_open_pos || []).filter((p) => !serverPoIds.has(String(p?.id || ""))),
    });
  }, [feed, computed, overdueProductRows]);

  // Client-computed invoice/PO rows union with the server feed's lists —
  // dedupeById keeps a record reported by both paths from showing twice.
  const mergedInvoices = dedupeById([...(feed?.overdue_invoices || []), ...(computed?.overdue_invoices || [])]);
  const mergedPos = dedupeById([...(feed?.overdue_pos || []), ...(computed?.overdue_open_pos || [])]);

  const activePersisted = useMemo(
    () => persisted.filter((n) => !n.handled_at && !(n.snoozed_until && Date.parse(n.snoozed_until) > Date.now())),
    [persisted],
  );

  const markAllRead = async () => {
    if (!sessionToken) return;
    setLoading(true);
    // #327 global mark-all-read: portal messages keep the existing
    // customerPortalAction writer; persisted notifications go through
    // notificationAction — run both and refresh.
    try {
      await Promise.all([
        base44.functions.invoke("customerPortalAction", {
          session_token: sessionToken,
          action: "mark_all_read",
        }).catch(() => null),
        markAllNotificationsRead(sessionToken),
      ]);
    } catch { /* non-fatal */ }
    await load();
  };

  const markSectionRead = async (category) => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      if (category.key === "portal") {
        await base44.functions.invoke("customerPortalAction", {
          session_token: sessionToken,
          action: "mark_all_read",
        }).catch(() => null);
      } else if (category.notifications) {
        await markAllNotificationsRead(sessionToken);
      } else {
        // #327 per-section: feed items have no read state server-side, so
        // "mark read" here = persist a handled overlay for every listed id.
        const ids = category.items.map((i) => i.id);
        persistDismissed([
          ...dismissed.filter((d) => !ids.includes(d.id)),
          ...ids.map((id) => ({ id, handled_at: new Date().toISOString() })),
        ]);
        await dismissFeedItems(sessionToken, ids, "handled").catch(() => null);
      }
    } catch { /* non-fatal */ }
    await load();
  };

  const handleItemAction = async (item, kind) => {
    if (item.notification) {
      // Persisted notification — real row transitions.
      if (kind === "handled") {
        setPersisted((prev) => prev.filter((n) => n.id !== item.id));
        await markNotificationHandled(sessionToken, item.id).catch(() => null);
      } else if (kind === "snooze") {
        setPersisted((prev) => prev.filter((n) => n.id !== item.id));
        await snoozeNotification(sessionToken, item.id, 4).catch(() => null);
      }
      return;
    }
    if (kind === "handled") markItemHandled(item.id);
    else if (kind === "snooze") snoozeItem(item.id, 4);
  };

  const openItem = (item) => {
    if (item.notification) {
      if (isNotificationUnread(item.notification)) {
        setPersisted((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
        void markNotificationRead(sessionToken, item.id);
      }
    }
    navigate(item.href);
  };

  const categories = feed ? buildAttentionCategories({
    feed,
    computed,
    overdueProductRows,
    mergedInvoices,
    mergedPos,
    persisted: activePersisted,
  }).filter((c) => c.count > 0
    && !hiddenSections.has(c.prefKey)
    && !(snoozed[c.prefKey] && snoozed[c.prefKey] > Date.now())) : [];

  if (!feed) return null;
  if (categories.length === 0 && !loading) return null;

  const active = categories.find((c) => c.key === section || c.prefKey === section);
  const visibleItems = active ? filterVisibleFeedItems(active.items, dismissed) : [];

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      {watchHits.length > 0 && (
        <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/40" title={watchHits.map((h) => `${h.label || h.record_id} ${h.field}=${h.current}`).join("; ")}>
          <Eye className="h-3.5 w-3.5" />{watchHits.length} watched record{watchHits.length === 1 ? "" : "s"} matched — {watchHits.slice(0, 3).map((h) => `${h.label || h.entity} ${h.field} is now "${h.current}"`).join("; ")}{watchHits.length > 3 ? ` +${watchHits.length - 3} more` : ""}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <Bell className="h-3.5 w-3.5 text-violet-600" />
          Needs attention
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {categories.map((c) => (
          <button key={c.key} type="button"
            onClick={() => { setSection(section === c.key || section === c.prefKey ? "" : c.key); setOpen(true); }}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.tone} ${section === c.key || section === c.prefKey ? "ring-2 ring-violet-400" : ""}`}>
            <c.icon className="h-3 w-3" />
            {c.count} {c.label}
          </button>
        ))}
        <button type="button" onClick={toggleSound} title={soundOn ? "Mute notification sound" : "Unmute notification sound"}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
          {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {soundOn ? "Sound on" : "Sound off"}
        </button>
        <button type="button" onClick={markAllRead} disabled={loading} title="Mark portal messages and notifications read"
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </button>
        <div className="relative ml-auto">
          <button type="button" onClick={() => setPrefsOpen((v) => !v)} title="Notification preferences"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <Settings className="h-3.5 w-3.5" />
          </button>
          {prefsOpen && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Daily in-app digest</p>
              <label className="flex items-center gap-1.5 px-1 py-1 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={digestOn} onChange={toggleDigest} className="h-3 w-3" />
                Digest notification each morning
              </label>
              <p className="mb-1 border-t border-slate-100 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">Sections</p>
              {PREF_SECTION_KEYS.map((key) => {
                const cat = categories.find((c) => c.prefKey === key || c.key === key);
                const label = cat?.label || key;
                const isSnoozed = snoozed[key] && snoozed[key] > Date.now();
                return (
                  <div key={key} className="flex items-center gap-2 px-1 py-0.5">
                    <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={!hiddenSections.has(key)} onChange={() => toggleHidden(key)} className="h-3 w-3" />
                      {label}{isSnoozed ? " (snoozed)" : ""}
                    </label>
                    {!isSnoozed && (
                      <button type="button" onClick={() => snoozeSection(key)} title="Snooze 4 hours"
                        className="text-[9px] font-semibold text-slate-400 hover:text-amber-600">zzz</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {open && active && (
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {visibleItems.map((it) => (
            <div key={it.id} className="flex w-full items-center gap-1 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
              <button type="button" onClick={() => openItem(it)}
                className="flex flex-1 items-center justify-between gap-3 text-left">
                <span className={`text-sm font-medium ${it.notification && isNotificationUnread(it.notification) ? "font-bold text-slate-900 dark:text-white" : "text-slate-800 dark:text-slate-200"}`}>
                  {it.primary}
                </span>
                <span className="truncate text-xs text-slate-500">{it.secondary}</span>
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); void handleItemAction(it, "snooze"); }}
                title="Snooze 4 hours"
                className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-700">
                <Clock className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); void handleItemAction(it, "handled"); }}
                title="Mark as handled"
                className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {active.count > visibleItems.length && (
            <div className="px-3 py-1.5 text-xs text-slate-400">+{Math.max(0, active.count - active.items.length)} more{visibleItems.length !== active.items.length ? " (some hidden by handled/snooze)" : ""}</div>
          )}
          <button type="button" onClick={() => markSectionRead(active)} disabled={loading}
            className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs font-semibold text-violet-600 hover:bg-violet-50 disabled:opacity-50 dark:border-slate-800 dark:text-violet-300 dark:hover:bg-slate-800">
            {active.key === "portal" ? "Mark all portal messages read" : active.notifications ? "Mark all notifications read" : "Mark this section handled"}
          </button>
        </div>
      )}
    </div>
  );
}
