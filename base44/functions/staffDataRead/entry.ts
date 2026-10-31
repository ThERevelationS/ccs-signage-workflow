import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Session-authenticated read gateway for non-Fleet role-gated entities.
// Staff sessions are EmailGate sessions — not Base44 app users — so direct
// entity reads can never satisfy entity RLS. Every staff-facing read of these
// entities flows through here instead: a valid sss_session_token is required
// and the per-entity tier plus field projection preserve the intended access.
const STAFF_READABLE = new Set([
  'ActivityLog',
  'AuthorizedEmail',
  'EstimateClipboardItem',
  'ImportJob',
  'LaborLevel',
  'LegacyMigrationMap',
  'MachineRate',
  'PartTemplate',
  'PermittingOfficeAuthorityReview',
  'PermittingRule',
  'PermittingSourceDocument',
  'PermittingSourceTextSegment',
  'PermittingWorkflowDraft',
  'QuickProduct',
  'SourceCollectionQueue',
  'SourceMonitorState',
  'TimeClockAudit',
  'TimeClockBreak',
  'TimeClockCorrectionRequest',
  'TimeClockLaborSegment',
  'TimeClockPayPeriod',
  'TimeClockWorkPause',
  'TimeEntry',
  'TimeOffRequest',
  'UserPTOBalance',

  // Staff-tier entities migrated off anonymous entity access (RLS is now
  // backend-only). Staff keep the same read breadth they had before — the
  // difference is a valid session is now required and writes stay on
  // dedicated action functions.
  'AllInOneEstimate',
  'BrickStoneInventory',
  'BrickStoneProject',
  'BuilderPart',
  'BuilderPartGroup',
  'BuilderProduct',
  'CNCProject',
  'CellHistory',
  'ChannelLetterInstallEquipment',
  'ChannelLetterInstallInventory',
  'ChannelLetterInstallation',
  'ChecklistSubItem',
  'Customer',
  'CustomerLocation',
  'CustomerNote',
  'DimensionalLetterMaterial',
  'EstimateOption',
  'FoundationInventory',
  'FoundationProject',
  'GeneralTask',
  'GlobalSettings',
  'Inventory',
  'JurisdictionProfile',
  'LaborServiceInventory',
  'CustomItemsProject',
  'LaserProject',
  'MaintenanceActionRate',
  'MaintenanceInventory',
  'MaintenanceProject',
  'MarkupCategory',
  'MarkupTier',
  'MetalProject',
  'OpportunityActivity',
  'Order',
  'PermitLineItem',
  'PermitLocality',
  'PortalMessage',
  'PricingTierMatrix',
  'Project',
  'QuoteDefaults',
  'RegulationAlert',
  'SalesLocation',
  'SavedQueueView',
  'Settings',
  'SignHardwareInventory',
  'SignLightingInventory',
  'SignPartsSuppliesInventory',
  'SipChecklistTemplate',
  'TaskTemplate',
  'TaxGroup',
  'VinylInventory',
  'VinylMachine',
  'VinylPartTemplate',
  'VinylProject',
  'VinylWorkflowTemplate',
  'WorkOrder',

  // Screens that previously read these straight from the browser (which entity
  // RLS blocks for staff sessions): announcements, sales filters, calendar,
  // estimator revisions/acceptances, price revisions, templates and capacity.
  'BuilderPriceRevision',
  'CalendarEvent',
  'EstimateAcceptance',
  'EstimateQuoteDelivery',
  'EstimateRevision',
  'EstimateSectionAcceptance',
  'InventoryMovement',
  'PTOPolicy',
  'ProjectTemplate',
  'QuickProductCategory',
  'SalesFilter',
  'UserCapacity',
]);

// Admin-settings data: readable by admins only. AuthorizedEmail is
// staff-readable because dozens of staff views resolve user identities from
// it; its secret fields are stripped by FIELD_DENYLIST below before any row
// leaves the backend.
const ADMIN_READABLE = new Set<string>([
  'AccountDeletionRequest',
  'AdminAuditLog',
  // Full rows carry target_users / acknowledged_viewers; staff viewers get the
  // targeted, projected feed from manageAnnouncements active_feed instead.
  'Announcement',
  'AutomationRule',
  'CorebridgeLog',
  'EmailGroup',
  'EmailNotificationSettings',
  'FailedAdminAttempt',
  'FeatureReport',
  'SyncConflict',
  'TimeClockPunchException',
  'UserSession',
]);

