// @/api/base44Client stub — entities resolve to no-op async CRUD shims.
const entityStub = () => ({
  get: async () => null,
  list: async () => [],
  filter: async () => [],
  create: async (d) => ({ id: "stub", ...d }),
  update: async (_id, d) => d,
  delete: async () => ({}),
});
export const base44 = {
  entities: new Proxy({}, { get: () => entityStub() }),
  asServiceRole: { entities: new Proxy({}, { get: () => entityStub() }) },
  auth: { me: async () => ({ role: "admin" }) },
};
export default base44;
