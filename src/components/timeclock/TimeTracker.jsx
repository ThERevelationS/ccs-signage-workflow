import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/EmailGate";
import { useToast } from "@/components/ui/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { playSoundEffect } from "@/components/announcements/AnnouncementContext";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  formatCompanyDateTime,
  formatMinutes,
} from "@/components/timeclock/timeClockCompanyTime";
import {
  Hourglass,
  Pause,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

// Named accent presets keyed to hex; custom hex colors flow through makeAccent.
const ACCENT_PRESETS = {
  indigo: "#6366f1", emerald: "#10b981", amber: "#f59e0b", violet: "#8b5cf6",
  rose: "#f43f5e", sky: "#0ea5e9", cyan: "#06b6d4", teal: "#14b8a6",
  lime: "#84cc16", orange: "#f97316", fuchsia: "#d946ef", slate: "#64748b",
  red: "#ef4444", pink: "#ec4899", purple: "#a855f7", blue: "#3b82f6",
  green: "#22c55e", yellow: "#eab308", mint: "#34d399", coral: "#fb7185",
  gold: "#ca8a04", navy: "#1e40af", plum: "#7e22ce", brick: "#b91c1c",
  seafoam: "#2dd4bf", lavender: "#a78bfa", peach: "#fdba74", charcoal: "#27272a",
};

function hexToHsl(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

function makeAccent(hex) {
  const [h, s, l] = hexToHsl(hex);
  const hsl = (hh, ss, ll) => `hsl(${hh} ${ss}% ${ll}%)`;
  return {
    ring: hex,
    barStart: hsl(h, Math.max(20, s - 10), Math.min(78, l + 16)),
    barEnd: hsl(h, s, Math.max(26, l - 10)),
    soft: hsl(h, Math.max(28, s - 14), 94),
    softBorder: hsl(h, Math.max(18, s - 18), 78),
    text: hsl(h, Math.min(72, s), 24),
  };
}

export function resolveAccent(color) {
  const key = String(color || "indigo");
  const hex = ACCENT_PRESETS[key] || (/^#[0-9a-fA-F]{6}$/.test(key) ? key : ACCENT_PRESETS.indigo);
  return makeAccent(hex);
}
export { ACCENT_PRESETS };

const FONTS = {
  default: "",
  mono: "font-mono",
  rounded: "tracking-wide",
  serif: "font-serif",
  light: "font-light tracking-wide",
  heavy: "font-black tracking-tight",
};

const ANIMATION_CLASSES = new Set([
  "pulse", "glow", "breathe", "sweep", "wave", "sparkle", "float",
  "flicker", "rainbow", "pop", "wobble", "ripple", "shake", "gradient",
]);

const MILESTONE_STORAGE = "ccs_time_tracker_milestones";

function milestoneKey(email, day) {
  return `${MILESTONE_STORAGE}:${String(email || "").toLowerCase()}:${day || "unknown"}`;
}

function readMilestones(email, day) {
  try {
    const raw = localStorage.getItem(milestoneKey(email, day));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(Number(n))) : [];
  } catch {
    return [];
  }
}

function writeMilestones(email, day, list) {
  try { localStorage.setItem(milestoneKey(email, day), JSON.stringify(list)); } catch {}
}

function formatClock(minutes, format) {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (format === "decimal") return `${(total / 60).toFixed(2)}h`;
  if (format === "hours_minutes") return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatClockSeconds(minutesFloat, format) {
  if (format !== "hh_mm_ss") return formatClock(minutesFloat, format);
  const total = Math.max(0, Math.floor(minutesFloat * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toneFor(progress, overtime) {
  if (overtime) return "overtime";
  if (progress >= 1) return "goal";
  if (progress >= 0.9) return "near";
  return "normal";
}

const TONE_RING = { normal: null, near: "#f59e0b", goal: "#10b981", overtime: "#8b5cf6" };
const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function TimeTracker({ position = "top", hasTopBar = true, hasSideBar = true } = {}) {
  const { currentUser, sessionToken } = useAuth();
  const location = useLocation();
  const onTimeClock = String(location?.pathname || "").toLowerCase().includes("timeclock");
  const [focused, setFocused] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const navigate = useNavigate();
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 767px)").matches
      : false);
  const { toast } = useToast();
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const scopeKey = `${email}|${sessionToken ? "t" : ""}`;

  const [snapshotRecord, setSnapshotRecord] = useState({ scope: scopeKey, data: null, receivedAt: 0, serverOffset: 0 });
  const [pollError, setPollError] = useState("");
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const inFlightRef = useRef(null);
  const snapshotRef = useRef(null);
  snapshotRef.current = snapshotRecord.scope === scopeKey ? snapshotRecord : null;

  const snapshot = snapshotRecord.scope === scopeKey ? snapshotRecord.data : null;
  const prefs = snapshot?.prefs || null;
  const enabled = Boolean(
    sessionToken && snapshot && prefs?.tracker_enabled === true,
  );

  const refresh = useCallback(async ({ force = false } = {}) => {
    const requestScope = scopeRef.current;
    const requestEmail = String(currentUser?.email || "").trim().toLowerCase();
    if (!sessionToken || !requestEmail) return null;
    if (inFlightRef.current && !force) return inFlightRef.current;
    const promise = (async () => {
      try {
        const response = await base44.functions.invoke("timeClockAction", {
          action: "time_tracker_snapshot",
          session_token: sessionToken,
          target_email: requestEmail,
        });
        const data = response?.data || response;
        if (scopeRef.current !== requestScope) return data;
        if (!data?.success) throw new Error(data?.error || "Time Tracker status could not be verified.");
        const receivedAt = Date.now();
        const serverMs = Date.parse(String(data.server_time || ""));
        setSnapshotRecord({
          scope: requestScope,
          data,
          receivedAt,
          serverOffset: Number.isFinite(serverMs) ? serverMs - receivedAt : 0,
        });
        setPollError("");
        return data;
      } catch (err) {
        if (scopeRef.current === requestScope) {
          setPollError(err?.message || "Time Tracker status could not be loaded.");
        }
        throw err;
      } finally {
        if (inFlightRef.current === promise) inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [currentUser?.email, sessionToken]);

  // Initial + interval polling at the employee's chosen cadence.
  const intervalSeconds = Math.min(300, Math.max(15, Number(prefs?.update_interval_seconds) || 60));
  useEffect(() => {
    if (!sessionToken || !email) return undefined;
    let cancelled = false;
    const run = () => { if (!cancelled) refresh({ force: true }).catch(() => {}); };
    run();
    const id = window.setInterval(run, intervalSeconds * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [sessionToken, email, intervalSeconds, refresh]);

  // Re-poll when Time Clock activity signals a state change.
  useEffect(() => {
    if (!sessionToken || !email) return undefined;
    const onChange = (event) => {
      const incoming = event?.detail?.prefs;
      if (incoming && typeof incoming === "object") {
        setSnapshotRecord(prev => prev && prev.scope === scopeRef.current && prev.data
          ? { ...prev, data: { ...prev.data, prefs: incoming } }
          : prev);
      }
      refresh({ force: true }).catch(() => {});
    };
    const onStorage = (event) => { if (event.key === "ccs_work_pause_signal") onChange(); };
    const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
    window.addEventListener("ccs-timeclock-work-pause-changed", onChange);
    window.addEventListener("ccs:timeTrackerRefresh", onChange);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("ccs-timeclock-work-pause-changed", onChange);
      window.removeEventListener("ccs:timeTrackerRefresh", onChange);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionToken, email, refresh]);

  // Local 1s tick between authoritative snapshots.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const live = useMemo(() => {
    if (!snapshot) return null;
    const offset = Number(snapshotRecord.serverOffset || 0);
    const serverNow = nowMs + offset;
    const sinceReceipt = Math.max(0, (serverNow - (snapshotRecord.receivedAt + offset)) / 60000);
    const accruingPaid = snapshot.accruing_paid === true;
    const accruingElapsed = snapshot.status === "clocked_in";
    return {
      paid: Number(snapshot.paid_minutes_today || 0) + (accruingPaid ? sinceReceipt : 0),
      elapsed: Number(snapshot.elapsed_minutes_today || 0) + (accruingElapsed ? sinceReceipt : 0),
      weekly: Number(snapshot.weekly_paid_minutes || 0) + (accruingPaid ? sinceReceipt : 0),
      unpaidNow: Number(snapshot.live_unpaid_minutes || 0) + (accruingElapsed && !accruingPaid ? sinceReceipt : 0),
      frozen: snapshot.status === "clocked_in" && !accruingPaid,
    };
  }, [snapshot, snapshotRecord, nowMs]);

  // Per-day-of-week goal overrides fall back to the single daily goal.
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const goalMinutes = Math.max(60, Number(prefs?.daily_goal_overrides?.[dayKey]) || Number(prefs?.daily_goal_minutes) || 480);
  const displayMinutes = live ? (prefs?.count_mode === "elapsed" ? live.elapsed : live.paid) : 0;
  const progress = goalMinutes > 0 ? displayMinutes / goalMinutes : 0;
  const overtimeMinutes = Math.max(0, displayMinutes - goalMinutes);
  const overtime = overtimeMinutes > 0.5;
  const tone = toneFor(progress, overtime);
  const shown = prefs?.direction === "down" && !overtime
    ? Math.max(0, goalMinutes - displayMinutes)
    : displayMinutes;

  // Milestone detection: thresholds crossed on the live counter.
  const milestoneThresholds = useMemo(() => {
    if (prefs?.milestones_mode === "off") return [];
    if (prefs?.milestones_mode === "custom" && Array.isArray(prefs?.milestone_thresholds) && prefs.milestone_thresholds.length) {
      return prefs.milestone_thresholds;
    }
    return [1];
  }, [prefs?.milestones_mode, prefs?.milestone_thresholds]);

  useEffect(() => {
    if (!enabled || !live || !snapshot?.company_day) return;
    const fired = readMilestones(email, snapshot.company_day);
    const next = [...fired];
    for (const threshold of milestoneThresholds) {
      const marker = Number(threshold);
      if (!Number.isFinite(marker) || marker <= 0) continue;
      if (progress >= marker && !next.includes(marker)) {
        next.push(marker);
        const pct = Math.round(marker * 100);
        const label = marker >= 1 ? `${pct}% — daily goal reached!` : `${pct}% of your daily goal`;
        if (prefs?.milestone_behavior === "pulse" || prefs?.milestone_behavior === "toast" || prefs?.milestone_behavior === "toast_sound") {
          setPulse(true);
          window.setTimeout(() => setPulse(false), 2400);
        }
        if (prefs?.milestone_behavior === "toast" || prefs?.milestone_behavior === "toast_sound") {
          toast({ description: `Time Tracker: ${label} (${formatClock(displayMinutes, prefs?.time_format)} today)` });
        }
        if (prefs?.milestone_behavior === "toast_sound") {
          playSoundEffect(prefs?.milestone_sound || "chime");
        }
      }
    }
    if (prefs?.overtime_warning === true && overtime && !next.includes(999)) {
      next.push(999);
      const label = `Overtime: +${formatClock(overtimeMinutes, prefs?.time_format)} past goal`;
      if (prefs?.milestone_behavior === "pulse" || prefs?.milestone_behavior === "toast" || prefs?.milestone_behavior === "toast_sound") {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 2400);
      }
      if (prefs?.milestone_behavior === "toast" || prefs?.milestone_behavior === "toast_sound") {
        toast({ description: `Time Tracker: ${label}` });
      }
      if (prefs?.milestone_behavior === "toast_sound") playSoundEffect(prefs?.milestone_sound || "chime");
    }
    if (prefs?.weekly_celebrate === true) {
      const weeklyGoal = Math.max(60, Number(prefs?.weekly_goal_minutes) || 2400);
      if (live.weekly >= weeklyGoal && !next.includes(2000)) {
        next.push(2000);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 2400);
        toast({ description: `Time Tracker: weekly goal reached (${formatClock(weeklyGoal, "hours_minutes")})` });
        if (prefs?.milestone_behavior === "toast_sound") playSoundEffect(prefs?.milestone_sound || "chime");
      }
    }
    if (next.length !== fired.length || next.some((v, i) => v !== fired[i])) {
      writeMilestones(email, snapshot.company_day, next);
    }
  }, [enabled, live, progress, overtime, overtimeMinutes, milestoneThresholds, prefs, email, snapshot?.company_day, displayMinutes, toast]);

  // Time-of-day reminders: one toast per configured elapsed-minute mark.
  useEffect(() => {
    if (!enabled || !live || !snapshot?.company_day) return;
    const source = Array.isArray(prefs?.reminders) && prefs.reminders.length ? prefs.reminders
      : (Array.isArray(prefs?.alert_minutes) ? prefs.alert_minutes : []);
    if (!source.length) return;
    const fired = readMilestones(email, snapshot.company_day);
    const next = [...fired];
    for (const r of source) {
      const minute = Number(typeof r === "object" && r !== null && Number(r.percent) > 0
        ? Number(r.percent) * goalMinutes
        : (typeof r === "object" && r !== null ? r.minutes : r));
      if (!Number.isFinite(minute) || minute <= 0) continue;
      const label = typeof r === "object" && r !== null ? String(r.label || "").trim() : "";
      const marker = 10000 + minute;
      if (displayMinutes >= minute && !next.includes(marker)) {
        next.push(marker);
        toast({ description: `Time Tracker reminder: ${label || formatClock(minute, "hours_minutes") + " on the clock"}` });
        if (prefs?.milestone_behavior === "toast_sound") playSoundEffect(prefs?.milestone_sound || "chime");
      }
    }
    if (next.length !== fired.length) writeMilestones(email, snapshot.company_day, next);
  }, [enabled, live, displayMinutes, prefs, email, snapshot?.company_day, toast]);

  // Location gate: hidden everywhere, or restricted to a bar.
  const locationPref = prefs?.location || "both";
  useEffect(() => {
    const mark = () => setFocused(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("blur", mark);
    window.addEventListener("focus", mark);
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 767px)") : null;
    const onMq = (event) => setIsMobileView(event.matches);
    mq?.addEventListener?.("change", onMq);
    return () => { document.removeEventListener("visibilitychange", mark); window.removeEventListener("blur", mark); window.removeEventListener("focus", mark); mq?.removeEventListener?.("change", onMq); };
  }, []);

  // Idle-hide preference: track real user activity and suppress the tracker
  // after the configured idle window.
  const lastActivityRef = useRef(0);
  useEffect(() => {
    lastActivityRef.current = Date.now();
    const mark = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("pointermove", mark);
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    return () => {
      window.removeEventListener("pointermove", mark);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);
  const idleLimitMs = Math.max(0, Number(prefs?.hide_when_idle_minutes || 0)) * 60000;
  const idleExpired = idleLimitMs > 0 && lastActivityRef.current > 0 && nowMs - lastActivityRef.current > idleLimitMs;

  // One source of truth for other widgets/components that want the live totals.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__timeTrackerLive = live
        ? { paid: live.paid, elapsed: live.elapsed, weekly: live.weekly, goalMinutes, status: snapshot?.status || null }
        : null;
    }
  }, [live, goalMinutes, snapshot?.status]);

  const matchesPref = locationPref === "both" ||
    (locationPref === "top" && position !== "side") ||
    (locationPref === "side" && position === "side");
  const visibleHere = enabled && locationPref !== "hidden" &&
    !(prefs?.show_only_clocked_in === true && snapshot?.status !== "clocked_in") &&
    !(prefs?.hide_when_unfocused === true && !focused) &&
    !idleExpired &&
    !(prefs?.timeclock_page_only === true && !onTimeClock) &&
    !(prefs?.device_scope === "desktop_only" && isMobileView) &&
    !(prefs?.device_scope === "mobile_only" && !isMobileView) &&
    (matchesPref ||
     (locationPref === "top" && !hasTopBar) ||
     (locationPref === "side" && !hasSideBar));

  const accent = resolveAccent(prefs?.accent_color);
  const ringColor = prefs?.progressive_colors === false ? accent.ring : (TONE_RING[tone] || accent.ring);
  const clockedIn = snapshot?.status === "clocked_in";
  const frozen = live?.frozen === true;
  const animClass = prefs?.animation_style === "pulse"
    ? (pulse ? "tracker-pulse" : "")
    : ANIMATION_CLASSES.has(prefs?.animation_style)
      ? `tracker-${prefs.animation_style}`
      : "";
  const animTarget = prefs?.animation_target || "all";
  const animFor = (t) => (animTarget === t ? animClass : "");

  const ringSize = prefs?.size === "expanded" ? 34 : 26;
  const circumference = 2 * Math.PI * 100;
  const ringFraction = Math.min(1, progress);

  const popoverStats = snapshot ? [
    { label: "Clocked in", value: snapshot.clock_in ? formatCompanyDateTime(snapshot.clock_in) : "—" },
    { label: "Paid time", value: formatClock(live?.paid || 0, prefs?.time_format), accent: true },
    { label: "Unpaid break", value: formatMinutes(Math.round((snapshot.break_minutes || 0) - (snapshot.paid_break_minutes || 0) + (snapshot.on_unpaid_break_now ? snapshot.live_unpaid_minutes || 0 : 0))) },
    { label: "Work Pause", value: formatMinutes(Math.round((snapshot.pause_minutes || 0) + (snapshot.paused_now ? snapshot.live_unpaid_minutes || 0 : 0))) },
  ] : [];

  const projectedFinish = useMemo(() => {
    if (!snapshot || !live || !clockedIn || overtime) return null;
    const remaining = goalMinutes - live.paid;
    if (remaining <= 0) return null;
    const unpaidSoFar = Math.max(0, live.elapsed - live.paid);
    const unpaidRate = live.elapsed > 15 ? Math.min(0.5, unpaidSoFar / live.elapsed) : 0;
    const finishMs = Date.now() + snapshotRecord.serverOffset + (remaining / Math.max(0.5, 1 - unpaidRate)) * 60000;
    return new Date(finishMs).toISOString();
  }, [snapshot, live, clockedIn, overtime, goalMinutes, snapshotRecord.serverOffset]);

  const pace = useMemo(() => {
    if (!snapshot || !live || !clockedIn) return null;
    const unpaidExpected = Math.max(30, live.elapsed - live.paid);
    const presenceNeeded = goalMinutes + unpaidExpected;
    const expectedPaid = live.elapsed * (goalMinutes / presenceNeeded);
    const diff = live.paid - expectedPaid;
    if (Math.abs(diff) < 3) return { label: "On pace", minutes: 0 };
    return diff > 0
      ? { label: `${formatMinutes(Math.round(diff))} ahead of pace`, minutes: diff }
      : { label: `${formatMinutes(Math.round(-diff))} behind pace`, minutes: diff };
  }, [snapshot, live, clockedIn, goalMinutes]);

  // Next unfired milestone - "45m to 8h" chip.
  const nextMilestone = useMemo(() => {
    if (!live || !clockedIn || !milestoneThresholds.length) return null;
    for (const marker of [...milestoneThresholds].sort((a, b) => a - b)) {
      const target = marker * goalMinutes;
      if (target > displayMinutes) return { remaining: target - displayMinutes, target };
    }
    return null;
  }, [live, clockedIn, milestoneThresholds, goalMinutes, displayMinutes]);

  // Approaching the overtime threshold - shifts the chip amber before OT hits.
  const otNearMinutes = !overtime && clockedIn ? Math.max(0, goalMinutes - displayMinutes) : 0;
  const otNear = !overtime && clockedIn && otNearMinutes > 0 && otNearMinutes <= 30;

  // "Last action" line for the popover header.
  const lastActionText = (() => {
    if (!snapshot || !clockedIn) return null;
    if (snapshot.paused_now) return "Work paused";
    if (snapshot.on_unpaid_break_now) return "On break";
    return snapshot.clock_in ? `Clocked in ${formatCompanyDateTime(snapshot.clock_in)}` : null;
  })();

  const weeklyDaily = Array.isArray(snapshot?.weekly_daily_minutes) ? snapshot.weekly_daily_minutes : [];
  const weekGoal = Math.max(60, Number(prefs?.weekly_goal_minutes) || 2400);

  // Goal streak: consecutive days at/above the daily goal, ending today.
  const goalStreak = useMemo(() => {
    if (weeklyDaily.length !== 7) return 0;
    let streak = 0;
    for (let i = weeklyDaily.length - 1; i >= 0; i -= 1) {
      const minutes = i === todayIndex && live ? live.paid : Number(weeklyDaily[i] || 0);
      if (minutes >= goalMinutes) streak += 1;
      else break;
    }
    return streak;
  }, [weeklyDaily, live, goalMinutes, todayIndex]);

  // Yesterday's total for context, and the trailing average for pace compare.
  const yesterdayMinutes = todayIndex > 0 ? Number(weeklyDaily[todayIndex - 1] || 0) : null;
  const weekAvgMinutes = useMemo(() => {
    const days = weeklyDaily.map(Number).filter((m, i) => i < todayIndex && m > 0);
    return days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
  }, [weeklyDaily, todayIndex]);
  const todayIndex = (() => {
    const day = snapshot?.company_day;
    if (!day) return -1;
    return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  })();

  const trackerLabel = clockedIn
    ? (String(prefs?.custom_label || "").trim() || (prefs?.direction === "down" && !overtime ? "Remaining" : "Today"))
    : "";
  const trackerTime = clockedIn
    ? (prefs?.show_seconds === false
        ? formatClock(shown, "hours_minutes")
        : formatClockSeconds(shown, prefs?.time_format))
    : "Off the clock";
  const bgStyle = String(prefs?.background_style || "minimal");
  const bgClass = bgStyle === "minimal"
    ? "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"
    : `tracker-bg-${bgStyle} rounded-2xl border`;
  const accentVars = {
    "--tracker-accent": accent.ring,
    "--tracker-accent-soft": accent.soft,
    "--tracker-accent-text": accent.text,
  };

  if (!visibleHere) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-time-tracker
          aria-label={`Time Tracker. ${clockedIn ? `${formatClock(displayMinutes, "hours_minutes")} of ${formatClock(goalMinutes, "hours_minutes")} today` : "Not clocked in"}`}
          title={live ? `Paid ${formatClock(live.paid, "hours_minutes")} · Elapsed ${formatClock(live.elapsed, "hours_minutes")} · Week ${formatClock(live.weekly, "hours_minutes")} · Goal ${formatClock(goalMinutes, "hours_minutes")}` : "Time Tracker"}
          className={`tracker-pill group relative flex items-center gap-2.5 text-left outline-none transition-[transform,opacity] duration-200 focus-visible:ring-4 focus-visible:ring-indigo-300/60 ${bgClass} ${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} ${animFor("all")} ${prefs?.goal_celebrate !== false && clockedIn && progress >= 1 ? "tracker-celebrate" : ""}`}
          style={{
            zoom: prefs?.scale || 1,
            opacity: prefs?.opacity ?? 1,
            ...accentVars,
          }}
        >
          {(prefs?.display_style === "ring" || prefs?.display_style === "donut") && (
            <span className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
              <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className={animFor("ring")} aria-hidden="true">
                <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={prefs?.display_style === "donut" ? 40 : 26} />
                <circle
                  cx="120" cy="120" r="100" fill="none"
                  stroke={ringColor}
                  strokeWidth={prefs?.display_style === "donut" ? 40 : 26} strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - ringFraction)}
                  transform="rotate(-90 120 120)"
                  className={prefs?.animation_style === "none" ? "" : "transition-[stroke-dashoffset] duration-700 ease-out"}
                />
              </svg>
              {prefs?.display_style === "donut" && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none" style={{ color: ringColor }}>
                  {Math.round(Math.min(1, Math.max(0, ringFraction)) * 100)}%
                </span>
              )}
            </span>
          )}
          {prefs?.display_style === "arc" && (
            <svg viewBox="0 0 120 62" style={{ width: ringSize * 1.5, height: Math.round(ringSize * 0.78) }} className={`shrink-0 ${animFor("ring")}`} aria-hidden="true">
              <path d="M10 58 A50 50 0 0 1 110 58" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="11" strokeLinecap="round" />
              <path
                d="M10 58 A50 50 0 0 1 110 58" fill="none"
                stroke={ringColor} strokeWidth="11" strokeLinecap="round"
                strokeDasharray="157.1"
                strokeDashoffset={157.1 * (1 - ringFraction)}
                className={prefs?.animation_style === "none" ? "" : "transition-[stroke-dashoffset] duration-700 ease-out"}
              />
            </svg>
          )}
          {prefs?.show_icon !== false && (frozen ? <Pause className={`shrink-0 opacity-70 ${prefs?.size === "expanded" ? "h-4 w-4" : "h-3.5 w-3.5"} ${animFor("icon")}`} /> : <Timer className={`shrink-0 opacity-70 ${prefs?.size === "expanded" ? "h-4 w-4" : "h-3.5 w-3.5"} ${animFor("icon")}`} />)}
          <span className={`flex flex-col leading-none ${FONTS[prefs?.font] || ""}`}>
            <span
              className={`font-bold tabular-nums ${prefs?.privacy_blur ? "blur-[3px] transition-[filter] duration-200 group-hover:blur-0 group-focus-visible:blur-0" : ""} ${prefs?.size === "expanded" ? "text-lg" : "text-sm"} ${frozen ? "opacity-60" : ""} ${prefs?.display_style === "flip" ? "tracker-flip" : prefs?.display_style === "roll" ? "tracker-roll" : ""} ${animFor("digits")} ${prefs?.blink_separator === true ? "tracker-blink" : ""}`}
              key={["flip","roll"].includes(prefs?.display_style) ? formatClockSeconds(shown, "hh_mm_ss") : "digits"}
            >
              {trackerLabel && prefs?.show_label !== false && <span className={`font-semibold uppercase tracking-[0.12em] opacity-55 mr-1.5 ${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}`}>{trackerLabel}</span>}
              {prefs?.display_style === "badge"
                ? <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: accent.ring }}>{trackerTime}</span>
                : trackerTime}
              {prefs?.show_percent === true && clockedIn && <span className={`ml-1.5 font-semibold opacity-60 ${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}`}>{Math.round(Math.min(1, progress) * 100)}%</span>}
            </span>
            {prefs?.display_style === "bar" && (
              <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <span
                  className={`block h-full rounded-full ${prefs?.animation_style === "none" ? "" : "transition-[width] duration-700 ease-out"}`}
                  style={{ width: `${Math.min(100, ringFraction * 100)}%`, backgroundImage: `linear-gradient(90deg, ${accent.barStart}, ${accent.barEnd})` }}
                />
              </span>
            )}
            {prefs?.show_overtime !== false && overtime && (
              <span className="mt-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                +{formatClock(overtimeMinutes, prefs?.time_format)} OT
              </span>
            )}
            {prefs?.show_overtime !== false && otNear && (
              <span className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                {formatMinutes(Math.ceil(otNearMinutes))} to OT
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80 rounded-2xl border-indigo-200/60 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-indigo-500/30 dark:bg-slate-950/95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Hourglass className="h-4 w-4 text-indigo-600" /> Time Tracker
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            clockedIn ? (frozen ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800") : "bg-slate-100 text-slate-600"
          }`}>
            {!clockedIn ? "Off" : frozen ? (snapshot?.paused_now ? "Paused" : "Break") : "Working"}
          </span>
        </div>
        {lastActionText && (
          <p className="mt-1 text-[10px] text-slate-400">
            {lastActionText}
            {frozen && live?.unpaidNow > 0 ? ` - ${formatMinutes(Math.round(live.unpaidNow))} so far` : ""}
          </p>
        )}

        {!snapshot && (
          <p className="mt-3 text-sm text-slate-500">{pollError || "Loading your day…"}</p>
        )}

        {snapshot && !clockedIn && (
          <p className="mt-3 text-sm text-slate-500">Clock in to start today's tracker.</p>
        )}

        {snapshot && (
          <>
            <div className="mt-3 space-y-1.5">
              {popoverStats.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{row.label}</span>
                  <span className={row.accent ? "font-bold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-300"}>{row.value}</span>
                </div>
              ))}
              {prefs?.show_projected_finish !== false && projectedFinish && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Projected finish</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{formatCompanyDateTime(projectedFinish)}</span>
                </div>
              )}
              {prefs?.show_pace !== false && pace && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Pace</span>
                  <span className={`flex items-center gap-1 font-medium ${pace.minutes >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {pace.minutes >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {pace.label}
                  </span>
                </div>
              )}
            </div>

            {prefs?.show_week_strip !== false && weeklyDaily.length === 7 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>This week{yesterdayMinutes !== null ? ` · yesterday ${formatClock(yesterdayMinutes, "hours_minutes")}` : ""}{weekAvgMinutes ? ` · avg ${formatClock(weekAvgMinutes, "hours_minutes")}/day` : ""}</span>
                  <span>{formatClock(live?.weekly || 0, "hours_minutes")} / {formatClock(weekGoal, "hours_minutes")}</span>
                </div>
                <div className="flex items-end gap-1">
                  {weeklyDaily.map((minutes, index) => {
                    const fraction = Math.min(1, Number(minutes || 0) / goalMinutes);
                    const isToday = index === todayIndex;
                    return (
                      <div key={index} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex h-14 w-full items-end rounded-md bg-black/[0.06] dark:bg-white/10">
                          <div
                            className={`w-full rounded-md ${isToday ? "tracker-today-bar" : ""}`}
                            style={{
                              height: `${Math.max(4, fraction * 100)}%`,
                              backgroundImage: fraction >= 1
                                ? "linear-gradient(180deg, #34d399, #059669)"
                                : `linear-gradient(180deg, ${accent.barStart}, ${accent.barEnd})`,
                              opacity: fraction < 0.5 && !isToday ? 0.45 : 1,
                            }}
                          />
                        </div>
                        <span className={`text-[9px] font-bold ${isToday ? "text-indigo-600" : "text-slate-400"}`}>{WEEK_LABELS[index]}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="relative mt-1 h-0 border-t border-dashed border-slate-300 dark:border-slate-600">
                  <span className="absolute -top-2 right-0 bg-white px-1 text-[9px] text-slate-400 dark:bg-slate-950">goal</span>
                </div>
              </div>
            )}

            {milestoneThresholds.length > 0 && (
              <div className="mt-4">
                <div className="relative h-1.5 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, ringFraction * 100)}%`, backgroundImage: `linear-gradient(90deg, ${accent.barStart}, ${accent.barEnd})` }} />
                  {milestoneThresholds.map((marker) => (
                    <span
                      key={marker}
                      className="absolute top-0 h-full w-px bg-slate-400/70"
                      style={{ left: `${Math.min(99, marker * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[9px] font-medium text-slate-400">
                  <span>0</span>
                  {milestoneThresholds.map((marker) => (
                    <span key={marker}>{Math.round(marker * 100)}%</span>
                  ))}
                </div>
                {nextMilestone && (
                  <p className="mt-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                    {formatMinutes(Math.ceil(nextMilestone.remaining))} to {formatClock(nextMilestone.target, prefs?.time_format)}
                  </p>
                )}
                {goalStreak >= 2 && (
                  <p className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {goalStreak}-day goal streak
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate("/TimeClock")}
              className="mt-3 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Open Time Clock
            </button>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
              Counts {prefs?.count_mode === "elapsed" ? "elapsed" : "paid"} time against a {formatClock(goalMinutes, "hours_minutes")} daily goal, in {TIME_CLOCK_COMPANY_TIME_LABEL}. Configure in Time Clock → Settings.
            </p>
            {snapshotRecord.receivedAt > 0 && (
              <p className="mt-1 text-[9px] text-slate-400">
                Synced {Math.max(0, Math.round((nowMs - snapshotRecord.receivedAt) / 1000))}s ago{pollError ? ` · refresh issue: ${pollError}` : ""}
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Static face preview � renders the tracker trigger with synthetic data so the
// settings card can preview draft prefs without saving or polling.
export function TimeTrackerPreview({ prefs }) {
  const accent = resolveAccent(prefs?.accent_color);
  const pvStyle = String(prefs?.background_style || "minimal");
  const pvBg = pvStyle === "minimal"
    ? "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"
    : `tracker-bg-${pvStyle} rounded-2xl border`;
  const pvVars = {
    "--tracker-accent": accent.ring,
    "--tracker-accent-soft": accent.soft,
    "--tracker-accent-text": accent.text,
  };
  const ringSize = prefs?.size === "expanded" ? 34 : 26;
  const circumference = 2 * Math.PI * 100;
  const ringFraction = 0.63;
  const ringColor = accent.ring;
  const animClass = prefs?.animation_style === "pulse"
    ? "tracker-pulse"
    : ANIMATION_CLASSES.has(prefs?.animation_style)
      ? `tracker-${prefs.animation_style}`
      : "";
  const animTarget = prefs?.animation_target || "all";
  const animFor = (t) => (animTarget === t ? animClass : "");
  const label = String(prefs?.custom_label || "").trim() || (prefs?.direction === "down" ? "Remaining" : "Today");
  const previewMinutes = prefs?.direction === "down" ? 187.35 : 247.8;
  const timeText = prefs?.show_seconds === false
    ? formatClock(previewMinutes, "hours_minutes")
    : formatClockSeconds(previewMinutes, prefs?.time_format);
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      className={`tracker-pill group relative flex items-center gap-2.5 text-left outline-none pointer-events-none ${pvBg} ${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} ${animFor("all")}`}
      style={{ zoom: prefs?.scale || 1, opacity: prefs?.opacity ?? 1, ...pvVars }}
    >
      {(prefs?.display_style === "ring" || prefs?.display_style === "donut") && (
        <span className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
          <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className={animFor("ring")}>
            <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={prefs?.display_style === "donut" ? 40 : 26} />
            <circle cx="120" cy="120" r="100" fill="none" stroke={ringColor} strokeWidth={prefs?.display_style === "donut" ? 40 : 26} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringFraction)} transform="rotate(-90 120 120)" />
          </svg>
          {prefs?.display_style === "donut" && (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none" style={{ color: ringColor }}>63%</span>
          )}
        </span>
      )}
      {prefs?.display_style === "arc" && (
        <svg viewBox="0 0 120 62" style={{ width: ringSize * 1.5, height: Math.round(ringSize * 0.78) }} className={`shrink-0 ${animFor("ring")}`}>
          <path d="M10 58 A50 50 0 0 1 110 58" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="11" strokeLinecap="round" />
          <path d="M10 58 A50 50 0 0 1 110 58" fill="none" stroke={ringColor} strokeWidth="11" strokeLinecap="round" strokeDasharray="157.1" strokeDashoffset={157.1 * (1 - ringFraction)} />
        </svg>
      )}
      {prefs?.show_icon !== false && <Timer className={`shrink-0 opacity-70 ${prefs?.size === "expanded" ? "h-4 w-4" : "h-3.5 w-3.5"} ${animFor("icon")}`} />}
      <span className={`flex flex-col leading-none ${FONTS[prefs?.font] || ""}`}>
        <span className={`font-bold tabular-nums ${prefs?.size === "expanded" ? "text-lg" : "text-sm"} ${prefs?.display_style === "flip" ? "tracker-flip" : ""} ${animFor("digits")} ${prefs?.blink_separator === true ? "tracker-blink" : ""}`}>
          {prefs?.show_label !== false && <span className={`font-semibold uppercase tracking-[0.12em] opacity-55 mr-1.5 ${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}`}>{label}</span>}
          {prefs?.display_style === "badge"
            ? <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: accent.ring }}>{timeText}</span>
            : timeText}
          {prefs?.show_percent === true && <span className={`ml-1.5 font-semibold opacity-60 ${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}`}>63%</span>}
        </span>
        {prefs?.display_style === "bar" && (
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <span className="block h-full rounded-full" style={{ width: "63%", backgroundImage: `linear-gradient(90deg, ${accent.barStart}, ${accent.barEnd})` }} />
          </span>
        )}
      </span>
    </button>
  );
}
