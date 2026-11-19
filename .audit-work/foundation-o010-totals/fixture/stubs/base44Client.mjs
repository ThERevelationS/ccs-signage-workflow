// Test double for @/api/base44Client — entity reads/writes are injected by the
// harness so the REAL modules under test exercise their actual code paths
// against deterministic records. Nothing hits the network.
// The registry lives on globalThis: esbuild inlines this module into each test
// bundle, so a module-scoped Map would be a different instance per bundle.
const registry = (globalThis.__b44EntityRegistry ??= new Map());

export function __setEntity(name, entity) { registry.set(name, entity); }
export function __resetEntities() { registry.clear(); }

const emptyEntity = () => ({
  get: async () => null,
  filter: async () => [],
  list: async () => [],
  create: async (row) => ({ id: "stub", ...row }),
  update: async (_id, row) => row,
  delete: async () => ({}),
});

export const base44 = {
  entities: new Proxy({}, {
    get: (_t, name) => registry.get(name) || emptyEntity(),
  }),
  functions: { invoke: async () => ({ data: {} }) },
};
