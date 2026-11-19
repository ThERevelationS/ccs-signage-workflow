import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const applyMode = process.argv.includes('--apply');
const path = '.audit-work/cb-held-estimate-plan.json';
const statePath = '.audit-work/cb-held-estimate-state.json';
const lockPath = '.audit-work/cb-held-estimate.lock';
const D = 'imports/corebridge-2026-11-16/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (!applyMode && existsSync(path)) throw new Error('Estimate plan exists; preserve it.');
if (applyMode && existsSync(lockPath)) throw new Error('Estimate worker lock exists; inspect before proceeding.');
const credentials = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const decisions = JSON.parse(readFileSync('.audit-work/cb-customer-decisions-plan.json', 'utf8'));
const accountIds = new Set(decisions.decisions.flatMap((entry) => entry.accounts.map(String)));
const archiveRows = JSON.parse(readFileSync(`${D}rows-estimates.json`, 'utf8')).filter((row) => accountIds.has(String(row.customer_id)));
const doneRows = readFileSync(`${D}estimate-lines-done.jsonl`, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const targetBySource = new Map();
for (const row of doneRows) {
  if (targetBySource.has(row.source_id) && targetBySource.get(row.source_id) !== row.target_id) throw new Error(`Duplicate estimate source ${row.source_id}.`);
  targetBySource.set(row.source_id, row.target_id);
}
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token;
async function call(fn, payload, write = false) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/${fn}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, ...(token ? { session_token: token } : {}) }), signal: AbortSignal.timeout(120000),
    });
    const body = await response.json();
    if (!write && response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
    if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
    return body.data || body;
  }
}
const login = await call('verifyLogin', { username: credentials.user, password: credentials.pass });
if (!login.token) throw new Error('Staff login failed.');
token = login.token;
const source = readFileSync('.audit-work/cb-inv-import.mjs', 'utf8');
const begin = source.indexOf('async function readAction');
const end = source.indexOf('const method =');
const snippet = source.slice(begin, end).replace('async function readAction', 'async function savedReadAction');
const module = { exports: {} };
runInNewContext(`${snippet}\nmodule.exports={savedReadAction};`, { module, exports: module.exports, raw: (fn, payload) => call(fn, payload).then((body) => ({ status: 200, body })), sleep, Error });
const historyRead = module.exports.savedReadAction;
if (!applyMode) {
  const maps = await call('staffDataRead', {
    entity: 'LegacyMigrationMap', query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: { $in: [...accountIds] } }, limit: 1000,
  });
  if (!Array.isArray(maps.items)) throw new Error('Customer ledger read failed.');
  const byAccount = new Map();
  for (const row of maps.items) {
    const id = String(row.source_id);
    if (byAccount.has(id)) throw new Error(`Duplicate customer ledger ${id}.`);
    if (row.target_id && row.target_id !== '__error__') byAccount.set(id, row.target_id);
  }
  const missingAccounts = [...accountIds].filter((id) => !byAccount.has(id));
  const eligible = archiveRows.filter((row) => byAccount.has(String(row.customer_id)));
  const missingTargets = eligible.filter((row) => !targetBySource.has(row.__source_id__)).map((row) => row.__source_id__);
  if (missingTargets.length) throw new Error(`Estimate target IDs missing: ${missingTargets.length}.`);
  const rows = [];
  for (let i = 0; i < eligible.length; i += 150) {
    const chunk = eligible.slice(i, i + 150);
    const result = await historyRead({ action: 'lookup_links', estimate_ids: chunk.map((row) => targetBySource.get(row.__source_id__)) });
    if (!Array.isArray(result.links)) throw new Error('lookup_links shape changed.');
    const links = new Map(result.links.map((row) => [row.estimate_id, row]));
    for (const item of chunk) {
      const estimateId = targetBySource.get(item.__source_id__);
      const link = links.get(estimateId);
      if (!link) throw new Error(`Estimate link missing ${item.__source_id__}.`);
      rows.push({ source_id: item.__source_id__, estimate_id: estimateId, account_id: String(item.customer_id),
        expected_customer_id: byAccount.get(String(item.customer_id)), current_customer_id: link.customer_id || '', work_order_ids: link.work_order_ids || [] });
    }
    await sleep(1000);
  }
  const conflicts = rows.filter((row) => row.current_customer_id && row.current_customer_id !== row.expected_customer_id);
  const pending = rows.filter((row) => !row.current_customer_id);
  const report = { generated_at: new Date().toISOString(), missing_accounts: missingAccounts, counts: { archive_rows: archiveRows.length, eligible: rows.length, already_linked: rows.length - conflicts.length - pending.length, pending: pending.length, conflicts: conflicts.length }, rows };
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.counts));
  console.log(JSON.stringify({ missing_accounts: missingAccounts, conflicts: conflicts.slice(0, 5) }));
  if (conflicts.length || missingAccounts.length) throw new Error('Resolve missing accounts or conflicting estimate links before applying.');
} else {
  const plan = JSON.parse(readFileSync(path, 'utf8'));
  if (plan.missing_accounts.length || plan.counts.conflicts) throw new Error('Estimate plan has blockers.');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { complete: {}, pending: null, conflicts: [] };
  if (state.pending) throw new Error('Estimate update is ambiguous; reconcile before proceeding.');
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  try {
    for (const row of plan.rows.filter((item) => !item.current_customer_id && !state.complete[item.source_id])) {
      const fresh = (await call('staffDataRead', { entity: 'AllInOneEstimate', id: row.estimate_id })).item;
      if (!fresh?.id || !fresh.updated_date) throw new Error(`Estimate unavailable ${row.source_id}.`);
      if (fresh.customer_id && fresh.customer_id !== row.expected_customer_id) {
        state.conflicts.push({ source_id: row.source_id, current: fresh.customer_id, expected: row.expected_customer_id }); save(); continue;
      }
      if (!fresh.customer_id) {
        state.pending = { source_id: row.source_id, estimate_id: row.estimate_id, at: new Date().toISOString() }; save();
        await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: fresh.id,
          query: { id: fresh.id, updated_date: fresh.updated_date }, update: { $set: { customer_id: row.expected_customer_id } } }, true);
        let matched = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          const check = await call('staffDataRead', { entity: 'AllInOneEstimate', id: row.estimate_id });
          if (check.item?.customer_id === row.expected_customer_id) { matched = true; break; }
          await sleep(2500);
        }
        if (!matched) throw new Error(`Estimate readback failed ${row.source_id}.`);
        state.pending = null;
      }
      state.complete[row.source_id] = row.estimate_id; save();
      if (Object.keys(state.complete).length % 25 === 0) console.log(JSON.stringify({ linked: Object.keys(state.complete).length, conflicts: state.conflicts.length }));
      await sleep(800);
    }
    console.log(JSON.stringify({ linked: Object.keys(state.complete).length, conflicts: state.conflicts.length }));
    const { unlinkSync } = await import('node:fs');
    unlinkSync(lockPath);
  } catch (error) { console.error(error?.message || String(error)); process.exitCode = 1; }
}
