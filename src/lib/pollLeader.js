// Cross-tab poll leadership. One tab owns each ambient poll; siblings consume
// the broadcast result instead of firing duplicate network calls. Leadership
// lives in a localStorage lease (crash-safe — a dead tab's lease expires) and
// results travel over a shared BroadcastChannel.
//
// Lease length scales with the poll interval: a 180s poll only claims at tick
// time, so the lease must outlive the interval or leadership flaps every tick.

const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const channel = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("ccs-poll-leader")
  : null;

const storageKey = (name) => `ccs-poll-leader:${name}`;

function readLease(name) {
  try {
    const raw = localStorage.getItem(storageKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Try to hold leadership for `name`. Lease = ~1.5 intervals (min 45s) so a
 * live leader keeps it between ticks, but a dead tab yields quickly.
 * Returns true when this tab should run the poll this tick.
 */
export function claimPollLeadership(name, intervalMs) {
  const leaseMs = Math.max(45000, Math.ceil(intervalMs * 1.5));
  const now = Date.now();
  try {
    const current = readLease(name);
    if (current && current.tabId !== tabId && now - current.at < leaseMs) {
      return false; // a live sibling owns it
    }
    localStorage.setItem(storageKey(name), JSON.stringify({ tabId, at: now }));
    // Re-read to resolve write races between simultaneous claimants.
    return readLease(name)?.tabId === tabId;
  } catch {
    return true; // storage unavailable -> every tab leads (old behavior)
  }
}

/** Leader drops its lease early (unmount / hidden) so a sibling takes over fast. */
export function releasePollLeadership(name) {
  try {
    if (readLease(name)?.tabId === tabId) localStorage.removeItem(storageKey(name));
  } catch { /* non-fatal */ }
}

/** Leader shares a poll result with all sibling tabs. */
export function broadcastPollResult(name, data) {
  if (!channel) return;
  try {
    channel.postMessage({ type: "poll-result", name, data, at: Date.now() });
  } catch { /* structured-clone failures are non-fatal */ }
}

/**
 * Subscribe to sibling poll results for `name`. Returns an unsubscribe fn.
 * Followers call `apply(data)` with the leader's payload.
 */
export function onPollResult(name, apply) {
  if (!channel) return () => {};
  const handler = (event) => {
    const msg = event?.data || {};
    if (msg.type === "poll-result" && msg.name === name) apply(msg.data);
  };
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}
