import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createRequestGovernor, isPlatformRateLimit, retryAfterMs } from './requestGovernor.mjs';
import { noteRateLimit, noteRateLimitSuccess } from './rateLimitCooldown.js';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
const rawClient = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Read-only backend functions share their own concurrency pool so a page
// burst queues in the browser instead of tripping the platform allowance.
const governor = createRequestGovernor({ pools: { read: 6 } });

// Read-only action allowlists per multi-action function. These actions are
// verified server-side reads (filter/get + return, never a mutation), so a
// platform 429 — which by definition never ran the function — can be retried
// safely and the call may ride the read pool/dedupe instead of the write lane.
const TIMECLOCK_READ_ACTIONS = new Set([
  'status', 'status_lite', 'time_tracker_snapshot', 'time_tracker_prefs_get',
  'my_history', 'list_correction_requests', 'list_time_off_requests',
  'list_pending_requests', 'list_shift_templates', 'list_devices',
  'list_face_enrollment', 'list_timeclock_audit', 'admin_load_data',
  'admin_load_all', 'admin_period_compare', 'who_is_in',
]);
const NOTIFICATION_READ_ACTIONS = new Set([
  'list_mine', 'unread_count', 'get_preferences', 'history',
]);
const SMARTSHEET_READ_ACTIONS = new Set(['conflict_count']);
const WORKSPACE_PREFS_READ_ACTIONS = new Set(['prefs_get']);
const ANNOUNCEMENT_READ_ACTIONS = new Set(['active_feed']);
// Pure reads on gateways that default to the write lane — without these the
// /sop and training bootstraps rode the unthrottled lane and 429'd raw.
const SOP_READ_ACTIONS = new Set(['bootstrap', 'list', 'get', 'ack_report']);
const TRAINING_READ_ACTIONS = new Set(['bootstrap', 'report']);

// Short-TTL response cache for advisory reads: identical invokes inside the
// TTL share one response instead of one in-flight call, which collapses the
// sequential duplicates in a mount wave (dedupe only covers simultaneous
// calls). Writes advance the governor epoch and epoch is folded into the key,
// so any post-write read still refetches. Only advisory feeds/prefs/notifiers
// belong here — stock levels and edit surfaces must stay live.
const READ_TTL_ACTIONS = new Map([
  ['workspacePrefsAction:prefs_get', 30000],
  ['opportunityWorkspaceAction:attention_feed', 20000],
  ['opportunityWorkspaceAction:check_watches', 20000],
  ['opportunityWorkspaceAction:list_watches', 20000],
  ['opportunityWorkspaceAction:search_customers', 15000],
  ['notificationAction:list_mine', 15000],
  ['notificationAction:unread_count', 15000],
  ['notificationAction:get_preferences', 15000],
  ['manageAnnouncements:active_feed', 20000],
  ['smartsheetSyncAction:conflict_count', 20000],
  ['manageTraining:bootstrap', 15000],
  ['manageSops:bootstrap', 15000],
]);
const READ_RESPONSE_CACHE_MAX = 200;
const readResponseCache = new Map();
const readTtlMs = (fnName, payload) => READ_TTL_ACTIONS.get(`${fnName}:${payload?.action}`) || 0;
const readCacheSet = (key, value) => {
  if (readResponseCache.size >= READ_RESPONSE_CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of readResponseCache) { if (now - v.at > 60000) readResponseCache.delete(k); }
    while (readResponseCache.size >= READ_RESPONSE_CACHE_MAX) readResponseCache.delete(readResponseCache.keys().next().value);
  }
  readResponseCache.set(key, { at: Date.now(), value });
};
// Verified write-free actions in opportunityWorkspaceAction — attention_feed
// and check_watches used to ride the write lane, so the AttentionBell +
// AttentionFeed double-mount paid two uncapped invokes per page.
const OPPORTUNITY_READ_ACTIONS = new Set([
  'attention_feed', 'check_watches', 'customer_workspace', 'get_customer_360',
  'get_opportunity', 'global_search', 'list_estimating_requests',
  'list_follow_ups', 'list_opportunities', 'list_watches', 'search_customers',
  'status_timeline',
]);
const INVENTORY_READ_ACTIONS = new Set(['list_stock', 'list_movements']);
const SALESFILTER_READ_ACTIONS = new Set(['preferences_get', 'default_sort_get', 'roster']);

