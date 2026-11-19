// Test double for @/components/staff/staffEntities.
const emptyEntity = () => ({
  get: async () => null,
  filter: async () => [],
  list: async () => [],
  create: async (row) => ({ id: "stub", ...row }),
  update: async (_id, row) => row,
  delete: async () => ({}),
});

export const staffEntities = new Proxy({}, { get: () => emptyEntity() });
