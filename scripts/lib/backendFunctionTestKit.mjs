import { createHmac } from 'node:crypto';
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Shared kit for esbuild-bundled Base44 backend function tests. Bundles an
// entry.ts under Node with the platform SDK replaced by an in-memory stub:
//   Deno.serve(handler) is captured; invoke the handler with a fake request
//   ({ json: async () => body }) and assert on the real Response object.
// Session tokens replicate signShopSession.ts's HMAC contract so
// authenticateSignShopSession runs for real against the stub entity store.

const b64url = (input) => Buffer.from(input).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const TEST_SESSION_SECRET = 'test-session-signing-secret';

/** A token that passes authenticateSignShopSession for `email` (now±window). */
export function makeSessionToken(email, { secret = TEST_SESSION_SECRET, iat = Date.now() - 1000, exp = Date.now() + 60000 } = {}) {
  const payloadStr = b64url(JSON.stringify({ email, iat, exp }));
  const sig = createHmac('sha256', secret).update(payloadStr).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${payloadStr}.${sig}`;
}

/** Install the Deno globals the bundled function expects. Returns a getter for the last served handler. */
export function installDeno({ env = {} } = {}) {
  const handlers = [];
  globalThis.Deno = {
    env: { get: (key) => (key in env ? env[key] : (key === 'SESSION_SIGNING_SECRET' ? TEST_SESSION_SECRET : undefined)) },
    serve: (fn) => { handlers.push(fn); return { shutdown: async () => {} }; },
  };
  return () => handlers[handlers.length - 1];
}

/** Fake req for the captured Deno handler. */
export const fakeRequest = (body) => ({ json: async () => body });

/** Convenience: read {status, data} off a real Response. */
export async function responseOf(res) {
  return { status: res.status, data: await res.json() };
}

/**
 * In-memory entity implementing the Base44 entity contract used by the
 * functions under test: filter(query, sort, limit, skip) with exact-match
 * query semantics, list, get, create, updateMany (CAS on every filter key),
 * deleteMany, delete, count.
 */
export function makeEntity(seedRows = []) {
  const store = { rows: seedRows.map((r, i) => ({ id: r.id || `row-${i + 1}`, ...r })) };
  const matches = (row, q) => Object.entries(q || {}).every(([k, v]) => row?.[k] === v);
  const sortRows = (rows, sort) => {
    if (!sort) return rows.slice();
    const desc = String(sort).startsWith('-');
    const key = desc ? String(sort).slice(1) : String(sort);
    return rows.slice().sort((a, b) => {
      const av = a?.[key] ?? ''; const bv = b?.[key] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  };
  const entity = {
    // Live getter — updateMany/deleteMany replace store.rows, so a captured
    // array reference would silently go stale mid-test.
    get rows() { return store.rows; },
    filter: async (q, sort, limit, skip) => {
      const rows = sortRows(store.rows.filter((r) => matches(r, q)), sort);
      if (typeof limit === 'number' || typeof skip === 'number') {
        return rows.slice(skip || 0, (skip || 0) + (limit ?? rows.length));
      }
      return rows;
    },
    list: async (sort, limit, skip) => {
      const rows = sortRows(store.rows, sort);
      return rows.slice(skip || 0, (skip || 0) + (limit ?? rows.length));
    },
    count: async (q) => store.rows.filter((r) => matches(r, q)).length,
    get: async (id) => store.rows.find((r) => r.id === id) || null,
    create: async (data) => {
      const row = { ...data, id: data.id || `new-${store.rows.length + 1}`, created_date: data.created_date || new Date().toISOString(), updated_date: data.updated_date || new Date().toISOString() };
      store.rows.push(row);
      return row;
    },
    updateMany: async (query, patch) => {
      const set = patch?.$set || patch || {};
      let updated = 0;
      store.rows = store.rows.map((row) => {
        if (!matches(row, query)) return row;
        updated += 1;
        return { ...row, ...set, updated_date: 'v-next' };
      });
      return { updated };
    },
    deleteMany: async (query) => {
      const keep = store.rows.filter((r) => !matches(r, query));
      const deleted = store.rows.length - keep.length;
      store.rows = keep;
      return { deleted };
    },
    delete: async (id) => {
      const before = store.rows.length;
      store.rows = store.rows.filter((r) => r.id !== id);
      return { deleted: before - store.rows.length };
    },
  };
  return entity;
}

/**
 * buildSdkStub: writes a stub module aliasing the platform SDK for esbuild.
 * `entities` maps entity name -> makeEntity()-shaped object for BOTH the
 * user-scoped (base44.entities) and service-role surfaces unless split.
 */
export function writeSdkStub(file, { entities = {}, authMe = null, invoke = null, extra = '' } = {}) {
  writeFileSync(file, `
globalThis.__invokeCalls = [];
globalThis.__invokeHandler = null;
export const createClientFromRequest = () => ({
  entities: globalThis.__entities,
  asServiceRole: {
    entities: globalThis.__entities,
    functions: { invoke: async (fn, body) => { globalThis.__invokeCalls.push({ fn, body }); return globalThis.__invokeHandler ? globalThis.__invokeHandler(fn, body) : { data: {} }; } },
  },
  functions: { invoke: async (fn, body) => { globalThis.__invokeCalls.push({ fn, body }); return globalThis.__invokeHandler ? globalThis.__invokeHandler(fn, body) : { data: {} }; } },
  auth: { me: async () => (typeof globalThis.__authMe === 'function' ? globalThis.__authMe() : globalThis.__authMe) },
});
${extra}
`);
  return file;
}

/** Set the stub entity map BEFORE importing the bundled handler. */
export function setStubEntities(entities) { globalThis.__entities = entities; }
export function setAuthMe(value) { globalThis.__authMe = value; }
export function setInvokeHandler(fn) { globalThis.__invokeHandler = fn; }
export function invokeCalls() { return globalThis.__invokeCalls || []; }

/** Bundle a backend function entry.ts with the SDK stubbed. */
export function bundleFunction({ here, entry, stubFile, outFile }) {
  buildSync({
    entryPoints: [resolve(here, entry)],
    // platform: node resolves node:* builtins (smartsheetTraceContext uses
    // node:async_hooks) instead of failing on the default browser platform.
    platform: 'node',
    bundle: true, format: 'esm', outfile: outFile, logLevel: 'silent',
    alias: {
      'npm:@base44/sdk@0.8.25': stubFile,
      'npm:@base44/sdk@0.8.53': stubFile,
      'npm:@base44/sdk': stubFile,
    },
  });
  return outFile;
}

export const hereOf = (metaUrl) => dirname(fileURLToPath(import.meta.url));
export const importBundled = (outFile) => import(pathToFileURL(outFile).href);
