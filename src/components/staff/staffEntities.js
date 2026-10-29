import { invokeFleet } from "@/components/fleet/fleetInvoke";

// Read facade for role-gated non-Fleet entities. Staff sessions are EmailGate
// sessions and cannot satisfy entity RLS directly, so reads route through the
// session-authenticated staffDataRead gateway (reads) and staffEntityWrite
// gateway (writes). Write methods reach only the entity/operation pairs the
// backend allowlist permits; anything else is rejected server-side.
// --- Mount-storm coalescing ---------------------------------------------------------
// A page mount fires a dozen parallel reads through this facade; previously each
// became its own staffDataRead invoke on the shared service budget. Calls made in
// the same synchronous burst now coalesce into one batch invoke (the gateway
// supports up to 16 entities per call), and identical simultaneous reads share a
// single request entirely.
const pendingBatch = new Map();
let flushScheduled = false;

const singleRead = (entity, args) =>
  invokeFleet("staffDataRead", { entity, ...args }).then((r) => r?.items || []);

async function flushBatch() {
  flushScheduled = false;
  const entries = [...pendingBatch.values()];
  pendingBatch.clear();
  if (entries.length === 0) return;
  const batchable = [];
  const individual = [];
  const seen = new Set();
  for (const entry of entries) {
    // The batch response is keyed by entity name only, so an entity can appear
    // at most once per batch; extras fall back to direct reads.
    if (seen.has(entry.entity)) individual.push(entry);
    else { seen.add(entry.entity); batchable.push(entry); }
  }
  for (let i = 0; i < batchable.length; i += 16) {
    const chunk = batchable.slice(i, i + 16);
    try {
      const r = await invokeFleet("staffDataRead", { entities: chunk.map((e) => e.args) });
      const out = r?.entities || {};
      chunk.forEach((e) => e.resolve(Array.isArray(out[e.entity]) ? out[e.entity] : []));
    } catch {
      individual.push(...chunk);
    }
  }
  individual.forEach((e) => singleRead(e.entity, e.args).then(e.resolve, e.reject));
}

const batchedRead = (entity, args) => {
  const key = entity + "|" + JSON.stringify(args);
  const existing = pendingBatch.get(key);
  if (existing) return existing.promise;
  let resolveRef, rejectRef;
  const promise = new Promise((resolve, reject) => { resolveRef = resolve; rejectRef = reject; });
  pendingBatch.set(key, { entity, args, resolve: resolveRef, reject: rejectRef, promise });
  if (!flushScheduled) { flushScheduled = true; queueMicrotask(flushBatch); }
  return promise;
};

const METHODS = {
  filter: (entity, query, sort, limit, skip) =>
    batchedRead(entity, { query, sort, limit, skip }),
  list: (entity, sort, limit, skip) =>
    batchedRead(entity, { sort, limit, skip }),
  get: (entity, id) =>
    invokeFleet("staffDataRead", { entity, id }).then((r) => r?.item ?? null),
  count: (entity, query, sort, limit, skip) =>
    invokeFleet("staffDataRead", { entity, query, sort, limit, skip, count: true }).then((r) => r?.count ?? 0),
  create: (entity, data) =>
    invokeFleet("staffEntityWrite", { entity, op: "create", data }).then((r) => r?.record),
  update: (entity, id, data) =>
    invokeFleet("staffEntityWrite", { entity, op: "update", id, data }).then((r) => r?.record),
  updateMany: (entity, query, update) =>
    invokeFleet("staffEntityWrite", { entity, op: "updateMany", id: query?.id, query, update }).then((r) => r?.result),
  delete: (entity, id) =>
    invokeFleet("staffEntityWrite", { entity, op: "delete", id }).then((r) => r?.deleted === true),
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
        // -updated_date puts mutations into the 500-row window — an unsorted
        // default order would cap the digest to the oldest rows and silently
        // drop change events for anything past position 500.
        const r = await invokeFleet("staffDataRead", { entity, limit: 500, sort: "-updated_date" });
        const rows = Array.isArray(r?.items) ? r.items : [];
        const stamp = JSON.stringify(rows);
        if (last && stamp !== last && !stopped) callback({ type: "update", data: null });
        last = stamp;
      } catch {
        // Transient gateway/rate-limit failure — retry on the next tick.
      }
    };
    check();
    const timer = setInterval(check, 120000);
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

// One gateway call → rows for many entities. Uses staffDataRead batch mode so
// a page mount can fetch its whole catalog set in a single request instead of
// a dozen parallel reads hitting the rate limit.
//   const { PermitLocality, GlobalSettings } = await loadEntitiesBatch([
//     { entity: "PermitLocality", sort: "name" },
//     { entity: "GlobalSettings", limit: 10 },
//   ]);
export const loadEntitiesBatch = (requests) =>
  invokeFleet("staffDataRead", { entities: requests }).then((r) => r?.entities || {});