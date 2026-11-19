import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const output = '.audit-work/cb-pipe-leads-plan.json';
if (existsSync(output)) throw new Error('Lead plan already exists; preserve it.');
const source = JSON.parse(readFileSync('.audit-work/cb-pipe-customer-original-plan.json', 'utf8'));
const ids = new Set(source.none.map((row) => row.id));
if (ids.size !== source.none.length) throw new Error('Duplicate WorkOrder in source plan.');
const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
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
const login = await call('verifyLogin', { username: credentials.user, password: credentials.pass });
if (!login.token) throw new Error('Staff login failed.');
token = login.token;
async function all(entity) {
  const rows = [];
  for (let skip = 0; ; skip += 1000) {
    const response = await call('staffDataRead', { entity, sort: 'created_date', limit: 1000, skip });
    if (!Array.isArray(response.items)) throw new Error(`${entity} page read failed.`);
    rows.push(...response.items);
    if (response.items.length < 1000) break;
    await sleep(1000);
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`${entity} page overlap.`);
  return rows;
}
const customers = (await all('Customer')).filter((row) => row.id && row.deleted !== true && !row.merged_into_customer_id);
const workorders = await all('WorkOrder');
const normalize = (value) => String(value || '').toLocaleLowerCase('en-US').replace(/\p{P}/gu, '').replace(/\s+/g, ' ').trim();
const byName = new Map();
for (const customer of customers) {
  const key = normalize(customer.company_name);
  if (!key) continue;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(customer);
}
const blocked = [];
const existing = [];
const groups = new Map();
let noLongerEligible = 0;
for (const row of workorders.filter((item) => ids.has(item.id))) {
  if (row.deleted === true || row.customer_id || row.estimate_id || /\d/.test(String(row.est_inv_at || ''))) { noLongerEligible++; continue; }
  const key = normalize(row.client_name);
  if (!key) { blocked.push({ id: row.id, reason: 'Missing client name.' }); continue; }
  const matches = byName.get(key) || [];
  if (matches.length > 1) { blocked.push({ id: row.id, reason: 'Multiple normalized Customer matches.', matches: matches.map((item) => ({ id: item.id, company_name: item.company_name })) }); continue; }
  if (matches.length === 1) { existing.push({ id: row.id, updated_date: row.updated_date, client_name: row.client_name, customer_id: matches[0].id }); continue; }
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const found = new Set(workorders.filter((row) => ids.has(row.id)).map((row) => row.id));
for (const id of ids) if (!found.has(id)) blocked.push({ id, reason: 'WorkOrder unavailable.' });
const mostCommon = (values) => {
  const counts = new Map();
  for (const value of values.map((value) => String(value || '').trim()).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
};
const newCustomers = [...groups].map(([key, rows]) => {
  const name = mostCommon(rows.map((row) => row.client_name));
  const ids = rows.map((row) => row.id).sort();
  const sourceId = `pipeline-lead:${createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 24)}`;
  const contactName = mostCommon(rows.map((row) => row.contact_name));
  const parts = contactName.split(/\s+/).filter(Boolean);
  const data = {
    __source_id__: sourceId, company_name: name, customer_status: 'prospect',
    notes: `Created from Sales Pipeline lead row(s) ${ids.join(', ')} — no CoreBridge estimate`,
    contact_first_name: parts[0] || '', contact_last_name: parts.slice(1).join(' '),
    contact_email: mostCommon(rows.map((row) => row.contact_email)), contact_office_phone: mostCommon(rows.map((row) => row.contact_phone)),
    billing_address_1: mostCommon(rows.map((row) => row.billing_address)), billing_address_2: mostCommon(rows.map((row) => row.billing_address_line_2)),
    location_address_1: mostCommon(rows.map((row) => row.install_location)), location_address_2: mostCommon(rows.map((row) => row.address_line_2)),
  };
  for (const field of Object.keys(data)) if (data[field] === '') delete data[field];
  if (customers.some((customer) => customer.company_name === name)) blocked.push({ name, reason: 'New customer name already exists exactly.' });
  return { normalized_name: key, data, rows: rows.map((row) => ({ id: row.id, updated_date: row.updated_date, client_name: row.client_name })) };
});
const plan = { generated_at: new Date().toISOString(), summary: {
  original_rows: ids.size, no_longer_eligible: noLongerEligible, linked_existing: existing.length,
  new_customers: newCustomers.length, rows_for_new_customers: newCustomers.reduce((sum, group) => sum + group.rows.length, 0), blocked: blocked.length,
}, existing, new_customers: newCustomers, blocked };
writeFileSync(output, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan.summary, null, 2));
if (blocked.length) console.log(JSON.stringify({ blockers: blocked }));
