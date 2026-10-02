// Retry only reads: never replay a punch/create/update after an uncertain response.
export function withEmployeeAccessReads(client) {
  const readMethods = new Set(['filter', 'list', 'get', 'count']);
  const entities = new Proxy(client.asServiceRole.entities, {
    get(target, name) {
      const entity = target[name];
      if (!entity) return entity;
      return new Proxy(entity, {
        get(record, method) {
          const value = record[method];
          if (typeof value !== 'function' || !readMethods.has(String(method))) return value;
          return async (...args) => {
            for (let attempt = 0; ; attempt++) {
              try { return await value.apply(record, args); }
              catch (error) {
                const limited = Number(error?.status || error?.response?.status) === 429 || /rate limit/i.test(String(error?.message || ''));
                if (!limited || attempt >= 4) throw error;
                const header = error?.response?.headers?.['retry-after'];
                const seconds = Number(header);
                const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 15000) : 1500 * (2 ** attempt);
                await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 250));
              }
            }
          };
        },
      });
    },
  });
  const service = new Proxy(client.asServiceRole, { get: (target, key) => key === 'entities' ? entities : target[key] });
  return new Proxy(client, { get: (target, key) => key === 'asServiceRole' ? service : target[key] });
}