// Fields that must never leave the backend regardless of role. These hold
// credentials, bearer ******, biometric descriptors, and session-revocation
// state; no staff-facing page has a legitimate read for them.
const FIELD_DENYLIST: Record<string, string[]> = {
  AuthorizedEmail: [
    'password_hash',
    'password_reset_token',
    'password_reset_token_hash',
    'password_reset_expires',
    'onboarding_token',
    'onboarding_token_hash',
    'onboarding_expires',
    'session_not_before',
    'failed_login_count',
    'login_locked_until',
    'face_descriptors',
  ],
};

const MAX_LIMIT = 500;
const MAX_SKIP = 100000;
const MAX_QUERY_BYTES = 4000;

// Payroll/HR rows are visible to their owner or an admin — not to every
// coworker. Entities listed here are filtered to user_email = caller
// whenever the caller is not an admin.
const OWNER_SCOPED = new Set([
  'TimeEntry',
  'TimeClockAudit',
  'TimeClockBreak',
  'TimeClockCorrectionRequest',
  'TimeClockLaborSegment',
  'TimeClockPayPeriod',
  'TimeClockWorkPause',
  'TimeOffRequest',
  'UserPTOBalance',
]);
const SORT_PATTERN = /^(-?[A-Za-z_][\w.]*)(\s*,\s*-?[A-Za-z_][\w.]*){0,3}$/;

function projectItem(entityName: string, item: any, user?: any) {
  const denied = [...(FIELD_DENYLIST[entityName] || []),
    ...((user?.admin_permissions?.denied_fields?.[entityName]) || [])];
  if (!denied || !item || typeof item !== 'object') return item;
  const clean = { ...item };
  for (const field of denied) delete clean[field];
  return clean;
}

function cleanSort(value: unknown, entityName: string) {
  const sort = String(value || '').trim();
  if (!sort) return '';
  if (sort.length > 200 || !SORT_PATTERN.test(sort)) {
    throw Object.assign(new Error('Staff read sort is invalid.'), { status: 400 });
  }
  // Denylisted fields must not be usable as a sort oracle either.
  const denied = new Set(FIELD_DENYLIST[entityName] || []);
  for (const part of sort.split(',')) {
    const field = part.trim().replace(/^-/, '');
    if (denied.has(field)) {
      throw Object.assign(new Error('Staff read sort field is not permitted.'), { status: 400 });
    }
  }
  return sort;
}

// The only filter operators a staff read may use. Comparison/set operators are
// safe on ordinary fields; logical operators ($or/$and/$nor) stay refused so a
// filter can never assemble a query the gateway did not scope itself.
const ALLOWED_OPERATORS = new Set([
  '$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte', '$exists', '$regex', '$options',
]);
const MAX_IN_VALUES = 200;
const MAX_REGEX_LENGTH = 200;

function checkOperatorValue(operator: string, value: unknown) {
  if (operator === '$in' || operator === '$nin') {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IN_VALUES) {
      throw Object.assign(new Error(`Staff read ${operator} needs 1 to ${MAX_IN_VALUES} values.`), { status: 400 });
    }
    for (const entry of value) {
      if (entry && typeof entry === 'object') {
        throw Object.assign(new Error('Staff read filter operators are not allowed.'), { status: 400 });
      }
    }
    return;
  }
  if (operator === '$exists') {
    if (typeof value !== 'boolean') {
      throw Object.assign(new Error('Staff read $exists needs true or false.'), { status: 400 });
    }
    return;
  }
  if (operator === '$regex' || operator === '$options') {
    if (typeof value !== 'string' || value.length > MAX_REGEX_LENGTH) {
      throw Object.assign(new Error('Staff read search pattern is not allowed.'), { status: 400 });
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    throw Object.assign(new Error('Staff read filter operators are not allowed.'), { status: 400 });
  }
}

