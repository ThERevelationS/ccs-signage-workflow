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
const ESTIMATOR_WRITE_ENTITIES = new Set([
  "FoundationProject", "ChannelLetterInstallation", "VinylProject", "CNCProject", "LaserProject",
  "MetalProject", "BrickStoneProject", "MaintenanceProject", "Project", "CustomItemsProject",
  "BuilderProduct", "BuilderPart", "BuilderPartGroup", "BuilderPriceRevision", "EstimateClipboardItem",
  "PartTemplate", "QuickProduct", "QuickProductCategory", "ProjectTemplate",
  "Settings", "MaintenanceActionRate", "ChannelLetterInstallInventory", "DimensionalLetterMaterial",
  "MaintenanceInventory", "VinylInventory", "VinylMachine", "BrickStoneInventory", "LaborServiceInventory",
  "ChannelLetterInstallEquipment",
]);
const PRIVATE_LIBRARY_ENTITIES = new Set(["PartTemplate", "QuickProduct", "QuickProductCategory"]);
const writeFunction = (entity) => ESTIMATOR_WRITE_ENTITIES.has(entity) ? "estimatorProjectWrite" : "staffEntityWrite";

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

// List/filter results use 30s, or 15 minutes for settled catalogs. After a
// write, catalog reads stay short-lived until the server's cache can settle.
// Reads share in-flight requests per session; writes invalidate both in-flight
// and cached reads, and overlapping reads cannot repopulate the cache.
const READ_CACHE_TTL_MS = 30000;
const CATALOG_ENTITIES = new Set([
  "MarkupTier", "QuoteDefaults", "Settings", "LaborServiceInventory", "FoundationInventory",
  "BrickStoneInventory", "Inventory", "VinylInventory", "VinylMachine", "ChannelLetterInstallInventory",
  "ChannelLetterInstallEquipment", "DimensionalLetterMaterial", "MaintenanceInventory", "MaintenanceEquipment",
  "MaintenanceActionRate", "SignLightingInventory", "SignHardwareInventory", "SignPartsSuppliesInventory",
]);
const CATALOG_READ_CACHE_TTL_MS = 15 * 60 * 1000;
const CATALOG_WRITE_SETTLE_MS = 60000;
let pointReadSeq = 0;
const readCache = new Map();
const inFlight = new Map();
const lastWriteAt = new Map();
const writeGeneration = new Map();
const readCacheKey = (entity, args) => `${getSessionToken()}|${entity}|${JSON.stringify(args)}`;
const cachedRead = (key) => {
  const entry = readCache.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) { readCache.delete(key); return undefined; }
  return entry.value;
};
const cacheRead = (key, value, ttl) => {
  readCache.set(key, { value, expires: Date.now() + ttl });
};
const readCacheTtl = (entity, startedAt) => {
  const lastWrite = lastWriteAt.get(entity) ?? -Infinity;
  return CATALOG_ENTITIES.has(entity) && lastWrite < startedAt && Date.now() - lastWrite >= CATALOG_WRITE_SETTLE_MS
    ? CATALOG_READ_CACHE_TTL_MS
    : READ_CACHE_TTL_MS;
};
const bustReadCache = (entity) => {
  lastWriteAt.set(entity, Date.now());
  writeGeneration.set(entity, (writeGeneration.get(entity) ?? 0) + 1);
  const marker = `|${entity}|`;
  for (const key of readCache.keys()) {
    if (key.includes(marker)) readCache.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key.includes(marker)) inFlight.delete(key);
  }
};
const writeEntity = (entity, payload) => {
  bustReadCache(entity);
  return (hasSession() ? invokeFleet(writeFunction(entity), payload) : Promise.reject(NO_SESSION_ERR()))
    .catch((err) => {
      // The gateway explains every refusal in its JSON body; the HTTP client's
      // "Request failed with status code 403" hides it from staff. Surface it.
      const reason = err?.response?.data?.error;
      if (typeof reason === "string" && reason.trim() && !/status code/i.test(reason)) {
        err.message = `${reason} (status code ${err?.response?.status || err?.status || "?"})`;
      }
      throw err;
    })
    .finally(() => bustReadCache(entity));
};

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
// queueMicrotask flushed after one tick, but sibling lazy chunks mount across
// several ticks — each landing became its own batch (~9 invokes per page
// mount). A short timer still reads as instant while merging those waves.
const BATCH_WINDOW_MS = 30;

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
  if (PRIVATE_LIBRARY_ENTITIES.has(entity)) {
    return singleRead(entity, { ...args, session_token: getSessionToken() });
  }
  const key = `${readCacheKey(entity, args)}|${writeGeneration.get(entity) ?? 0}`;
  const existing = pendingBatch.get(key);
  if (existing) return existing.promise;
  let resolveRef, rejectRef;
  const promise = new Promise((resolve, reject) => { resolveRef = resolve; rejectRef = reject; });
  pendingBatch.set(key, { entity, args, resolve: resolveRef, reject: rejectRef, promise });
  if (!flushScheduled) { flushScheduled = true; setTimeout(flushBatch, BATCH_WINDOW_MS); }
  return promise;
};

