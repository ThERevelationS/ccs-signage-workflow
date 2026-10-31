// Field-level authority on the staffEntityWrite gateway: non-admin staff
// sessions cannot forge manager-owned estimate/work-order fields or
// permanently delete estimates. Runs the real entry.ts with synthetic I/O.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['base44/functions/staffEntityWrite/entry.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral',
  plugins: [{ name: 'mock-boundaries', setup(b) {
    b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: 'sdk', namespace: 'mock' }));
    b.onResolve({ filter: /signShopSession\.ts$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onResolve({ filter: /entityRateLimitRetry\.ts$/ }, () => ({ path: 'retry', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'js', contents: {
      sdk: 'export const createClientFromRequest = () => globalThis.__client;',
      session: 'export const authenticateSignShopSession = async () => globalThis.__user;',
      retry: 'export const withEntityRateLimitRetry = (c) => c;',
    }[path] }));
  } }],
});
let handler; globalThis.Deno = { serve: (fn) => { handler = fn; } };
await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

function fixture(role, records) {
  const writes = [];
  const entity = (name) => ({
    get: async (id) => structuredClone(records[name]?.[id] ?? null),
    create: async (data) => { writes.push({ name, op: 'create', data }); return { id: 'new', ...data }; },
    update: async (id, data) => { writes.push({ name, op: 'update', id, data }); return { id, ...data }; },
    updateMany: async (q, u) => { writes.push({ name, op: 'updateMany', q, u }); return { updated: 1 }; },
    delete: async (id) => { writes.push({ name, op: 'delete', id }); },
  });
  globalThis.__user = { email: 'staff@example.com', role };
  globalThis.__client = { asServiceRole: { entities: { AllInOneEstimate: entity('AllInOneEstimate'), WorkOrder: entity('WorkOrder') } } };
  return writes;
}
const call = async (body) => {
  const r = await handler(new Request('https://test', { method: 'POST', body: JSON.stringify({ session_token: 't', ...body }) }));
  return { status: r.status, data: await r.json() };
};
const approval = { approved_at: '2026-10-01T00:00:00.000Z', approved_by: 'mgr@example.com', quote_total_at_approval: 9000 };
const records = () => ({
  AllInOneEstimate: { e1: { id: 'e1', updated_date: 'v1', status: 'draft', internal_approval: approval, project_name: 'A' },
    e2: { id: 'e2', updated_date: 'v1', status: 'draft', project_name: 'B' } },
  WorkOrder: { w1: { id: 'w1', updated_date: 'v1', status: 'open', payment_status: 'unpaid', title: 'Job' } },
});
const setMany = (entity, id, $set) => call({ entity, op: 'updateMany', id, query: { id, updated_date: 'v1' }, update: { $set } });

let cases = 0;
const check = async (name, fn) => { await fn(); cases++; };

await check('staff cannot forge internal_approval', async () => {
  const w = fixture('user', records());
  const r = await setMany('AllInOneEstimate', 'e2', { internal_approval: { ...approval, quote_total_at_approval: 1e9 } });
  assert.equal(r.status, 403); assert.match(r.data.error, /internal_approval/); assert.equal(w.length, 0);
});
await check('staff cannot alter internal_approval via dotted key', async () => {
  const w = fixture('user', records());
  const r = await setMany('AllInOneEstimate', 'e1', { 'internal_approval.quote_total_at_approval': 1e9 });
  assert.equal(r.status, 403); assert.equal(w.length, 0);
});
await check('staff cannot clear internal_approval', async () => {
  const w = fixture('user', records());
  assert.equal((await setMany('AllInOneEstimate', 'e1', { internal_approval: null })).status, 403); assert.equal(w.length, 0);
});
await check('staff full-form save resubmitting loaded approval still saves', async () => {
  const w = fixture('user', records());
  const reordered = { quote_total_at_approval: 9000, approved_by: 'mgr@example.com', approved_at: '2026-10-01T00:00:00.000Z' };
  const r = await setMany('AllInOneEstimate', 'e1', { project_name: 'A2', status: 'sent', internal_approval: reordered });
  assert.equal(r.status, 200); assert.equal(w.length, 1);
  const r2 = await setMany('AllInOneEstimate', 'e2', { project_name: 'B2', internal_approval: null });
  assert.equal(r2.status, 200); assert.equal(w.length, 2);
});
await check('staff cannot set privileged WorkOrder fields', async () => {
  for (const [f, v] of [['payment_status', 'paid'], ['invoice_status', 'paid'], ['status', 'closed'], ['approved_by', 'x'], ['approved_at', '2026-10-01'], ['sales_quote_sent_verified_at', '2026-10-01T00:00:00Z']]) {
    const w = fixture('user', records());
    const r = await setMany('WorkOrder', 'w1', { title: 'Job', [f]: v });
    assert.equal(r.status, 403, f); assert.equal(w.length, 0, f);
  }
});
await check('staff cannot create WorkOrder with privileged fields', async () => {
  const w = fixture('user', records());
  assert.equal((await call({ entity: 'WorkOrder', op: 'create', data: { title: 'R', payment_status: 'paid' } })).status, 403);
  assert.equal(w.length, 0);
  assert.equal((await call({ entity: 'WorkOrder', op: 'create', data: { title: 'R', is_rider: true } })).status, 200);
  assert.equal(w.length, 1);
});
await check('staff ordinary WorkOrder edit still saves', async () => {
  const w = fixture('user', records());
  const r = await setMany('WorkOrder', 'w1', { title: 'Job 2', status: 'open', payment_status: 'unpaid' });
  assert.equal(r.status, 200); assert.equal(w.length, 1);
});
await check('staff cannot permanently delete an estimate', async () => {
  const w = fixture('user', records());
  assert.equal((await call({ entity: 'AllInOneEstimate', op: 'delete', id: 'e1' })).status, 403); assert.equal(w.length, 0);
});
await check('admin can write privileged fields and delete', async () => {
  const w = fixture('admin', records());
  assert.equal((await setMany('WorkOrder', 'w1', { payment_status: 'paid' })).status, 200);
  assert.equal((await setMany('AllInOneEstimate', 'e2', { internal_approval: approval })).status, 200);
  assert.equal((await call({ entity: 'AllInOneEstimate', op: 'delete', id: 'e1' })).status, 200);
  assert.equal(w.length, 3);
});

console.log(`PASS staff entity write authority (${cases} cases)`);
