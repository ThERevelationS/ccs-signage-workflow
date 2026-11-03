import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import {
  CRM_EVENT_TYPES,
  CRM_ACTIVITY_FIELDS,
  CRM_CUSTOMER_FIELDS,
  ESTIMATE_QUEUE_FIELDS,
  GENERAL_TASK_FIELDS,
  MY_WORKFLOW_USER_FIELDS,
  QUOTE_DEFAULTS_FIELDS,
  SAVED_VIEW_FIELDS,
  projectCrmActivity,
  projectCrmCustomer,
  projectEstimate,
  projectGeneralTask,
  projectQuoteDefaults,
  projectSettingRecord,
  projectWorkflowUser,
  scopeSavedViewsForLens,
  scopeSavedViewsForPage,
  queueFeedCacheKey,
} from '../../shared/queueFeedModel.mjs';

// Queue feed — one composed, projected payload per queue page instead of N
// parallel entity reads from the browser (masterplan M-03). Every surface
// returns `items` (the page's row set, allowlist-projected) plus the scoped
// extras the page mounts with, so a queue mount is ONE function call on one
// caller budget rather than a boardFeed pull plus several gateway reads.
//
//   feed=product_queue (default)
//     items      — the WorkOrder projection the product queue pages need and
//                  nothing else (~70-80% smaller than the board projection,
//                  which still carries ~150 top-level fields and whole
//                  product sub-documents). QUEUE_WO_FIELDS covers every field
//                  flattenQueueRows, queueCountersModel.moduleKeyForRow, the
//                  ProductQueue row chrome AND the write paths mounted rows
//                  drive (deposit gate reads deposit_required/invoiced/
//                  amount; notify context reads estimator/total/balance_due).
//     saved_views — SavedQueueView rows scoped to {queue_lens, session
//                  owner} — the same set loadSavedQueueViews returns.
//     settings   — { product_stage_mode } GlobalSettings record.
//
//   feed=crm_events
//     items      — OpportunityActivity rows whose event_type is in the CRM
//                  taxonomy (server-side $in — audit rows never cross the
//                  wire), projected to the fields CrmEventsQueue reads.
//     customers  — the company datalist set, {id, company_name, name}.
//
//   feed=estimate_queue
//     items      — AllInOneEstimate rows projected to the queue's columns +
//                  trash-lifecycle CAS fields + the estimateMatchesSearch
//                  haystack (line_items[] survives projected to the search
//                  subfields — full line blobs never leave the server).
//     quote_defaults — the {config_name:"default"} QuoteDefaults row.
//     saved_views — page-axis views when page_key is passed.
//
//   feed=my_workflow
//     items      — GeneralTask rows where completed:false, projected to every
//                  declared field and sorted by created_date to match the
//                  gateway read the page ran. The work-order half of the page
//                  still comes from the shared boardFeed snapshot — folding it
//                  in would duplicate a whole-table pull for heavy fields the
//                  queue projections deliberately strip (notes, sip_checklist).
//     users      — the AuthorizedEmail assignee roster projected to the five
//                  fields the pickers read (tight allowlist — the entity's
//                  credential/session fields never leave the backend).
//     dropdown_conditions — GlobalSettings('dropdownConditions') record.
//     task_descriptions — GlobalSettings('salesTaskDescriptions') record.
//     Nothing in this feed is owner-scoped, so its isolate-cache key drops
//     the owner segment entirely — every staff session shares the entry.
//
// Common controls: `since` (updated_date delta cursor, server-side $gte),
// `limit` (caps items; capped responses keep next_cursor honest), `include`
// (subset of the feed's extras; default = all of them), `items:false`
// (extras-only call — no table scan), `queue_lens`/`page_key`/`module_key`
// lenses. next_cursor = max updated_date scanned; rows scan oldest→newest so
// a limited pull resumes gap-free and clients dedupe by id.
// Saved-view owner scoping uses the AUTHENTICATED session email, never the
// request's owner_email — per-user rows must never cross owners.
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
  // Write/notify paths mounted rows drive: deposit gate (depositGate.js) and
  // buildNotifyContext fallbacks. Without these a projected snapshot would
  // silently bypass the deposit warning and empty notify placeholders.
  'deposit_required', 'deposit_invoiced', 'deposit_amount',
  'estimator', 'total', 'balance_due',
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
const MAX_LENS = 80;
const MAX_OWNER = 200;
// SavedQueueView scopes are small by design; the gateway path capped them at
// the same bound (loadRows maxRows: 2000), so parity holds.
const MAX_SAVED_VIEWS = 2000;
const SETTINGS_KEY_STAGE_MODE = 'productStatusDrivesStage';
const SETTINGS_KEY_DROPDOWN_CONDITIONS = 'dropdownConditions';
const SETTINGS_KEY_TASK_DESCRIPTIONS = 'salesTaskDescriptions';