function cleanQuery(value: unknown, entityName: string) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Staff read filter must be an object.'), { status: 400 });
  }
  // Operators are allowed only directly on a top-level field, never on a
  // denylisted field (that would turn output-denied data into a boolean
  // oracle) and never nested deeper than one level.
  const deniedFields = new Set(FIELD_DENYLIST[entityName] || []);
  const stack: any[] = [{ node: value, field: '', depth: 0 }];
  while (stack.length) {
    const { node, field, depth } = stack.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$')) {
        if (depth !== 1 || !field) {
          throw Object.assign(new Error('Staff read filter operators are not allowed.'), { status: 400 });
        }
        if (!ALLOWED_OPERATORS.has(key)) {
          throw Object.assign(new Error('Staff read filter operators are not allowed.'), { status: 400 });
        }
        if (deniedFields.has(field)) {
          throw Object.assign(new Error('Staff read filter operators are not allowed.'), { status: 400 });
        }
        checkOperatorValue(key, val);
        continue;
      }
      if (val && typeof val === 'object') {
        // Exactly one level below a top-level field may hold operators.
        stack.push({ node: val, field: key, depth: depth + 1 });
      }
    }
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw Object.assign(new Error('Staff read filter must be JSON-serializable.'), { status: 400 });
  }
  if (serialized.length > MAX_QUERY_BYTES) {
    throw Object.assign(new Error('Staff read filter is too large.'), { status: 400 });
  }
  return value;
}

function cleanLimit(value: unknown, fallback: number) {
  if (value == null || value === '') return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw Object.assign(new Error(`Staff read limit must be between 1 and ${MAX_LIMIT}.`), { status: 400 });
  }
  // A caller asking for more than one page gets the page maximum rather than a
  // failed read; callers that need every row page with skip.
  return Math.min(parsed, MAX_LIMIT);
}

function cleanSkip(value: unknown) {
  if (value == null || value === '') return 0;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SKIP) {
    throw Object.assign(new Error(`Staff read offset must be between 0 and ${MAX_SKIP}.`), { status: 400 });
  }
  return parsed;
}

const MAX_CURSOR_BYTES = 4000;
const MAX_FIELD_LIST = 200;
const FIELD_NAME_PATTERN = /^[A-Za-z_][\w.]*$/;
const COUNT_PAGE = 500;
const COUNT_MAX_ROWS = 100000;

// Continuation cursor for options-object reads — opaque to the gateway, only
// size-checked so a request can't smuggle an oversized token.
function cleanCursor(value: unknown) {
  const cursor = String(value || '').trim();
  if (!cursor) return '';
  if (cursor.length > MAX_CURSOR_BYTES) {
    throw Object.assign(new Error('Staff read cursor is invalid.'), { status: 400 });
  }
  return cursor;
}

// Optional field projection — dotted paths allowed so callers pull only the
// fields a view needs. Denylisted fields still get stripped by projectItem on
// the way out, so requesting one can never leak it.
function cleanFields(value: unknown) {
  if (value == null || value === '') return null;
  if (!Array.isArray(value) || value.length > MAX_FIELD_LIST) {
    throw Object.assign(new Error('Staff read fields list is invalid.'), { status: 400 });
  }
  const out = [...new Set(value.map((f) => String(f || '').trim()).filter((f) => FIELD_NAME_PATTERN.test(f)))];
  return out.length ? out : null;
}

// Count the full matching set, not one bounded page — the old path counted
// only the limit/skip window and under-reported anything larger. Prefers the
// entity count() API; falls back to a paged tally (capped + honestly flagged)
// when a backend does not expose it.
async function countRows(entity: any, query: any) {
  const countQuery = query && typeof query === 'object' ? query : {};
  if (typeof entity?.count === 'function') {
    try {
      const total = Number(await entity.count(countQuery));
      if (Number.isFinite(total) && total >= 0) return { count: total, truncated: false };
    } catch { /* fall back to the paged tally below */ }
  }
  let scanned = 0;
  while (scanned < COUNT_MAX_ROWS) {
    const page = await entity.filter(countQuery, null, COUNT_PAGE, scanned);
    if (!Array.isArray(page)) break;
    scanned += page.length;
    if (page.length < COUNT_PAGE) return { count: scanned, truncated: false };
  }
  return { count: scanned, truncated: true };
}

