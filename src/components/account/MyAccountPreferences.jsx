// K-03 — "My Account" per-user preference surface. Sections:
//   1. Workspace & display — the existing Settings Center (theme/density/
//      nav order/profiles), surfaced here for parity with every other place
//      it is already mounted.
//   2. Timezone            — locale.timezone on the workspace-prefs blob
//      (#488 consumer: userDateDisplay.resolveUserTimeZone).
//   3. Queue defaults      — queues.defaultLens + queues.myQueueOnly on the
//      same blob (applied by src/pages/ProductQueues.jsx).
//   4. Notifications       — sound + digest opt-in + H-12 event
//      subscriptions on the NotificationPreference row.
//
// READS: everything on this panel arrives through data the app already
// loads or a single cached call — the workspace-prefs blob is hydrated by
// WorkspacePreferencesProvider at Layout mount, and notification prefs come
// through notificationClient's shared 30s cache (one get_preferences invoke
// the first time this tab opens within a session, zero when the feed/bell
// loaded it recently). No entity reads happen here.
//
// WRITES: all writes are session-scoped — workspacePrefsAction and
// notificationAction derive the owner from the session token server-side,
// so this panel can only ever edit the signed-in user's rows (no admin
// role required, and no path for one user to touch another's prefs).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { useWorkspacePreferences } from "@/components/layout/WorkspacePreferencesProvider";
import WorkspaceSettingsCenter from "@/components/timeclock/WorkspaceSettingsCenter";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  subscribeNotificationPrefs,
  getCachedNotificationPrefs,
} from "@/components/workflow/notificationClient";
import {
  SUBSCRIBABLE_EVENTS,
} from "../../../base44/shared/alertSubscriptionsModel.ts";
import {
  IANA_TIMEZONE_SUGGESTIONS,
  ACCOUNT_QUEUE_LENSES,
  normalizeTimezone,
  timezoneFromPrefs,
  resolveTimezoneChoice,
  queuePrefsFromWorkspace,
  queueDefaultsPatch,
  notificationPrefsPatch,
  accountSubscriptionsFor,
  accountSubscriptionUpsert,
  normalizeSubEventKey,
} from "./userPrefsModel";
import {
  MonitorCog, Globe2, ListFilter, Bell, BellRing, Volume2, MailOpen,
  Loader2, AlertCircle, Check, Layers,
} from "lucide-react";

const LENS_LABELS = {
  "": "App default (Design)",
  design: "Design",
  production: "Production",
  fulfillment: "Fulfillment",
  all: "All Active",
};

const DELIVERY_LABELS = { feed: "Feed", digest: "Daily digest", both: "Feed + digest" };

