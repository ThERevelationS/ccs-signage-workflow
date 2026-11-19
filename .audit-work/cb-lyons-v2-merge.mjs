import { readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';

const lockPath = '.audit-work/cb-lyons-v2-merge.lock';
const resultPath = '.audit-work/cb-lyons-v2-merge.json';
if (existsSync(resultPath)) throw new Error('Pilot result exists; do not rerun.');
const lock = openSync(lockPath, 'wx');
writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
const preview = JSON.parse(readFileSync('.audit-work/cb-lyons-v2-preview.json', 'utf8'));
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
async function call(fn, data) {
  const response = await fetch(`${base}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
    signal: AbortSignal.timeout(180000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
  return body.data || body;
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Staff login failed.');
const session_token = login.token;
const read = (payload) => call('staffDataRead', { session_token, ...payload });
for (const [id, name] of [[preview.keep, 'Lyons & Lyons Co'], [preview.lose, 'Lyons & Lyons']]) {
  const item = (await read({ entity: 'Customer', id })).item;
  if (item?.company_name !== name || item.merged_into_customer_id) throw new Error('Pilot customer changed; stop.');
}
writeFileSync('.audit-work/cb-lyons-v2-pending.json', JSON.stringify({ keep: preview.keep, lose: preview.lose, submitted_at: new Date().toISOString() }, null, 2));
const result = await call('customerMergeV2', {
  session_token, action: 'merge_customers', keep_id: preview.keep, lose_id: preview.lose, merge_run_key: preview.preview.run_key,
});
writeFileSync(resultPath, JSON.stringify(result, null, 2));
if (result.status !== 'merged' || result.winner_warning || result.progress_warning || !result.audit_id) throw new Error('Pilot merge requires review; do not retry automatically.');
const loser = (await read({ entity: 'Customer', id: preview.lose })).item;
if (loser?.merged_into_customer_id !== preview.keep || loser.customer_status !== 'inactive') throw new Error('Pilot tombstone readback failed.');
for (const [entity, ids] of Object.entries(preview.linked)) {
  for (const id of ids) {
    const row = (await read({ entity, id })).item;
    if (row?.customer_id !== preview.keep) throw new Error(`${entity} ${id} was not relinked.`);
  }
  const remaining = await read({ entity, query: { customer_id: preview.lose }, limit: 1000 });
  if (!Array.isArray(remaining.items) || remaining.items.length) throw new Error(`${entity} still points at the loser.`);
}
const audit = await read({ entity: 'OpportunityActivity', query: { creation_request_key: preview.audit_key }, limit: 25 });
if (!Array.isArray(audit.items) || audit.items.length !== 1 || audit.items[0].id !== result.audit_id) throw new Error('Pilot audit readback failed.');
const verified = {
  status: result.status, keep: preview.keep, lose: preview.lose, audit_id: result.audit_id,
  linked_estimates: preview.linked.AllInOneEstimate.length, linked_workorders: preview.linked.WorkOrder.length,
  missing_schemas: result.entities.filter((entry) => entry.status === 'skipped_missing_entity').map((entry) => entry.entity),
};
writeFileSync('.audit-work/cb-lyons-v2-verified.json', JSON.stringify(verified, null, 2));
closeSync(lock);
unlinkSync(lockPath);
console.log(JSON.stringify(verified, null, 2));
