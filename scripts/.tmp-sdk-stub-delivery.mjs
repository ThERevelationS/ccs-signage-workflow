
globalThis.__invokeCalls = [];
globalThis.__invokeHandler = null;
export const createClientFromRequest = () => ({
  entities: globalThis.__entities,
  asServiceRole: {
    entities: globalThis.__entities,
    functions: { invoke: async (fn, body) => { globalThis.__invokeCalls.push({ fn, body }); return globalThis.__invokeHandler ? globalThis.__invokeHandler(fn, body) : { data: {} }; } },
  },
  functions: { invoke: async (fn, body) => { globalThis.__invokeCalls.push({ fn, body }); return globalThis.__invokeHandler ? globalThis.__invokeHandler(fn, body) : { data: {} }; } },
  auth: { me: async () => (typeof globalThis.__authMe === 'function' ? globalThis.__authMe() : globalThis.__authMe) },
});

