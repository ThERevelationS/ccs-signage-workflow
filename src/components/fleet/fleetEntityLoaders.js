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
// fresh. Settled loads are never cached; the entry drops on settle.
const inFlight = new Map();

const epoch = () => getFleetMutationEpoch();

function deduped(signature, run) {
  const existing = inFlight.get(signature);
  if (existing) return existing;
  const promise = run().finally(() => {
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

async function fetchFleetPage(entityName, { query, sort, limit, skip }) {
  try {
    const res = await invokeFleet("fleetDataRead", {
      entity: entityName,
      ...(query ? { query } : {}),
      ...(sort ? { sort } : {}),
      limit,
      skip,
    });
    const data = res?.data || res;
    return Array.isArray(data?.items) ? data.items : [];
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
export function readFleetRows(entityName, { query, sort, limit = 100, skip = 0 } = {}) {
  return deduped(
    `page|${entityName}|${epoch()}|${JSON.stringify({ query, sort, limit, skip })}`,
    () => fetchFleetPage(entityName, { query, sort, limit, skip }),
  );
}

export function listAllFleetRows(entityName, sort, options = {}) {
  return deduped(
    `list|${entityName}|${epoch()}|${JSON.stringify(sort)}|${options.batchSize || DEFAULT_BATCH_SIZE}`,
    () => collectPages(
      (limit, skip) => fetchFleetPage(entityName, { sort, limit, skip }),
      options,
    ),
  );
}

export function filterAllFleetRows(entityName, query, sort, options = {}) {
  return deduped(
    `filter|${entityName}|${epoch()}|${JSON.stringify(query)}|${JSON.stringify(sort)}|${options.batchSize || DEFAULT_BATCH_SIZE}`,
    () => collectPages(
      (limit, skip) => fetchFleetPage(entityName, { query, sort, limit, skip }),
      options,
    ),
  );
}
