import { invokeFleet } from "@/components/fleet/fleetInvoke";

// Read facade for role-gated non-Fleet entities. Staff sessions are EmailGate
// sessions and cannot satisfy entity RLS directly, so reads route through the
// session-authenticated staffDataRead gateway. Only read methods exist —
// mutations intentionally throw so writes keep flowing through their backend
// action functions instead of silently failing.
const METHODS = {
  filter: (entity, query, sort, limit, skip) =>
    invokeFleet("staffDataRead", { entity, query, sort, limit, skip }).then((r) => r?.items || []),
  list: (entity, sort, limit, skip) =>
    invokeFleet("staffDataRead", { entity, sort, limit, skip }).then((r) => r?.items || []),
  get: (entity, id) =>
    invokeFleet("staffDataRead", { entity, id }).then((r) => r?.item ?? null),
  count: (entity, query, sort, limit, skip) =>
    invokeFleet("staffDataRead", { entity, query, sort, limit, skip, count: true }).then((r) => r?.count ?? 0),
};

const proxy = (name) => new Proxy({}, {
  get(_, method) {
    const fn = METHODS[method];
    if (fn) return (...args) => fn(name, ...args);
    return () => Promise.reject(new Error(`${name}.${String(method)} is not available to staff reads`));
  },
});

export const staffEntities = new Proxy({}, {
  get(_, name) {
    if (typeof name !== "string") return undefined;
    return proxy(name);
  },
});
