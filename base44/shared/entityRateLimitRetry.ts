// Base44's own database API also rate-limits ("Rate limit exceeded"). Retry those
// calls with backoff so one burst does not skip a whole sync stage.
export function withEntityRateLimitRetry(client: any) {
  const isLimited = (e: any) => e?.status === 429 || /rate limit/i.test(String(e?.message || e?.data?.message || ''));
  const wrapEntity = (entity: any) => new Proxy(entity, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return async (...args: any[]) => {
        for (let attempt = 0; ; attempt++) {
          try { return await value.apply(target, args); }
          catch (e) {
            if (!isLimited(e) || attempt >= 5) throw e;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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