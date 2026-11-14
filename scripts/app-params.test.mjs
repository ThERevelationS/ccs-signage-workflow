import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await fs.readFile('src/lib/app-params.js', 'utf8');
const ENV = {
  VITE_BASE44_APP_ID: 'app123',
  VITE_BASE44_BACKEND_URL: 'https://backend.example',
};

async function load(search, { dev = false, stored = {} } = {}) {
  const env = { ...ENV, DEV: dev };
  const compiled = (await transform(source, {
    loader: 'js',
    format: 'cjs',
    define: { 'import.meta.env': JSON.stringify(env) },
  })).code;
  const store = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const location = new URL(`https://shop.base44.app/estimates${search}#top`);
  const browser = {
    localStorage,
    location,
    history: {
      state: null,
      replaceState: (_s, _t, url) => {
        const next = new URL(url, location.origin);
        location.search = next.search;
        location.hash = next.hash;
      },
    },
  };
  const module = { exports: {} };
  new Function('module', 'exports', 'window', 'document', compiled)(
    module, module.exports, browser, { title: 'CCS' },
  );
  return { params: module.exports.appParams, store, location };
}

test('production ignores attacker backend/app overrides and persists nothing', async () => {
  const { params, store, location } = await load(
    '?server_url=https://attacker.example&access_token=x&app_id=evil&from_url=https://attacker.example/p&keep=1',
    { stored: { base44_server_url: 'https://attacker.example', base44_app_id: 'evil', base44_functions_version: 'old' } },
  );
  assert.equal(params.serverUrl, 'https://backend.example');
  assert.equal(params.appId, 'app123');
  assert.equal(params.token, 'x');
  assert.equal(params.fromUrl, 'https://shop.base44.app/estimates?keep=1#top');
  assert.equal(location.search, '?keep=1');
  assert.deepEqual([...store.keys()], []);
});

test('a later clean load does not resurrect a URL-supplied token', async () => {
  const { params } = await load('');
  assert.equal(params.token, null);
  assert.equal(params.serverUrl, 'https://backend.example');
});

test('the SDK-stored sign-in token is still used', async () => {
  const { params } = await load('', { stored: { base44_access_token: 'sdk-token' } });
  assert.equal(params.token, 'sdk-token');
});

test('only allowlisted backend origins are accepted in production', async () => {
  assert.equal((await load('?server_url=https://base44.app')).params.serverUrl, 'https://base44.app');
  assert.equal((await load('?server_url=https://evil.base44.app')).params.serverUrl, 'https://backend.example');
  assert.equal((await load('?server_url=javascript:alert(1)')).params.serverUrl, 'https://backend.example');
});

test('development builds may override backend and app id', async () => {
  const { params } = await load('?server_url=http://localhost:4000&app_id=devapp', { dev: true });
  assert.equal(params.serverUrl, 'http://localhost:4000');
  assert.equal(params.appId, 'devapp');
});
