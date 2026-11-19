export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }), functions: {}, integrations: {} };
export const isRetryableFunction = () => false;
