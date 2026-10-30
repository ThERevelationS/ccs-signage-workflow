import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, CheckCircle2, Coffee, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BREAK_CHOICES, FOCUS_CHOICES, displayTimer, freshTimer,
  normalizeTimer, timerAction, timerStorageKey,
} from "./focusTimerState";

function readTimer(key) {
  if (!key) return freshTimer();
  try {
    const stored = localStorage.getItem(key);
    return normalizeTimer(stored ? JSON.parse(stored) : null);
  } catch {
    return freshTimer();
  }
}

// Personal planning only. This must not mutate TimeEntry, break, Work Pause,
// Current Work, allocations or pay-period state, even when "Break" is selected.
export default function GlobalFocusTimer({ currentUser, paired = false, compact = false } = {}) {
  const identity = currentUser?.id || currentUser?.email;
  const key = timerStorageKey(identity);
  const [timer, setTimer] = useState(() => readTimer(key));
  const [open, setOpen] = useState(false);
  const lastStatusRef = useRef(timer.status);

  const persist = useCallback((next) => {
    setTimer(next);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {
      // Local storage may be unavailable; the visible timer still works
      // for the current mounted session rather than pretending it saved.
    }
  }, [key]);

  const refresh = useCallback(() => {
    if (!key) return;
    const next = readTimer(key);
    if (next.status === "finished") {
      try {
        const raw = localStorage.getItem(key);
        const original = raw ? JSON.parse(raw) : null;
        if (original?.status === "running") localStorage.setItem(key, JSON.stringify(next));
      } catch { /* Private browsing can block storage. */ }
    }
    setTimer(next);
  }, [key]);

  useEffect(() => {
    setTimer(readTimer(key));
    lastStatusRef.current = readTimer(key).status;
    setOpen(false);
  }, [key]);

  useEffect(() => {
    const onStorage = (event) => { if (event.key === key) refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, refresh]);

  useEffect(() => {
    if (timer.status !== "running") return;
    const update = () => {
      setTimer((previous) => {
        if (previous.status !== "running") return previous;
        const next = normalizeTimer(previous, Date.now());
        if (next.status === "finished" && key) {
          try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
        }
        if (next.status === "running" && next.remainingSeconds === previous.remainingSeconds) return previous;
        return next;
      });
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [timer.status, key]);

  useEffect(() => {
    if (timer.status === "finished" && lastStatusRef.current === "running") setOpen(true);
    lastStatusRef.current = timer.status;
  }, [timer.status]);

  const action = (type, value) => {
    const latest = key ? readTimer(key) : timer;
    persist(timerAction(latest, type, Date.now(), value));
  };

  if (!key) return null;

  const isFocus = timer.mode === "focus";
  const duration = Math.max(1, timer.durationSeconds);
  const progress = Math.max(0, Math.min(1, timer.remainingSeconds / duration));
  const circumference = 2 * Math.PI * 100;
  const running = timer.status === "running";
  const done = timer.status === "finished";
  const buttonLabel = done ? "Focus timer finished. Open timer" :
    `Open focus timer${running ? `, ${displayTimer(timer.remainingSeconds)} remaining` : ""}`;
  const triggerClassName = paired
    ? `ccs-focus-segment relative z-[1] flex items-center justify-center border-0 font-bold outline-none transition-[background-color,color,transform] duration-150 focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 ${compact ? "min-h-[26px] gap-1 px-1.5 py-0.5 text-[11px]" : "min-h-[32px] gap-1.5 px-2.5 py-1 text-sm"}`
    : `fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex min-h-[48px] items-center gap-2 rounded-2xl border-2 px-4 py-2 text-sm font-bold shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 lg:bottom-5 ${done
        ? "border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/70 dark:text-amber-100"
        : "border-purple-300 bg-purple-50 text-purple-900 dark:border-violet-500/50 dark:bg-violet-950/70 dark:text-violet-100"}`;

  return (
    <>
      <button type="button"
        data-focus-timer-trigger
        type="button"
        onClick={() => setOpen(true)}
        title={buttonLabel}
        aria-label={buttonLabel}
        className={triggerClassName}
      >
        {done ? <CheckCircle2 className={paired ? (compact ? "h-3.5 w-3.5" : "h-4 w-4") : "h-5 w-5"} /> : <Timer className={paired ? (compact ? "h-3.5 w-3.5" : "h-4 w-4") : "h-5 w-5"} />}
        <span>{done ? "Time's up" : running || timer.status === "paused"
          ? displayTimer(timer.remainingSeconds) : paired ? "Focus" : "Focus Timer"}</span>
        {running && <span className="sr-only">Running</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen} modal={false}>
        <DialogContent className="z-[90] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto rounded-3xl border-purple-200 bg-white/95 p-4 text-slate-900 shadow-2xl backdrop-blur-xl dark:border-violet-400/20 dark:bg-slate-950/95 dark:text-slate-100 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Brain className="h-6 w-6 text-purple-700" /> My Focus Timer
            </DialogTitle>
            <DialogDescription>
              One thing at a time. Your personal focus timer is separate from the CCS Time Clock.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 rounded-2xl bg-purple-50 p-1 dark:bg-violet-950/50" role="group" aria-label="Focus timer mode">
            <button type="button" disabled={running} onClick={() => action("mode", "focus")}
              aria-pressed={isFocus}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600 disabled:cursor-not-allowed ${isFocus ? "bg-white text-purple-800 shadow-sm dark:bg-slate-800 dark:text-violet-200" : "text-slate-600 dark:text-slate-300"}`}>
              <Brain className="h-4 w-4" /> Focus
            </button>
            <button type="button" disabled={running} onClick={() => action("mode", "break")}
              aria-pressed={!isFocus}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600 disabled:cursor-not-allowed ${!isFocus ? "bg-white text-purple-800 shadow-sm dark:bg-slate-800 dark:text-violet-200" : "text-slate-600 dark:text-slate-300"}`}>
              <Coffee className="h-4 w-4" /> Short Break
            </button>
          </div>

          <div className="mx-auto relative h-[220px] w-[220px]" role="timer"
            aria-label={`${isFocus ? "Focus" : "Break"} timer: ${displayTimer(timer.remainingSeconds)} remaining`}>
            <svg viewBox="0 0 240 240" className="h-full w-full" aria-hidden="true">
              <circle cx="120" cy="120" r="100" fill="none" stroke="#ede9fe" strokeWidth="16" />
              <circle cx="120" cy="120" r="100" fill="none"
                stroke={done ? "#d97706" : isFocus ? "#7c3aed" : "#0f766e"}
                strokeWidth="16" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                transform="rotate(-90 120 120)"
                className="transition-[stroke-dashoffset] duration-300" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-5xl font-extrabold tabular-nums tracking-tight">
                {displayTimer(timer.remainingSeconds)}
              </span>
              <span className="mt-2 text-sm font-semibold text-slate-500">
                {done ? "Block complete!" : running ? "You’ve got this" :
                  timer.status === "paused" ? "Paused" : isFocus ? "Ready to focus" : "Ready for a breather"}
              </span>
            </div>
          </div>

          <div aria-live="polite" className="min-h-[20px] text-center text-sm font-medium text-purple-800 dark:text-violet-200">
            {done ? isFocus ? "Focus block complete. Take a break or start another." :
              "Break complete. Ready for another focus block?" : timer.task || "Choose one task to work on."}
          </div>

          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="ccs-focus-task">
            The one thing I'm working on
          </label>
          <Input id="ccs-focus-task" maxLength={120} value={timer.task}
            onChange={(event) => action("task", event.target.value)}
            placeholder="e.g. Finish the Smith sign estimate"
            className="min-h-[44px] text-base" />

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="ccs-focus-duration">
              Focus minutes
              <select id="ccs-focus-duration" value={timer.focusMinutes} disabled={running}
                onChange={(event) => action("focusMinutes", event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-60">
                {FOCUS_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="ccs-break-duration">
              Break minutes
              <select id="ccs-break-duration" value={timer.breakMinutes} disabled={running}
                onChange={(event) => action("breakMinutes", event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-60">
                {BREAK_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button type="button" onClick={() => action(running ? "pause" : "start")}
              className="min-h-[48px] rounded-xl bg-purple-700 text-base hover:bg-purple-800">
              {running ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
              {running ? "Pause" : timer.status === "paused" ? "Resume" :
                done ? "Start another" : isFocus ? "Start focusing" : "Start break"}
            </Button>
            <Button type="button" variant="outline" onClick={() => action("reset")}
              className="min-h-[48px] rounded-xl border-slate-300" title="Reset current timer">
              <RotateCcw className="mr-1 h-4 w-4" /> Reset
            </Button>
          </div>

          {done && (
            <Button type="button" variant="outline"
              className="min-h-[44px] w-full rounded-xl border-teal-300 bg-teal-50 text-teal-900"
              onClick={() => action("mode", isFocus ? "break" : "focus")}>
              {isFocus ? "Switch to a short break" : "Back to focus"}
            </Button>
          )}

          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-950/40 dark:text-amber-100">
            Focus breaks do <strong>not</strong> start tracked lunch, unpaid breaks or Work Pause.
            Use the Time Clock separately whenever you actually stop working.
          </p>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {timer.finishedFocusBlocks} completed focus block{timer.finishedFocusBlocks === 1 ? "" : "s"} on this device.
            Timer survives refresh and keeps counting while you visit other pages.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
