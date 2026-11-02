// Auto-refresh for the queue pages with entity-list budget discipline
// (masterplan item C-07).
//
// Budget context: boardFeed/queueFeed hold each feed payload in a server-side
// isolate cache for 30s (base44/functions/boardFeed/entry.ts
// FEED_CACHE_TTL_MS = 30_000). Polling faster than that cadence can NEVER
// return fresher data — every sub-30s request is a guaranteed cache hit that
// still burns the shared `entity_list` budget (140 req/60s per caller, shared
// by every poller in the app). So QUEUE_REFRESH_MIN_INTERVAL_MS is a hard
// floor on every scheduling path below, not a suggestion.
//
// Delta cursor: `refresh` is called as refresh({ since }) where `since` is the
// feed's updated_date cursor. The controller threads `res.next_cursor` from
// each response into the next call, so steady-state polls are cheap ASC delta
// scans, not full-table pulls. Callers wrap their fetch+apply in `refresh`
// (e.g. `(args) => { const res = await queueFeed(args); applyRows(res.rows);
// return res; }`) — the controller only needs the response's next_cursor.
//
// Visibility: the cadence pauses while the tab is hidden (ticks still fire but
// skip the call), and one debounced refresh runs when the tab regains focus so
// the user returns to fresh data without a burst of calls.

import { useCallback, useEffect, useReducer, useRef } from "react";

// boardFeed isolate-cache cadence — never poll faster than this (see header).
export const QUEUE_REFRESH_MIN_INTERVAL_MS = 30000;
// Regain-visible refresh debounce: absorbs visible/hidden flicker without a
// burst of feed calls.
export const QUEUE_REFRESH_RESUME_DEBOUNCE_MS = 2000;

// Hard floor on the poll cadence. Anything non-finite or under the floor
// reads as the floor; anything slower is preserved (rounded to whole ms).
export function clampQueueRefreshInterval(interval_ms) {
  const n = Number(interval_ms);
  if (!Number.isFinite(n) || n <= 0) return QUEUE_REFRESH_MIN_INTERVAL_MS;
  return Math.max(QUEUE_REFRESH_MIN_INTERVAL_MS, Math.round(n));
}

// Pure interval/visibility/cursor core — no React, no DOM. `now`, `isVisible`
// and the timer functions are injectable so the whole scheduling policy is
// Node-testable (scripts/test-queue-auto-refresh.mjs drives it with a fake
// clock + fake timers). The hook below is a thin wrapper around this.
export function createAutoRefreshController({
  refresh,
  interval_ms = QUEUE_REFRESH_MIN_INTERVAL_MS,
  now = () => Date.now(),
  isVisible = () => true,
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (handle) => clearTimeout(handle),
  resumeDebounceMs = QUEUE_REFRESH_RESUME_DEBOUNCE_MS,
  onError = (err) => console.warn("[useQueueAutoRefresh] refresh failed:", err),
  onStateChange,
  initialCursor = null,
} = {}) {
  if (typeof refresh !== "function") {
    throw new TypeError("createAutoRefreshController requires a refresh function");
  }

  const state = {
    intervalMs: clampQueueRefreshInterval(interval_ms),
    cursor: initialCursor ?? null,
    lastRefreshAt: null,
    refreshing: false,
    error: null,
    started: false,
    disposed: false,
    inFlight: false,
    tickHandle: null,
    resumeHandle: null,
  };

  function getState() {
    return {
      cursor: state.cursor,
      lastRefreshAt: state.lastRefreshAt,
      refreshing: state.refreshing,
      error: state.error,
    };
  }

  const emit = () => {
    try {
      onStateChange?.(getState());
    } catch {
      // An observer must never break the cadence.
    }
  };

  const clearTick = () => {
    if (state.tickHandle !== null) {
      clearTimeoutImpl(state.tickHandle);
      state.tickHandle = null;
    }
  };
  const clearResume = () => {
    if (state.resumeHandle !== null) {
      clearTimeoutImpl(state.resumeHandle);
      state.resumeHandle = null;
    }
  };

  // scheduleTick always clears first, so any number of calls converge on a
  // single armed timer — there is never more than one tick outstanding.
  function scheduleTick() {
    clearTick();
    if (state.disposed || !state.started) return;
    state.tickHandle = setTimeoutImpl(onTick, state.intervalMs);
  }

  // Single funnel for every refresh trigger (tick, resume, manual). Returns
  // true when a call was actually made; concurrent triggers collapse on the
  // in-flight guard so the feed can never be double-hit.
  async function runRefresh() {
    if (state.disposed || state.inFlight) return false;
    state.inFlight = true;
    state.refreshing = true;
    emit();
    try {
      const res = await refresh({ since: state.cursor });
      // Thread the feed's delta cursor into the next pull. nextCursor is the
      // JS-side alias; a response without either leaves the cursor alone so a
      // partial/odd payload can't silently restart the chain.
      const next = res?.next_cursor ?? res?.nextCursor ?? null;
      if (next !== null && next !== undefined && next !== "") state.cursor = next;
      state.error = null;
      state.lastRefreshAt = now();
      return true;
    } catch (err) {
      // A failed refresh must never kill the cadence: record it, keep the
      // timer, let the next tick retry.
      state.error = err instanceof Error ? err : new Error(String(err));
      try {
        onError?.(state.error);
      } catch {
        // A throwing logger must not break the cadence either.
      }
      return false;
    } finally {
      state.inFlight = false;
      state.refreshing = false;
      emit();
      // Reschedule from completion: a manual refreshNow pushes the next auto
      // tick a full interval out, which keeps total request rate bounded.
      scheduleTick();
    }
  }

  async function onTick() {
    state.tickHandle = null;
    if (state.disposed || !state.started) return;
    if (!isVisible()) {
      // Hidden tab: skip the CALL but keep the cadence so the next tick
      // re-checks. Regain-visible fires its own debounced refresh.
      scheduleTick();
      return;
    }
    await runRefresh();
  }

  // Called by the hook's visibilitychange listener (and by tests). Re-reads
  // isVisible() so the same entry point handles both transitions.
  function notifyVisibility() {
    if (state.disposed || !state.started) return;
    if (!isVisible()) {
      // Dropped to background — a queued regain-refresh must not leak a call
      // into a hidden tab.
      clearResume();
      return;
    }
    // Regained focus: ONE debounced refresh. Re-arming on every notification
    // means rapid visible/hidden flicker still produces a single call.
    clearResume();
    const requestedAt = now();
    state.resumeHandle = setTimeoutImpl(() => {
      state.resumeHandle = null;
      if (state.disposed || !state.started || !isVisible()) return;
      // A tick or manual refresh that completed at/after this request already
      // covers it — a second call now would be a 30s cache hit at best.
      if (state.lastRefreshAt !== null && state.lastRefreshAt >= requestedAt) return;
      void runRefresh();
    }, resumeDebounceMs);
  }

  function start() {
    if (state.disposed || state.started) return;
    state.started = true;
    scheduleTick();
  }

  // Pauses everything but keeps the cursor — used by the hook's effect
  // cleanup so `enabled` toggles can restart.
  function stop() {
    state.started = false;
    clearTick();
    clearResume();
  }

  // Terminal: after dispose, start/notifyVisibility/refreshNow are no-ops and
  // an in-flight completion can't re-arm the timer.
  function dispose() {
    stop();
    state.disposed = true;
  }

  // cursorKey-driven invalidation: switching lens/filter set resets the delta
  // chain so the next pull is a clean full fetch.
  function resetCursor(cursor = null) {
    state.cursor = cursor;
  }

  // Prop drift path — the floor still applies. A pending tick keeps its armed
  // delay; the new interval takes effect at the next scheduleTick.
  function setIntervalMs(interval_ms) {
    state.intervalMs = clampQueueRefreshInterval(interval_ms);
  }

  return {
    start,
    stop,
    dispose,
    notifyVisibility,
    resetCursor,
    setIntervalMs,
    getState,
    refreshNow: () => runRefresh(),
    get intervalMs() {
      return state.intervalMs;
    },
    get cursor() {
      return state.cursor;
    },
    get started() {
      return state.started;
    },
    get disposed() {
      return state.disposed;
    },
  };
}