function Card({ icon: Icon, title, hint, children, actions }) {
  return (
    <div className="clay-card p-6">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon className="w-5 h-5 text-purple-600" />
          {title}
        </h2>
        {actions}
      </div>
      {hint && <p className="text-xs text-gray-500 mb-3">{hint}</p>}
      {children}
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
        {hint && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const selCls =
  "rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs " +
  "text-slate-800 dark:text-slate-100";

export default function MyAccountPreferences() {
  const { currentUser, sessionToken } = useAuth();
  const { prefs, patchPrefs, updatePrefs, saving, saveError } = useWorkspacePreferences();

  // --- Notification prefs: shared client cache (same store the bell/feed
  // use), hydrated once through loadNotificationPrefs's 30s TTL.
  const [notifPrefs, setNotifPrefs] = useState(() => getCachedNotificationPrefs());
  const [notifLoaded, setNotifLoaded] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const unsub = subscribeNotificationPrefs((p) => {
      if (mountedRef.current) setNotifPrefs(p);
    });
    loadNotificationPrefs(sessionToken)
      .catch(() => null)
      .finally(() => { if (mountedRef.current) setNotifLoaded(true); });
    return () => { mountedRef.current = false; unsub(); };
  }, [sessionToken]);

  const saveNotif = async (patch) => {
    if (!sessionToken) { setNotifError("Sign in to save notification preferences."); return; }
    setNotifBusy(true);
    setNotifError("");
    try {
      await saveNotificationPrefs(sessionToken, notificationPrefsPatch(patch));
    } catch (e) {
      setNotifError(e?.message || "Notification preferences could not be saved.");
    } finally {
      if (mountedRef.current) setNotifBusy(false);
    }
  };

  // --- Timezone ------------------------------------------------------------
  const storedTz = timezoneFromPrefs(prefs);
  const browserTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
  }, []);
  const [tzDraft, setTzDraft] = useState(storedTz);
  const [tzInvalid, setTzInvalid] = useState(false);
  // Re-seed the draft only when the stored value changes underneath us and
  // the input is not mid-edit (mirrors the page's own dirty-field pattern).
  const tzFocused = useRef(false);
  useEffect(() => { if (!tzFocused.current) { setTzDraft(storedTz); setTzInvalid(false); } }, [storedTz]);
  const commitTimezone = () => {
    const normalized = normalizeTimezone(tzDraft);
    if (tzDraft.trim() && !normalized) { setTzInvalid(true); return; }
    setTzInvalid(false);
    updatePrefs("locale.timezone", normalized);
    setTzDraft(normalized);
  };
  const effectiveTz = resolveTimezoneChoice(prefs) || browserTz;

  // --- Queue defaults -------------------------------------------------------
  const queuePrefs = queuePrefsFromWorkspace(prefs);
  const setQueue = (patch) => patchPrefs(queueDefaultsPatch({ ...queuePrefs, ...patch }));

  // --- Subscriptions --------------------------------------------------------
  const subs = useMemo(() => accountSubscriptionsFor(notifPrefs), [notifPrefs]);
  // Criteria-less subs are the ones this surface owns; scoped subs written
  // by other surfaces stay read-only here so a checkbox toggle can never
  // silently drop them.
  const generalSubByEvent = useMemo(() => {
    const map = new Map();
    for (const s of subs) {
      if (!Object.keys(s.criteria || {}).length && !map.has(s.event_key)) map.set(s.event_key, s);
    }
    return map;
  }, [subs]);
  const scopedCount = useMemo(
    () => subs.filter((s) => Object.keys(s.criteria || {}).length > 0).length,
    [subs],
  );
  const groupedEvents = useMemo(() => {
    const groups = new Map();
    for (const ev of SUBSCRIBABLE_EVENTS) {
      const g = groups.get(ev.entity) || [];
      g.push(ev);
      groups.set(ev.entity, g);
    }
    return [...groups.entries()];
  }, []);

  const toggleEvent = async (eventKey, checked, delivery) => {
    const key = normalizeSubEventKey(eventKey);
    if (!key) return;
    const existing = generalSubByEvent.get(key);
    const next = checked
      ? accountSubscriptionUpsert(subs, {
          event_key: key,
          criteria: {},
          delivery: delivery || existing?.delivery || "feed",
          enabled: true,
        })
      : accountSubscriptionUpsert(subs, {
          event_key: key,
          criteria: {},
          delivery: existing?.delivery || "feed",
          enabled: false,
        });
    await saveNotif({ subscriptions: next });
  };

  const changeDelivery = async (eventKey, delivery) => {
    const key = normalizeSubEventKey(eventKey);
    const existing = generalSubByEvent.get(key);
    if (!existing) return;
    await saveNotif({
      subscriptions: accountSubscriptionUpsert(subs, { ...existing, delivery, enabled: existing.enabled }),
    });
  };

  const notifSaving = notifBusy || saving;

  return (
    <div className="space-y-6">
      <Card
        icon={MonitorCog}
        title="Workspace & Display"
        hint="Theme, density, taskbar layout, navigation labels and saved view profiles — the same settings the workspace Settings Center manages. Everything here is yours only."
      >
        <WorkspaceSettingsCenter />
      </Card>

      <Card
        icon={Globe2}
        title="Timezone"
        hint="Dates and times across the app display in this zone (work orders, queues, calendars). Leave blank to use this device's timezone."
      >
        <Row label="Your timezone" hint={effectiveTz ? `Showing times in ${effectiveTz}` : "Showing times in the browser timezone"}>
          <div className="flex items-center gap-2">
            <Input
              value={tzDraft}
              list="ccs-tz-suggestions"
              placeholder={browserTz || "e.g. America/Chicago"}
              className="w-56"
              onFocus={() => { tzFocused.current = true; }}
              onBlur={() => { tzFocused.current = false; commitTimezone(); }}
              onChange={(e) => { setTzDraft(e.target.value); setTzInvalid(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTimezone(); } }}
            />
            <datalist id="ccs-tz-suggestions">
              {IANA_TIMEZONE_SUGGESTIONS.map((tz) => <option key={tz} value={tz} />)}
            </datalist>
          </div>
        </Row>
        {tzInvalid && (
          <div className="flex items-center gap-2 text-xs text-rose-600 mt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            That is not a recognized timezone name — try a suggestion or leave blank.
          </div>
        )}
        {storedTz && storedTz !== browserTz && (
          <button type="button" className="text-xs text-purple-600 hover:underline mt-1"
            onClick={() => { updatePrefs("locale.timezone", ""); setTzDraft(""); }}>
            Use this device's timezone ({browserTz || "browser local"})
          </button>
        )}
      </Card>

      <Card
        icon={ListFilter}
        title="Queue Defaults"
        hint="How the Product Queues page opens for you. A shared or bookmarked queue link always wins over these defaults."
      >
        <Row label="Open queue tab" hint="The lens Product Queues opens with when no tab is specified">
          <select
            className={selCls}
            value={queuePrefs.defaultLens}
            onChange={(e) => setQueue({ defaultLens: e.target.value })}
          >
            {["", ...ACCOUNT_QUEUE_LENSES].map((k) => (
              <option key={k || "default"} value={k}>{LENS_LABELS[k] || k}</option>
            ))}
          </select>
        </Row>
        <Row
          label="Only show my work"
          hint="Queue pages open filtered to rows assigned to you (same as the “Assigned to me” filter — you can always clear it on the page)"
        >
          <Switch
            checked={queuePrefs.myQueueOnly}
            onCheckedChange={(v) => setQueue({ myQueueOnly: v === true })}
          />
        </Row>
      </Card>

      <Card
        icon={Bell}
        title="Notifications"
        hint="Sounds, the daily digest, and which events land in your attention feed. Stored on your own notification preference record — nobody else's settings change."
        actions={notifBusy ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : null}
      >
        {!notifLoaded ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading notification preferences…
          </div>
        ) : (
          <>
            <Row label="Notification sound" hint="Play a sound when a new notification arrives">
              <Switch
                checked={notifPrefs?.sound_on !== false}
                disabled={!sessionToken}
                onCheckedChange={(v) => saveNotif({ sound_on: v === true })}
              />
            </Row>
            <Row label="Daily digest" hint="One end-of-day summary notification of what needs attention">
              <Switch
                checked={notifPrefs?.digest_opt_in === true}
                disabled={!sessionToken}
                onCheckedChange={(v) => saveNotif({ digest_opt_in: v === true })}
              />
            </Row>

            <div className="mt-4 mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <BellRing className="w-4 h-4 text-purple-600" />
              Event subscriptions
              {scopedCount > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  <Layers className="w-3 h-3 mr-1" />
                  {scopedCount} scoped {scopedCount === 1 ? "subscription" : "subscriptions"} managed elsewhere
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Subscribe to event types for your own feed — pick whether they post immediately, collect into the daily digest, or both.
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupedEvents.map(([entity, events]) => (
                <div key={entity} className="py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">{entity.replace(/_/g, " ")}</div>
                  {events.map((ev) => {
                    const sub = generalSubByEvent.get(ev.key);
                    const on = sub?.enabled === true;
                    return (
                      <div key={ev.key} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="min-w-0 text-sm text-slate-700 dark:text-slate-300">{ev.label}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          {on && (
                            <select
                              className={selCls}
                              value={sub.delivery}
                              disabled={!sessionToken || notifBusy}
                              onChange={(e) => changeDelivery(ev.key, e.target.value)}
                            >
                              {["feed", "digest", "both"].map((d) => (
                                <option key={d} value={d}>{DELIVERY_LABELS[d]}</option>
                              ))}
                            </select>
                          )}
                          <Switch
                            checked={on}
                            disabled={!sessionToken || notifBusy}
                            onCheckedChange={(v) => toggleEvent(ev.key, v === true)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
        {notifError && (
          <div className="flex items-center gap-2 text-xs text-rose-600 mt-2">
            <AlertCircle className="w-3.5 h-3.5" />
            {notifError}
          </div>
        )}
      </Card>

      {(notifSaving || saveError) && (
        <div className="flex items-center gap-2 text-xs">
          {notifSaving && <><Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" /><span className="text-gray-500">Saving…</span></>}
          {!notifSaving && saveError && <><AlertCircle className="w-3.5 h-3.5 text-rose-600" /><span className="text-rose-600">{saveError}</span></>}
          {!notifSaving && !saveError && <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-gray-500">Saved</span></>}
        </div>
      )}

      <div className="p-4 bg-sky-50 dark:bg-slate-800/60 rounded-lg border border-sky-200 dark:border-slate-700">
        <p className="text-sm text-sky-800 dark:text-sky-200 flex items-center gap-2">
          <MailOpen className="w-4 h-4 shrink-0" />
          <span>These preferences are tied to your sign-in{currentUser?.email ? ` (${currentUser.email})` : ""} and follow you across devices.</span>
        </p>
      </div>
    </div>
  );
}
