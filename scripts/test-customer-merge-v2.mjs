import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildSync, transformSync } from 'esbuild';

function loadShared(path) {
  const source = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const module = { exports: {} };
  runInNewContext(source, { module, exports: module.exports, console, Date, Map, Set });
  return module.exports;
}
const model = loadShared('base44/shared/customerMergeModel.ts');
const paged = loadShared('base44/shared/pagedEntityRows.ts');
const source = transformSync(readFileSync('base44/functions/customerMergeV2/entry.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;

function fixture(initialFailure) {
  const rows = Object.fromEntries(model.CUSTOMER_RELINK_SPECS.map((spec) => [spec.entity, []]));
  rows.Customer = [
    { id: 'keep', company_name: 'Winner', customer_status: 'active', updated_date: 'v1' },
    { id: 'lose', company_name: 'Loser', customer_status: 'active', updated_date: 'v1' },
  ];
  rows.WorkOrder.push({ id: 'wo1', customer_id: 'lose', client_name: 'Loser', updated_date: 'v1' });
  rows.AllInOneEstimate.push({ id: 'est1', customer_id: 'lose', client_name: 'Loser', updated_date: 'v1' });
  let failure = initialFailure;
  let version = 1;
  const calls = [];
  const apis = Object.fromEntries(Object.keys(rows).map((name) => [name, {
    async filter(query, sort, limit, skip, fields) {
      calls.push({ name, sort, fields });
      if (typeof sort === 'object' && sort !== null) throw Object.assign(new Error('Request failed with status code 400'), { status: 400 });
      if (fields !== undefined) throw new Error('unexpected projected SDK read');
      if (name === 'CrmSuggestion' && failure) throw new Error(failure);
      return rows[name].filter((row) => Object.entries(query).every(([key, value]) =>
        Array.isArray(row[key]) ? row[key].includes(value) : row[key] === value)).slice(skip || 0, (skip || 0) + (limit || 1000)).map((row) => structuredClone(row));
    },
    async get(id) { const row = rows[name].find((entry) => entry.id === id); if (!row) throw new Error('not found'); return structuredClone(row); },
    async updateMany(query, update) {
      const row = rows[name].find((entry) => Object.entries(query).every(([key, value]) => entry[key] === value));
      if (!row) return { updated: 0 };
      Object.assign(row, structuredClone(update.$set), { updated_date: `v${++version}` });
      return { updated: 1 };
    },
    async update(id, update) { const row = rows[name].find((entry) => entry.id === id); Object.assign(row, structuredClone(update), { updated_date: `v${++version}` }); },
    async create(data) { const row = { ...structuredClone(data), id: `${name}-${rows[name].length + 1}`, updated_date: `v${++version}` }; rows[name].push(row); return structuredClone(row); },
  }]));
  let handler;
  const sdk = { asServiceRole: { entities: apis } };
  const imports = {
    'npm:@base44/sdk@0.8.53': { createClientFromRequest: () => sdk },
    '../../shared/entityRateLimitRetry.ts': { withEntityRateLimitRetry: (value) => value },
    '../../shared/signShopSession.ts': {
      authenticateSignShopSession: async (_client, token) => {
        if (!token) throw Object.assign(new Error('Unauthenticated'), { status: 401 });
        return { id: token, role: token === 'admin' ? 'admin' : 'staff' };
      },
    },
    '../../shared/pagedEntityRows.ts': paged,
    '../../shared/customerMergeModel.ts': model,
  };
  runInNewContext(source, {
    require: (name) => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; },
    module: { exports: {} }, exports: {}, Deno: { serve: (fn) => { handler = fn; } }, Response, console, Date, Map, Set, Object, Number, String, Array, Error,
  });
  return {
    rows, calls, setFailure: (value) => { failure = value; },
    async invoke(action, token = 'admin') {
      const response = await handler(new Request('https://example.test', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, session_token: token, keep_id: 'keep', lose_id: 'lose' }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

{
  const app = fixture('Entity schema CrmSuggestion not found in app');
  const probe = await app.invoke('probe_projection');
  assert.equal(probe.body.options_supported, false);
  assert.equal((await app.invoke('merge_customers', 'staff')).status, 403);
  assert.equal((await app.invoke('preview_customer_merge', '')).status, 401);
  const preview = await app.invoke('preview_customer_merge');
  assert.equal(preview.body.ok, true);
  assert.equal(preview.body.entities.find((entry) => entry.entity === 'CrmSuggestion').status, 'skipped_missing_entity');
  const merged = await app.invoke('merge_customers');
  assert.equal(merged.body.status, 'merged');
  assert.equal(merged.body.entities.find((entry) => entry.entity === 'CrmSuggestion').status, 'skipped_missing_entity');
  assert.equal(app.rows.Customer.find((row) => row.id === 'lose').merged_into_customer_id, 'keep');
  assert.equal(app.rows.WorkOrder[0].customer_id, 'keep');
  assert.equal(app.rows.AllInOneEstimate[0].customer_id, 'keep');
  assert.ok(merged.body.audit_id);
  assert.equal(app.rows.OpportunityActivity.length, 1);
  assert.equal((await app.invoke('merge_customers')).body.status, 'already_merged');
  assert.ok(app.calls.filter((call) => typeof call.sort !== 'object').every((call) => call.fields === undefined));
}
{
  const app = fixture('Rate limit or database failure');
  assert.equal((await app.invoke('preview_customer_merge')).body.ok, false);
  const partial = await app.invoke('merge_customers');
  assert.equal(partial.body.status, 'partial');
  assert.equal(partial.body.entities.find((entry) => entry.entity === 'CrmSuggestion').status, 'failed');
  assert.ok(!app.rows.Customer.find((row) => row.id === 'lose').merged_into_customer_id);
  app.setFailure('Entity schema CrmSuggestion not found in app');
  const resumed = await app.invoke('merge_customers');
  assert.equal(resumed.body.status, 'merged');
  assert.equal(app.rows.Customer.find((row) => row.id === 'lose').merged_into_customer_id, 'keep');
}
{
  const app = fixture('Entity schema OtherEntity not found in app');
  const partial = await app.invoke('merge_customers');
  assert.equal(partial.body.status, 'partial');
  assert.equal(partial.body.entities.find((entry) => entry.entity === 'CrmSuggestion').status, 'failed');
}
console.log('PASS customer merge V2: authorization, positional reads, missing schema skip, other errors partial, resume, links, tombstone and audit');