// Module-scope per-entry cache — identical reads within the TTL (mount storms:
// parallel component reads and subscribe checks) collapse to a single upstream
// entity read while an isolate stays warm. Writes go through staffEntityWrite,
// so a stale read for up to 45s is an accepted trade for the shared rate
// budget. Only 200 results are cached: an error must never be served twice.
const staffReadCache = new Map();
const staffReadInFlight = new Map();
const STAFF_READ_CACHE_MS = 45_000;

const isRateLimited = (error: any) => Number(error?.status) === 429
  || /rate limit|too many requests|traffic volume/i.test(String(error?.message || error));

function rateLimitRetryAfterMs(error: any) {
  const match = /retry after (\d+)\s*s/i.exec(String(error?.message || error));
  const ms = match ? Number(match[1]) * 1000 : 3000;
  return Math.min(Math.max(ms, 3000), 60000);
}

const MAX_BATCH = 16;
const BATCH_CONCURRENCY = 4;

// The cache key is the request itself plus the scoping the read actually
// applies: role tier, the caller's email for OWNER_SCOPED entities (rows are
// filtered to the owner), and the per-admin denied_fields projection scope.
// Entries share across users and across different batch combinations.
function staffReadEntryKey(request: any, user: any, deniedFieldScope: string) {
  const entity = String(request?.entity || '').trim();
  const ownerScope = user.role !== 'admin' && OWNER_SCOPED.has(entity)
    ? String(user.email || '').trim().toLowerCase() : '';
  return JSON.stringify({
    entity,
    id: request?.id,
    query: request?.query,
    sort: request?.sort,
    limit: request?.limit,
    skip: request?.skip,
    cursor: request?.cursor,
    fields: request?.fields,
    count: request?.count,
  }) + '|' + (user.role === 'admin' ? 'admin' : 'staff') + '|' + ownerScope + '|' + deniedFieldScope;
}

// Cache + in-flight dedupe around readOne. Concurrent identical reads in the
// isolate share one upstream call; only 200 results are retained.
async function readOneCached(base44: any, user: any, request: any, deniedFieldScope: string) {
  const key = staffReadEntryKey(request, user, deniedFieldScope);
  const hit = staffReadCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  const pending = staffReadInFlight.get(key);
  if (pending) return pending;
  const promise = readOne(base44, user, request)
    .then((result: any) => {
      if (result.status === 200) {
        if (staffReadCache.size > 300) staffReadCache.clear();
        staffReadCache.set(key, { result, expires: Date.now() + STAFF_READ_CACHE_MS });
      }
      return result;
    })
    .finally(() => { staffReadInFlight.delete(key); });
  staffReadInFlight.set(key, promise);
  return promise;
}

