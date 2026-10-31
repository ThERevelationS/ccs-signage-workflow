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

// Only read-only functions may retry on rate limit. Backend functions return
// their own 429s after doing real work (login lockouts, sync budget), so
// retrying anything else could duplicate a mutation.
export function isRetryableFunction(fnName, payload) {
  if (fnName === 'verifySession') return true;
  if (fnName === 'permittingScanStatus') return true;
  // Read gateways never mutate, so a platform 429 can be retried safely.
  if (fnName === 'staffDataRead' || fnName === 'fleetDataRead') return true;
  if (fnName === 'timeClockAction') return ['status', 'status_lite'].includes(payload?.action);
  if (fnName === 'smartsheetSyncAction') return payload?.action === 'conflict_count';
  return false;
}

// Pure reads: concurrency-limited, cooldown-aware and de-duplicated while in
// flight. Everything else is treated as a write: it is never de-duplicated,
// never queued behind reads, and it advances the read epoch.
function isReadInvocation(fnName, payload) {
  if (['staffDataRead', 'fleetDataRead', 'verifySession', 'permittingScanStatus'].includes(fnName)) return true;
  if (fnName === 'timeClockAction') return ['status', 'status_lite'].includes(payload?.action);
  if (fnName === 'smartsheetSyncAction') return payload?.action === 'conflict_count';
  return false;
}

const cloneValue = (value) => {
  if (value == null || typeof value !== 'object') return value;
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
};
const copyResponse = (res) => (res && typeof res === 'object' && 'data' in res ? { ...res, data: cloneValue(res.data) } : cloneValue(res));

// Sign-in can fail before any credential is checked — a transient server-side
// failure (5xx) or a request that never got a response. Only those are retried:
// a 400/401/403/409/429 response means the request was processed and must be
// reported to the user as-is. The server never counts a failed login it did not
// evaluate, so these retries cannot lock an account out.
function isUnprocessedSignInFailure(err) {
  const status = err?.response?.status ?? err?.status;
  return typeof status === 'number' ? status >= 500 : true;
}

// These entities keep backend-only RLS: a browser read of them always returns
// nothing. Staff sessions therefore read them through the session-authenticated
// staffDataRead gateway, so direct reads are routed there instead.
const STAFF_READ_ENTITIES = new Set([
  'AllInOneEstimate', 'Announcement', 'AutomationRule', 'BuilderPart', 'BuilderPartGroup',
  'BuilderPriceRevision', 'BuilderProduct', 'CalendarEvent', 'CellHistory', 'Customer',
  'CustomerLocation', 'EmailGroup', 'EmailNotificationSettings', 'EstimateAcceptance',
  'EstimateOption', 'EstimateQuoteDelivery', 'EstimateRevision', 'EstimateSectionAcceptance',
  'GeneralTask', 'GlobalSettings', 'Inventory', 'InventoryMovement', 'JurisdictionProfile',
  'OpportunityActivity', 'Order', 'PTOPolicy', 'PermitLineItem', 'PermitLocality', 'PortalMessage', 'ProjectTemplate', 'QuickProduct',
  'QuickProductCategory', 'SalesFilter', 'Settings', 'TimeEntry', 'TimeOffRequest',
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
          // Keep the sign-in spinner bounded: a couple of quick retries, no long wait.
          maxAttempts: fnName === 'verifyLogin' ? 2 : 1,
        });
        // One rate-limit note per invocation: dedupe followers share exec, so
        // they must not each note the same 429.
        const tracked = () => exec().then(
          (r) => { noteRateLimitSuccess(); return r; },
          (e) => { if (isPlatformRateLimit(e)) noteRateLimit(retryAfterMs(e, 60000)); throw e; },
        );
        if (read) return governor.dedupe(`fn:${fnName}:${JSON.stringify(payload ?? null)}`, tracked, copyResponse);
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
    const value = Reflect.get(t, prop);
    return typeof value === 'function' ? value.bind(t) : value;
  },
});

export const requestGovernor = governor;

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