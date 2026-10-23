import { useCallback, useEffect, useRef } from "react";
import { jitteredDelay, shouldRunFocusRefresh } from "@/lib/pollingSchedule.mjs";

export function usePolling(
  fn,
  intervalMs,
  {
    enabled = true,
    pauseWhenHidden = true,
    jitter = 0.2,
    runOnMount = true,
    refreshOnFocus = true,
    minFocusGapMs = 15000,
  } = {},
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const inFlightRef = useRef(false);
  const lastRunAtRef = useRef(0);
  const timerRef = useRef(null);

  const run = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastRunAtRef.current = Date.now();
    try {
      await fnRef.current();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const runNow = useCallback(async () => {
    await run();
  }, [run]);

  useEffect(() => {
    if (!enabled) return;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const isHidden = () =>
      pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden";

    const schedule = () => {
      clearTimer();
      timerRef.current = setTimeout(async () => {
        if (isHidden()) {
          schedule();
          return;
        }
        await run();
        schedule();
      }, jitteredDelay(intervalMs, jitter));
    };

    const refreshIfDue = () => {
      if (isHidden()) return;
      if (shouldRunFocusRefresh(lastRunAtRef.current, Date.now(), minFocusGapMs)) {
        run();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfDue();
    };

    if (runOnMount) run();
    schedule();

    if (refreshOnFocus) {
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("focus", refreshIfDue);
      window.addEventListener("online", refreshIfDue);
    }

    return () => {
      clearTimer();
      if (refreshOnFocus) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", refreshIfDue);
        window.removeEventListener("online", refreshIfDue);
      }
    };
  }, [enabled, intervalMs, pauseWhenHidden, jitter, runOnMount, refreshOnFocus, minFocusGapMs, run]);

  return { runNow };
}
