import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2];
if (!['estimate', 'lead'].includes(mode)) throw new Error('Expected estimate or lead.');
const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token;
async function call(fn, data) {
  const response = await fetch(`${base}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...data, ...(token ? { session_token: token } : {}) }), signal: AbortSignal.timeout(120000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
  return body.data || body;
}
const login = await call('verifyLogin', { username: credentials.user, password: credentials.pass });
if (!login.token) throw new Error('Staff login failed.');
token = login.token;
let expected;
if (mode === 'estimate') {
  const plan = JSON.parse(readFileSync('imports/corebridge-2026-11-16/pipeline-customer-from-estimate-plan.json', 'utf8'));
  expected = plan.plan.filter((row) => row.customer_id).map((row) => ({ id: row.id, customer_id: row.customer_id, estimate_id: row.estimate_id }));
} else {
  const plan = JSON.parse(readFileSync('.audit-work/cb-pipe-leads-plan.json', 'utf8'));
  const state = JSON.parse(readFileSync('.audit-work/cb-pipe-leads-state.json', 'utf8'));
  if (state.pending || state.conflicts.length) throw new Error('Lead state has unresolved conflicts.');
  expected = [...plan.existing.map((row) => ({ id: row.id, customer_id: row.customer_id })),
    ...plan.new_customers.flatMap((group) => group.rows.map((row) => ({ id: row.id, customer_id: state.customers[group.data.__source_id__] })))];
  if (Object.keys(state.customers).length !== plan.new_customers.length) throw new Error('Lead customer count mismatch.');
}
if (expected.some((row) => !row.customer_id)) throw new Error('Missing expected customer id.');
const actual = new Map();
for (let i = 0; i < expected.length; i += 50) {
  const ids = expected.slice(i, i + 50).map((row) => row.id);
  const results = await call('staffDataRead', { entity: 'WorkOrder', query: { id: { $in: ids } }, limit: 1000 });
  if (!Array.isArray(results.items) || results.items.length >= 1000) throw new Error('WorkOrder verification read incomplete.');
  for (const row of results.items) actual.set(row.id, row);
}
const differences = expected.filter((row) => actual.get(row.id)?.customer_id !== row.customer_id ||
  (row.estimate_id && actual.get(row.id)?.estimate_id !== row.estimate_id) || (mode === 'lead' && actual.get(row.id)?.estimate_id));
const report = { mode, expected: expected.length, found: actual.size, differences };
writeFileSync(`.audit-work/cb-pipe-${mode}-verify.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode, expected: expected.length, found: actual.size, differences: differences.length }));
if (differences.length || actual.size !== expected.length) throw new Error('WorkOrder verification failed.');
