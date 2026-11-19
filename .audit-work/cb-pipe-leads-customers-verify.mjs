import { readFileSync, writeFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync('.audit-work/cb-pipe-leads-plan.json', 'utf8'));
const state = JSON.parse(readFileSync('.audit-work/cb-pipe-leads-state.json', 'utf8'));
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
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
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Staff login failed.');
token = login.token;
const differences = [];
let checked = 0;
for (let i = 0; i < plan.new_customers.length; i += 50) {
  const chunk = plan.new_customers.slice(i, i + 50);
  const ids = chunk.map((group) => state.customers[group.data.__source_id__]);
  const sources = chunk.map((group) => group.data.__source_id__);
  const customers = await call('staffDataRead', { entity: 'Customer', query: { id: { $in: ids } }, limit: 1000 });
  const ledgers = await call('staffDataRead', { entity: 'LegacyMigrationMap',
    query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: { $in: sources } }, limit: 1000 });
  if (!Array.isArray(customers.items) || !Array.isArray(ledgers.items)) throw new Error('Readback failed.');
  for (const group of chunk) {
    const data = group.data;
    const id = state.customers[data.__source_id__];
    const customer = customers.items.find((row) => row.id === id);
    const matches = ledgers.items.filter((row) => row.source_id === data.__source_id__);
    const errors = [];
    if (!customer || customer.company_name !== data.company_name || customer.customer_status !== 'prospect') errors.push('identity/status');
    if (!String(customer?.notes || '').includes(data.notes)) errors.push('notes');
    for (const field of ['contact_first_name', 'contact_last_name', 'contact_email', 'contact_office_phone', 'billing_address_1', 'billing_address_2', 'location_address_1', 'location_address_2']) {
      if (!data[field]) continue;
      const actual = String(customer?.[field] || '');
      if (field === 'contact_office_phone' ? actual.replace(/\D/g, '') !== String(data[field]).replace(/\D/g, '') : actual !== data[field]) errors.push(field);
    }
    if (matches.length !== 1 || matches[0].target_id !== id) errors.push('ledger');
    if (errors.length) differences.push({ source_id: data.__source_id__, fields: errors });
    checked++;
  }
}
writeFileSync('.audit-work/cb-pipe-leads-customers-verify.json', JSON.stringify({ checked, differences }, null, 2));
console.log(JSON.stringify({ customers_checked: checked, differences: differences.length }));
if (differences.length) throw new Error('Lead customer readback differs from plan.');
