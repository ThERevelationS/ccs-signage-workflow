// src/components/estimator/loadAllEntityRows.js
var DEFAULT_PAGE_SIZE = 500;
var DEFAULT_MAX_ROWS = 5e4;
var RATE_LIMIT_MAX_RETRIES = 3;
var RATE_LIMIT_BASE_DELAY_MS = 1200;
function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const message = String(
    error?.message || error?.response?.data?.error || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}
async function withRateLimitRetry(fn) {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (typeof error?.ccsGovernorRetried === "number") throw error;
      if (attempt < RATE_LIMIT_MAX_RETRIES && isRateLimitError(error)) {
        await sleep(RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}
var readCache = /* @__PURE__ */ new Map();
var CACHE_MAX_AGE_MS = 3e4;
var primeEntityRowsCache = (label, query, sort, rows) => {
  readCache.set(JSON.stringify([label, query ?? null, sort, DEFAULT_PAGE_SIZE, DEFAULT_MAX_ROWS]), { at: Date.now(), rows });
};
async function loadAllEntityRows({
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
  limit = null
} = {}) {
  const parsedLimit = limit == null ? null : Math.floor(Number(limit));
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const cacheKey = cacheTtlMs > 0 ? JSON.stringify([label, query, sort, pageSize, safeLimit ?? maxRows]) : null;
  if (cacheKey) {
    const hit = readCache.get(cacheKey);
    if (hit && Date.now() - hit.at < Math.min(cacheTtlMs, CACHE_MAX_AGE_MS)) return hit.rows;
  }
  const hasFilter = query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = safeLimit ?? Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const collected = [];
  const seen = /* @__PURE__ */ new Set();
  let skip = 0;
  while (skip < safeMaxRows) {
    const pageLimit = Math.min(safePageSize, safeMaxRows - skip);
    const page = await withRateLimitRetry(
      () => hasFilter ? entity.filter(query, sort || void 0, pageLimit, skip) : entity.list(sort || void 0, pageLimit, skip)
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
      if (cacheKey) readCache.set(cacheKey, { at: Date.now(), rows: collected });
      return collected;
    }
    skip += pageLimit;
  }
  if (safeLimit != null) {
    if (cacheKey) readCache.set(cacheKey, { at: Date.now(), rows: collected });
    return collected;
  }
  throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
}
export {
  isRateLimitError,
  loadAllEntityRows,
  primeEntityRowsCache,
  withRateLimitRetry
};
