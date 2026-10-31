// Shared app-wide 429 circuit breaker consulted by pollers and invoke paths —
// one rate limit anywhere backs every backend caller off together.
const BASE_COOLDOWN_MS = 20000;
const MAX_COOLDOWN_MS = 60000;
let cooldownUntil = 0;
let cooldownMs = BASE_COOLDOWN_MS;
export const isAppCoolingDown = () => Date.now() < cooldownUntil;
export function noteRateLimit(retryMs = 0) {
  const wait = Math.max(cooldownMs, Math.min(Number(retryMs) || 0, MAX_COOLDOWN_MS));
  cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
  cooldownMs = Math.min(cooldownMs * 2, MAX_COOLDOWN_MS);
}
export function noteRateLimitSuccess() { cooldownMs = BASE_COOLDOWN_MS; }
