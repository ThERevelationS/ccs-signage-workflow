import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Queue feed — the WorkOrder projection the product queue pages need and
// nothing else. Queue views used to pull whole WorkOrder rows through
// boardFeed; the queue surface only renders a small slice of each row plus a
// small slice of each products[] entry, so this endpoint returns exactly that
// slice (~70-80% smaller payload than the board projection, which still
// carries ~150 top-level fields and whole product sub-documents).
//
//   - QUEUE_WO_FIELDS / QUEUE_PRODUCT_FIELDS are allowlist projections: every
//     field flattenQueueRows (src/components/queues/productQueueModel.js),
//     queueCountersModel.moduleKeyForRow, and the ProductQueue row chrome
//     read. Anything not listed never leaves the function.
//   - products[] is projected per-entry in-function (the SDK's filter(fields)
//     arg projects top-level columns only), which is where the heavy product
//     blobs — notes[], status_history, conversion_events, smartsheet_* — get
//     stripped.
//   - `since` is an updated_date delta cursor (server-side $gte), `limit`
//     caps returned items, `module_key` narrows products to one module the
//     same way moduleKeyForRow resolves module ownership (product module_key
//     wins, WO module fields are the fallback).
//   - next_cursor = max updated_date scanned, so a poll with since=next_cursor
//     resumes without re-reading the table. Rows scan oldest→newest so a
//     limited pull resumes gap-free; the $gte boundary row re-arrives once —
//     clients dedupe by id (this response dedupes within itself too).
// Read scope matches boardFeed: a valid staff session is required — the
// service-role read must not reopen what the entity RLS lockdown closed.

const QUEUE_WO_FIELDS = [
  'id', 'created_date', 'updated_date',
  'title', 'client_name', 'customer_id', 'contact_email', 'opportunity_id',
  'corbridge_invoice_number',
  'current_stage', 'priority', 'assigned_to', 'due_date', 'project_install_date',
  'completed', 'deleted',
  // Module ownership — moduleKeyForRow's WO fallback chain, first non-blank wins.
  'module_key', 'project_type', 'order_type', 'module', 'type',
  // Queue filter columns (QueueFilterBar: salesperson / entered_by) + enteredBy.
  'sales_rep', 'salesperson', 'salesperson_email',
  'created_by', 'entered_by',
  // Order-level rush signals flattenQueueRows folds into the row's rush flag.
  'is_rush', 'rush', 'order_priority',
  'products',
];

const QUEUE_PRODUCT_FIELDS = [
  'id', 'product_name', 'description', 'client_product_name', 'quantity',
  'product_type', 'category', 'module_key',
  'operational_status', 'operational_substatus', 'customer_facing_status',
  'operational_status_changed_at',
  'fulfillment_state', 'fulfillment_method',
  'proof_status', 'proof_version', 'proof_approved_version',
  'proof_file_url', 'proof_file_name',
  'design_due_date', 'product_due_date', 'hard_due_date',
  'designer', 'assigned_to', 'responsibility', 'responsibility_color',
  'priority', 'queue_priority', 'priority_label',
  // Product-level rush signals + quick tags.
  'is_rush', 'rush', 'quick_tags',
  // CoreBridge filter keys (machine / part columns).
  'machine', 'machine_name', 'assigned_machine', 'part', 'part_name',
  // Per-product crew/credit spellings some imported rows carry.
  'salesperson', 'entered_by',
  'builder_product_id',
];

// Heavy product sub-documents the queue never renders. The allowlist already
// excludes them; the explicit strip is a guard so a future field-list edit
// can't silently re-inflate the payload.
const PRODUCT_HEAVY_FIELDS = ['notes', 'status_history', 'conversion_events'];
const PRODUCT_HEAVY_PREFIXES = ['smartsheet_'];

// WO module ownership fallback chain — same order moduleKeyForRow uses.
const WO_MODULE_KEYS = ['module_key', 'project_type', 'order_type', 'module', 'type'];

// One 5k page pulls the whole active table in a single entity_list call
// (~2-5s) instead of sequential 500-row pages — same budget math as boardFeed.
const PAGE_SIZE = 5000;
const MAX_ROWS = 20000;
const MAX_LIMIT = 20000;
const MAX_MODULE_KEY = 120;

function bad(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

function cleanSince(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw bad('Feed cursor is invalid.');
  return new Date(ms).toISOString();
}

function cleanLimit(value: unknown) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw bad('Feed limit is invalid.');
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function cleanModuleKey(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.length > MAX_MODULE_KEY) throw bad('Feed module_key is invalid.');
  return raw;
}

const norm = (v: unknown) => String(v || '').trim().toLowerCase();

function woModuleKey(wo: any) {
  for (const key of WO_MODULE_KEYS) {
    const v = norm(wo?.[key]);
    if (v) return v;
  }
  return '';
}

// Product module ownership mirrors moduleKeyForRow: the product's own
// module_key wins, the WO's resolved module is the fallback for products
// that never got stamped at conversion.
function productModuleKey(product: any, woKey: string) {
  return norm(product?.module_key) || woKey;
}

function projectProduct(product: any) {
  if (!product || typeof product !== 'object') return product;
  const out: any = {};
  for (const field of QUEUE_PRODUCT_FIELDS) out[field] = product[field];
  for (const field of PRODUCT_HEAVY_FIELDS) delete out[field];
  for (const key of Object.keys(out)) {
    if (PRODUCT_HEAVY_PREFIXES.some((p) => key.startsWith(p))) delete out[key];
  }
  return out;
}

