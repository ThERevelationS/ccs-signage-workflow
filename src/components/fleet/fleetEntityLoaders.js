const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_PAGES = 200;
const RATE_LIMIT_MAX_ATTEMPTS = 4;

// entity_list is quota-limited per caller. When the API reports a rate limit it
// embeds a "Retry after Ns" hint; honoring that delay is far cheaper than
// surfacing an error and having the user reload the whole burst again.
function rateLimitDelayMs(err) {
  const message = String(err?.message || err || "");
  if (!/rate limit|too many requests|\b429\b/i.test(message)) return null;
  const hint = message.match(/retry after (\d+(?:\.\d+)?)s/i);
  const base = hint ? Number(hint[1]) * 1000 : 1500;
  return Math.min(15000, Math.max(500, base + Math.floor(Math.random() * 250)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Identical concurrent loads share one in-flight promise. This is dedupe only —
// the entry is removed when the promise settles, so a later load always reads
// fresh data and mutation reloads can never observe a stale cached list.
const inFlight = new WeakMap();

function deduped(entity, signature, run) {
  let bucket = inFlight.get(entity);
  if (!bucket) inFlight.set(entity, (bucket = new Map()));
  const existing = bucket.get(signature);
  if (existing) return existing;
  const promise = run().finally(() => {
    if (bucket.get(signature) === promise) bucket.delete(signature);
  });
  bucket.set(signature, promise);
  return promise;
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

export function listAllFleetRows(entity, sort, options = {}) {
  return deduped(
    entity,
    `list|${JSON.stringify(sort)}|${options.batchSize || DEFAULT_BATCH_SIZE}`,
    () => collectPages(
      (limit, skip) => entity.list(sort, limit, skip),
      options,
    ),
  );
}

export function filterAllFleetRows(entity, query, sort, options = {}) {
  return deduped(
    entity,
    `filter|${JSON.stringify(query)}|${JSON.stringify(sort)}|${options.batchSize || DEFAULT_BATCH_SIZE}`,
    () => collectPages(
      (limit, skip) => entity.filter(query, sort, limit, skip),
      options,
    ),
  );
}