// React wrapper. Usage on a queue page:
//
//   const { refreshing, lastRefreshAt, error, refreshNow } = useQueueAutoRefresh({
//     refresh: async ({ since }) => {
//       const res = await queueFeed({ since, module_key: moduleKey });
//       applyQueueResponse(res);          // caller merges res.rows by id
//       return res;                        // controller captures res.next_cursor
//     },
//     interval_ms: 45000,                  // anything <30s clamps to the floor
//     cursorKey: moduleKey,                // changing it resets the delta chain
//   });
//
// The cursor lives inside the controller (a ref-stable object), so advancing
// it does not re-render; `refreshing`/`error`/`lastRefreshAt` transitions do.
export function useQueueAutoRefresh({
  refresh,
  interval_ms = QUEUE_REFRESH_MIN_INTERVAL_MS,
  cursorKey = null,
  enabled = true,
} = {}) {
  const [, bump] = useReducer((x) => x + 1, 0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const controllerRef = useRef(null);
  if (controllerRef.current === null) {
    controllerRef.current = createAutoRefreshController({
      refresh: (args) => refreshRef.current?.(args),
      interval_ms,
      isVisible: () =>
        typeof document === "undefined" ? true : document.visibilityState === "visible",
      onStateChange: () => bump(),
    });
  }
  const controller = controllerRef.current;

  // Prop drift — the clamp floor applies here too.
  useEffect(() => {
    controller.setIntervalMs(interval_ms);
  }, [controller, interval_ms]);

  // cursorKey namespaces the delta chain (module lens, filter set, etc.) —
  // changing it invalidates the cursor so the next pull is a full fetch.
  const cursorKeyRef = useRef(cursorKey);
  useEffect(() => {
    if (cursorKeyRef.current !== cursorKey) {
      cursorKeyRef.current = cursorKey;
      controller.resetCursor();
    }
  }, [controller, cursorKey]);

  // Lifecycle + visibility wiring. Cleanup stops (not disposes) so toggling
  // `enabled` re-arms cleanly; either way every timer is cleared on unmount.
  useEffect(() => {
    if (!enabled) {
      controller.stop();
      return undefined;
    }
    controller.start();
    if (typeof document === "undefined") {
      return () => controller.stop();
    }
    const onVisibility = () => controller.notifyVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.stop();
    };
  }, [controller, enabled]);

  const refreshNow = useCallback(() => controller.refreshNow(), [controller]);
  const snap = controller.getState();

  return {
    cursor: snap.cursor,
    lastRefreshAt: snap.lastRefreshAt,
    refreshing: snap.refreshing,
    error: snap.error,
    refreshNow,
  };
}