function projectWorkOrder(row: any, wantedModule: string) {
  if (!row || typeof row !== 'object') return row;
  const out: any = {};
  for (const field of QUEUE_WO_FIELDS) out[field] = row[field];
  const woKey = woModuleKey(row);
  const products = Array.isArray(row.products) ? row.products : [];
  if (!wantedModule) {
    out.products = products.map(projectProduct);
    return out;
  }
  // Module lens — keep only products whose resolved module matches; a WO
  // left with no contributing products is dropped by the caller (it has no
  // queue rows to show).
  const kept = products.filter((p) => productModuleKey(p, woKey) === wantedModule);
  if (!kept.length) return null;
  out.products = kept.map(projectProduct);
  return out;
}

// Module-scope result cache — Deno isolates are reused across invocations,
// so a burst of identical full pulls (many staff tabs opening the same queue
// at once) collapses to one upstream read set instead of one table scan per
// tab. Delta pulls (since), module lenses, and limited pulls are never
// cached; the cached payload keeps its own generated_at/next_cursor so the
// caller's resume cursor still covers the gap.
let feedCache: { payload: any; expires: number } | null = null;
const FEED_CACHE_TTL_MS = 30_000;
// Set false permanently for the isolate if a projected filter is rejected —
// one fallback pulls the same page unprojected and later calls skip the extra
// argument entirely. Keeps older SDK builds working unchanged.
let projectionSupported = true;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));

    // Staff session required — WorkOrder read RLS is role-gated; fail closed
    // like boardFeed so a stale token gets a 401 the client can re-auth, not
    // silent service-role access to every work order on file.
    await authenticateSignShopSession(base44, body?.session_token);

    const since = cleanSince(body?.since);
    const limit = cleanLimit(body?.limit);
    const moduleKey = cleanModuleKey(body?.module_key);

    const query: Record<string, any> = {};
    if (since) query.updated_date = { $gte: since };
    // Oldest→newest: a limited pull returns the oldest-updated rows first so
    // next_cursor resumes exactly where it stopped — sort DESC would skip
    // unscanned middle rows on limited pulls.
    const sort = 'updated_date';

    const cacheable = !since && !limit && !moduleKey;
    if (cacheable && feedCache && feedCache.expires > Date.now()) {
      return Response.json(feedCache.payload);
    }

    const entity = base44.asServiceRole.entities.WorkOrder;
    const items: any[] = [];
    const seen = new Set<string>();
    let skip = 0;
    let rowsHit = 0;
    let truncated = false;
    let maxUpdated = '';
    while (true) {
      let page: any[] | null = null;
      if (projectionSupported) {
        try {
          page = await entity.filter(query, sort, PAGE_SIZE, skip, QUEUE_WO_FIELDS);
        } catch {
          projectionSupported = false;
        }
      }
      if (page === null) page = await entity.filter(query, sort, PAGE_SIZE, skip);
      if (!Array.isArray(page)) throw new Error('WorkOrder queue feed could not be verified completely.');
      rowsHit += page.length;
      for (const row of page) {
        const id = String(row?.id || '');
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        const updated = String(row?.updated_date || '');
        if (updated && (!maxUpdated || updated > maxUpdated)) maxUpdated = updated;
        const projected = projectWorkOrder(row, moduleKey);
        if (projected) items.push(projected);
      }
      // Clamp scans that run past MAX_ROWS and flag the partial feed so
      // callers never mistake it for a complete one.
      if (rowsHit >= MAX_ROWS) { truncated = true; break; }
      if (page.length < PAGE_SIZE) break;
      // Stop early only when the item cap is satisfied — keep scanning past
      // it otherwise (module lenses keep reading until the cap fills or the
      // table ends). Breaking here leaves the rest of the table unscanned,
      // so the feed is partial even when items.length lands exactly on the
      // cap — truncated flags it either way.
      if (limit && items.length >= limit) { truncated = true; break; }
      skip += PAGE_SIZE;
    }

    const cappedByLimit = limit > 0 && items.length >= limit;
    const pageItems = limit > 0 ? items.slice(0, limit) : items;
    // Max updated_date *scanned* normally — resuming from it never re-reads
    // rows already returned. When the response was cut by `limit`, the cursor
    // must not advance past rows the client never received, so it falls back
    // to the max over returned items (scanned ASC, so the rest resume next).
    let nextCursor = maxUpdated || since || null;
    if (cappedByLimit) {
      const maxReturned = pageItems.reduce((m, it) => {
        const u = String(it?.updated_date || '');
        return u > m ? u : m;
      }, '');
      nextCursor = maxReturned || since || null;
    }

    const payload = {
      items: pageItems,
      count: pageItems.length,
      truncated: truncated || cappedByLimit,
      next_cursor: nextCursor,
      projected_fields: { work_order: QUEUE_WO_FIELDS, product: QUEUE_PRODUCT_FIELDS },
      generated_at: new Date().toISOString(),
    };
    if (cacheable) feedCache = { payload, expires: Date.now() + FEED_CACHE_TTL_MS };
    return Response.json(payload);
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Queue feed failed.' }, { status });
    }
    console.error('queueFeed error:', error);
    return Response.json({ error: 'Data could not be loaded. Try again.' }, { status: 500 });
  }
});
