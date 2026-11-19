import { readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const planPath = '.audit-work/cb-customer-decisions-plan.json';
const statePath = '.audit-work/cb-customer-decisions-state.json';
const lockPath = '.audit-work/cb-customer-decisions.lock';
const batch = 'cb-customers-2026-11-17';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const atomic = (path, value) => { writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2)); renameSync(`${path}.tmp`, path); };
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { pending: null, responses: {}, accounts: {}, merges: {}, blocked: [] };
if (state.pending) throw new Error('A prior write outcome is ambiguous; reconcile it before continuing.');
const lock = openSync(lockPath, 'wx');
writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
const builder = readFileSync('.audit-work/cb-build.cjs', 'utf8');
const cutoff = builder.indexOf('const newRows =');
if (cutoff < 0) throw new Error('Original customer-row builder changed.');
const builderModule = { exports: {} };
runInNewContext(`${builder.slice(0, cutoff)}\nmodule.exports={customerRow,cbById};`, {
  require: createRequire(import.meta.url), module: builderModule, exports: builderModule.exports, console, Map, Set, Number, String, Array, Object,
});
const { customerRow, cbById } = builderModule.exports;
const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token;
async function call(fn, payload) {
  const response = await fetch(`${base}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, ...(token ? { session_token: token } : {}) }), signal: AbortSignal.timeout(180000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
  return body.data || body;
}
async function writeOnce(key, fn, payload) {
  if (state.responses[key]) return state.responses[key];
  if (state.pending) throw new Error('Pending mutation requires reconciliation.');
  state.pending = { key, fn, at: new Date().toISOString() };
  atomic(statePath, state);
  const result = await call(fn, payload);
  state.responses[key] = result;
  state.pending = null;
  atomic(statePath, state);
  await sleep(1500);
  return result;
}
async function read(payload) { return call('staffDataRead', payload); }
async function findCustomer(name) {
  const result = await read({ entity: 'Customer', query: { company_name: name }, limit: 1000 });
  if (!Array.isArray(result.items) || result.items.length >= 1000) throw new Error(`Customer lookup incomplete: ${name}`);
  return result.items.filter((row) => row.company_name === name);
}
async function getCustomer(id) {
  const result = await read({ entity: 'Customer', id });
  if (!result.item?.id) throw new Error('Customer lookup failed.');
  return result.item;
}
async function getLedger(sourceId) {
  const result = await read({ entity: 'LegacyMigrationMap', query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: String(sourceId) }, limit: 25 });
  if (!Array.isArray(result.items) || result.items.length >= 25) throw new Error('Customer ledger lookup incomplete.');
  return result.items;
}
async function expectEventually(fn, predicate, label) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const value = await fn();
    if (predicate(value)) return value;
    await sleep(2500);
  }
  throw new Error(`${label} did not read back as expected.`);
}
const identity = (row) => Object.fromEntries(Object.keys(row).map((key) => [key, key]));
const empty = (value) => value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
const AUTH = new Set(['pricing_tier', 'customer_status', 'is_active', '__source_id__', 'company_name']);
function updateRow(account, current) {
  const full = customerRow(account);
  const row = {};
  for (const [key, value] of Object.entries(full)) {
    if (AUTH.has(key) || empty(current[key]) || (key === 'tax_exempt' && value === true) || (key === 'require_purchase_order' && value === true)) row[key] = value;
  }
  row.company_name = current.company_name;
  row.notes = empty(current.notes) ? full.notes : `${current.notes}\n${full.notes}`;
  for (const key of ['billing_contact_same', 'location_same_as_billing', 'send_monthly_statements']) {
    if (!empty(current[key]) && current[key] !== full[key] && !(key in row)) row[key] = full[key];
  }
  if (!empty(current.billing_country)) row.billing_country = current.billing_country;
  return row;
}
async function importRow(key, row, onDuplicate) {
  const response = await writeOnce(key, 'manageMigration', {
    action: 'import_rows', batch_id: batch, entity: 'customers', rows: [row],
    mapping: identity(row), on_duplicate: onDuplicate, source_label: 'corebridge_account_sweep',
  });
  const result = response.results?.[0];
  if (!result || result.status === 'error' || !result.target_id) throw new Error(`${key}: mapper did not return a target (${result?.error || result?.status || 'missing result'}).`);
  return result;
}
try {
  const login = await call('verifyLogin', { username: credentials.user, password: credentials.pass });
  if (!login.token) throw new Error('Staff login failed.');
  token = login.token;
  await call('manageMigration', { action: 'get_batch', batch_id: batch });
  for (const decision of plan.decisions) {
    if (decision.blockers.length) { state.blocked.push({ accounts: decision.accounts, reasons: decision.blockers }); atomic(statePath, state); continue; }
    let keep;
    if (decision.keep) {
      const matches = await findCustomer(decision.keep);
      if (matches.length !== 1 || matches[0].merged_into_customer_id) {
        state.blocked.push({ accounts: decision.accounts, reasons: [`${decision.keep}: ${matches.length} matches or merged`] });
        atomic(statePath, state); continue;
      }
      keep = matches[0].id;
    } else if (state.accounts[String(decision.accounts[0])]?.target_id) {
      keep = state.accounts[String(decision.accounts[0])].target_id;
      if ((await getCustomer(keep)).company_name !== decision.create) throw new Error('Previously created customer changed.');
    } else {
      const matches = await findCustomer(decision.create);
      if (matches.length) {
        state.blocked.push({ accounts: decision.accounts, reasons: [`New customer name ${decision.create} already exists`] });
        atomic(statePath, state); continue;
      }
    }
    let namesValid = true;
    for (const name of decision.merge || []) {
      const rows = await findCustomer(name);
      if (rows.length !== 1 || (rows[0].merged_into_customer_id && rows[0].merged_into_customer_id !== keep)) {
        state.blocked.push({ accounts: decision.accounts, reasons: [`${name}: ${rows.length} matches or merged elsewhere`] });
        namesValid = false;
      }
    }
    if (!namesValid) { atomic(statePath, state); continue; }

    for (const accountId of decision.accounts) {
      const id = String(accountId);
      if (state.accounts[id]?.complete) continue;
      const account = cbById.get(accountId);
      if (!account) throw new Error(`Archive account ${id} missing.`);
      if (decision.create) {
        const previous = await getLedger(id);
        if (previous.length && !state.responses[`create:${id}`]) throw new Error(`Unexpected preexisting ledger ${id}.`);
        const full = customerRow(account);
        if (full.company_name !== decision.create) throw new Error('Archive name differs from approved create name.');
        const created = await importRow(`create:${id}`, full, 'skip');
        if (created.status !== 'created') throw new Error(`Customer ${id} was not newly created.`);
        keep = created.target_id;
        await expectEventually(() => getCustomer(keep), (row) => row.company_name === decision.create, `Customer ${id}`);
        await expectEventually(() => getLedger(id), (rows) => rows.length === 1 && rows[0].target_id === keep, `Ledger ${id}`);
        state.accounts[id] = { action: 'created', target_id: keep, complete: true };
      } else {
        const ledger = await getLedger(id);
        if (ledger.length && !state.responses[`link:${id}`]) throw new Error(`Unexpected preexisting ledger ${id}.`);
        if (!ledger.length) {
          await writeOnce(`link:${id}`, 'staffEntityWrite', {
            entity: 'LegacyMigrationMap', op: 'create', data: {
              source_app_id: 'corebridge', source_entity: 'customers', source_id: id, target_entity: 'Customer', target_id: keep,
              migration_batch: batch, notes: JSON.stringify({ status: 'linked', matched_existing: true, at: new Date().toISOString() }),
            },
          });
        }
        await expectEventually(() => getLedger(id), (rows) => rows.length === 1 && rows[0].target_id === keep, `Ledger ${id}`);
        const current = await getCustomer(keep);
        const row = updateRow(account, current);
        const updated = await importRow(`update:${id}`, row, 'update');
        if (updated.status !== 'updated' || updated.target_id !== keep) throw new Error(`Customer ${id} update returned an unexpected target.`);
        await expectEventually(() => getCustomer(keep), (result) =>
          result.company_name === current.company_name && result.customer_status === row.customer_status &&
          Number(result.pricing_tier) === Number(row.pricing_tier) && result.is_active === row.is_active &&
          (empty(current.billing_country) || result.billing_country === current.billing_country), `Customer ${id}`);
        state.accounts[id] = { action: 'attached', target_id: keep, complete: true };
      }
      atomic(statePath, state);
      console.log(JSON.stringify({ account: accountId, ...state.accounts[id] }));
    }

    for (const name of decision.merge || []) {
      const rows = await findCustomer(name);
      if (rows.length !== 1) throw new Error(`Merge name ${name} is no longer unique.`);
      const lose = rows[0].id;
      const mergeKey = `${keep}:${lose}`;
      if (rows[0].merged_into_customer_id === keep) {
        state.merges[mergeKey] = { name, keep, lose, status: 'already_merged' };
        atomic(statePath, state); continue;
      }
      if (rows[0].merged_into_customer_id) throw new Error(`Merge name ${name} is already merged elsewhere.`);
      const preview = await call('customerMergeV2', { action: 'preview_customer_merge', keep_id: keep, lose_id: lose });
      if (!preview.ok || preview.entities?.some((entry) => entry.error)) throw new Error(`Merge preview failed for ${name}: ${preview.reason || 'entity error'}`);
      const merged = await writeOnce(`merge:${mergeKey}`, 'customerMergeV2', { action: 'merge_customers', keep_id: keep, lose_id: lose, merge_run_key: preview.run_key });
      if (merged.status !== 'merged' || merged.winner_warning || merged.progress_warning || !merged.audit_id) throw new Error(`Merge ${name} returned ${merged.status} or warnings; review before resuming.`);
      await expectEventually(() => getCustomer(lose), (row) => row.merged_into_customer_id === keep && row.customer_status === 'inactive', `Merge ${name}`);
      state.merges[mergeKey] = { name, keep, lose, status: merged.status, audit_id: merged.audit_id, missing_schemas: merged.entities.filter((entry) => entry.status === 'skipped_missing_entity').map((entry) => entry.entity) };
      atomic(statePath, state);
      console.log(JSON.stringify({ merge: name, keep, lose, status: merged.status }));
    }
  }
  console.log(JSON.stringify({ complete_accounts: Object.keys(state.accounts).length, merges: Object.keys(state.merges).length, blocked: state.blocked.length }));
  closeSync(lock);
  unlinkSync(lockPath);
} catch (error) {
  console.error(error?.message || String(error));
  closeSync(lock);
  process.exitCode = 1;
}
