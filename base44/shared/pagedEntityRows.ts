// 2,000-row pages cut full-table pulls to ~4x fewer entity_list requests
// than the old 500 default while keeping each response bounded (~8MB worst
// case on blob-heavy rows). Callers can still pass a smaller pageSize.
const DEFAULT_PAGE_SIZE = 2000;
const DEFAULT_MAX_ROWS = 50000;

// ---- M-02 read-budget telemetry -----------------------------------------
// Module-level counters — environment-agnostic (this file is bundled into
// Deno function runtimes via shared/ imports, so no node:* or unguarded
// process.env deps). Every call accumulates stats inspectable via
// getReadTelemetry() and clearable via resetReadTelemetry(); surfaces that
// blow the read budget show up as high pages/rows/maxPagesPerCall. A
// console.warn line is also emitted per call outside production (guarded —
// Deno runtimes may lack process.env); force on/off from any environment
// with `globalThis.__READ_BUDGET_TELEMETRY = true | false`. Counters only —
// the read path below is unchanged.

type ReadTelemetryCall = {
  at: string;
  label: string;
  pages: number;
  rows: number;
  ms: number;
  inflight: number;
};

type ReadTelemetryBucket = {
  calls: number;
  pages: number;
  rows: number;
  totalMs: number;
  inflight: number;
  maxInflight: number;
  maxPagesPerCall: number;
  maxRowsPerCall: number;
  lastCall: ReadTelemetryCall | null;
};

function emptyReadTelemetryBucket(): ReadTelemetryBucket {
  return {
    calls: 0, pages: 0, rows: 0, totalMs: 0,
    inflight: 0, maxInflight: 0,
    maxPagesPerCall: 0, maxRowsPerCall: 0,
    lastCall: null,
  };
}

const readTelemetryTotal = emptyReadTelemetryBucket();
const readTelemetryByEntity = new Map<string, ReadTelemetryBucket>();

function readTelemetryBucketFor(key: string): ReadTelemetryBucket {
  let bucket = readTelemetryByEntity.get(key);
  if (!bucket) {
    bucket = emptyReadTelemetryBucket();
    readTelemetryByEntity.set(key, bucket);
  }
  return bucket;
}

// The SDK entity handler keeps entityName in a closure — not readable — so
// probe common name props (facade wrappers expose some) and fall back to
// the caller's label, which every call site supplies ('Order rows', …).
function readTelemetryEntityName(entity: any, label: string): string {
  for (const prop of ['_entityName', 'entityName', 'entity_name', 'name']) {
    const value = entity?.[prop];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return label || 'unknown';
}

function readTelemetryInflight(bucket: ReadTelemetryBucket, delta: 1 | -1) {
  bucket.inflight = Math.max(0, bucket.inflight + delta);
  readTelemetryTotal.inflight = Math.max(0, readTelemetryTotal.inflight + delta);
  if (delta > 0) {
    if (bucket.inflight > bucket.maxInflight) bucket.maxInflight = bucket.inflight;
    if (readTelemetryTotal.inflight > readTelemetryTotal.maxInflight) {
      readTelemetryTotal.maxInflight = readTelemetryTotal.inflight;
    }
  }
}

function readTelemetryDevWarn(): boolean {
  try {
    const flag = (globalThis as any).__READ_BUDGET_TELEMETRY;
    if (flag === true) return true;
    if (flag === false) return false;
  } catch { /* fall through to the env check */ }
  try {
    const proc = (globalThis as any).process;
    return !!proc?.env && proc.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

function recordReadTelemetry(
  key: string, label: string, pages: number, rows: number, ms: number, inflight: number,
) {
  const call: ReadTelemetryCall = { at: new Date().toISOString(), label, pages, rows, ms, inflight };
  const bucket = readTelemetryBucketFor(key);
  for (const target of [readTelemetryTotal, bucket]) {
    target.calls += 1;
    target.pages += pages;
    target.rows += rows;
    target.totalMs += ms;
    if (pages > target.maxPagesPerCall) target.maxPagesPerCall = pages;
    if (rows > target.maxRowsPerCall) target.maxRowsPerCall = rows;
    target.lastCall = call;
  }
  if (readTelemetryDevWarn()) {
    console.warn(
      `[read-budget] ${key}: ${pages} page(s), ${rows} rows, ${ms}ms` +
      (inflight > 1 ? ` (inflight=${inflight})` : ''),
    );
  }
}

/** Snapshot of accumulated read-budget counters (plain JSON-safe object). */
export function getReadTelemetry() {
  const copy = (b: ReadTelemetryBucket): ReadTelemetryBucket => ({
    ...b, lastCall: b.lastCall ? { ...b.lastCall } : null,
  });
  const byEntity: Record<string, ReadTelemetryBucket> = {};
  for (const [key, bucket] of readTelemetryByEntity) byEntity[key] = copy(bucket);
  return { ...copy(readTelemetryTotal), byEntity };
}

/** Zero all accumulated counters. In-flight calls keep their inflight count. */
export function resetReadTelemetry() {
  const inflight = new Map<string, number>();
  for (const [key, bucket] of readTelemetryByEntity) {
    if (bucket.inflight > 0) inflight.set(key, bucket.inflight);
  }
  const totalInflight = readTelemetryTotal.inflight;
  readTelemetryByEntity.clear();
  Object.assign(readTelemetryTotal, emptyReadTelemetryBucket());
  readTelemetryTotal.inflight = totalInflight;
  for (const [key, count] of inflight) {
    readTelemetryBucketFor(key).inflight = count;
  }
}
// -------------------------------------------------------------------------

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
  fields = null,
  label = 'Entity rows',
}: {
  entity: any;
  query?: Record<string, unknown> | null;
  sort?: string | null;
  pageSize?: number;
  maxRows?: number;
  // Server-side projection (SDK 5th arg): an allowlist of fields to read.
  // Omitting it keeps full-row reads — callers passing it must include every
  // field their downstream code touches, including undeclared stored fields.
  fields?: string[] | null;
  label?: string;
}) {
  const hasFilter = !!query && typeof query === 'object';
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== 'function') {
    throw new Error(`${label} could not initialize its paged read.`);
  }

  // Pages may be up to the platform's 5,000-row list ceiling; callers paging
  // large tables should opt in explicitly so request count drops ~10x.
  const safePageSize = Math.max(1, Math.min(5000, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const rows: any[] = [];
  const seen = new Set<string>();
  let skip = 0;

  // Telemetry (M-02): wrap the unchanged read loop — pages fetched, rows
  // returned, elapsed ms, and concurrent in-flight calls per entity are
  // recorded even when the read throws or hits the safety limit.
  const telemetryKey = readTelemetryEntityName(entity, label);
  const telemetryBucket = readTelemetryBucketFor(telemetryKey);
  const telemetryStart = Date.now();
  let telemetryPages = 0;
  readTelemetryInflight(telemetryBucket, 1);

  try {
    while (skip < safeMaxRows) {
      // Count requests issued — a page that throws still consumed the
      // caller's entity_list rate budget.
      telemetryPages += 1;
      const page = hasFilter
        ? await entity.filter(query, sort || undefined, safePageSize, skip, fields || undefined)
        : await entity.list(sort || undefined, safePageSize, skip, fields || undefined);

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
  } finally {
    const telemetryInflightNow = telemetryBucket.inflight;
    readTelemetryInflight(telemetryBucket, -1);
    recordReadTelemetry(
      telemetryKey, label, telemetryPages, rows.length,
      Date.now() - telemetryStart, telemetryInflightNow,
    );
  }
}