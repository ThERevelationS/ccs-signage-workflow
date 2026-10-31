import { invokeFleet, isFleetCoolingDown } from "@/components/fleet/fleetInvoke";
import { getSessionToken } from "@/components/auth/EmailGate";
import { noteRateLimit } from "@/api/rateLimitCooldown";

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
// Guests (no EmailGate session) must never reach the gateways — every call
// is a guaranteed 401 that burns budget and spams the console.
const hasSession = () => !!getSessionToken();
const NO_SESSION_ERR = () => new Error("Sign-in required");

// Per-session negative cache of denied entities. Once the gateway refuses an
// entity for this session (403), every repeat read is a guaranteed failure
// that only spends the shared budget — resolve it locally until the session
// token changes (a different signed-in user may have different access).
let deniedSessionToken;
const deniedEntities = new Set();
const syncDeniedScope = () => {
  const token = getSessionToken();
  if (token !== deniedSessionToken) {
    deniedEntities.clear();
    deniedSessionToken = token;
  }
};
const markDenied = (entity) => {
  if (!entity) return;
  syncDeniedScope();
  deniedEntities.add(entity);
};
const isDenied = (entity) => {
  syncDeniedScope();
  return deniedEntities.has(entity);
};
const isForbidden = (err) => Number(err?.status ?? err?.response?.status) === 403;

// The platform's function client resolves with the transport envelope
// ({ status, data, ... }) rather than the JSON body, while a few call paths hand
// back the body itself. Normalize once here so every staff read/write in the app
// reads from the gateway's actual payload instead of silently finding nothing.
const bodyOf = (response) => {
  if (!response || typeof response !== "object") return {};
  const isEnvelope = Object.prototype.hasOwnProperty.call(response, "status")
    && Object.prototype.hasOwnProperty.call(response, "data");
  const body = isEnvelope ? response.data : response;
  return body && typeof body === "object" ? body : {};
};

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

const asRows = (response) => {
  const rows = bodyOf(response).items;
  return Array.isArray(rows) ? rows : [];
};
const page = (rows) => ({ items: rows, has_more: false, next_cursor: null });

const pendingBatch = new Map();
let flushScheduled = false;

const singleRead = (entity, args) =>
  invokeFleet("staffDataRead", { entity, ...args }).then(asRows, (err) => {
    if (isForbidden(err)) markDenied(entity);
    throw err;
  });

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
      // Each entry must carry its own entity name — the gateway rejects a batch
      // whose entries lack it, which used to fan every burst back out into
      // ~16 individual calls and saturate the function budget.
      const r = await invokeFleet("staffDataRead", { entities: chunk.map((e) => ({ entity: e.entity, ...e.args })) });
      const body = bodyOf(r);
      const out = body.entities || {};
      const errs = body.errors || {};
      // A 429 inside a batch still means the shared budget is saturated — the
      // invoke resolved, so base44Client never saw the limit; note it here.
      const limited = Object.values(errs).find((d) => Number(d?.status) === 429);
      if (limited) noteRateLimit(limited.retry_after_ms || body.retry_after_ms || 0);
      // Denied entities resolve as empty reads and go into the negative cache
      // so nothing in this session asks for them again.
      (body.denied || []).forEach(markDenied);
      chunk.forEach((e) => {
        if (errs[e.entity]) {
          const detail = errs[e.entity];
          if (Number(detail.status) === 403) markDenied(e.entity);
          e.reject(Object.assign(new Error(detail.error || 'Staff read failed'), { status: detail.status }));
        } else {
          e.resolve(Array.isArray(out[e.entity]) ? out[e.entity] : []);
        }
      });
    } catch (err) {
      // Rate-limited batch: fanning out into ~16 individual reads would amplify
      // the very saturation that caused the 429 — reject so callers degrade.
      if (err?.status === 429 || err?.response?.status === 429) {
        chunk.forEach((e) => e.reject(err));
      } else {
        // Non-429 whole-batch failure: retry the entries individually so the
        // healthy ones still resolve.
        individual.push(...chunk);
      }
    }
  }
  individual.forEach((e) => singleRead(e.entity, e.args).then(e.resolve, e.reject));
}

