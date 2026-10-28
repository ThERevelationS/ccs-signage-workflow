import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createRequestGovernor } from './requestGovernor.mjs';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
const rawClient = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

const governor = createRequestGovernor();

// Only read-only functions may retry on rate limit. Backend functions return
// their own 429s after doing real work (login lockouts, sync budget), so
// retrying anything else could duplicate a mutation.
function isRetryableFunction(fnName, payload) {
  if (fnName === 'verifySession') return true;
  if (fnName === 'permittingScanStatus') return true;
  if (fnName === 'timeClockAction') return ['status', 'status_lite'].includes(payload?.action);
  if (fnName === 'smartsheetSyncAction') return payload?.action === 'conflict_count';
  return false;
}

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
  'Order', 'PTOPolicy', 'PermitLineItem', 'PermitLocality', 'ProjectTemplate', 'QuickProduct',
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
          } catch {
            return value.apply(t, args);
          }
        };
      }
      // A platform 429 means the request was never processed, so retrying
      // writes here is safe.
      return (...args) => governor.run(`${name}.${String(prop)}`, () => value.apply(t, args), { retryOnRateLimit: true });
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
      return (fnName, payload) => governor.run(`fn:${fnName}`, () => value.call(t, fnName, payload), {
        limitConcurrency: false,
        retryOnRateLimit: isRetryableFunction(fnName, payload),
        shouldRetry: fnName === 'verifyLogin' ? isUnprocessedSignInFailure : null,
        // Keep the sign-in spinner bounded: a couple of quick retries, no long wait.
        maxAttempts: fnName === 'verifyLogin' ? 2 : undefined,
      });
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

if (typeof window !== 'undefined') window.__ccsRequestStats = governor.stats;