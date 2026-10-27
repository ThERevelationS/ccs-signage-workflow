import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
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

const ACCENTS = {
  indigo: { ring: "#6366f1", pill: "border-indigo-300/60 bg-indigo-50/80 text-indigo-950 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-100", bar: "from-indigo-400 to-indigo-600" },
  emerald: { ring: "#10b981", pill: "border-emerald-300/60 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-100", bar: "from-emerald-400 to-emerald-600" },
  amber: { ring: "#f59e0b", pill: "border-amber-300/60 bg-amber-50/80 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-100", bar: "from-amber-400 to-amber-600" },
  violet: { ring: "#8b5cf6", pill: "border-violet-300/60 bg-violet-50/80 text-violet-950 dark:border-violet-500/40 dark:bg-violet-950/50 dark:text-violet-100", bar: "from-violet-400 to-violet-600" },
  rose: { ring: "#f43f5e", pill: "border-rose-300/60 bg-rose-50/80 text-rose-950 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-100", bar: "from-rose-400 to-rose-600" },
  sky: { ring: "#0ea5e9", pill: "border-sky-300/60 bg-sky-50/80 text-sky-950 dark:border-sky-500/40 dark:bg-sky-950/50 dark:text-sky-100", bar: "from-sky-400 to-sky-600" },
};

const FONTS = {
  default: "",
  mono: "font-mono",
  rounded: "tracking-wide",
  serif: "font-serif",
};

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