// One read for an already-authenticated staff user. Returns {status, body} so
// a batch can report each read independently; the single-read path wraps it as
// a normal Response. Authorization, owner scoping and field projection are
// identical for both paths.
async function readOne(base44: any, user: any, body: any) {
  try {
    const entityName = String(body?.entity || '').trim();
    if (!STAFF_READABLE.has(entityName) && !ADMIN_READABLE.has(entityName)) {
      return { status: 403, body: { error: 'This record type cannot be read here.' } };
    }
    if (ADMIN_READABLE.has(entityName) && user.role !== 'admin') {
      return { status: 403, body: { error: 'This record type requires a CCS admin.' } };
    }

    const entity = base44.asServiceRole.entities[entityName];
    const ownerEmail = user.role === 'admin' ? '' : String(user.email).trim().toLowerCase();
    const id = String(body?.id || '').trim();
    if (id) {
      const item = await entity.get(id).catch((e: any) => (Number(e?.status) === 404 ? null : Promise.reject(e)));
      if (!item) return { status: 404, body: { error: 'Record not found.' } };
      if (OWNER_SCOPED.has(entityName) && ownerEmail && String(item?.user_email || '').trim().toLowerCase() !== ownerEmail) {
        return { status: 404, body: { error: 'Record not found.' } };
      }
      return { status: 200, body: { success: true, item: projectItem(entityName, item, user) } };
    }

    const query = cleanQuery(body?.query, entityName);
    const sort = cleanSort(body?.sort, entityName);
    const limit = cleanLimit(body?.limit, 100);
    const skip = cleanSkip(body?.skip);
    const cursor = cleanCursor(body?.cursor);
    const fields = cleanFields(body?.fields);
    let effectiveQuery = query;
    if (OWNER_SCOPED.has(entityName) && ownerEmail) {
      effectiveQuery = { ...(effectiveQuery || {}), user_email: ownerEmail };
    }
    if (body?.count === true) {
      const counted = await countRows(entity, effectiveQuery);
      return { status: 200, body: { success: true, count: counted.count, truncated: counted.truncated } };
    }
    let rows: any[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;
    if (cursor || fields) {
      // Options-object read — cursor pagination and/or field projections go
      // through the paged entity API ({sort, limit, skip, cursor, fields}).
      // A cursor continues a previous page, so it replaces skip entirely.
      const options: any = { sort: sort || undefined, limit };
      if (!cursor && skip) options.skip = skip;
      if (cursor) options.cursor = cursor;
      if (fields) options.fields = fields;
      const page = effectiveQuery
        ? await entity.filter(effectiveQuery, options)
        : await entity.list(options);
      const pageRows = Array.isArray(page) ? page : page?.items;
      rows = Array.isArray(pageRows) ? pageRows : [];
      nextCursor = !Array.isArray(page) && typeof page?.next_cursor === 'string' && page.next_cursor
        ? page.next_cursor : null;
      hasMore = !Array.isArray(page) && (page?.has_more === true || Boolean(nextCursor));
    } else {
      const items = effectiveQuery
        ? await entity.filter(effectiveQuery, sort || null, limit, skip)
        : await entity.list(sort || null, limit, skip);
      rows = Array.isArray(items) ? items : [];
    }
    const scopedRows = OWNER_SCOPED.has(entityName) && ownerEmail
      ? rows.filter((row) => String(row?.user_email || '').trim().toLowerCase() === ownerEmail)
      : rows;
    // `truncated` means "there may be more rows past this window" — a full
    // page or a live continuation cursor both raise it so callers can page on
    // instead of mistaking a clamped read for the whole set.
    const payload: any = {
      success: true,
      items: scopedRows.map((row) => projectItem(entityName, row, user)),
      returned: scopedRows.length,
      truncated: hasMore || Boolean(nextCursor) || rows.length >= limit,
    };
    if (nextCursor) payload.next_cursor = nextCursor;
    return { status: 200, body: payload };
  } catch (error: any) {
    // A platform rate limit is transient whatever status it arrives with:
    // hand it back as 429 so the browser backs off and retries instead of
    // surfacing a hard failure.
    if (isRateLimited(error)) {
      return { status: 429, body: { error: 'Data could not be loaded. Try again.', retry_after_ms: rateLimitRetryAfterMs(error) } };
    }
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 404, 429].includes(status)) {
      return { status, body: { error: error?.message || 'Staff read failed.' } };
    }
    console.error('staffDataRead error:', error);
    return { status: 500, body: { error: 'Data could not be loaded. Try again.' } };
  }
}

function toResponse(result: { status: number, body: any }) {
  const retryMs = Number(result.body?.retry_after_ms) || 3000;
  const headers: Record<string, string> = result.status === 429
    ? { 'Retry-After': String(Math.max(1, Math.ceil(retryMs / 1000))) } : {};
  return Response.json(result.body, { status: result.status, headers });
}