function isReadFunctionInvocation(fnName, payload) {
  if (['staffDataRead', 'fleetDataRead', 'boardFeed', 'queueFeed', 'appBootstrap', 'verifySession', 'permittingScanStatus'].includes(fnName)) return true;
  if (fnName === 'timeClockAction') return TIMECLOCK_READ_ACTIONS.has(payload?.action);
  if (fnName === 'notificationAction') return NOTIFICATION_READ_ACTIONS.has(payload?.action);
  if (fnName === 'smartsheetSyncAction') return SMARTSHEET_READ_ACTIONS.has(payload?.action);
  if (fnName === 'workspacePrefsAction') return WORKSPACE_PREFS_READ_ACTIONS.has(payload?.action);
  if (fnName === 'manageAnnouncements') return ANNOUNCEMENT_READ_ACTIONS.has(payload?.action);
  if (fnName === 'opportunityWorkspaceAction') return OPPORTUNITY_READ_ACTIONS.has(payload?.action);
  if (fnName === 'inventoryAction') return INVENTORY_READ_ACTIONS.has(payload?.action);
  if (fnName === 'manageSalesFilters') return SALESFILTER_READ_ACTIONS.has(payload?.action);
  if (fnName === 'manageSops') return SOP_READ_ACTIONS.has(payload?.action);
  if (fnName === 'manageTraining') return TRAINING_READ_ACTIONS.has(payload?.action);
  return false;
}

// Only read-only functions may retry on rate limit. Backend functions return
// their own 429s after doing real work (login lockouts, sync budget), so
// retrying anything else could duplicate a mutation.
export function isRetryableFunction(fnName, payload) {
  if (isReadFunctionInvocation(fnName, payload)) return true;
  // timeClockAction mutations are request-id gated end to end: the backend
  // requires a valid request_id before any write dispatch and replays or
  // dedupes the same request. A 429 retry carrying the identical payload is
  // the designed recovery path, so it cannot double-apply a punch.
  if (fnName === 'timeClockAction') {
    const id = String(payload?.request_id || '').trim();
    if (id.length >= 8 && id.length <= 128) return true;
  }
  return false;
}

// Pure reads: concurrency-limited, cooldown-aware and de-duplicated while in
// flight. Everything else is treated as a write: it is never de-duplicated,
// never queued behind reads, and it advances the read epoch.
// boardFeed is a pure board read; treating it as a write let a mount burst
// bypass the read pool/cooldown and fan out unthrottled invokes that 429'd.
function isReadInvocation(fnName, payload) {
  return isReadFunctionInvocation(fnName, payload);
}

const cloneValue = (value) => {
  if (value == null || typeof value !== 'object') return value;
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
};
const copyResponse = (res) => (res && typeof res === 'object' && 'data' in res ? { ...res, data: cloneValue(res.data) } : cloneValue(res));

// Sign-in can fail before any credential is checked — a transient server-side
// failure (5xx), a request that never got a response, or a shared-budget 429.
// verifyLogin returns its own 429 for the credential lockout too; that is a
// real decision the user must see, so it is excluded by its message. Any
// other 429 (platform invoke cap or the function's shared-budget pass-through)
// is transient congestion worth a bounded retry. The server never counts a
// failed login it did not evaluate, so these retries cannot lock an account
// out — and a retried lockout response still surfaces after the attempts run
// out, just a few seconds later.
function isUnprocessedSignInFailure(err) {
  const status = err?.response?.status ?? err?.status;
  if (status === 429) {
    const msg = String(err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? '');
    return !/too many failed|login_locked|try again in \d+ minutes/i.test(msg);
  }
  return typeof status === 'number' ? status >= 500 : true;
}

