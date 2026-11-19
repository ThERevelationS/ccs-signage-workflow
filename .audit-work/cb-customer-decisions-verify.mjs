import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const output = '.audit-work/cb-customer-decisions-verify.json';
if (existsSync(output)) throw new Error('Verification report exists; preserve it.');
if (existsSync('.audit-work/cb-customer-decisions.lock')) throw new Error('Customer worker is still active or requires recovery.');
const state = JSON.parse(readFileSync('.audit-work/cb-customer-decisions-state.json', 'utf8'));
const pilot = JSON.parse(readFileSync('.audit-work/cb-lyons-v2-verified.json', 'utf8'));
if (state.pending || state.blocked.length) throw new Error('Customer decisions unresolved.');
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let token;
async function call(fn, data) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/${fn}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...data, ...(token ? { session_token: token } : {}) }), signal: AbortSignal.timeout(120000),
    });
    const body = await response.json();
    if (response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
    if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
    return body.data || body;
  }
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Staff login failed.');
token = login.token;
const read = (data) => call('staffDataRead', data);
const issues = [];
const accounts = [];
for (const [source, info] of Object.entries(state.accounts)) {
  const result = await read({ entity: 'LegacyMigrationMap', query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: source }, limit: 25 });
  if (!Array.isArray(result.items) || result.items.length !== 1 || result.items[0].target_id !== info.target_id) issues.push({ source, error: 'Ledger missing, duplicate, or wrong target.' });
  const customer = (await read({ entity: 'Customer', id: info.target_id })).item;
  if (!customer || customer.merged_into_customer_id) issues.push({ source, error: 'Customer missing or merged.' });
  accounts.push({ account: source, action: info.action, target_id: info.target_id, customer_name: customer?.company_name });
  await sleep(500);
}
const merges = [];
for (const item of Object.values(state.merges)) {
  const loser = (await read({ entity: 'Customer', id: item.lose })).item;
  if (loser?.merged_into_customer_id !== item.keep || loser?.customer_status !== 'inactive') issues.push({ lose: item.lose, error: 'Tombstone mismatch.' });
  for (const entity of ['WorkOrder', 'AllInOneEstimate']) {
    const rows = await read({ entity, query: { customer_id: item.lose }, limit: 1000 });
    if (!Array.isArray(rows.items) || rows.items.length) issues.push({ lose: item.lose, entity, error: 'References remain or lookup failed.' });
  }
  const auditId = item.audit_id || (item.lose === pilot.lose ? pilot.audit_id : '');
  const audit = await read({ entity: 'OpportunityActivity', query: { creation_request_key: `custmerge-audit:custmerge:${item.keep}:${item.lose}` }, limit: 25 });
  if (!Array.isArray(audit.items) || audit.items.length !== 1 || audit.items[0].id !== auditId) issues.push({ lose: item.lose, error: 'Audit missing or duplicated.' });
  merges.push({ ...item, audit_id: auditId });
  await sleep(500);
}
const report = { accounts, merges, issues };
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ accounts: accounts.length, merges: merges.length, issues: issues.length }));
if (issues.length) throw new Error('Customer decision readback contains errors.');
