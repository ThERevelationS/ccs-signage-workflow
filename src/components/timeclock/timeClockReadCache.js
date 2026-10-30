import { base44 } from "@/api/base44Client";

// Shared short-TTL read cache for timeClockAction. Page mounts fan out several
// identical status reads (status_lite/status, snapshot, correction counts) —
// the same key inside the TTL collapses to one invoke. Mutating actions never
// read the cache and clear it, so clock in/out reflects immediately.
const READ_TTL_MS = 15000;
const READ_ONLY_ACTIONS = new Set([
  "status",
  "status_lite",
  "time_tracker_snapshot",
  "list_correction_requests",
  "my_history",
]);

const readCache = new Map();

export function clearTimeClockReadCache() {
  readCache.clear();
}

// The app's existing clock-state signals must invalidate cached reads.
if (typeof window !== "undefined") {
  const clear = () => clearTimeClockReadCache();
  window.addEventListener("ccs-timeclock-refresh", clear);
  window.addEventListener("ccs-timeclock-work-pause-changed", clear);
  window.addEventListener("storage", (event) => {
    if (event.key === "ccs_work_pause_signal") clear();
  });
}

// Drop-in for base44.functions.invoke("timeClockAction", { action, ... }).
// Read allowlist actions share the cache; anything else invokes directly and
// clears the cache first.
export async function invokeTimeClockAction({ action, sessionToken, payload = {} } = {}) {
  const call = () =>
    base44.functions
      .invoke("timeClockAction", { action, session_token: sessionToken, ...payload })
      .then((response) => response?.data ?? response);

  if (!READ_ONLY_ACTIONS.has(action)) {
    clearTimeClockReadCache();
    return call();
  }

  const key = `${action}|${JSON.stringify(payload)}`;
  const existing = readCache.get(key);
  if (existing && (existing.inFlight || existing.expires > Date.now())) {
    return existing.promise;
  }

  const promise = call();
  const entry = { promise, expires: Date.now() + READ_TTL_MS, inFlight: true };
  readCache.set(key, entry);
  promise
    .catch(() => {})
    .finally(() => {
      if (readCache.get(key) === entry) entry.inFlight = false;
    });
  return promise;
}
