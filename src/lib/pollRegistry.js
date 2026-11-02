// Shared poll registry (masterplan item M-05).
//
// Problem: every page/widget used to arm its own setInterval — N components at
// 60s meant N timers, N visibility guards hand-copied (some forgotten, e.g.
// OrderSpreadsheet's loadData interval), and N calls the moment a hidden tab
// came back. The registry collapses the pattern: ONE window.setInterval per
// unique interval serves every registered fn, and one visibilitychange
// listener gates the whole page — while document.hidden, no fn runs unless it
// was registered with run_when_hidden: true. Verify: hidden tab → zero poll
// network traffic in the waterfall; the suppressed_ticks stat counts every
// fn-call the hidden tab skipped.
//
// Shape (mirrors createAutoRefreshController in useQueueAutoRefresh.js): a
// pure injectable core — clock, hidden probe, timers and the visibility
// listener are all injected, so scripts/test-poll-registry.mjs drives it with
// fakes and no DOM — plus a lazy browser-bound singleton behind a globalThis
// symbol. Multiple imports of this module always land on the same registry,
// even if a bundler duplicates the file. There is NO React import: the file
// is a plain ESM module so Node loads it directly and SSR/import of any page
// that transitively imports it can never touch window/document at module
// scope.
//
// Contract:
//
//   registerPoll(key, { interval_ms, fn, run_when_hidden?, refresh_on_visible? })
//     - key: unique non-empty string (re-registering the same key REPLACES the
//       previous registration — safe for effect re-runs).
//     - interval_ms: cadence; non-finite throws, anything under
//       POLL_REGISTRY_MIN_INTERVAL_MS clamps to the floor.
//     - fn: called on each tick; may return a promise. Errors/rejections are
//       routed to onError and never kill the cadence. A call still in flight
//       at the next tick is skipped (skipped_in_flight) rather than stacked.
//     - run_when_hidden (default false): exempt from the hidden pause — for
//       session-expiry/idle checks and the like that must keep working in a
//       background tab.
//     - refresh_on_visible (default true): when the tab returns to visible and
//       this entry is due (>= interval_ms since its last dispatch, or never
//       ran), it fires once immediately — the "regain focus → fresh data"
//       behaviour every hand-rolled site re-implemented.
//     - returns { key, unregister } — unregister() === unregisterPoll(key).
//
//   unregisterPoll(key) → boolean. Removing a group's last key clears its
//   timer; unknown keys are a no-op.
//
//   pollNow(key) → boolean. Manual single dispatch — ignores hidden/due
//   checks, still respects the in-flight guard.
//
//   setPollInterval(key, interval_ms) → boolean. Moves an entry between
//   groups without losing last_run_at — for dynamic cadences (e.g.
//   SmartsheetSyncWidget's 1s-while-running / 120s-idle).
//
//   stats() → { registered, active_listeners, intervals, interval_ms,
//               last_tick_at, suppressed_ticks, fired_calls,
//               skipped_in_flight, hidden, disposed }
//     registered: live keys. active_listeners: entries eligible on the next
//     tick (all when visible, only run_when_hidden when hidden).
//     suppressed_ticks: cumulative fn-calls skipped while hidden — the number
//     that should be ~0 fn-calls worth of network per hidden tab.
//
// Migration recipe for a raw `setInterval(load, ms)` in a component:
//
//   useEffect(() => {
//     const { unregister } = registerPoll("orders:list", {
//       interval_ms: 60000,
//       fn: () => loadData(false),
//     });
//     return unregister;
//   }, [deps]);
//
// (delete the inline `document.hidden`/isFleetCoolingDown guards — the
// registry owns visibility; keep the fleet breaker inside fn if it applies.)

import { shouldRunFocusRefresh } from "./pollingSchedule.mjs";

// Floor below which a "poll" is a bug: keeps a mistaken 0/negative cadence
// from becoming a busy loop. UI tickers faster than this should stay raw.
export const POLL_REGISTRY_MIN_INTERVAL_MS = 50;

