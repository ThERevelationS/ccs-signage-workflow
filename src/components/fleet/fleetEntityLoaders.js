import { invokeFleet, getFleetMutationEpoch } from "./fleetInvoke";

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_PAGES = 200;
const RATE_LIMIT_MAX_ATTEMPTS = 4;

// Fleet entities are role-gated and staff authenticate through EmailGate
// sessions, not Base44 accounts — direct entity reads can never satisfy RLS.
// All reads flow through the fleetDataRead backend function, which validates
// the session server-side. Entity arguments are therefore NAMES, not SDK
// objects.

// entity_list is quota-limited per caller. When the API reports a rate limit it
// embeds a "Retry after Ns" hint; honoring that delay is far cheaper than
// surfacing an error and having the user reload the whole burst again.
function rateLimitDelayMs(err) {
  if (Number(err?.response?.status) === 429 || Number(err?.status) === 429) return 1500 + Math.floor(Math.random() * 250);
  const message = String(err?.response?.data?.error || err?.message || err || "");
  if (!/rate limit|too many requests|\b429\b/i.test(message)) return null;
  const hint = message.match(/retry after (\d+(?:\.\d+)?)s/i);
  const base = hint ? Number(hint[1]) * 1000 : 1500;
  return Math.min(15000, Math.max(500, base + Math.floor(Math.random() * 250)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Identical concurrent loads share one in-flight promise. The mutation epoch
// rides inside each signature so a read issued after a mutation can never
// consume a snapshot that predates it — post-mutation reloads always fetch
// fresh. Settled loads are never cached unless the caller passes ttlMs —
// reserved for slow-changing catalogs (parts/fluids), never edit surfaces.
const inFlight = new Map();
const responseCache = new Map();
const RESPONSE_CACHE_MAX = 100;

const epoch = () => getFleetMutationEpoch();

function deduped(signature, run, ttlMs = 0) {
  const existing = inFlight.get(signature);
  if (existing) return existing;
  if (ttlMs > 0) {
    const hit = responseCache.get(signature);
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.rows);
  }
  const promise = run().then((rows) => {
    if (ttlMs > 0) {
      if (responseCache.size >= RESPONSE_CACHE_MAX) responseCache.delete(responseCache.keys().next().value);
      responseCache.set(signature, { at: Date.now(), rows });
    }
    return rows;
  }).finally(() => {
    if (inFlight.get(signature) === promise) inFlight.delete(signature);
  });
  inFlight.set(signature, promise);
  return promise;
}

function readError(err) {
  const message = err?.response?.data?.error || err?.message || "Fleet data could not be loaded.";
  const wrapped = new Error(message);
  wrapped.status = Number(err?.response?.status || err?.status || 0) || undefined;
  return wrapped;
}

async function directFleetPage(entityName, { query, sort, limit, skip }) {
  const res = await invokeFleet("fleetDataRead", {
    entity: entityName,
    ...(query ? { query } : {}),
    ...(sort ? { sort } : {}),
    limit,
    skip,
  });
  const data = res?.data || res;
  return Array.isArray(data?.items) ? data.items : [];
}

// Mount-storm coalescing — a page mount fires many parallel single-entity
// reads; previously each became its own fleetDataRead invoke on the shared
// service budget (~9 invokes at FleetOverview mount). Calls made in the same
// synchronous burst now coalesce into one batch invoke (the gateway supports
// up to 16 entities per call, rows keyed by entity name).
const BATCH_WINDOW_MS = 30;
const pendingBatch = new Map();
let flushScheduled = false;

async function flushBatch() {
  flushScheduled = false;
  const entries = [...pendingBatch.values()];
  pendingBatch.clear();
  if (entries.length === 0) return;
  const batchable = [];
  const individual = [];
  const seen = new Set();
  for (const entry of entries) {
    // The batch response is keyed by entity name, so an entity can appear at
    // most once per batch; extras fall back to direct reads.
    if (seen.has(entry.entity)) individual.push(entry);
    else { seen.add(entry.entity); batchable.push(entry); }
  }
  for (let i = 0; i < batchable.length; i += 16) {
    const chunk = batchable.slice(i, i + 16);
    try {
      const res = await invokeFleet("fleetDataRead", {
        entities: chunk.map((e) => ({ entity: e.entity, ...e.args })),
      });
      const data = res?.data || res;
      const out = data?.entities || {};
      const errs = data?.errors || {};
      // A 429 inside a batch still means the shared budget is saturated — the
      // invoke resolved, so the caller's rate-limit handling never saw it.
      const limited = Object.values(errs).find((d) => Number(d?.status) === 429);
      if (limited) throw Object.assign(new Error(String(limited.error || 'Rate limit exceeded')), { status: 429 });
      chunk.forEach((e) => {
        if (errs[e.entity]) {
          const detail = errs[e.entity];
          e.reject(Object.assign(new Error(detail.error || 'Fleet read failed'), { status: detail.status }));
        } else {
          e.resolve(Array.isArray(out[e.entity]) ? out[e.entity] : []);
        }
      });
    } catch (err) {
      // Rate-limited batch: fanning out into ~16 individual reads would amplify
      // the very saturation that caused the 429 — reject so callers degrade.
      if (Number(err?.status ?? err?.response?.status) === 429) {
        chunk.forEach((e) => e.reject(err));
      } else {
        individual.push(...chunk);
      }
    }
  }
  individual.forEach((e) => directFleetPage(e.entity, e.args).then(e.resolve, e.reject));
}

function batchedFleetRead(entityName, args) {
  const key = `${entityName}|${JSON.stringify(args)}`;
  const existing = pendingBatch.get(key);
  if (existing) return existing.promise;
  let resolveRef, rejectRef;
  const promise = new Promise((resolve, reject) => { resolveRef = resolve; rejectRef = reject; });
  pendingBatch.set(key, { entity: entityName, args, resolve: resolveRef, reject: rejectRef, promise });
  if (!flushScheduled) { flushScheduled = true; setTimeout(flushBatch, BATCH_WINDOW_MS); }
  return promise;
}

async function fetchFleetPage(entityName, { query, sort, limit, skip }) {
  try {
    return await batchedFleetRead(entityName, {
      ...(query ? { query } : {}),
      ...(sort ? { sort } : {}),
      limit,
      skip,
    });
  } catch (err) {
    throw readError(err);
  }
}

async function collectPages(fetchPage, { batchSize = DEFAULT_BATCH_SIZE, maxPages = DEFAULT_MAX_PAGES, label = "Fleet entity" } = {}) {
  const rows = [];
  let skip = 0;
  for (let page = 0; page < maxPages; page += 1) {
    let batch;
    for (let attempt = 0; ; attempt += 1) {
      try {
        batch = await fetchPage(batchSize, skip);
        break;
      } catch (err) {
        const delay = rateLimitDelayMs(err);
        if (delay == null || attempt >= RATE_LIMIT_MAX_ATTEMPTS) throw err;
        await sleep(delay);
      }
    }
    const pageRows = Array.isArray(batch) ? batch : [];
    rows.push(...pageRows);
    if (pageRows.length < batchSize) return rows;
    skip += pageRows.length;
  }
  throw new Error(`${label} exceeded the Fleet pagination safety limit; refusing to silently truncate results.`);
}

// Single-page read — replaces direct entity.list/filter calls that do not
// need collectPages' paginate-all behavior (detail lookups, capped panels).
export function readFleetRows(entityName, { query, sort, limit = 100, skip = 0, ttlMs = 0 } = {}) {
  return deduped(
    `page|${entityName}|${epoch()}|${JSON.stringify({ query, sort, limit, skip })}`,
    () => fetchFleetPage(entityName, { query, sort, limit, skip }),
    ttlMs,
  );
}

export function listAllFleetRows(entityName, sort, options = {}) {
  return deduped(
    `list|${entityName}|${epoch()}|${JSON.stringify(sort)}|${options.batchSize || DEFAULT_BATCH_SIZE}`,
    () => collectPages(
      (limit, skip) => fetchFleetPage(entityName, { sort, limit, skip }),
      options,
    ),
    Number(options.ttlMs) || 0,
  );
}

export function filterAllFleetRows(entityName, query, sort, options = {}) {
  return deduped(
    `filter|${entityName}|${epoch()}|${JSON.stringify(query)}|${JSON.stringify(sort)}|${options.batchSize || DEFAULT_BATCH_SIZE}`,
    () => collectPages(
      (limit, skip) => fetchFleetPage(entityName, { query, sort, limit, skip }),
      options,
    ),
    Number(options.ttlMs) || 0,
  );
}