
export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null } };
export const staffEntities = base44.entities;
export const isRetryableFunction = () => false;
export const appParams = {};
