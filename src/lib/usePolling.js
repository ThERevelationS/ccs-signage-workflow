import { useCallback, useEffect, useRef } from "react";
import { jitteredDelay, shouldRunFocusRefresh } from "@/lib/pollingSchedule.mjs";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";

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
    initialDelayMs = 0,
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
    } catch {
      // Poll errors are handled by the polled functions themselves;
      // a rejection must never kill the schedule.
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
        // Hidden tabs and an open 429 circuit breaker both skip the call —
        // the schedule itself keeps running on its normal cadence.
        if (isHidden() || isFleetCoolingDown()) {
          schedule();
          return;
        }
        await run();
        schedule();
      }, jitteredDelay(intervalMs, jitter));
    };

    const refreshIfDue = () => {
      if (isHidden() || isFleetCoolingDown()) return;
      // Only refresh on focus/visibility when the scheduled tick was already
      // due (>= interval since the last run) — anything sooner adds calls
      // between ticks for no new data.
      if (shouldRunFocusRefresh(lastRunAtRef.current, Date.now(), Math.max(minFocusGapMs, intervalMs))) {
        run();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfDue();
    };

    let initialTimer = null;
    if (runOnMount) {
      // Chrome widgets (bells, banners, badges) pass initialDelayMs so their
      // first call yields the request pool to the page's own data on load.
      if (initialDelayMs > 0) {
        initialTimer = setTimeout(() => {
          initialTimer = null;
          if (isHidden() || isFleetCoolingDown()) return;
          run();
        }, jitteredDelay(initialDelayMs, jitter));
      } else {
        run();
      }
    }
    schedule();

    if (refreshOnFocus) {
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("focus", refreshIfDue);
      window.addEventListener("online", refreshIfDue);
    }

    return () => {
      clearTimer();
      if (initialTimer !== null) clearTimeout(initialTimer);
      if (refreshOnFocus) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", refreshIfDue);
        window.removeEventListener("online", refreshIfDue);
      }
    };
  }, [enabled, intervalMs, pauseWhenHidden, jitter, runOnMount, refreshOnFocus, minFocusGapMs, initialDelayMs, run]);

  return { runNow };
}