const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_PAGES = 200;

async function collectPages(fetchPage, { batchSize = DEFAULT_BATCH_SIZE, maxPages = DEFAULT_MAX_PAGES, label = "Fleet entity" } = {}) {
  const rows = [];
  let skip = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await fetchPage(batchSize, skip);
    const pageRows = Array.isArray(batch) ? batch : [];
    rows.push(...pageRows);
    if (pageRows.length < batchSize) return rows;
    skip += pageRows.length;
  }
  throw new Error(`${label} exceeded the Fleet pagination safety limit; refusing to silently truncate results.`);
}

export function listAllFleetRows(entity, sort, options = {}) {
  return collectPages(
    (limit, skip) => entity.list(sort, limit, skip),
    options,
  );
}

export function filterAllFleetRows(entity, query, sort, options = {}) {
  return collectPages(
    (limit, skip) => entity.filter(query, sort, limit, skip),
    options,
  );
}
