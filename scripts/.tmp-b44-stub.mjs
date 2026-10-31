
export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }) } };
