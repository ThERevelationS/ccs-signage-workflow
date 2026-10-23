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

const entityWrappers = new Map();
function wrapEntity(name, target) {
  if (!target || typeof target !== 'object') return target;
  if (entityWrappers.has(name)) return entityWrappers.get(name);
  const wrapped = new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop);
      if (prop === 'subscribe' || typeof value !== 'function') return value;
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
