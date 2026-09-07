const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_ROWS = 50000;

function rowIdentity(row: any, index: number) {
  const id = String(row?.id || '').trim();
  return id || `__row_${index}`;
}

export async function loadAllEntityRows({
  entity,
  query = null,
  sort = 'created_date',
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = 'Entity rows',
}: {
  entity: any;
  query?: Record<string, unknown> | null;
  sort?: string | null;
  pageSize?: number;
  maxRows?: number;
  label?: string;
}) {
  const hasFilter = !!query && typeof query === 'object';
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== 'function') {
    throw new Error(`${label} could not initialize its paged read.`);
  }

  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const rows: any[] = [];
  const seen = new Set<string>();
  let skip = 0;

  while (skip < safeMaxRows) {
    const page = hasFilter
      ? await entity.filter(query, sort || undefined, safePageSize, skip)
      : await entity.list(sort || undefined, safePageSize, skip);

    if (!Array.isArray(page)) {
      throw new Error(`${label} could not be verified completely.`);
    }

    for (let index = 0; index < page.length; index += 1) {
      const row = page[index];
      const key = rowIdentity(row, skip + index);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }

    if (page.length < safePageSize) return rows;
    skip += safePageSize;
  }

  throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record verification safety limit.`);
}