const FEED_NAMES = new Set(['product_queue', 'crm_events', 'estimate_queue', 'my_workflow']);
// Which extras each feed can compose. `include` narrows this set; when the
// caller does not pass include, all of the feed's extras are returned.
const FEED_EXTRAS = {
  product_queue: ['saved_views', 'settings'],
  crm_events: ['customers'],
  estimate_queue: ['quote_defaults', 'saved_views'],
  my_workflow: ['users', 'dropdown_conditions', 'task_descriptions'],
};

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

function cleanFeed(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'product_queue';
  if (!FEED_NAMES.has(raw)) throw bad('This feed cannot be read here.');
  return raw;
}

function cleanLens(value: unknown) {
  const raw = String(value || '').trim();
  if (raw.length > MAX_LENS) throw bad('Feed queue_lens is invalid.');
  return raw;
}

function cleanPageKey(value: unknown) {
  const raw = String(value || '').trim();
  if (raw.length > MAX_LENS) throw bad('Feed page_key is invalid.');
  return raw;
}

function cleanOwner(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.length > MAX_OWNER) throw bad('Feed owner_email is invalid.');
  return raw;
}

function cleanInclude(value: unknown, feed: string) {
  const allowed = new Set(FEED_EXTRAS[feed] || []);
  if (value == null || value === '') return [...allowed];
  const list = Array.isArray(value) ? value : String(value).split(',');
  const out = [...new Set(list.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
  for (const name of out) {
    if (!allowed.has(name)) throw bad(`Feed extra is not available here: ${name}`);
  }
  return out;
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
// so a burst of identical pulls (many staff tabs opening the same queue at
// once) collapses to one upstream read set instead of one table scan per
// tab. Keyed by feed+lens+pageKey+session-owner+include+module so per-user
// payloads (own saved views) never cross owners and per-lens extras never
// cross queues. Delta pulls (since) and limited pulls are never cached; the
// cached payload keeps its own generated_at/next_cursor so the caller's
// resume cursor still covers the gap.
const feedCache = new Map<string, { payload: any; expires: number; at: number }>();
const FEED_CACHE_TTL_MS = 30_000;
const FEED_CACHE_MAX_KEYS = 40;

function feedCacheGet(key: string) {
  const hit = feedCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    feedCache.delete(key);
    return null;
  }
  return hit.payload;
}

function feedCacheSet(key: string, payload: any) {
  if (feedCache.size >= FEED_CACHE_MAX_KEYS) {
    const now = Date.now();
    for (const [k, v] of feedCache) {
      if (v.expires <= now) feedCache.delete(k);
    }
    if (feedCache.size >= FEED_CACHE_MAX_KEYS) {
      // Evict the oldest entry — a full cache must never grow unbounded.
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of feedCache) {
        if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
      }
      if (oldestKey !== null) feedCache.delete(oldestKey);
    }
  }
  feedCache.set(key, { payload, expires: Date.now() + FEED_CACHE_TTL_MS, at: Date.now() });
}

// Set false permanently for the isolate if a projected filter is rejected —
// one fallback pulls the same page unprojected and later calls skip the extra
// argument entirely. Keeps older SDK builds working unchanged.
let projectionSupported = true;

// Generic projected row scanner: oldest→newest so next_cursor resumes
// gap-free; dedupes by id; clamped at MAX_ROWS with `truncated` flagged so a
// partial feed is never mistaken for a complete one. Returns
// {items, truncated, maxUpdated} with items already allowlist-projected.
async function scanProjectedRows(
  entity: any,
  query: Record<string, any>,
  projection: string[] | null,
  projectRow: (row: any) => any,
  { limit = 0, maxRows = MAX_ROWS } = {},
) {
  const items: any[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let rowsHit = 0;
  let truncated = false;
  let maxUpdated = '';
  while (true) {
    let page: any[] | null = null;
    if (projection && projectionSupported) {
      try {
        page = await entity.filter(query, 'updated_date', PAGE_SIZE, skip, projection);
      } catch {
        projectionSupported = false;
      }
    }
    if (page === null) page = await entity.filter(query, 'updated_date', PAGE_SIZE, skip);
    if (!Array.isArray(page)) throw new Error('Queue feed could not be verified completely.');
    rowsHit += page.length;
    for (const row of page) {
      const id = String(row?.id || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const updated = String(row?.updated_date || '');
      if (updated && (!maxUpdated || updated > maxUpdated)) maxUpdated = updated;
      const projected = projectRow(row);
      if (projected) items.push(projected);
    }
    if (rowsHit >= maxRows) { truncated = true; break; }
    if (page.length < PAGE_SIZE) break;
    // Stop early only when the item cap is satisfied — keep scanning past it
    // otherwise (module lenses keep reading until the cap fills or the table
    // ends). A response cut by `limit` is partial even when items.length
    // lands exactly on the cap — truncated flags it either way.
    if (limit && items.length >= limit) { truncated = true; break; }
    skip += PAGE_SIZE;
  }
  return { items, truncated, maxUpdated };
}

// Bounded scoped read for the small extras tables (SavedQueueView scopes):
// paged like the gateway path but capped at `cap` rows.
async function loadScopedRows(entity: any, query: Record<string, any>, sort: string, cap = MAX_SAVED_VIEWS) {
  const rows: any[] = [];
  let skip = 0;
  const pageSize = 1000;
  while (rows.length < cap) {
    const page = await entity.filter(query, sort, pageSize, skip);
    if (!Array.isArray(page)) throw new Error('Saved view rows could not be loaded.');
    rows.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return rows.slice(0, cap);
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));

    // Staff session required — every entity here is role-gated; fail closed
    // like boardFeed so a stale token gets a 401 the client can re-auth, not
    // silent service-role access. The session user also supplies the saved-
    // views owner scope — a caller can never read another user's views by
    // passing a different owner_email.
    const sessionUser = await authenticateSignShopSession(base44, body?.session_token);
    const sessionEmail = norm(sessionUser?.email);

    const feed = cleanFeed(body?.feed);
    const since = cleanSince(body?.since);
    const limit = cleanLimit(body?.limit);
    const moduleKey = cleanModuleKey(body?.module_key);
    const queueLens = cleanLens(body?.queue_lens);
    const pageKey = cleanPageKey(body?.page_key);
    cleanOwner(body?.owner_email); // validated for shape; scoping uses the session.
    const include = cleanInclude(body?.include, feed);
    // items:false — extras-only call (lens tab switch re-scopes saved views
    // without re-pulling the whole row table).
    const wantItems = body?.items !== false;

    const cacheable = !since && !limit;
    const cacheKey = queueFeedCacheKey({
      feed,
      lens: queueLens,
      pageKey,
      // my_workflow carries no owner-scoped slice — its items and extras are
      // the same rows for every session, so the key drops the owner segment
      // and one entry serves a whole-staff mount burst.
      owner: feed === 'my_workflow' ? '' : sessionEmail,
      include,
      moduleKey,
    }) + `|items:${wantItems ? 1 : 0}`;
    if (cacheable) {
      const hit = feedCacheGet(cacheKey);
      if (hit) return Response.json(hit);
    }

    const entities = base44.asServiceRole.entities;
    const payload: any = {
      feed,
      items: [],
      count: 0,
      truncated: false,
      next_cursor: since || null,
      generated_at: new Date().toISOString(),
    };
    // Per-extra failures are reported, never fatal — the client falls back to
    // its own gateway reads for exactly the missing slice (fail-open).
    const extrasErrors: Record<string, string> = {};

    // --- items: the page's row set -------------------------------------------
    if (wantItems) {
      const query: Record<string, any> = {};
      if (since) query.updated_date = { $gte: since };

      let projection: string[] | null = null;
      let projectRow: (row: any) => any = (r) => r;
      if (feed === 'product_queue') {
        projection = QUEUE_WO_FIELDS;
        projectRow = (row) => projectWorkOrder(row, moduleKey);
      } else if (feed === 'crm_events') {
        projection = CRM_ACTIVITY_FIELDS;
        // The queue only ever renders taxonomy rows — the server applies the
        // same filter so audit-trail records never cross the wire.
        query.event_type = { $in: [...CRM_EVENT_TYPES] };
        projectRow = (row) => projectCrmActivity(row);
      } else if (feed === 'estimate_queue') {
        projection = ESTIMATE_QUEUE_FIELDS;
        projectRow = (row) => projectEstimate(row);
      } else if (feed === 'my_workflow') {
        projection = GENERAL_TASK_FIELDS;
        // The gateway read the page ran was filter({completed:false},
        // 'created_date') — the server applies the same query so the open-task
        // set is identical (a since-delta can never observe a task flipping
        // completed, which is why the client asks for full pulls here).
        query.completed = false;
        projectRow = (row) => projectGeneralTask(row);
      }

      const entity =
        feed === 'crm_events' ? entities.OpportunityActivity
        : feed === 'estimate_queue' ? entities.AllInOneEstimate
        : feed === 'my_workflow' ? entities.GeneralTask
        : entities.WorkOrder;
      const scanned = await scanProjectedRows(
        entity, query, projection, projectRow, { limit },
      );

      const cappedByLimit = limit > 0 && scanned.items.length >= limit;
      const pageItems = limit > 0 ? scanned.items.slice(0, limit) : scanned.items;
      // Max updated_date *scanned* normally — resuming from it never re-reads
      // rows already returned. When the response was cut by `limit`, the
      // cursor must not advance past rows the client never received, so it
      // falls back to the max over returned items (scanned ASC, the rest
      // resume next).
      let nextCursor = scanned.maxUpdated || since || null;
      if (cappedByLimit) {
        const maxReturned = pageItems.reduce((m: string, it: any) => {
          const u = String(it?.updated_date || '');
          return u > m ? u : m;
        }, '');
        nextCursor = maxReturned || since || null;
      }
      if (feed === 'my_workflow') {
        // Row-order parity with the gateway read this replaces
        // (filter({completed:false}, 'created_date')): scan order is
        // updated_date-ascending for cursor math, so the open-task set is
        // re-sorted on the immutable created_date before it leaves.
        pageItems.sort((a: any, b: any) =>
          String(a?.created_date || '').localeCompare(String(b?.created_date || '')));
      }
      payload.items = pageItems;
      payload.count = pageItems.length;
      payload.truncated = scanned.truncated || cappedByLimit;
      payload.next_cursor = nextCursor;
    }

    // --- extras: the page's mount-time scoped reads ---------------------------
    if (include.includes('saved_views')) {
      try {
        const rows = queueLens
          ? await loadScopedRows(entities.SavedQueueView, { queue_lens: queueLens }, 'created_date')
          : await loadScopedRows(entities.SavedQueueView, {}, 'created_date');
        payload.saved_views = pageKey
          ? scopeSavedViewsForPage(rows, { pageKey, ownerEmail: sessionEmail })
          : scopeSavedViewsForLens(rows, { lens: queueLens || 'all', ownerEmail: sessionEmail });
      } catch (e: any) {
        extrasErrors.saved_views = e?.message || 'Saved views could not be loaded.';
        payload.saved_views = null;
      }
    }
    if (include.includes('settings')) {
      try {
        const rows = await entities.GlobalSettings.filter({ setting_key: SETTINGS_KEY_STAGE_MODE });
        if (!Array.isArray(rows)) throw new Error('Setting lookup did not return a record list.');
        if (rows.length > 1) throw new Error('Setting has multiple records for its key.');
        payload.settings = {
          product_stage_mode: rows[0] ? projectSettingRecord(rows[0]) : null,
        };
      } catch (e: any) {
        extrasErrors.settings = e?.message || 'Queue settings could not be loaded.';
        payload.settings = null;
      }
    }
    if (include.includes('customers')) {
      try {
        const rows = await scanProjectedRows(
          entities.Customer, {}, CRM_CUSTOMER_FIELDS, projectCrmCustomer, { maxRows: MAX_ROWS },
        );
        payload.customers = rows.items;
        if (rows.truncated) extrasErrors.customers = 'Customer list reached the row cap.';
      } catch (e: any) {
        extrasErrors.customers = e?.message || 'Customers could not be loaded.';
        payload.customers = null;
      }
    }
    if (include.includes('quote_defaults')) {
      try {
        const rows = await entities.QuoteDefaults.filter({ config_name: 'default' }, undefined, 1);
        const row = Array.isArray(rows) ? rows[0] : null;
        payload.quote_defaults = row ? projectQuoteDefaults(row) : null;
      } catch (e: any) {
        extrasErrors.quote_defaults = e?.message || 'Quote defaults could not be loaded.';
        payload.quote_defaults = null;
      }
    }
    if (include.includes('users')) {
      try {
        // The page's unfiltered AuthorizedEmail pull — the assignee pickers
        // need the whole roster, projected down to the five fields they read.
        const rows = await scanProjectedRows(
          entities.AuthorizedEmail, {}, MY_WORKFLOW_USER_FIELDS, projectWorkflowUser, { maxRows: MAX_ROWS },
        );
        payload.users = rows.items;
        if (rows.truncated) extrasErrors.users = 'User directory reached the row cap.';
      } catch (e: any) {
        extrasErrors.users = e?.message || 'The user directory could not be loaded.';
        payload.users = null;
      }
    }
    if (include.includes('dropdown_conditions')) {
      try {
        const rows = await entities.GlobalSettings.filter({ setting_key: SETTINGS_KEY_DROPDOWN_CONDITIONS });
        if (!Array.isArray(rows)) throw new Error('Setting lookup did not return a record list.');
        if (rows.length > 1) throw new Error('Setting has multiple records for its key.');
        payload.dropdown_conditions = rows[0] ? projectSettingRecord(rows[0]) : null;
      } catch (e: any) {
        extrasErrors.dropdown_conditions = e?.message || 'Dropdown conditions could not be loaded.';
        payload.dropdown_conditions = null;
      }
    }
    if (include.includes('task_descriptions')) {
      try {
        const rows = await entities.GlobalSettings.filter({ setting_key: SETTINGS_KEY_TASK_DESCRIPTIONS });
        if (!Array.isArray(rows)) throw new Error('Setting lookup did not return a record list.');
        if (rows.length > 1) throw new Error('Setting has multiple records for its key.');
        payload.task_descriptions = rows[0] ? projectSettingRecord(rows[0]) : null;
      } catch (e: any) {
        extrasErrors.task_descriptions = e?.message || 'Task descriptions could not be loaded.';
        payload.task_descriptions = null;
      }
    }

    payload.projected_fields = {
      items:
        feed === 'crm_events' ? CRM_ACTIVITY_FIELDS
        : feed === 'estimate_queue' ? ESTIMATE_QUEUE_FIELDS
        : feed === 'my_workflow' ? GENERAL_TASK_FIELDS
        : QUEUE_WO_FIELDS,
      product: feed === 'product_queue' ? QUEUE_PRODUCT_FIELDS : undefined,
      saved_view: include.includes('saved_views') ? SAVED_VIEW_FIELDS : undefined,
      customer: include.includes('customers') ? CRM_CUSTOMER_FIELDS : undefined,
      quote_defaults: include.includes('quote_defaults') ? QUOTE_DEFAULTS_FIELDS : undefined,
      user: include.includes('users') ? MY_WORKFLOW_USER_FIELDS : undefined,
    };
    if (Object.keys(extrasErrors).length) payload.extras_errors = extrasErrors;
    if (cacheable) feedCacheSet(cacheKey, payload);
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