import { readFileSync } from 'node:fs';

const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const ids = [...new Set(readFileSync('imports/corebridge-2026-11-16/estimate-lines-done.jsonl', 'utf8')
  .split('\n').filter(Boolean).slice(0, 2).map((line) => JSON.parse(line).target_id))];
async function request(name, body) {
  const res = await fetch(`${base}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const result = await res.json();
  return { status: res.status, body: result.data || result };
}
function ensure(response, label) {
  if (response.status !== 200 || !response.body.success) throw new Error(`${label}: HTTP ${response.status}: ${response.body.error || 'request failed'}`);
  return response.body;
}
const login = await request('verifyLogin', { username: creds.user, password: creds.pass });
if (login.status !== 200 || !login.body.token) throw new Error('Staff login failed.');
const session_token = login.body.token;
const denied = await request('corebridgeHistoryImport', { action: 'lookup_links', estimate_ids: ids });
if (denied.status !== 401) throw new Error(`Unauthenticated gate returned ${denied.status}, expected 401.`);
const links = ensure(await request('corebridgeHistoryImport', { session_token, action: 'lookup_links', estimate_ids: ids }), 'lookup_links');
if (links.links.length !== ids.length || ids.some((id) => !links.links.some((x) => x.estimate_id === id))) throw new Error('Estimate $in link lookup did not return all requested IDs.');
const customerId = links.links.find((link) => link.customer_id)?.customer_id;
if (!customerId) throw new Error('Smoke estimates have no resolved customer.');
const missing = ensure(await request('corebridgeHistoryImport', { session_token, action: 'find_by_keys', entity: 'Invoice', keys: ['cb:invoice:synthetic-smoke-a', 'cb:invoice:synthetic-smoke-b'] }), 'find_by_keys');
if (missing.results.length !== 2 || missing.results.some((entry) => entry.matches.length)) throw new Error('Unexpected find_by_keys result.');
const history = ensure(await request('customerHistoryList', { session_token, customer_id: customerId }), 'customerHistoryList');
console.log(JSON.stringify({
  unauthenticated_status: denied.status,
  lookup_requested: ids.length,
  lookup_returned: links.links.length,
  with_customer: links.links.filter((link) => link.customer_id).length,
  find_keys_returned: missing.results.length,
  history_counts: history.counts,
  history_truncated: history.truncated,
}));
