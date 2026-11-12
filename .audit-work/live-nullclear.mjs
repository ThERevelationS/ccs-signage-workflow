// O-012 residual — live entity null-clear confirmation on receipt retirement.
// Creates a real FoundationProject with a populated builder_sync_attempt
// receipt, CAS-nulls it via staffEntityWrite updateMany, reads back —
// confirms the entity layer honors null-clear writes live (the receipt-
// retirement write the resolver relies on).
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const r = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const call = (fn, payload) => fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, session_token: r.token }) }).then((x) => x.json()).then((d) => d?.data || d);

const receipt = { schema_version: 1, key: 'live-nullclear-probe', source_project_id: 'PENDING', estimate_id: 'missing-estimate-404', requested_at: new Date().toISOString() };
const created = await call('staffEntityWrite', { entity: 'FoundationProject', op: 'create', data: { project_name: '[LIVE-NULLCLEAR] probe', client_name: '[LIVE-NULLCLEAR] probe co', builder_sync_attempt: receipt } });
const id = created?.record?.id;
console.log('create →', id || JSON.stringify(created).slice(0, 200));
if (!id) process.exit(1);

// populate the receipt's source_project_id + read fresh (unique limit busts cache)
const got1 = await call('staffDataRead', { entity: 'FoundationProject', id, limit: 61 });
console.log('pre-clear receipt →', JSON.stringify(got1?.item?.builder_sync_attempt));

// the resolver's retirement write — CAS-null through updateMany
const upd = await call('staffEntityWrite', { entity: 'FoundationProject', op: 'updateMany', id, query: { id, updated_date: got1?.item?.updated_date }, update: { $set: { builder_sync_attempt: null } } });
console.log('null-clear →', JSON.stringify(upd?.result || upd).slice(0, 200));

const got2 = await call('staffDataRead', { entity: 'FoundationProject', id, limit: 62 });
const after = got2?.item?.builder_sync_attempt;
console.log('post-clear receipt →', JSON.stringify(after));
console.log(after === null || after === undefined ? 'PASS null-clear confirmed live' : `FAIL receipt still populated: ${JSON.stringify(after)}`);