// These entities keep backend-only RLS: a browser read of them always returns
// nothing. Staff sessions therefore read them through the session-authenticated
// staffDataRead gateway, so direct reads are routed there instead.
const STAFF_READ_ENTITIES = new Set([
  'AllInOneEstimate', 'Announcement', 'AutomationRule', 'BuilderPart', 'BuilderPartGroup',
  'BuilderPriceRevision', 'BuilderProduct', 'CalendarEvent', 'CellHistory', 'ChannelLetterInstallEquipment', 'ChecklistSubItem',
  'Customer',
  'CustomerLocation', 'EmailGroup', 'EmailNotificationSettings', 'EstimateAcceptance',
  'EstimateOption', 'EstimateQuoteDelivery', 'EstimateRevision', 'EstimateSectionAcceptance',
  'GeneralTask', 'GlobalSettings', 'Inventory', 'InventoryMovement', 'JurisdictionProfile',
  'OpportunityActivity', 'Order', 'PTOPolicy', 'PermitLineItem', 'PermitLocality', 'PortalMessage', 'ProjectTemplate', 'QuickProduct',
  'MarkupTier', 'QuickProductCategory', 'RegulationAlert', 'SalesFilter', 'Settings',
  'SipChecklistTemplate', 'TimeEntry', 'TimeOffRequest',
  'UserCapacity', 'UserPTOBalance', 'WorkOrder',
]);
const READ_METHODS = new Set(['filter', 'list', 'get', 'count']);
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The SDK returns a page ({items}) when called with an options object and a
// plain array for positional calls; translate so both shapes keep working.
function routeReadArgs(method, args) {
  if (method === 'get' || method === 'count') return { call: args, paged: false, unsupported: false };
  const positional = method === 'filter'
    ? [args[0], args[1], args[2], args[3]]
    : [null, args[0], args[1], args[2]];
  if (!isPlainObject(positional[1])) {
    return { call: method === 'filter' ? positional : positional.slice(1), paged: false, unsupported: false };
  }
  const options = positional[1];
  const rest = [options.sort, options.limit, options.skip ?? options.offset];
  return {
    call: method === 'filter' ? [positional[0], ...rest] : rest,
    paged: true,
    unsupported: Boolean(options.distinct || options.cursor),
  };
}

const entityWrappers = new Map();
function wrapEntity(name, target) {
  if (!target || typeof target !== 'object') return target;
  if (entityWrappers.has(name)) return entityWrappers.get(name);
  const wrapped = new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop);
      if (prop === 'subscribe' && STAFF_READ_ENTITIES.has(name)) {
        return (callback) => {
          let unsub = () => {};
          import('@/components/staff/staffEntities').then(({ staffEntities }) => {
            const u = staffEntities[name]?.subscribe?.(callback);
            if (typeof u === 'function') unsub = u;
          }).catch(() => {});
          return () => unsub();
        };
      }
      if (prop === 'subscribe' || typeof value !== 'function') return value;
      if (STAFF_READ_ENTITIES.has(name) && READ_METHODS.has(String(prop))) {
        return async (...args) => {
          const { call, paged, unsupported } = routeReadArgs(String(prop), args);
          if (unsupported) return value.apply(t, args);
          try {
            const { staffEntities } = await import('@/components/staff/staffEntities');
            const result = await staffEntities[name][String(prop)](...call);
            return paged && Array.isArray(result)
              ? { items: result, has_more: false, next_cursor: null }
              : result;
          } catch (error) {
            // Only a missing staff session (e.g. the builder preview signed in
            // as a platform user) falls back to a direct read. A rate limit or
            // server failure must surface, not turn into a silently empty list.
            const status = Number(error?.response?.status ?? error?.status);
            if (status === 401) return value.apply(t, args);
            throw error;
          }
        };
      }
      // A platform 429 means the request was never processed, so retrying
      // writes here is safe.
      const isWrite = !READ_METHODS.has(String(prop));
      return (...args) => {
        if (isWrite) governor.bumpEpoch();
        const pending = governor.run(`${name}.${String(prop)}`, () => value.apply(t, args), { retryOnRateLimit: true, respectCooldown: !isWrite });
        // Feed the app-wide breaker after the governor's own retry decides.
        const tracked = pending.then(
          (r) => { noteRateLimitSuccess(); return r; },
          (e) => { if (isPlatformRateLimit(e)) noteRateLimit(retryAfterMs(e, 60000)); throw e; },
        );
        return isWrite ? tracked.finally(governor.bumpEpoch) : tracked;
      };
    },
  });
  entityWrappers.set(name, wrapped);
  return wrapped;
}

const entitiesProxy = new Proxy(rawClient.entities, {
  get(t, prop) {
    return wrapEntity(String(prop), Reflect.get(t, prop));
  },
});

// Staff sign in through EmailGate, not Base44 platform auth. Without a
// platform access token, auth.me() is a guaranteed 401 round-trip on every
// call — dozens per page across cards, dialogs and services. Reject it
// locally with the same 401 shape so every caller's fallback path runs
// unchanged without spending a request.
const authProxy = new Proxy(rawClient.auth, {
  get(t, prop) {
    const value = Reflect.get(t, prop);
    if (prop === 'me' && typeof value === 'function' && !token) {
      return () => {
        const err = new Error('Platform authentication required');
        err.status = 401;
        return Promise.reject(err);
      };
    }
    return value;
  },
});

