
globalThis.__wo = null;
globalThis.__failSave = false;
export const base44 = { entities: { WorkOrder: {
  get: async (id) => globalThis.__wo,
  updateMany: async () => ({ updated: 0 }),
}}, functions: { invoke: async (name, payload) => {
  if (globalThis.__failSave) return { data: { success: false, error: 'conflict' } };
  const r = globalThis.__wo;
  const set = payload?.fields || payload?.next_fields || payload?.nextFields || {};
  Object.assign(r, set); r.updated_date = 'v2';
  return { data: { success: true, record: r } };
}} };
