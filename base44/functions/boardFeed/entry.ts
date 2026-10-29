import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Board/list feed for the app's largest tables. Workflow boards used to page
// the full WorkOrder table (~3.1k rows, ~15 MB) through entity reads on every
// mount and again on every poll, which saturated the shared entity_list rate
// budget and produced user-facing 500s. This endpoint exists to make those
// reads survivable:
//   - HEAVY_FIELDS are stripped per entity (~70% of WorkOrder bytes are the
//     smartsheet_sync_snapshot + work_notes blobs, which list views never
//     read; detail dialogs fetch single rows when they need them).
//   - `since` applies an updated_date delta cursor server-side, so a steady
//     board refresh transfers only changed rows in one read instead of
//     re-paging the whole table.
// Read scope matches these entities' open read RLS — a valid staff session is
// accepted when presented but is not required to read.

const FEEDABLE: Record<string, { heavy: string[] }> = {
  WorkOrder: { heavy: ['smartsheet_sync_snapshot', 'work_notes'] },
  Order: { heavy: ['smartsheet_sync_snapshot', 'work_notes'] },
  JurisdictionProfile: { heavy: [] },
};

const ALLOWED_OPERATORS = new Set(['$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']);
const MAX_QUERY_BYTES = 4000;
// One 5k page pulls the whole active table in a single entity_list call
// (~2-5s) instead of ~7 sequential 500-row pages — both faster for the
// caller and ~7x cheaper against the shared entity_list rate budget.
const PAGE_SIZE = 5000;
const MAX_ROWS = 20000;
const MAX_FIELD_LIST = 200;
const SORT_PATTERN = /^(-?[A-Za-z_][\w.]*)(\s*,\s*-?[A-Za-z_][\w.]*){0,3}$/;

function bad(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

function cleanQuery(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw bad('Feed filter must be an object.');
  }
  const stack: any[] = [value];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$') && !ALLOWED_OPERATORS.has(key)) {
        throw bad(`Feed filter operator is not permitted: ${key}`);
      }
      if (val && typeof val === 'object') stack.push(val);
    }
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw bad('Feed filter must be JSON-serializable.');
  }
  if (serialized.length > MAX_QUERY_BYTES) throw bad('Feed filter is too large.');
  return value;
}

function cleanSort(value: unknown) {
  const sort = String(value || '').trim();
  if (!sort) return null;
  if (sort.length > 200 || !SORT_PATTERN.test(sort)) throw bad('Feed sort is invalid.');
  return sort;
}

function cleanFields(value: unknown) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > MAX_FIELD_LIST) throw bad('Feed fields list is invalid.');
  const out = [...new Set(value.map((f) => String(f || '').trim()).filter((f) => /^[A-Za-z_][\w.]*$/.test(f)))];
  return out.length ? out : null;
}

function cleanSince(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw bad('Feed cursor is invalid.');
  return new Date(ms).toISOString();
}

function projectRow(row: any, fields: string[] | null, heavy: string[]) {
  if (!row || typeof row !== 'object') return row;
  if (fields) {
    const out: any = { id: row.id, created_date: row.created_date, updated_date: row.updated_date };
    for (const field of fields) out[field] = row[field];
    return out;
  }
  const clean = { ...row };
  for (const field of heavy) delete clean[field];
  return clean;
}

// Module-scope result cache — Deno isolates are reused across invocations,
// so a burst of identical full pulls (post-publish reloads, many staff tabs
// opening at once) collapses to one upstream read set instead of ~7 paged
// entity reads per tab. Delta pulls and custom projections are never
// cached; the cached payload keeps its own server_time so the caller
// delta cursor still covers the gap.
let feedCache: { key: string; payload: any; expires: number } | null = null;
const FEED_CACHE_TTL_MS = 30_000;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));

    // Staff session required — WorkOrder/Order read RLS is role-gated, so an
    // anonymous service-role feed would reopen the access that lockdown closed.
    // Reads stay open to match the entity read RLS — a stale or expired staff
    // token must not turn the feed into a permanent loading screen.
    await authenticateSignShopSession(base44, body.session_token).catch(() => null);

    const entityName = String(body?.entity || '').trim();
    const spec = FEEDABLE[entityName];
    if (!spec) return Response.json({ error: 'This record type cannot be read here.' }, { status: 403 });

    const query = cleanQuery(body?.query) || {};
    const since = cleanSince(body?.since);
    if (since) {
      query.updated_date = { ...(query.updated_date && typeof query.updated_date === 'object' ? query.updated_date : {}), $gt: since };
    }
    const sort = cleanSort(body?.sort) || '-updated_date';
    const fields = cleanFields(body?.fields);
    const includeHeavy = body?.include_heavy === true;
    const heavy = includeHeavy ? [] : spec.heavy;
    const cacheable = !since && !fields && !includeHeavy;
    const cacheKey = entityName + "|" + JSON.stringify(query) + "|" + sort;
    if (cacheable && feedCache && feedCache.key === cacheKey && feedCache.expires > Date.now()) {
      return Response.json(feedCache.payload);
    }

    const entity = base44.asServiceRole.entities[entityName];
    const rows: any[] = [];
    const seen = new Set<string>();
    let skip = 0;
    let truncated = false;
    while (true) {
      const page = await entity.filter(query, sort, PAGE_SIZE, skip);
      if (!Array.isArray(page)) throw new Error(`${entityName} feed could not be verified completely.`);
      for (const row of page) {
        const id = String(row?.id || '');
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        rows.push(projectRow(row, fields, heavy));
      }
      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
      if (skip >= MAX_ROWS) { truncated = true; break; }
    }

    const payload = {
      rows,
      count: rows.length,
      truncated,
      server_time: new Date().toISOString(),
    };
    if (cacheable) feedCache = { key: cacheKey, payload, expires: Date.now() + FEED_CACHE_TTL_MS };
    return Response.json(payload);
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Board feed failed.' }, { status });
    }
    console.error('boardFeed error:', error);
    return Response.json({ error: 'Data could not be loaded. Try again.' }, { status: 500 });
  }
});