function normalizeInterval(interval_ms) {
  const n = Number(interval_ms);
  if (!Number.isFinite(n)) {
    throw new TypeError(`registerPoll requires a finite interval_ms (got ${interval_ms})`);
  }
  return Math.max(POLL_REGISTRY_MIN_INTERVAL_MS, Math.round(n));
}

export function createPollRegistry({
  now = () => Date.now(),
  isHidden = () =>
    typeof document !== "undefined" &&
    (document.hidden === true || document.visibilityState === "hidden"),
  setIntervalImpl = (fn, ms) =>
    (typeof window !== "undefined" ? window : globalThis).setInterval(fn, ms),
  clearIntervalImpl = (handle) =>
    (typeof window !== "undefined" ? window : globalThis).clearInterval(handle),
  // (cb) => unsubscribe — one DOM listener for the whole registry. Injectable
  // so the harness flips visibility synchronously.
  addVisibilityListener =
    typeof document !== "undefined" && typeof document.addEventListener === "function"
      ? (cb) => {
          document.addEventListener("visibilitychange", cb);
          return () => document.removeEventListener("visibilitychange", cb);
        }
      : null,
  onError = (err, entry) =>
    console.warn(`[pollRegistry] "${entry?.key}" poll failed:`, err),
} = {}) {
  const entries = new Map(); // key -> entry
  const groups = new Map(); // interval_ms -> { handle, keys:Set<key> }
  const state = {
    disposed: false,
    last_tick_at: null,
    suppressed_ticks: 0,
    fired_calls: 0,
    skipped_in_flight: 0,
  };

  const reportError = (err, entry) => {
    try {
      onError?.(err, entry);
    } catch {
      // A throwing logger must not break the cadence.
    }
  };

  // Single dispatch path for ticks, resumes and pollNow. last_run_at stamps at
  // dispatch (usePolling parity) so a slow call can't look "due" mid-flight.
  function runEntry(entry) {
    if (state.disposed) return false;
    if (entry.in_flight) {
      // Overlapping polls are the bug every hand-rolled site guarded with its
      // own inFlight ref — one guard here replaces them all.
      state.skipped_in_flight += 1;
      return false;
    }
    entry.in_flight = true;
    entry.last_run_at = now();
    state.fired_calls += 1;
    try {
      const result = entry.fn();
      if (result && typeof result.then === "function") {
        result.then(
          () => {
            entry.in_flight = false;
          },
          (err) => {
            entry.in_flight = false;
            reportError(err, entry);
          },
        );
      } else {
        entry.in_flight = false;
      }
    } catch (err) {
      entry.in_flight = false;
      reportError(err, entry);
    }
    return true;
  }

  function tickGroup(group) {
    if (state.disposed) return;
    state.last_tick_at = now();
    const hidden = isHidden();
    for (const key of [...group.keys]) {
      const entry = entries.get(key);
      if (!entry) continue;
      if (hidden && !entry.run_when_hidden) {
        // The hidden pause: the timer still fires (a mixed group may have a
        // run_when_hidden sibling) but the fn-call — and therefore every
        // entity read behind it — is suppressed.
        state.suppressed_ticks += 1;
        continue;
      }
      runEntry(entry);
    }
  }

  // Regain-visible catch-up: each entry that is already due fires once.
  // Entries polled recently sit out, so a hidden/visible flicker cannot add
  // calls between ticks (shouldRunFocusRefresh = usePolling's focus rule).
  function resumeDue() {
    const t = now();
    for (const entry of entries.values()) {
      if (entry.refresh_on_visible === false) continue;
      // last_run_at 0 = never dispatched — always due (explicit check so the
      // semantics don't lean on now() being a real epoch).
      const due =
        entry.last_run_at === 0 ||
        shouldRunFocusRefresh(entry.last_run_at, t, entry.interval_ms);
      if (!due) continue;
      runEntry(entry);
    }
  }

  const detach = (entry) => {
    const group = entry.group;
    if (!group) return;
    group.keys.delete(entry.key);
    entry.group = null;
    if (group.keys.size === 0) {
      clearIntervalImpl(group.handle);
      groups.delete(group.interval_ms);
    }
  };

  function attach(entry) {
    let group = groups.get(entry.interval_ms);
    if (!group) {
      group = { interval_ms: entry.interval_ms, handle: null, keys: new Set() };
      group.handle = setIntervalImpl(() => tickGroup(group), entry.interval_ms);
      groups.set(entry.interval_ms, group);
    }
    group.keys.add(entry.key);
    entry.group = group;
  }

  function registerPoll(key, { interval_ms, fn, run_when_hidden = false, refresh_on_visible = true } = {}) {
    if (state.disposed) throw new Error("poll registry is disposed");
    if (typeof key !== "string" || key.trim() === "") {
      throw new TypeError("registerPoll requires a non-empty string key");
    }
    if (typeof fn !== "function") {
      throw new TypeError(`registerPoll("${key}") requires a fn`);
    }
    const normalized = normalizeInterval(interval_ms);
    // Same-key re-register = replace: effect re-runs can never stack timers.
    if (entries.has(key)) unregisterPoll(key);
    const entry = {
      key,
      fn,
      interval_ms: normalized,
      run_when_hidden: run_when_hidden === true,
      refresh_on_visible: refresh_on_visible !== false,
      last_run_at: 0,
      in_flight: false,
      group: null,
    };
    entries.set(key, entry);
    attach(entry);
    return { key, unregister: () => unregisterPoll(key) };
  }

  function unregisterPoll(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    detach(entry);
    entries.delete(key);
    return true;
  }

  function pollNow(key) {
    const entry = entries.get(key);
    if (!entry || state.disposed) return false;
    return runEntry(entry);
  }

  function setPollInterval(key, interval_ms) {
    const entry = entries.get(key);
    if (!entry) return false;
    const normalized = normalizeInterval(interval_ms);
    if (normalized === entry.interval_ms) return true;
    detach(entry);
    entry.interval_ms = normalized;
    attach(entry);
    return true;
  }

  function stats() {
    const hidden = isHidden();
    let active = 0;
    for (const entry of entries.values()) {
      if (!hidden || entry.run_when_hidden) active += 1;
    }
    return {
      registered: entries.size,
      active_listeners: active,
      intervals: groups.size,
      interval_ms: [...groups.keys()].sort((a, b) => a - b),
      last_tick_at: state.last_tick_at,
      suppressed_ticks: state.suppressed_ticks,
      fired_calls: state.fired_calls,
      skipped_in_flight: state.skipped_in_flight,
      hidden,
      disposed: state.disposed,
    };
  }

  const onVisibility = () => {
    if (state.disposed || isHidden()) return;
    resumeDue();
  };
  const removeVisibilityListener =
    typeof addVisibilityListener === "function" ? addVisibilityListener(onVisibility) : null;

  function dispose() {
    if (state.disposed) return;
    state.disposed = true;
    for (const group of groups.values()) clearIntervalImpl(group.handle);
    groups.clear();
    entries.clear();
    if (typeof removeVisibilityListener === "function") removeVisibilityListener();
  }

  return {
    registerPoll,
    unregisterPoll,
    pollNow,
    setPollInterval,
    stats,
    dispose,
    // Test/debug introspection — not part of the migration contract.
    get disposed() {
      return state.disposed;
    },
  };
}

// Process-wide singleton behind a global symbol: two bundles importing this
// module still land on one registry. Lazily created on first use so importing
// the module in SSR/Node (no document) wires nothing.
const POLL_REGISTRY_GLOBAL_KEY = "__ccs_poll_registry__";

export function getPollRegistry() {
  if (!globalThis[POLL_REGISTRY_GLOBAL_KEY]) {
    globalThis[POLL_REGISTRY_GLOBAL_KEY] = createPollRegistry();
  }
  return globalThis[POLL_REGISTRY_GLOBAL_KEY];
}

// Flat singleton delegates — the import surface call sites use.
export const registerPoll = (key, opts) => getPollRegistry().registerPoll(key, opts);
export const unregisterPoll = (key) => getPollRegistry().unregisterPoll(key);
export const pollNow = (key) => getPollRegistry().pollNow(key);
export const setPollInterval = (key, interval_ms) =>
  getPollRegistry().setPollInterval(key, interval_ms);
export const pollRegistryStats = () => getPollRegistry().stats();
