
export const base44 = {
  entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }),
  functions: { invoke: async (name, payload) => {
    if (name === 'ensureBuilderPriceRevision') return { data: { revision: { id: 'rev-' + (payload?.idempotency_key || 'x').slice(-8), ...((payload && payload.revision) || {}) } } };
    return { data: {} };
  } },
  auth: { me: async () => ({ id: 'tester' }) },
};
export const isRetryableFunction = () => false;
