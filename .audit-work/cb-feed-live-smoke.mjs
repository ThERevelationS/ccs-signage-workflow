import { readFileSync } from 'node:fs';

const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const plan = JSON.parse(readFileSync('.audit-work/cb-inv-plan.json', 'utf8'));
const customer = plan.invoices.find((row) => row.data.customer_display_name === 'Bridgewater Church')?.data.customer_id;
if (!customer) throw new Error('Bridgewater customer not found in plan.');
async function call(fn, body) {
  const res = await fetch(`${base}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const data = await res.json();
  return { status: res.status, data: data.data || data };
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (login.status !== 200 || !login.data.token) throw new Error('Staff login failed.');
const denied = await call('customerHistoryFeed', { action: 'get', customer_id: customer });
if (denied.status !== 401) throw new Error(`Unauthenticated gate returned ${denied.status}, expected 401.`);
const feed = await call('customerHistoryFeed', { session_token: login.data.token, action: 'get', customer_id: customer });
if (feed.status !== 200 || !feed.data.success) throw new Error(`Feed failed: HTTP ${feed.status} ${feed.data.error || ''}`);
console.log(JSON.stringify({ unauthenticated_status: denied.status, customer: 'Bridgewater Church', totals: feed.data.totals, truncated: feed.data.truncated }));
