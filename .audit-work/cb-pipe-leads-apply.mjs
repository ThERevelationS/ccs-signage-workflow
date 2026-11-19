import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';

const plan = JSON.parse(readFileSync('.audit-work/cb-pipe-leads-plan.json', 'utf8'));
if (plan.blocked.length) throw new Error('Lead plan has blockers; do not apply.');
const statePath = '.audit-work/cb-pipe-leads-state.json';
const lockPath = '.audit-work/cb-pipe-leads.lock';
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { pending: null, responses: {}, customers: {}, rows: {}, conflicts: [] };
if (state.pending || existsSync(lockPath)) throw new Error('Prior lead write or worker needs reconciliation.');
writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value || '').toLocaleLowerCase('en-US').replace(/\p{P}/gu, '').replace(/\s+/g, ' ').trim();
let token;
async function call(fn, data) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(`${base}/${fn}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, ...(token ? { session_token: token } : {}) }), signal: AbortSignal.timeout(120000),
      });
    } catch (error) {
      if (error?.cause?.code === 'ECONNREFUSED') throw new Error(`${fn}: connection refused; stop.`);
      if (fn === 'staffDataRead' && attempt < 3) { await sleep(3000 * (attempt + 1)); continue; }
      throw error;
    }
    const body = await response.json();
    if (fn === 'staffDataRead' && response.status === 429 && attempt < 3) { await sleep(15000 * (attempt + 1)); continue; }
    if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
    return body.data || body;
  }
}
async function writeOnce(key, fn, data) {
  if (state.responses[key]) return state.responses[key];
  state.pending = { key, at: new Date().toISOString() }; save();
  const result = await call(fn, data);
  state.responses[key] = result; state.pending = null; save();
  return result;
}
async function readRow(entity, id) {
  const result = await call('staffDataRead', { entity, id });
  if (!result.item?.id) throw new Error(`${entity} row not found.`);
  return result.item;
}
async function allCustomers() {
  const rows = [];
  for (let skip = 0; ; skip += 1000) {
    const result = await call('staffDataRead', { entity: 'Customer', sort: 'created_date', limit: 1000, skip });
    if (!Array.isArray(result.items)) throw new Error('Customer read failed.');
    rows.push(...result.items);
    if (result.items.length < 1000) break;
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('Customer pagination overlaps.');
  return rows.filter((row) => row.deleted !== true && !row.merged_into_customer_id);
}
async function updateOrder(row, customerId) {
  if (state.rows[row.id]) return;
  const fresh = await readRow('WorkOrder', row.id);
  if (fresh.customer_id === customerId) { state.rows[row.id] = { customer_id: customerId, status: 'already_linked' }; save(); return; }
  if (fresh.customer_id || fresh.estimate_id || /\d/.test(String(fresh.est_inv_at || '')) || fresh.deleted === true ||
      normalize(fresh.client_name) !== normalize(row.client_name) || !fresh.updated_date) {
    state.conflicts.push({ id: row.id, reason: 'WorkOrder changed or is no longer eligible.' }); save(); return;
  }
  await writeOnce(`workorder:${row.id}`, 'staffEntityWrite', { entity: 'WorkOrder', op: 'updateMany', id: row.id,
    query: { id: row.id, updated_date: fresh.updated_date }, update: { $set: { customer_id: customerId } } });
  let verified = false;
  for (let i = 0; i < 12; i++) {
    if ((await readRow('WorkOrder', row.id)).customer_id === customerId) { verified = true; break; }
    await sleep(2500);
  }
  if (!verified) throw new Error(`WorkOrder ${row.id} did not read back; inspect before resuming.`);
  state.rows[row.id] = { customer_id: customerId, status: 'linked' }; save();
  await sleep(800);
}
try {
  const login = await call('verifyLogin', { username: credentials.user, password: credentials.pass });
  if (!login.token) throw new Error('Staff login failed.');
  token = login.token;
  const customers = await allCustomers();
  for (const row of plan.existing) {
    const matches = customers.filter((customer) => normalize(customer.company_name) === normalize(row.client_name));
    if (matches.length !== 1 || matches[0].id !== row.customer_id) throw new Error(`Customer match changed for ${row.id}; regenerate plan.`);
  }
  for (const group of plan.new_customers) {
    const matches = customers.filter((customer) => normalize(customer.company_name) === group.normalized_name);
    const created = state.customers[group.data.__source_id__];
    if (matches.some((customer) => customer.id !== created)) throw new Error(`New customer name now matches an existing customer: ${group.data.company_name}`);
  }
  await call('manageMigration', { action: 'get_batch', batch_id: 'cb-customers-2026-11-17' });
  const todo = plan.new_customers.filter((group) => !state.customers[group.data.__source_id__]);
  for (let offset = 0; offset < todo.length; offset += 20) {
    const chunk = todo.slice(offset, offset + 20);
    const ids = chunk.map((group) => group.data.__source_id__);
    const existingLedger = await call('staffDataRead', { entity: 'LegacyMigrationMap',
      query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: { $in: ids } }, limit: 1000 });
    if (!Array.isArray(existingLedger.items) || existingLedger.items.length) throw new Error('A lead customer already has a ledger; inspect.');
    const mapping = Object.fromEntries(chunk.flatMap((group) => Object.keys(group.data).map((key) => [key, key])));
    const started = Date.now();
    const response = await writeOnce(`create-batch:${ids.join(',')}`, 'manageMigration', {
      action: 'import_rows', entity: 'customers', batch_id: 'cb-customers-2026-11-17', rows: chunk.map((group) => group.data),
      mapping, on_duplicate: 'skip', source_label: 'sales_pipeline_leads',
    });
    if (!Array.isArray(response.results) || response.results.length !== chunk.length) throw new Error('Lead creation returned an incomplete batch; inspect.');
    for (let j = 0; j < chunk.length; j++) {
      const group = chunk[j];
      const result = response.results[j];
      if (!result?.target_id || result.source_id !== group.data.__source_id__ || result.status !== 'created') throw new Error(`Lead customer ${group.data.company_name} was not created; inspect.`);
      let verified = false;
      for (let i = 0; i < 12; i++) {
        const item = await readRow('Customer', result.target_id);
        if (item.company_name === group.data.company_name && item.customer_status === 'prospect') { verified = true; break; }
        await sleep(2500);
      }
      if (!verified) throw new Error(`Lead customer ${group.data.company_name} did not read back; inspect.`);
      state.customers[group.data.__source_id__] = result.target_id; save();
    }
    console.log(JSON.stringify({ created_customers: Object.keys(state.customers).length, total: plan.new_customers.length }));
    await sleep(Math.max(0, 16000 - (Date.now() - started)));
  }
  for (const group of plan.new_customers) {
    for (const row of group.rows) await updateOrder(row, state.customers[group.data.__source_id__]);
  }
  for (const row of plan.existing) await updateOrder(row, row.customer_id);
  console.log(JSON.stringify({ customers_created: Object.keys(state.customers).length, workorders: Object.keys(state.rows).length, conflicts: state.conflicts.length }));
  unlinkSync(lockPath);
} catch (error) { console.error(error?.message || String(error)); process.exitCode = 1; }
