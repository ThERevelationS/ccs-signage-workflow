// @/components/staff/staffEntities stub — any named entity returns the shim.
const entityStub = () => ({
  get: async () => null,
  list: async () => [],
  filter: async () => [],
  create: async (d) => ({ id: "stub", ...d }),
  update: async (_id, d) => d,
  delete: async () => ({}),
});
export const staffEntities = new Proxy({}, { get: () => entityStub() });
