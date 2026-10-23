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
  return /rate limit|too many requests/i.test(text);
}

export function createRequestGovernor({
  maxConcurrent = 8,
  maxRetries = 4,
  baseDelayMs = 1000,
  maxDelayMs = 8000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  rand = Math.random,
} = {}) {
  const stats = {
    startedAt: Date.now(),
    total: 0,
    inFlight: 0,
    queued: 0,
    rateLimited: 0,
    retries: 0,
    gaveUp: 0,
    byLabel: {},
  };
  const waiters = [];

  const acquire = () =>
    new Promise((resolve) => {
      if (stats.inFlight < maxConcurrent) {
        stats.inFlight += 1;
        resolve();
        return;
      }
      stats.queued += 1;
      waiters.push(() => {
        stats.queued -= 1;
        stats.inFlight += 1;
        resolve();
      });
    });

  const release = () => {
    stats.inFlight -= 1;
    const next = waiters.shift();
    if (next) next();
  };

  const run = async (label, fn, { limitConcurrency = true, retryOnRateLimit = false } = {}) => {
    stats.total += 1;
    stats.byLabel[label] = (stats.byLabel[label] || 0) + 1;
    for (let attempt = 0; ; attempt += 1) {
      if (limitConcurrency) await acquire();
      try {
        const result = await fn();
        if (limitConcurrency) release();
        return result;
      } catch (err) {
        if (limitConcurrency) release();
        const limited = isPlatformRateLimit(err);
        if (limited) stats.rateLimited += 1;
        if (limited && retryOnRateLimit && attempt < maxRetries) {
          stats.retries += 1;
          await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + rand()));
          continue;
        }
        if (limited && retryOnRateLimit) {
          err.ccsGovernorRetried = attempt;
          stats.gaveUp += 1;
        }
        throw err;
      }
    }
  };

  return { run, stats };
}