export default function TimeTracker({ position = "top" } = {}) {
  const { currentUser, sessionToken } = useAuth();
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
    const onChange = () => { refresh({ force: true }).catch(() => {}); };
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
      frozen: snapshot.status === "clocked_in" && !accruingPaid,
    };
  }, [snapshot, snapshotRecord, nowMs]);

  const goalMinutes = Math.max(60, Number(prefs?.daily_goal_minutes) || 480);
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
    if (next.length !== fired.length || next.some((v, i) => v !== fired[i])) {
      writeMilestones(email, snapshot.company_day, next);
    }
  }, [enabled, live, progress, overtime, overtimeMinutes, milestoneThresholds, prefs, email, snapshot?.company_day, displayMinutes, toast]);

  // Location gate: hidden everywhere, or restricted to a bar.
  const locationPref = prefs?.location || "both";
  const visibleHere = enabled && locationPref !== "hidden" &&
    (locationPref === "both" ||
     (locationPref === "top" && position !== "side") ||
     (locationPref === "side" && position === "side"));

  if (!visibleHere) return null;

  const accent = ACCENTS[prefs?.accent_color] || ACCENTS.indigo;
  const ringColor = TONE_RING[tone] || accent.ring;
  const clockedIn = snapshot?.status === "clocked_in";
  const frozen = live?.frozen === true;
  const animClass = prefs?.animation_style === "pulse"
    ? (pulse ? "tracker-pulse" : "")
    : ["glow", "breathe", "sweep"].includes(prefs?.animation_style)
      ? `tracker-${prefs.animation_style}`
      : "";

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

  const weeklyDaily = Array.isArray(snapshot?.weekly_daily_minutes) ? snapshot.weekly_daily_minutes : [];
  const weekGoal = Math.max(60, Number(prefs?.weekly_goal_minutes) || 2400);
  const todayIndex = (() => {
    const day = snapshot?.company_day;
    if (!day) return -1;
    return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  })();

  const trackerLabel = clockedIn
    ? (prefs?.direction === "down" && !overtime ? "Remaining" : "Today")
    : "";
  const trackerTime = clockedIn ? formatClockSeconds(shown, prefs?.time_format) : "Off the clock";
  const hasBubble = prefs?.background_style === "glass" || prefs?.background_style === "solid";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-time-tracker
          aria-label={`Time Tracker. ${clockedIn ? `${formatClock(displayMinutes, "hours_minutes")} of ${formatClock(goalMinutes, "hours_minutes")} today` : "Not clocked in"}`}
          className={`tracker-pill group relative flex items-center gap-2.5 text-left outline-none transition-[transform,opacity] duration-200 focus-visible:ring-4 focus-visible:ring-indigo-300/60 ${hasBubble ? `rounded-2xl border shadow-sm ${accent.pill} ${prefs?.background_style === "solid" ? "backdrop-blur-none" : "backdrop-blur-md"}` : "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"} ${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} ${animClass}`}
          style={{
            transform: `scale(${prefs?.scale || 1})`,
            transformOrigin: position === "side" ? "top center" : "left center",
            opacity: prefs?.opacity ?? 1,
          }}
        >
          {prefs?.display_style !== "minimal" && prefs?.display_style !== "flip" && prefs?.display_style !== "bar" && (
            <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className="shrink-0" aria-hidden="true">
              <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="26" />
              <circle
                cx="120" cy="120" r="100" fill="none"
                stroke={ringColor}
                strokeWidth="26" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ringFraction)}
                transform="rotate(-90 120 120)"
                className={prefs?.animation_style === "none" ? "" : "transition-[stroke-dashoffset] duration-700 ease-out"}
              />
            </svg>
          )}
          {frozen ? <Pause className={`shrink-0 opacity-70 ${prefs?.size === "expanded" ? "h-4 w-4" : "h-3.5 w-3.5"}`} /> : <Timer className={`shrink-0 opacity-70 ${prefs?.size === "expanded" ? "h-4 w-4" : "h-3.5 w-3.5"}`} />}
          <span className={`flex flex-col leading-none ${FONTS[prefs?.font] || ""}`}>
            <span
              className={`font-bold tabular-nums ${prefs?.privacy_blur ? "blur-[3px] transition-[filter] duration-200 group-hover:blur-0 group-focus-visible:blur-0" : ""} ${prefs?.size === "expanded" ? "text-lg" : "text-sm"} ${frozen ? "opacity-60" : ""} ${prefs?.display_style === "flip" ? "tracker-flip" : ""}`}
              key={prefs?.display_style === "flip" ? formatClockSeconds(shown, "hh_mm_ss") : "digits"}
            >
              {trackerLabel && <span className={`font-semibold uppercase tracking-[0.12em] opacity-55 mr-1.5 ${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}`}>{trackerLabel}</span>}
              {trackerTime}
            </span>
            {prefs?.display_style === "bar" && (
              <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <span
                  className={`block h-full rounded-full bg-gradient-to-r ${accent.bar} ${prefs?.animation_style === "none" ? "" : "transition-[width] duration-700 ease-out"}`}
                  style={{ width: `${Math.min(100, ringFraction * 100)}%` }}
                />
              </span>
            )}
            {prefs?.show_overtime !== false && overtime && (
              <span className="mt-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                +{formatClock(overtimeMinutes, prefs?.time_format)} OT
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
                  <span>This week</span>
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
                            className={`w-full rounded-md bg-gradient-to-t ${accent.bar} ${isToday ? "tracker-today-bar" : ""}`}
                            style={{ height: `${Math.max(4, fraction * 100)}%` }}
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
                  <div className={`h-full rounded-full bg-gradient-to-r ${accent.bar}`} style={{ width: `${Math.min(100, ringFraction * 100)}%` }} />
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
              </div>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
              Counts {prefs?.count_mode === "elapsed" ? "elapsed" : "paid"} time against a {formatClock(goalMinutes, "hours_minutes")} daily goal, in {TIME_CLOCK_COMPANY_TIME_LABEL}. Configure in Time Clock → Settings.
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Static face preview � renders the tracker trigger with synthetic data so the
// settings card can preview draft prefs without saving or polling.
export function TimeTrackerPreview({ prefs }) {
  const accent = ACCENTS[prefs?.accent_color] || ACCENTS.indigo;
  const hasBubble = prefs?.background_style === "glass" || prefs?.background_style === "solid";
  const ringSize = prefs?.size === "expanded" ? 34 : 26;
  const circumference = 2 * Math.PI * 100;
  const ringFraction = 0.63;
  const ringColor = accent.ring;
  const animClass = prefs?.animation_style === "pulse"
    ? ""
    : ["glow", "breathe", "sweep"].includes(prefs?.animation_style)
      ? `tracker-${prefs.animation_style}`
      : "";
  const label = prefs?.direction === "down" ? "Remaining" : "Today";
  const timeText = formatClockSeconds(prefs?.direction === "down" ? 187.35 : 247.8, prefs?.time_format);
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      className={`tracker-pill group relative flex items-center gap-2.5 text-left outline-none pointer-events-none ${hasBubble ? `rounded-2xl border shadow-sm ${accent.pill} ${prefs?.background_style === "solid" ? "backdrop-blur-none" : "backdrop-blur-md"}` : "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"} ${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} ${animClass}`}
      style={{ transform: `scale(${prefs?.scale || 1})`, transformOrigin: "left center", opacity: prefs?.opacity ?? 1 }}
    >
      {prefs?.display_style !== "minimal" && prefs?.display_style !== "flip" && prefs?.display_style !== "bar" && (
        <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className="shrink-0">
          <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="26" />
          <circle cx="120" cy="120" r="100" fill="none" stroke={ringColor} strokeWidth="26" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringFraction)} transform="rotate(-90 120 120)" />
        </svg>
      )}
      <Timer className={`shrink-0 opacity-70 ${prefs?.size === "expanded" ? "h-4 w-4" : "h-3.5 w-3.5"}`} />
      <span className={`flex flex-col leading-none ${FONTS[prefs?.font] || ""}`}>
        <span className={`font-bold tabular-nums ${prefs?.size === "expanded" ? "text-lg" : "text-sm"} ${prefs?.display_style === "flip" ? "tracker-flip" : ""}`}>
          <span className={`font-semibold uppercase tracking-[0.12em] opacity-55 mr-1.5 ${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}`}>{label}</span>
          {timeText}
        </span>
        {prefs?.display_style === "bar" && (
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <span className={`block h-full rounded-full bg-gradient-to-r ${accent.bar}`} style={{ width: "63%" }} />
          </span>
        )}
      </span>
    </button>
  );
}
