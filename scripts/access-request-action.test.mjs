import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

const source = readFileSync('base44/functions/accessRequestAction/entry.ts', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^/, 'const authenticateSignShopSession = (...a) => globalThis.__accessRequestDeps.authenticateSignShopSession(...a);\nconst base44 = { get asServiceRole() { return globalThis.__accessRequestDeps.base44.asServiceRole; } };\n');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const modulePath = join(mkdtempSync(join(tmpdir(), 'access-request-')), 'entry.mjs');
writeFileSync(modulePath, code);
const { handler } = await import(pathToFileURL(modulePath).href);

function setup({ actor, request, target }) {
  const updates = [];
  const entity = (rows) => ({
    filter: async (q) => rows.filter((r) => Object.entries(q).every(([k, v]) => r[k] === v)),
    get: async (id) => rows.find((r) => r.id === id) || null,
    update: async (id, data) => { updates.push({ id, data }); return { id, ...data }; },
    create: async (data) => ({ id: 'new', ...data }),
  });
  globalThis.__accessRequestDeps = {
    authenticateSignShopSession: async () => actor,
    base44: { asServiceRole: { entities: {
      AccessRequest: entity([request]),
      AdminAuditLog: entity([]),
      AuthorizedEmail: entity([target]),
    } } },
  };
  return updates;
}

const approve = () => handler(new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'approve', request_id: 'req1', session_token: 't' }) }));
const bob = { email: 'bob@example.com', role: 'admin' };
const mallory = { id: 'u1', email: 'mallory@example.com', role: 'user', admin_permissions: {} };
const pending = (sections, proposer = mallory.email) => ({ id: 'req1', requester_email: mallory.email, proposer_email: proposer, requested_sections: sections, status: 'pending' });

test('section-scoped approval merges sections without granting the admin role', async () => {
  const updates = setup({ actor: bob, request: pending(['timeclock']), target: { ...mallory, admin_permissions: { sections: ['people'] } } });
  const res = await approve();
  assert.equal(res.status, 200);
  const userUpdate = updates.find((u) => u.id === 'u1').data;
  assert.equal('role' in userUpdate, false);
  assert.equal('is_full_admin' in userUpdate, false);
  assert.deepEqual(userUpdate.admin_permissions.sections, ['people', 'timeclock']);
});

test('full_admin and breakglass approvals still grant the admin role', async () => {
  let updates = setup({ actor: bob, request: pending(['full_admin']), target: { ...mallory } });
  await approve();
  assert.deepEqual(updates.find((u) => u.id === 'u1').data, { role: 'admin', is_full_admin: true });

  updates = setup({ actor: bob, request: pending(['breakglass']), target: { ...mallory } });
  await approve();
  const bg = updates.find((u) => u.id === 'u1').data;
  assert.equal(bg.role, 'admin');
  assert.ok(Date.parse(bg.admin_grant_expires) > Date.now());
});

test('admin-role grants require a second admin when the approver proposed them', async () => {
  for (const sections of [[], ['full_admin'], ['breakglass']]) {
    const updates = setup({ actor: bob, request: pending(sections, bob.email), target: { ...mallory } });
    const res = await approve();
    assert.equal(res.status, 403);
    assert.equal(updates.length, 0);
  }
});

test('non-admins cannot approve requests', async () => {
  const updates = setup({ actor: { email: 'eve@example.com', role: 'user' }, request: pending(['timeclock']), target: { ...mallory } });
  const res = await approve();
  assert.equal(res.status, 403);
  assert.equal(updates.length, 0);
});
