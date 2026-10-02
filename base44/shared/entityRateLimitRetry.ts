// Base44's own database API also rate-limits ("Rate limit exceeded"). Retry those
// calls with backoff so one burst does not skip a whole sync stage.
export function withEntityRateLimitRetry(client: any, { paceMs = 0 } = {}) {
  // One queue across all entities in this sync invocation, including parallel reads.
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  const reserveRequest = () => {
    const slot = queue.then(async () => {
      const delay = nextRequestAt - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      nextRequestAt = Date.now() + paceMs;
    });
    queue = slot.catch(() => {});
    return slot;
  };
  const isLimited = (e: any) => e?.status === 429 || /rate limit/i.test(String(e?.message || e?.data?.message || ''));
  const wrapEntity = (entity: any) => new Proxy(entity, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return async (...args: any[]) => {
        for (let attempt = 0; ; attempt++) {
          if (paceMs) await reserveRequest();
          try { return await value.apply(target, args); }
          catch (e) {
            if (!isLimited(e) || attempt >= 5) throw e;
            // Background work yields longer instead of competing with employee access.
            const delay = paceMs ? 15000 * (attempt + 1) : 1500 * (attempt + 1);
            if (paceMs) nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      };
    },
  });
  const entities = new Proxy(client.asServiceRole.entities, {
    get: (target, name) => (target[name] ? wrapEntity(target[name]) : target[name]),
  });
  const serviceRole = new Proxy(client.asServiceRole, { get: (t, p) => (p === 'entities' ? entities : t[p]) });
  return new Proxy(client, { get: (t, p) => (p === 'asServiceRole' ? serviceRole : t[p]) });
}