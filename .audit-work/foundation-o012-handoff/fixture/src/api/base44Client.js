// O-012 harness stub: the code under test never invokes base44 functions on
// the handoff path; expose the shape so imports resolve.
export const base44 = {
  entities: new Proxy({}, { get: () => undefined }),
  functions: { invoke: async () => ({ data: {} }) },
  auth: { me: async () => ({ email: "harness@test.local", role: "admin" }) },
  asServiceRole: { entities: new Proxy({}, { get: () => undefined }) },
};
export default base44;
