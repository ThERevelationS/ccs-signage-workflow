import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Gift, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { usePolling } from "@/lib/usePolling";
import { computedAttentionCount } from "./attentionComputedModel";
import {
  listMyNotifications,
  evaluateNotificationTriggers,
  loadNotificationPrefs,
  getCachedNotificationPrefs,
  requestDailyDigest,
} from "./notificationClient";
import {
  buildDigestCounts,
  isNotificationActive,
  isNotificationUnread,
  publishAttentionFeed,
  publishPersistedNotifications,
} from "./notificationModel.mjs";
import { FEED_SECTION_KEYS } from "./attentionFeedCategories";
import NotificationCenter from "./NotificationCenter";

const todayLocal = () => new Date().toLocaleDateString("en-CA");

// Client-side gap between evaluate_triggers calls — the server also throttles
// per user, but this keeps the invoke off the hot poll entirely.
const EVAL_GAP_MS = 12 * 60 * 1000;

const readSeenIds = () => {
  try { return new Set(JSON.parse(localStorage.getItem("notif_seen_ids") || "[]")); } catch { return new Set(); }
};
const writeSeenIds = (set) => {
  try { localStorage.setItem("notif_seen_ids", JSON.stringify([...set].slice(-200))); } catch { /* quota — non-fatal */ }
};
const sessionGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sessionSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* non-fatal */ } };

// Subtle WebAudio beep — no asset needed (#339). Lazily created so the first
// poll doesn't trip the autoplay policy; a rejected resume() fails soft.
let audioCtx = null;
function playNotificationBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") { void audioCtx.resume().catch(() => {}); }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch { /* audio unavailable — notifications stay silent */ }
}

export default function AttentionBell({ compact = false, shellGlass = false }) {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  // First successful load hydrates the seen-set so backlog notifications
  // don't toast; only rows arriving after that baseline pop.
  const hydratedRef = useRef(false);
  const soundOnRef = useRef(localStorage.getItem("attention_sound") !== "off");

  const pushToasts = useCallback((fresh) => {
    if (!fresh.length) return;
    setToasts((prev) => [...prev, ...fresh.slice(0, 2)].slice(-3));
    if (soundOnRef.current && getCachedNotificationPrefs().sound_on !== false) playNotificationBeep();
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [feedRes, notifRes] = await Promise.all([
        base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken,
          action: "attention_feed",
          today: todayLocal(),
        }),
        listMyNotifications(sessionToken, { limit: 40 }),
      ]);
      const feed = feedRes?.data || feedRes || {};
      publishAttentionFeed(feed);
      const notifications = notifRes?.notifications || [];
      publishPersistedNotifications(notifications, notifRes?.unread_count);
      const feedCount = FEED_SECTION_KEYS.reduce(
        (sum, key) => sum + (Array.isArray(feed[key]) ? feed[key].length : 0), 0);
      const unread = typeof notifRes?.unread_count === "number"
        ? notifRes.unread_count
        : notifications.filter((n) => isNotificationUnread(n)).length;
      setCount(feedCount + computedAttentionCount() + unread);

      // New-persisted-notification detection → toast (+ beep, #336/#339).
      const seen = readSeenIds();
      if (!hydratedRef.current) {
        notifications.forEach((n) => seen.add(n.id));
        writeSeenIds(seen);
        hydratedRef.current = true;
      } else {
        const fresh = notifications.filter((n) => n?.id && !seen.has(n.id) && isNotificationActive(n));
        if (fresh.length) {
          fresh.forEach((n) => seen.add(n.id));
          writeSeenIds(seen);
          pushToasts(fresh);
        }
      }

      // Trigger evaluation + daily digest ride the bell poll so they work on
      // every page, gated cheaply client-side and authoritatively server-side.
      const now = Date.now();
      const lastEval = Number(sessionGet("notif_eval_at") || 0);
      if (now - lastEval > EVAL_GAP_MS) {
        sessionSet("notif_eval_at", String(now));
        void evaluateNotificationTriggers(sessionToken, todayLocal());
      }
      if (sessionGet("notif_digest_req") !== todayLocal()) {
        sessionSet("notif_digest_req", todayLocal());
        const prefs = await loadNotificationPrefs(sessionToken).catch(() => null);
        if (prefs?.digest_opt_in) {
          void requestDailyDigest(sessionToken, todayLocal(), buildDigestCounts(feed));
        }
      }
    } catch { /* fail soft — bell just stays quiet */ }
  }, [sessionToken, pushToasts]);

  // usePolling already pauses when document.hidden, skips open 429 breakers,
  // clears timers on unmount and only refreshes on focus when due (#330).
  const { runNow } = usePolling(load, 60000, { initialDelayMs: 2000 });

  // Keep the sound flag live — the feed strip and the prefs tab both write it.
  useEffect(() => {
    const sync = () => { soundOnRef.current = localStorage.getItem("attention_sound") !== "off"; };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${count} item${count === 1 ? "" : "s"} need attention`}
        className={`relative inline-flex items-center justify-center rounded-xl ${shellGlass ? "ccs-glass-control ccs-glass-neutral text-slate-100" : "clay-button border-2 text-gray-800 border-gray-200"} ${compact ? "h-7 w-7" : "h-9 w-9"}`}
      >
        <Bell className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {count > 0 && (
          <span className={`pointer-events-none absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full bg-red-600 font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900 ${compact ? "h-3.5 min-w-3.5 px-0.5 text-[8px]" : "h-4 min-w-4 px-1 text-[9px]"}`}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <NotificationCenter open={open} onClose={() => setOpen(false)} onRefresh={runNow} />
      {/* Celebration/event toasts — new persisted notifications pop here on
          every page the bell renders on, including EstimatorQueues (#336). */}
      {toasts.length > 0 && (
        <span className="fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2">
          {toasts.map((t) => (
            <ToastCard key={t.id} notification={t}
              onOpen={() => { dismissToast(t.id); if (t.deep_link) navigate(t.deep_link); }}
              onDismiss={() => dismissToast(t.id)} />
          ))}
        </span>
      )}
    </span>
  );
}

function ToastCard({ notification: n, onOpen, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 7000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  const celebration = n.category === "quote_approved";
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-left shadow-2xl transition-all ${celebration ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950" : "border-violet-300 bg-white dark:border-violet-700 dark:bg-slate-900"}`}>
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${celebration ? "bg-emerald-500 text-white" : "bg-violet-100 text-violet-700 dark:bg-violet-900"}`}>
        {celebration ? <Gift className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-xs font-bold ${celebration ? "text-emerald-800 dark:text-emerald-200" : "text-slate-800 dark:text-slate-100"}`}>
          {celebration ? `🎉 ${n.title}` : n.title}
        </span>
        {n.body && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{n.body}</span>}
      </span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="shrink-0 rounded p-0.5 text-slate-300 hover:text-slate-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
