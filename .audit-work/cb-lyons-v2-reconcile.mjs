import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const lockPath = '.audit-work/cb-lyons-v2-merge.lock';
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
try { process.kill(lock.pid, 0); throw new Error('Pilot worker is still running.'); }
catch (error) { if (error.code !== 'ESRCH') throw error; }
const plan = JSON.parse(readFileSync('.audit-work/cb-lyons-v2-preview.json', 'utf8'));
const result = JSON.parse(readFileSync('.audit-work/cb-lyons-v2-merge.json', 'utf8'));
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
if (result.status !== 'merged' || result.winner_warning || result.progress_warning || !result.audit_id) throw new Error('Unexpected pilot merge result; requires review.');
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
async function call(fn, data) {
  const response = await fetch(`${base}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
  return body.data || body;
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Staff login failed.');
const read = (payload) => call('staffDataRead', { session_token: login.token, ...payload });
const keep = (await read({ entity: 'Customer', id: plan.keep })).item;
const lose = (await read({ entity: 'Customer', id: plan.lose })).item;
if (lose?.merged_into_customer_id !== plan.keep || lose.customer_status !== 'inactive') throw new Error('Pilot tombstone mismatch.');
if (lose.merge_run?.entities?.CrmSuggestion?.status !== 'skipped_missing_entity') throw new Error('Pilot missing-schema status not persisted.');
if (!Array.isArray(keep?.legacy_client_names) || !keep.legacy_client_names.includes('Lyons & Lyons')) throw new Error('Pilot winner legacy-name readback failed.');
for (const [entity, ids] of Object.entries(plan.linked)) {
  for (const id of ids) {
    const item = (await read({ entity, id })).item;
    if (item?.customer_id !== plan.keep) throw new Error(`${entity} ${id} was not relinked.`);
  }
  const remaining = await read({ entity, query: { customer_id: plan.lose }, limit: 1000 });
  if (!Array.isArray(remaining.items) || remaining.items.length) throw new Error(`${entity} still points at the loser.`);
}
const audit = await read({ entity: 'OpportunityActivity', query: { creation_request_key: plan.audit_key }, limit: 25 });
if (!Array.isArray(audit.items) || audit.items.length !== 1 || audit.items[0].id !== result.audit_id) throw new Error('Pilot audit readback failed.');
const verified = {
  status: result.status, keep: plan.keep, lose: plan.lose, audit_id: result.audit_id,
  linked_estimates: plan.linked.AllInOneEstimate.length, linked_workorders: plan.linked.WorkOrder.length,
  missing_schemas: result.entities.filter((entry) => entry.status === 'skipped_missing_entity').map((entry) => entry.entity),
  initial_readback_error: 'Pilot tombstone readback failed; subsequent read matched.',
};
writeFileSync('.audit-work/cb-lyons-v2-verified.json', JSON.stringify(verified, null, 2));
unlinkSync(lockPath);
console.log(JSON.stringify(verified, null, 2));
