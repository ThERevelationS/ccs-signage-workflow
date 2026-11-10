const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_ROWS = 50000;
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1200;

function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const message = String(
    error?.message ||
    error?.response?.data?.error ||
    error?.data?.error ||
    ""
  ).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}

/**
 * Retries a single SDK call when the platform returns a transient rate-limit
 * error. Uses exponential backoff so concurrent page-load calls (builder
 * reconciliation, part catalogs, section snapshots) don't all retry at once.
 */
export async function withRateLimitRetry(fn) {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      // The request governor already retried this call with backoff; a second
      // retry loop here would multiply the delay without helping.
      if (typeof error?.ccsGovernorRetried === "number") throw error;
      if (attempt < RATE_LIMIT_MAX_RETRIES && isRateLimitError(error)) {
        await sleep(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Load a complete estimator prerequisite catalog without relying on Base44's
 * list/filter default limit (50 rows).
 *
 * This helper is intentionally read-only. It pages the existing entity client
 * using the SDK's list/filter(sort, limit, skip) contract, fails closed on an
 * unreadable page, and de-duplicates by entity id so callers never silently
 * estimate from a partial catalog.
 *
 * Paging order defaults to ASCENDING "created_date" (not "-created_date").
 * That is deliberate: new rows append to the end of the set, so earlier
 * skip/limit pages stay stable while a full scan is in flight — a
 * newest-first order would shift every page on each concurrent insert.
 * Callers may pass any SDK sort string; it is forwarded to list/filter on
 * every page (an empty/falsy sort falls back to the SDK's own default).
 */
/**
 * @param {{
 *   entity?: any,
 *   query?: Record<string, any> | null,
 *   sort?: string | null,
 *   pageSize?: number,
 *   maxRows?: number,
 *   label?: string,
 *   limit?: number | null,
 * }} [options]
 */
// Short-TTL in-memory cache for slow-changing catalogs (jurisdiction/locality
// lists). Opt-in per call — repeated mounts of the same page stop re-reading
// the whole catalog and burning the shared rate-limit budget. Keyed per
// entity object (like inFlightReads): the query/sort/limits tuple alone is
// not unique — two entities with identical reads would otherwise share a
// cache slot and serve each other's rows.
const readCache = new WeakMap(); // entity -> Map<key, {at, rows}>
const CACHE_MAX_AGE_MS = 30000;
// Identical reads issued at the same instant (mount bursts, StrictMode double
// mounts, sibling components) share one network pass. Keyed per entity object
// so different gateways never share rows; every caller receives a copy so an
// in-place sort/splice by one consumer cannot corrupt another's result.
const inFlightReads = new WeakMap(); // entity -> Map<key, Promise<rows>>

const readCacheBucket = (entity) => {
  let bucket = readCache.get(entity);
  if (!bucket) {
    bucket = new Map();
    readCache.set(entity, bucket);
  }
  return bucket;
};

// Seed the short-TTL cache with rows fetched through a batch read so the
// per-entity loaders skip their own network call on the next mount.
export const primeEntityRowsCache = (entity, query, sort, rows) => {
  if (entity === null || (typeof entity !== "object" && typeof entity !== "function")) return;
  readCacheBucket(entity).set(JSON.stringify([query ?? null, sort, DEFAULT_PAGE_SIZE, DEFAULT_MAX_ROWS]), { at: Date.now(), rows });
};

export async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Estimator prerequisite catalog",
  cacheTtlMs = 0,
  // (#403) `limit` bounds the total rows returned for callers that only need a
  // window (e.g. "the 50 newest"), not a verified-complete catalog. Reaching
  // the bound is a normal truncation — unlike `maxRows`, which stays a
  // runaway-scan safety net and still throws when a full scan would pass it.
  limit = null,
} = {}) {
  const parsedLimit = limit == null ? null : Math.floor(Number(limit));
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const canShare = entity !== null && (typeof entity === "object" || typeof entity === "function");
  const cacheKey = cacheTtlMs > 0 && canShare ? JSON.stringify([query, sort, pageSize, safeLimit ?? maxRows]) : null;
  if (cacheKey) {
    const hit = readCache.get(entity)?.get(cacheKey);
    if (hit && Date.now() - hit.at < Math.min(cacheTtlMs, CACHE_MAX_AGE_MS)) return [...hit.rows];
  }
  const hasFilter = query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }

  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  // A bounded read never fetches a page larger than the rows still wanted —
  // `limit: 50` costs exactly one 50-row request, not a 500-row page.
  const safeMaxRows = safeLimit ?? Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);

  // Join an identical read already in flight instead of starting a second
  // paged scan for the same data. Non-object entities skip sharing.
  const flightKey = JSON.stringify([hasFilter ? "filter" : "list", query ?? null, sort ?? null, safePageSize, safeMaxRows]);
  if (canShare) {
    const existing = inFlightReads.get(entity)?.get(flightKey);
    if (existing) return existing.then((rows) => [...rows]);
  }

  const readPromise = (async () => {
    const collected = [];
    const seen = new Set();
    let skip = 0;

    while (skip < safeMaxRows) {
      const pageLimit = Math.min(safePageSize, safeMaxRows - skip);
      const page = await withRateLimitRetry(() =>
        hasFilter
          ? entity.filter(query, sort || undefined, pageLimit, skip)
          : entity.list(sort || undefined, pageLimit, skip)
      );

      if (!Array.isArray(page)) {
        throw new Error(`${label} could not be verified completely. Estimating was blocked rather than using a partial catalog.`);
      }

      for (let index = 0; index < page.length; index += 1) {
        const row = page[index];
        const key = rowIdentity(row, skip + index);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(row);
      }

      if (page.length < pageLimit) {
        if (cacheKey) readCacheBucket(entity).set(cacheKey, { at: Date.now(), rows: collected });
        return collected;
      }
      skip += pageLimit;
    }

    if (safeLimit != null) {
      if (cacheKey) readCacheBucket(entity).set(cacheKey, { at: Date.now(), rows: collected });
      return collected;
    }
    throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
  })();

  if (!canShare) return readPromise;
  let flightBucket = inFlightReads.get(entity);
  if (!flightBucket) {
    flightBucket = new Map();
    inFlightReads.set(entity, flightBucket);
  }
  flightBucket.set(flightKey, readPromise);
  try {
    const rows = await readPromise;
    return [...rows];
  } finally {
    if (flightBucket.get(flightKey) === readPromise) flightBucket.delete(flightKey);
  }
}