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
  const message = String(
    error?.message ||
    error?.response?.data?.error ||
    error?.data?.error ||
    ""
  ).toLowerCase();
  return message.includes("rate limit");
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
 */
export async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Estimator prerequisite catalog",
} = {}) {
  const hasFilter = query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }

  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const collected = [];
  const seen = new Set();
  let skip = 0;

  while (skip < safeMaxRows) {
    const page = await withRateLimitRetry(() =>
      hasFilter
        ? entity.filter(query, sort || undefined, safePageSize, skip)
        : entity.list(sort || undefined, safePageSize, skip)
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

    if (page.length < safePageSize) return collected;
    skip += safePageSize;
  }

  throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record estimator safety limit.`);
}