const listRead = (entity, args, paged) => {
  if (PRIVATE_LIBRARY_ENTITIES.has(entity)) {
    return batchedRead(entity, args).then((rows) => paged ? page(rows) : rows);
  }
  const key = readCacheKey(entity, args);
  const cached = cachedRead(key);
  if (cached !== undefined) return Promise.resolve(paged ? page(cached.slice()) : cached.slice());
  let promise = inFlight.get(key);
  if (!promise) {
    const startedAt = Date.now();
    const generation = writeGeneration.get(entity) ?? 0;
    promise = batchedRead(entity, args)
      .then((rows) => {
        if ((writeGeneration.get(entity) ?? 0) === generation) {
          cacheRead(key, rows, readCacheTtl(entity, startedAt));
        }
        return rows;
      })
      .finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });
    inFlight.set(key, promise);
  }
  return promise.then((rows) => paged ? page(rows.slice()) : rows.slice());
};

const METHODS = {
  filterFresh: (entity, query, sort, limit) => {
    if (!hasSession()) return Promise.reject(NO_SESSION_ERR());
    if (!ESTIMATOR_WRITE_ENTITIES.has(entity)) return METHODS.filter(entity, query, sort, limit);
    return invokeFleet("estimatorProjectWrite", { entity, op: "filter", query, sort, limit }).then((r) => {
      const items = bodyOf(r).items;
      if (!Array.isArray(items)) throw new Error("Fresh entity filter did not return a record list.");
      return items;
    });
  },
  filter: (entity, query, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    if (isDenied(entity)) return Promise.resolve(args.paged ? page([]) : []);
    return listRead(entity, { query, sort: args.sort, limit: args.limit, skip: args.skip }, args.paged);
  },
  list: (entity, sortOrOptions, limit, skip) => {
    const args = readArgs(sortOrOptions, limit, skip);
    if (isDenied(entity)) return Promise.resolve(args.paged ? page([]) : []);
    return listRead(entity, { sort: args.sort, limit: args.limit, skip: args.skip }, args.paged);
  },
  // Single-record reads must be current: the CAS save helpers re-read by id to
  // get the live updated_date before every retry. The gateway's in-isolate read
  // cache keys on the request shape, so a unique cursor value (ignored by id
  // reads) keeps a 45s-old copy from being served after a save.
  get: (entity, id) => {
    if (!hasSession() || isDenied(entity)) return Promise.resolve(null);
    return invokeFleet("staffDataRead", { entity, id, cursor: `point-${Date.now()}-${++pointReadSeq}` }).then(
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
    writeEntity(entity, { entity, op: "create", data }).then((r) => bodyOf(r).record),
  update: (entity, id, data) =>
    writeEntity(entity, { entity, op: "update", id, data }).then((r) => bodyOf(r).record),
  updateMany: (entity, query, update) =>
    writeEntity(entity, { entity, op: "updateMany", id: query?.id, query, update }).then((r) => bodyOf(r).result),
  delete: (entity, id) =>
    writeEntity(entity, { entity, op: "delete", id }).then((r) => bodyOf(r).deleted === true),
  deleteMany: (entity, query) =>
    writeEntity(entity, { entity, op: "deleteMany", query }).then((r) => bodyOf(r).result),
  // Staff sessions cannot use platform live-subscriptions (entity RLS is
  // backend-only), so subscribe polls staffDataRead and emits a synthetic
  // change event when the row set changes. Returns an unsubscribe function,
  // matching the SDK contract: `unsub = entity.subscribe(cb)`.
  subscribe: (entity, callback) => {
    if (typeof callback !== "function") return () => {};
    let stopped = false;
    let last = "";
    const check = async () => {
      // M-05: no entity traffic while the tab is hidden — this one guard covers
      // every subscribe() consumer app-wide (WO board, SalesFilter, etc.).
      if (typeof document !== "undefined" && document.hidden) return;
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
  if (!hasSession()) return Promise.resolve({});
  const live = (requests || []).filter((r) => !isDenied(r?.entity));
  if (live.length === 0) return Promise.resolve({});
  return invokeFleet("staffDataRead", { entities: live }).then((r) => {
    const body = bodyOf(r);
    (body.denied || []).forEach(markDenied);
    return body.entities || {};
  });
};