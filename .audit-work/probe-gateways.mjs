// Read-only probe: is staffEntityBulkWrite live, and does staffDataRead find a SCQ row by id?
import { readFileSync } from 'node:fs';
import { permitCreds } from '../scripts/lib/permit-creds.mjs';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const post = async (fn, body) => { const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.text()).slice(0, 400) }; };
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json());
const session_token = login?.token;
console.log('login', !!session_token);
console.log('bulk empty', await post('staffEntityBulkWrite', { session_token, writes: [] }));
const stuck = readFileSync('.audit-work/outbox.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.entity === 'SourceCollectionQueue' && r.op === 'update' && r.attempts > 1);
console.log('stuck SCQ id', stuck.id, stuck.note);
console.log('read by id', await post('staffDataRead', { session_token, entity: 'SourceCollectionQueue', query: { id: stuck.id }, limit: 1 }));
const q = JSON.parse(readFileSync('.audit-work/mirrors/queue.json', 'utf8')).rows;
console.log('id in fresh queue mirror?', q.some((r) => r.id === stuck.id), 'mirror rows', q.length);
const anyId = q[0].id;
console.log('read known id', anyId, (await post('staffDataRead', { session_token, entity: 'SourceCollectionQueue', query: { id: anyId }, limit: 1 })).body.slice(0, 160));
