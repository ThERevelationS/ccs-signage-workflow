// Shared app-wide 429 circuit breaker consulted by pollers and invoke paths —
// one rate limit anywhere backs every backend caller off together.
// The deadline and escalation are mirrored to localStorage so same-origin
// tabs share the quiet period: the platform sees ONE caller bucket, so one
// tab's 429 must back every tab off, not just its own pollers. Different
// origins (editor preview vs app preview) still isolate — nothing client-side
// can coordinate those; only same-origin windows share this state.
const BASE_COOLDOWN_MS = 20000;
const MAX_COOLDOWN_MS = 60000;
const STORAGE_KEY = "ccs_rate_cooldown_v1";
let cooldownUntil = 0;
let cooldownMs = BASE_COOLDOWN_MS;

const readShared = () => {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || "");
    return { until: Math.max(0, Number(parsed?.until) || 0), ms: Math.max(0, Number(parsed?.ms) || 0) };
  } catch {
    return { until: 0, ms: 0 };
  }
};

const writeShared = (until, ms) => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ until, ms }));
  } catch {
    // localStorage can be unavailable (private mode / storage disabled) —
    // the in-memory breaker still covers this tab.
  }
};

export const isAppCoolingDown = () =>
  Date.now() < Math.max(cooldownUntil, readShared().until);

export function noteRateLimit(retryMs = 0) {
  // Adopt the highest escalation any tab has reached — the bucket is shared.
  cooldownMs = Math.max(cooldownMs, Math.min(readShared().ms || 0, MAX_COOLDOWN_MS));
  const wait = Math.max(cooldownMs, Math.min(Number(retryMs) || 0, MAX_COOLDOWN_MS));
  cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
  cooldownMs = Math.min(cooldownMs * 2, MAX_COOLDOWN_MS);
  writeShared(cooldownUntil, cooldownMs);
}

export function noteRateLimitSuccess() {
  cooldownMs = BASE_COOLDOWN_MS;
  // A success means the window has room again — reflect the de-escalation for
  // sibling tabs. The active deadline is left alone; it still belongs to the
  // tab(s) that tripped it.
  const shared = readShared();
  if (shared.ms > BASE_COOLDOWN_MS) writeShared(shared.until, BASE_COOLDOWN_MS);
}
