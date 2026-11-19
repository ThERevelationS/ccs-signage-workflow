// Ensure every imported estimate has its frozen line items. Uses the LegacyMigrationMap ledger for ids.
import { readFileSync, appendFileSync } from 'node:fs';
import { login, read, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const lines = JSON.parse(readFileSync(D + 'rows-estimate-lines.json', 'utf8'));
await login();
const maps = []; for (let s = 0; ; s += 1000) { const p = await read({ entity: 'LegacyMigrationMap', query: { source_entity: 'estimates' }, limit: 1000, skip: s, sort: 'created_date' }); maps.push(...p.items); if (p.items.length < 1000) break; }
const good = maps.filter((m) => m.target_id && m.target_id !== '__error__');
const done = new Set(readFileSync(D + 'estimate-lines-done.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).source_id));
const todo = good.filter((m) => (lines[m.source_id] || []).length && !done.has(m.source_id));
console.log(`map rows ${good.length}, need-lines candidates ${todo.length}`);
let ok = 0, had = 0, fail = 0;
for (const m of todo) {
  try {
    const r = await read({ entity: 'AllInOneEstimate', id: m.target_id }); const e = r.item || r.items?.[0] || r;
    if ((e.line_items || []).length) had++;
    else { await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: e.id, query: { id: e.id, updated_date: e.updated_date }, update: { $set: { line_items: lines[m.source_id] } } }); ok++; }
    appendFileSync(D + 'estimate-lines-done.jsonl', JSON.stringify({ source_id: m.source_id, target_id: m.target_id, lines: lines[m.source_id].length, fixed: true }) + '\n');
  } catch (x) { fail++; console.log('fail', m.source_id, String(x.message).slice(0, 120)); }
  await new Promise((s) => setTimeout(s, 200));
}
console.log({ wrote: ok, already_had: had, failed: fail });