// A staff-session invoke rejected as unauthenticated may mean the stored
// session expired or was revoked in another tab — hand the signal to
// EmailGate's one-shot reverifier, which ends the session only when the
// token is genuinely dead (a transient failure keeps it). Without this an
// expired session 401s on every call with no recovery until a reload.
// Dynamic import: EmailGate already imports this module, so a static edge
// would cycle at module-init time.
function reportSessionRejection(payload, err) {
  const status = Number(err?.response?.status ?? err?.status ?? err?.originalError?.response?.status);
  if (status !== 401 && status !== 409) return;
  if (typeof payload?.session_token !== "string" || !payload.session_token) return;
  import("@/components/auth/EmailGate").then((m) => m.notifySessionRejected?.()).catch(() => {});
}

const functionsProxy = new Proxy(rawClient.functions, {
  get(t, prop) {
    const value = Reflect.get(t, prop);
    if (prop === 'invoke' && typeof value === 'function') {
      return (fnName, payload) => {
        const read = isReadInvocation(fnName, payload);
        const exec = () => governor.run(`fn:${fnName}`, () => value.call(t, fnName, payload), {
          limitConcurrency: read,
          pool: 'read',
          respectCooldown: read,
          retryOnRateLimit: isRetryableFunction(fnName, payload),
          shouldRetry: fnName === 'verifyLogin' ? isUnprocessedSignInFailure : null,
          // Keep the sign-in spinner bounded: a handful of backed-off retries,
          // ~10s worst case. Other invokes use the governor default — read-pool
          // calls and request-id-gated writes are both safe to retry on a 429.
          maxAttempts: fnName === 'verifyLogin' ? 4 : undefined,
        });
        // One rate-limit note per invocation: dedupe followers share exec, so
        // they must not each note the same 429.
        const tracked = () => exec().then(
          (r) => { noteRateLimitSuccess(); return r; },
          (e) => {
            if (isPlatformRateLimit(e)) noteRateLimit(retryAfterMs(e, 60000));
            reportSessionRejection(payload, e);
            throw e;
          },
        );
        if (read) {
          const key = `fn:${fnName}:${JSON.stringify(payload ?? null)}`;
          const ttl = readTtlMs(fnName, payload);
          if (ttl > 0) {
            const cacheKey = `${governor.getEpoch()}|${key}`;
            const hit = readResponseCache.get(cacheKey);
            if (hit && Date.now() - hit.at < ttl) return Promise.resolve(copyResponse(hit.value));
            return governor.dedupe(key, () => tracked().then((v) => { readCacheSet(cacheKey, v); return v; }), copyResponse);
          }
          return governor.dedupe(key, tracked, copyResponse);
        }
        // A write may commit even when its response is lost, so reads requested
        // after it settles must never reuse a response fetched before it.
        governor.bumpEpoch();
        return tracked().finally(governor.bumpEpoch);
      };
    }
    return value;
  },
});

export const base44 = new Proxy(rawClient, {
  get(t, prop) {
    if (prop === 'entities') return entitiesProxy;
    if (prop === 'functions') return functionsProxy;
    if (prop === 'auth') return authProxy;
    const value = Reflect.get(t, prop);
    return typeof value === 'function' ? value.bind(t) : value;
  },
});

export const requestGovernor = governor;

// Seeds a read-lane TTL slot exactly as a real invoke response would, so a
// later identical call (same fn + payload, JSON key order included) resolves
// from cache without a POST. Used by the appBootstrap mount read to carry
// several providers' opening data in one call.
export function primeReadResponse(fnName, payload, data) {
  const cacheKey = `${governor.getEpoch()}|fn:${fnName}:${JSON.stringify(payload ?? null)}`;
  readCacheSet(cacheKey, { data });
}

// Developer diagnostics only: counts, timings and labels (entity/function
// names). Never payloads, tokens or record contents.
if (typeof window !== 'undefined') {
  governor.stats.scriptReadyMs = typeof performance !== 'undefined' ? Math.round(performance.now()) : null;
  window.__ccsRequestStats = governor.stats;
  window.__ccsRequestReport = () => {
    const rows = Object.entries(governor.stats.detail)
      .map(([label, d]) => ({ label, count: d.count, errors: d.errors, avgMs: Math.round(d.totalMs / d.count), maxMs: Math.round(d.maxMs) }))
      .sort((a, b) => b.count - a.count);
    const minutes = Math.max(1 / 60, (Date.now() - governor.stats.startedAt) / 60000);
    console.table(rows);
    return { perMinute: Math.round(governor.stats.total / minutes), peakInFlight: governor.stats.peakInFlight, rateLimited: governor.stats.rateLimited, retries: governor.stats.retries, deduped: governor.stats.deduped, slow: governor.stats.slow, rows };
  };
}