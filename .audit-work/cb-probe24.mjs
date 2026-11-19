import { readFileSync } from 'node:fs';
import { login, read } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const en = readFileSync(D + 'estimate-enrich-done.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.fields.length);
const map = new Map(readFileSync(D + 'estimate-lines-done.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((x) => [x.source_id, x.target_id]));
await login();
const t = en[5]; const r = await read({ entity: 'AllInOneEstimate', id: map.get(t.source_id) }); const e = r.item || r.items?.[0] || r;
console.log(t, e.estimate_number, e.status, 'log', (e.notes_log || []).length, JSON.stringify((e.notes_log || [])[0]).slice(0, 200));
console.log('line0 notes tail:', String(e.line_items?.[0]?.product_notes || '').slice(0, 600));
