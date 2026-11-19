import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const output = '.audit-work/cb-lyons-v2-preview.json';
if (existsSync(output)) throw new Error('Pilot preview already exists; preserve it.');
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const plan = JSON.parse(readFileSync('.audit-work/cb-customer-decisions-plan.json', 'utf8'));
const decision = plan.decisions.find((item) => item.accounts.includes(488));
if (!decision || decision.blockers.length) throw new Error('Lyons decision is not ready.');
const keep = decision.names.find((item) => item.name === decision.keep).matches[0].id;
const lose = decision.names.find((item) => item.name === decision.merge[0]).matches[0].id;
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
const probe = JSON.parse(readFileSync('.audit-work/cb-lyons-v2-probe.json', 'utf8'));
if (probe.options_supported !== false) {
  throw new Error(`Unexpected options-object probe: ${JSON.stringify(probe)}`);
}
const read = (payload) => call('staffDataRead', { session_token, ...payload });
const keepRow = (await read({ entity: 'Customer', id: keep })).item;
const loseRow = (await read({ entity: 'Customer', id: lose })).item;
if (keepRow?.company_name !== decision.keep || loseRow?.company_name !== decision.merge[0] || keepRow.merged_into_customer_id || loseRow.merged_into_customer_id) {
  throw new Error('Pilot customers changed since planning.');
}
const linked = {};
for (const entity of ['AllInOneEstimate', 'WorkOrder']) {
  const result = await read({ entity, query: { customer_id: lose }, sort: 'created_date', limit: 1000 });
  if (!Array.isArray(result.items) || result.items.length >= 1000) throw new Error(`Incomplete ${entity} read.`);
  linked[entity] = result.items.map((row) => row.id);
}
const auditKey = `custmerge-audit:custmerge:${keep}:${lose}`;
const audit = await read({ entity: 'OpportunityActivity', query: { creation_request_key: auditKey }, limit: 25 });
if (!Array.isArray(audit.items) || audit.items.length) throw new Error('Pilot audit key already exists.');
const preview = await call('customerMergeV2', { session_token, action: 'preview_customer_merge', keep_id: keep, lose_id: lose });
if (!preview.ok || preview.entities.some((entry) => entry.error)) throw new Error(`Pilot preview failed: ${preview.reason || 'entity lookup error'}`);
for (const entity of Object.keys(linked)) {
  const match = preview.entities.find((entry) => entry.entity === entity);
  if (match?.linked !== linked[entity].length) throw new Error(`${entity} live count differs from preview.`);
}
const record = { at: new Date().toISOString(), keep, lose, audit_key: auditKey, probe, linked, preview };
writeFileSync(output, JSON.stringify(record, null, 2));
console.log(JSON.stringify({
  options_probe: probe, keep, lose, linked_estimates: linked.AllInOneEstimate.length,
  linked_workorders: linked.WorkOrder.length,
  missing_schemas: preview.entities.filter((entry) => entry.status === 'skipped_missing_entity').map((entry) => entry.entity),
  warnings: preview.warnings,
}, null, 2));