const batchedRead = (entity, args) => {
  if (!hasSession()) return Promise.resolve([]);
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
  filter: (entity, query, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    if (isDenied(entity)) return Promise.resolve(args.paged ? page([]) : []);
    return batchedRead(entity, { query, sort: args.sort, limit: args.limit, skip: args.skip })
      .then((rows) => (args.paged ? page(rows) : rows));
  },
  list: (entity, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    if (isDenied(entity)) return Promise.resolve(args.paged ? page([]) : []);
    return batchedRead(entity, { sort: args.sort, limit: args.limit, skip: args.skip })
      .then((rows) => (args.paged ? page(rows) : rows));
  },
  get: (entity, id) => {
    if (!hasSession() || isDenied(entity)) return Promise.resolve(null);
    return invokeFleet("staffDataRead", { entity, id }).then(
      (r) => bodyOf(r).item ?? null,
      (err) => { if (isForbidden(err)) markDenied(entity); throw err; },
    );
  },
  count: (entity, query, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    if (!hasSession() || isDenied(entity)) return Promise.resolve(0);
    return invokeFleet("staffDataRead", { entity, query, sort: args.sort, limit: args.limit, skip: args.skip, count: true }).then(
      (r) => bodyOf(r).count ?? 0,
      (err) => { if (isForbidden(err)) markDenied(entity); throw err; },
    );
  },
  create: (entity, data) =>
    hasSession() ? invokeFleet("staffEntityWrite", { entity, op: "create", data }).then((r) => bodyOf(r).record) : Promise.reject(NO_SESSION_ERR()),
  update: (entity, id, data) =>
    hasSession() ? invokeFleet("staffEntityWrite", { entity, op: "update", id, data }).then((r) => bodyOf(r).record) : Promise.reject(NO_SESSION_ERR()),
  updateMany: (entity, query, update) =>
    hasSession() ? invokeFleet("staffEntityWrite", { entity, op: "updateMany", id: query?.id, query, update }).then((r) => bodyOf(r).result) : Promise.reject(NO_SESSION_ERR()),
  delete: (entity, id) =>
    hasSession() ? invokeFleet("staffEntityWrite", { entity, op: "delete", id }).then((r) => bodyOf(r).deleted === true) : Promise.reject(NO_SESSION_ERR()),
  // Staff sessions cannot use platform live-subscriptions (entity RLS is
  // backend-only), so subscribe polls staffDataRead and emits a synthetic
  // change event when the row set changes. Returns an unsubscribe function,
  // matching the SDK contract: `unsub = entity.subscribe(cb)`.
  subscribe: (entity, callback) => {
    if (typeof callback !== "function") return () => {};
    let stopped = false;
    let last = "";
    const check = async () => {
      if (!hasSession() || isDenied(entity) || isFleetCoolingDown()) return;
      try {
        // -updated_date puts mutations into the 50 most-recently-updated rows —
        // an unsorted default order would cap the digest to the oldest rows and
        // silently drop change events for anything past position 50.
        const r = await invokeFleet("staffDataRead", { entity, limit: 50, sort: "-updated_date" });
        const rows = Array.isArray(bodyOf(r).items) ? bodyOf(r).items : [];
        const stamp = rows.map((r) => `${r?.id}:${r?.updated_date}`).join("|");
        if (last && stamp !== last && !stopped) callback({ type: "update", data: null });
        last = stamp;
      } catch (err) {
        if (isForbidden(err)) markDenied(entity);
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
export const loadEntitiesBatch = (requests) => {
  const live = (requests || []).filter((r) => !isDenied(r?.entity));
  if (live.length === 0) return Promise.resolve({});
  return invokeFleet("staffDataRead", { entities: live }).then((r) => {
    const body = bodyOf(r);
    (body.denied || []).forEach(markDenied);
    return body.entities || {};
  });
};