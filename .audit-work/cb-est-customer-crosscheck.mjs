import { readFileSync } from 'node:fs';

const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const plan = JSON.parse(readFileSync('.audit-work/cb-inv-plan.json', 'utf8'));
const rows = JSON.parse(readFileSync('imports/corebridge-2026-11-16/rows-estimates.json', 'utf8'));
const bySource = new Map(rows.map((row) => [String(row.__source_id__), row]));
async function call(fn, data) {
  const response = await fetch(`${base}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${fn}: HTTP ${response.status}: ${result.error || 'request failed'}`);
  return result.data || result;
}
const login = await call('verifyLogin', { username: credentials.user, password: credentials.pass });
if (!login.token) throw new Error('Staff login failed.');
const sample = plan.invoices.slice(0, 20);
const totals = { sampled: sample.length, source_customer_matches_live: 0, plan_customer_matches_live: 0, live_missing: 0 };
for (const row of sample) {
  const result = await call('staffDataRead', { session_token: login.token, entity: 'AllInOneEstimate', id: row.data.estimate_id });
  const live = result.item;
  if (!live?.customer_id) totals.live_missing++;
  if (String(bySource.get(row.source_id)?.customer_id || '') === String(live?.customer_id || '')) totals.source_customer_matches_live++;
  if (String(row.data.customer_id || '') === String(live?.customer_id || '')) totals.plan_customer_matches_live++;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(JSON.stringify(totals));
