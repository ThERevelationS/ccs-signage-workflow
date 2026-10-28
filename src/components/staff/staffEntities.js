import { invokeFleet } from "@/components/fleet/fleetInvoke";

// Read facade for role-gated non-Fleet entities. Staff sessions are EmailGate
// sessions and cannot satisfy entity RLS directly, so reads route through the
// session-authenticated staffDataRead gateway (reads) and staffEntityWrite
// gateway (writes). Write methods reach only the entity/operation pairs the
// backend allowlist permits; anything else is rejected server-side.
// The platform's function client resolves with the transport envelope
// ({ status, data, ... }) rather than the JSON body, while a few call paths hand
// back the body itself. Normalize once here so every staff read/write in the app
// reads from the gateway's actual payload instead of silently finding nothing.
function bodyOf(response) {
  if (!response || typeof response !== "object") return {};
  const isEnvelope = Object.prototype.hasOwnProperty.call(response, "status")
    && Object.prototype.hasOwnProperty.call(response, "data");
  const body = isEnvelope ? response.data : response;
  return body && typeof body === "object" ? body : {};
}

// Callers use both the SDK-style options object ({sort, limit, skip}) and the
// positional (sort, limit, skip) contract. An options object must never land in
// the gateway's sort slot, and an options call answers with a page shape
// ({items, has_more, next_cursor}) like the platform SDK, while a positional
// call keeps returning a plain array.
function readArgs(sortOrOptions, limit, skip) {
  if (sortOrOptions && typeof sortOrOptions === "object" && !Array.isArray(sortOrOptions)) {
    return {
      paged: true,
      sort: sortOrOptions.sort,
      limit: sortOrOptions.limit,
      skip: sortOrOptions.skip ?? sortOrOptions.offset,
    };
  }
  return { paged: false, sort: sortOrOptions, limit, skip };
}

function asRows(response) {
  const rows = bodyOf(response).items;
  return Array.isArray(rows) ? rows : [];
}

const page = (rows) => ({ items: rows, has_more: false, next_cursor: null });

const METHODS = {
  filter: (entity, query, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    return invokeFleet("staffDataRead", { entity, query, sort: args.sort, limit: args.limit, skip: args.skip })
      .then((r) => (args.paged ? page(asRows(r)) : asRows(r)));
  },
  list: (entity, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    return invokeFleet("staffDataRead", { entity, sort: args.sort, limit: args.limit, skip: args.skip })
      .then((r) => (args.paged ? page(asRows(r)) : asRows(r)));
  },
  get: (entity, id) =>
    invokeFleet("staffDataRead", { entity, id }).then((r) => bodyOf(r).item ?? null),
  count: (entity, query, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    return invokeFleet("staffDataRead", { entity, query, sort: args.sort, limit: args.limit, skip: args.skip, count: true })
      .then((r) => bodyOf(r).count ?? 0);
  },
  create: (entity, data) =>
    invokeFleet("staffEntityWrite", { entity, op: "create", data }).then((r) => bodyOf(r).record),
  update: (entity, id, data) =>
    invokeFleet("staffEntityWrite", { entity, op: "update", id, data }).then((r) => bodyOf(r).record),
  updateMany: (entity, query, update) =>
    invokeFleet("staffEntityWrite", { entity, op: "updateMany", id: query?.id, query, update }).then((r) => bodyOf(r).result),
  delete: (entity, id) =>
    invokeFleet("staffEntityWrite", { entity, op: "delete", id }).then((r) => bodyOf(r).deleted === true),
  // Staff sessions cannot use platform live-subscriptions (entity RLS is
  // backend-only), so subscribe polls staffDataRead and emits a synthetic
  // change event when the row set changes. Returns an unsubscribe function,
  // matching the SDK contract: `unsub = entity.subscribe(cb)`.
  subscribe: (entity, callback) => {
    if (typeof callback !== "function") return () => {};
    let stopped = false;
    let last = "";
    const check = async () => {
      try {
        const r = await invokeFleet("staffDataRead", { entity, limit: 500 });
        const items = bodyOf(r).items;
        const rows = Array.isArray(items) ? items : [];
        const stamp = JSON.stringify(rows);
        if (last && stamp !== last && !stopped) callback({ type: "update", data: null });
        last = stamp;
      } catch {
        // Transient gateway/rate-limit failure — retry on the next tick.
      }
    };
    check();
    const timer = setInterval(check, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  },
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