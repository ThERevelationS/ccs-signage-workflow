import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Zero-dependency contract check for the A-01 IncomeAccount + A-02 COGSAccount
// schema work: both entities must exist with the full GL field set and
// backend-only RLS, accountingAdminAction must expose seed_gl_accounts with all
// 15 deterministic seed codes. Run: node scripts/test-schema-income-cogs.mjs

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJson = (rel) => JSON.parse(readFileSync(resolve(root, rel), 'utf8'));

const ENTITY_SPECS = [
  {
    file: 'base44/entities/IncomeAccount.jsonc',
    name: 'IncomeAccount',
    role: '__incomeaccount_backend_only__',
    codes: ['4000', '4100', '4200', '4300', '4400', '4500', '4900'],
  },
  {
    file: 'base44/entities/COGSAccount.jsonc',
    name: 'COGSAccount',
    role: '__cogsaccount_backend_only__',
    codes: ['5000', '5100', '5200', '5300', '5400', '5500', '5600', '5900'],
  },
];

for (const spec of ENTITY_SPECS) {
  assert.ok(existsSync(resolve(root, spec.file)), `${spec.file} must exist`);
  const entity = readJson(spec.file);
  assert.equal(entity.name, spec.name, `${spec.file} name`);
  assert.equal(entity.type, 'object', `${spec.file} type`);

  const props = entity.properties || {};
  for (const field of ['code', 'name', 'parent_account', 'status', 'creation_request_key', 'updated_by']) {
    assert.equal(props[field]?.type, 'string', `${spec.name}.${field} must be a string`);
  }
  assert.equal(props.schema_version?.type, 'number', `${spec.name}.schema_version must be a number`);
  assert.deepEqual(props.status?.enum, ['active', 'inactive'], `${spec.name}.status enum`);

  // Every schema field stays optional — nothing may be added to `required`.
  assert.ok(!Array.isArray(entity.required) || entity.required.length === 0,
    `${spec.name} must not declare required fields`);

  // Backend-only RLS on all four ops.
  for (const op of ['create', 'read', 'update', 'delete']) {
    assert.equal(entity.rls?.[op]?.user_condition?.role, spec.role,
      `${spec.name}.rls.${op} must be ${spec.role}`);
  }
}

// Function dir: both files present, manifest points at entry.ts.
const fnDir = 'base44/functions/accountingAdminAction';
assert.ok(existsSync(resolve(root, `${fnDir}/function.jsonc`)), 'function.jsonc must exist');
assert.ok(existsSync(resolve(root, `${fnDir}/entry.ts`)), 'entry.ts must exist');
const manifest = readJson(`${fnDir}/function.jsonc`);
assert.equal(manifest.name, 'accountingAdminAction');
assert.equal(manifest.entry, 'entry.ts');
assert.ok(!manifest.entry.includes('base44/functions/'), 'entry must be relative, not a repo path');

// entry.ts: session-authed gateway, idempotent seed action, all 15 seed codes.
const entry = readFileSync(resolve(root, `${fnDir}/entry.ts`), 'utf8');
for (const needle of [
  'seed_gl_accounts',
  'authenticateSignShopSession',
  'createFoundationRecordWithRecovery',
  'withEntityRateLimitRetry',
  'asServiceRole.entities.IncomeAccount',
  'asServiceRole.entities.COGSAccount',
  'income_created',
  'income_existing',
  'cogs_created',
  'cogs_existing',
  'seed-income-',
  'seed-cogs-',
]) {
  assert.ok(entry.includes(needle), `entry.ts must contain ${needle}`);
}
const allCodes = ENTITY_SPECS.flatMap((s) => s.codes);
assert.equal(allCodes.length, 15, 'seed chart must be 15 rows');
for (const code of allCodes) {
  assert.ok(entry.includes(`'${code}'`), `entry.ts must seed code ${code}`);
}

console.log('PASS schema-income-cogs');