Deno.serve(async (req) => {
  try {
    // One quick server-side retry at most: longer backoff belongs to the
    // browser, which honors Retry-After and coordinates every open request.
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await resolveFleetStaffUser(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    // Per-admin denied_fields change the field projection, so they scope the
    // per-entry cache alongside the role tier and owner-scoped email.
    const deniedFieldScope = user?.admin_permissions?.denied_fields
      ? JSON.stringify(user.admin_permissions.denied_fields) : '';

    // Batch: many reads behind a single session verification. The "entities"
    // shape returns rows keyed by entity name with per-entity errors beside
    // them — plus a `denied` list of entities this caller may not read, each
    // resolved as an empty read; the "requests" shape returns positional
    // {status, body} results. One failing entry never hides the others — a
    // single bad entity can no longer turn one batch call into a fan-out of
    // individual reads.
    if (Array.isArray(body?.entities) || Array.isArray(body?.requests)) {
      const entityMode = Array.isArray(body.entities);
      const requests = entityMode ? body.entities : body.requests;
      if (requests.length === 0 || requests.length > MAX_BATCH) {
        return Response.json({ error: `Staff read batch needs 1 to ${MAX_BATCH} reads.` }, { status: 400 });
      }
      const entities: Record<string, any> = {};
      const errors: Record<string, any> = {};
      const denied: string[] = [];
      const results: any[] = new Array(requests.length);
      // Once a slice surfaces a rate limit the remaining reads are not issued
      // at all — they resolve as the same 429 so the caller backs off as one.
      let rateLimited = false;
      let rateLimitError = 'Data could not be loaded. Try again.';
      let batchRetryAfterMs = 0;
      for (let start = 0; start < requests.length; start += BATCH_CONCURRENCY) {
        const slice = requests.slice(start, start + BATCH_CONCURRENCY);
        const settled = rateLimited
          ? slice.map(() => ({ status: 429, body: { error: rateLimitError, retry_after_ms: batchRetryAfterMs || 3000 } }))
          : await Promise.all(slice.map((request: any) => readOneCached(base44, user, request, deniedFieldScope)));
        settled.forEach((result, offset) => {
          results[start + offset] = result;
          const name = String(requests[start + offset]?.entity || '').trim();
          if (result.status === 200) {
            entities[name] = result.body?.items ?? result.body?.item ?? result.body?.count;
          } else if (result.status === 403 && name) {
            // A denied entity is an expected authorization outcome, not a batch
            // failure: it resolves as an empty read and is reported in `denied`
            // so the browser stops re-requesting it for this session.
            entities[name] = [];
            if (!denied.includes(name)) denied.push(name);
          } else if (name) {
            errors[name] = {
              status: result.status,
              error: result.body?.error || 'Staff read failed.',
              ...(result.status === 429 ? { retry_after_ms: Number(result.body?.retry_after_ms) || 3000 } : {}),
            };
          }
          if (result.status === 429) {
            batchRetryAfterMs = Math.max(batchRetryAfterMs, Number(result.body?.retry_after_ms) || 3000);
          }
        });
        if (!rateLimited) {
          const limited = settled.find((result) => result.status === 429);
          if (limited) {
            rateLimited = true;
            rateLimitError = limited.body?.error || rateLimitError;
          }
        }
      }
      const batchPayload = entityMode
        ? {
            success: true,
            entities,
            ...(denied.length ? { denied } : {}),
            ...(Object.keys(errors).length ? { errors } : {}),
            ...(batchRetryAfterMs ? { retry_after_ms: batchRetryAfterMs } : {}),
          }
        : { success: true, results, ...(batchRetryAfterMs ? { retry_after_ms: batchRetryAfterMs } : {}) };
      return Response.json(batchPayload);
    }

    const result = await readOneCached(base44, user, body, deniedFieldScope);
    return toResponse(result);
  } catch (error: any) {
    if (isRateLimited(error)) {
      const retryAfterMs = rateLimitRetryAfterMs(error);
      return Response.json(
        { error: 'Data could not be loaded. Try again.', retry_after_ms: retryAfterMs },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } },
      );
    }
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Staff read failed.' }, { status });
    }
    console.error('staffDataRead error:', error);
    return Response.json({ error: 'Data could not be loaded. Try again.' }, { status: 500 });
  }
});