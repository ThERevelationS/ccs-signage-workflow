
export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }) } };
export const staffEntities = base44.entities;
export const assertEstimateProductMutationAllowed = async () => null;
export const getOpenEstimateRevision = async () => null;
export const isRetryableFunction = () => false;
