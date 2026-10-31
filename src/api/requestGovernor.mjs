export function rateLimitStatus(err) {
  return err?.status ?? err?.response?.status;
}

export function isPlatformRateLimit(err) {
  if (rateLimitStatus(err) === 429) return true;
  const text = [
    err?.message,
    err?.response?.data?.error,
    err?.response?.data?.message,
    err?.data?.error,
  ].filter(Boolean).join(" ");
  return /rate limit|too many requests|traffic volume/i.test(text);
}

// Retry-After from a 429 response, in ms (seconds or HTTP-date form). Capped so
// a hostile or malformed header can never stall the app for long.
export function retryAfterMs(err, capMs = 30000) {
  const headers = err?.response?.headers;
  const raw = (typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'])
    ?? err?.retryAfter;
  if (raw == null || raw === '') {
    const bodyMs = Number(err?.response?.data?.retry_after_ms);
    return Number.isFinite(bodyMs) && bodyMs > 0 ? Math.min(bodyMs, capMs) : 0;
  }
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(raw)) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, capMs) : 0;
}

const SLOW_MS = 3000;
const SLOW_KEEP = 25;

export function createRequestGovernor({
  maxConcurrent = 8,
  pools: poolSizes = {},
  maxRetries = 4,
  baseDelayMs = 1000,
  maxDelayMs = 8000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  rand = Math.random,
  now = () => Date.now(),
} = {}) {
  const stats = {
    startedAt: now(),
    total: 0,
    inFlight: 0,
    peakInFlight: 0,
    queued: 0,
    rateLimited: 0,
    retries: 0,
    gaveUp: 0,
    deduped: 0,
    errors: 0,
    cooldownWaits: 0,
    byLabel: {},
    detail: {},
    slow: [],
  };

  // Concurrency pools. "default" keeps the historical entity cap; other pools
  // (e.g. read-only backend functions) are sized by the caller.
  const pools = new Map();
  const poolFor = (name) => {
    if (!pools.has(name)) {
      pools.set(name, { max: name === 'default' ? maxConcurrent : (poolSizes[name] || maxConcurrent), active: 0, waiters: [] });
    }
    return pools.get(name);
  };

  const acquire = (pool) =>
    new Promise((resolve) => {
      const take = () => {
        pool.active += 1;
        stats.inFlight += 1;
        stats.peakInFlight = Math.max(stats.peakInFlight, stats.inFlight);
        resolve();
      };
      if (pool.active < pool.max) { take(); return; }
      stats.queued += 1;
      pool.waiters.push(() => { stats.queued -= 1; take(); });
    });

  const release = (pool) => {
    pool.active -= 1;
    stats.inFlight -= 1;
    const next = pool.waiters.shift();
    if (next) next();
  };

  // After any 429, new cooldown-respecting requests wait until the window
  // passes, so a burst of callers does not keep hammering a saturated budget.
  let cooldownUntil = 0;
  // Bumped by every write; dedupe keys fold it in so a read requested after a
  // write never reuses a response fetched before that write.
  let epoch = 0;
  const inflight = new Map();

  const record = (label, ms, failed) => {
    const d = stats.detail[label] || (stats.detail[label] = { count: 0, errors: 0, totalMs: 0, maxMs: 0 });
    d.count += 1;
    d.totalMs += ms;
    d.maxMs = Math.max(d.maxMs, ms);
    if (failed) { d.errors += 1; stats.errors += 1; }
    if (ms >= SLOW_MS) {
      stats.slow.push({ label, ms: Math.round(ms), at: new Date(now()).toISOString() });
      if (stats.slow.length > SLOW_KEEP) stats.slow.shift();
    }
  };

  const run = async (label, fn, {
    limitConcurrency = true,
    pool: poolName = 'default',
    retryOnRateLimit = false,
    respectCooldown = false,
    shouldRetry = null,
    maxAttempts = maxRetries,
  } = {}) => {
    stats.total += 1;
    stats.byLabel[label] = (stats.byLabel[label] || 0) + 1;
    const pool = limitConcurrency ? poolFor(poolName) : null;
    const started = now();
    for (let attempt = 0; ; attempt += 1) {
      if (respectCooldown && attempt === 0) {
        const wait = cooldownUntil - now();
        if (wait > 0) { stats.cooldownWaits += 1; await sleep(wait); }
      }
      if (pool) await acquire(pool);
      try {
        const result = await fn();
        if (pool) release(pool);
        record(label, now() - started, false);
        return result;
      } catch (err) {
        if (pool) release(pool);
        const limited = isPlatformRateLimit(err);
        if (limited) stats.rateLimited += 1;
        const retryable = (limited && retryOnRateLimit)
          || (typeof shouldRetry === 'function' && shouldRetry(err, attempt));
        if (retryable && attempt < maxAttempts) {
          stats.retries += 1;
          const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + rand());
          const delay = Math.max(backoff, limited ? retryAfterMs(err) : 0);
          if (limited) cooldownUntil = Math.max(cooldownUntil, now() + delay);
          await sleep(delay);
          continue;
        }
        if (limited && retryOnRateLimit) {
          err.ccsGovernorRetried = attempt;
          stats.gaveUp += 1;
        }
        record(label, now() - started, true);
        throw err;
      }
    }
  };

  // Share one in-flight promise between identical reads. Followers get their
  // own copy of the result so one caller mutating it cannot affect another.
  const dedupe = (key, fn, copy = (value) => value) => {
    const fullKey = `${epoch}|${key}`;
    const existing = inflight.get(fullKey);
    if (existing) {
      stats.deduped += 1;
      return existing.then(copy);
    }
    const promise = Promise.resolve().then(fn);
    inflight.set(fullKey, promise);
    promise.catch(() => {}).finally(() => {
      if (inflight.get(fullKey) === promise) inflight.delete(fullKey);
    });
    return promise;
  };

  const bumpEpoch = () => { epoch += 1; };
  const getEpoch = () => epoch;

  return { run, dedupe, bumpEpoch, getEpoch, stats };
}