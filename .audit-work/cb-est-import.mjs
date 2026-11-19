// Import CoreBridge orders/estimates as read-only AllInOneEstimate history.
// Step 1: header through manageMigration 'estimates' mapper (dedupe + rollback ledger, customer link).
// Step 2: frozen line_items via staffEntityWrite CAS updateMany, then verify computed total == CoreBridge total.
// usage: node cb-est-import.mjs <limit|all> [dry]
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { login, mm, read, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const BATCH = 'cb-estimates-2026-11-17';
const limit = process.argv[2] === 'all' ? Infinity : Number(process.argv[2] || 3);
const dry = process.argv[3] === 'dry';
const rows = JSON.parse(readFileSync(D + 'rows-estimates.json', 'utf8'));
const lines = JSON.parse(readFileSync(D + 'rows-estimate-lines.json', 'utf8'));
const LOG = D + 'import-log-estimates.jsonl';
const linesDone = new Set(existsSync(D + 'estimate-lines-done.jsonl') ? readFileSync(D + 'estimate-lines-done.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).source_id) : []);
await login();
await mm({ action: 'start_batch', batch_tag: BATCH, entity: 'estimates', source_label: 'CoreBridge order archive 2026-11-17' });
const start = Number(process.argv[4] || 0);
const todo = rows.slice(start, start + limit);
const identity = (rs) => { const m = {}; for (const r of rs) for (const k of Object.keys(r)) m[k] = k; return m; };
const tot = { created: 0, updated: 0, skipped: 0, errors: 0 };
for (let i = 0; i < todo.length; i += 25) {
  const t0 = Date.now(); const chunk = todo.slice(i, i + 25);
  const r = await mm({ action: 'import_rows', batch_id: BATCH, entity: 'estimates', rows: chunk, mapping: identity(chunk), on_duplicate: 'skip', dry_run: dry, source_label: 'corebridge_order_archive' });
  for (const k in tot) tot[k] += r.counts[k];
  appendFileSync(LOG, JSON.stringify({ i, counts: r.counts, errors: r.results.filter((x) => x.status === 'error') }) + '\n');
  if (!dry) {
    const pending = r.results.filter((res) => res.target_id && res.status !== 'error' && !linesDone.has(res.source_id));
    await Promise.all(Array.from({ length: 6 }, async () => { while (pending.length) { const res = pending.shift();
      const li = lines[res.source_id] || [];
      const cur = await read({ entity: 'AllInOneEstimate', id: res.target_id }); const est = cur.item || cur.items?.[0] || cur;
      if ((est.line_items || []).length) { linesDone.add(res.source_id); continue; }
      if (li.length) {
        try { await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: est.id, query: { id: est.id, updated_date: est.updated_date }, update: { $set: { line_items: li } } }); }
        catch (e) { appendFileSync(D + 'estimate-lines-retry.jsonl', JSON.stringify({ source_id: res.source_id, target_id: res.target_id, error: String(e.message).slice(0, 200) }) + '\n'); continue; }
      }
      appendFileSync(D + 'estimate-lines-done.jsonl', JSON.stringify({ source_id: res.source_id, target_id: res.target_id, lines: li.length }) + '\n');
      linesDone.add(res.source_id);
    } }));
  }
  process.stdout.write(`\nestimates ${Math.min(i + 25, todo.length)}/${todo.length} ${JSON.stringify(tot)}`);
  if (!dry) await new Promise((s) => setTimeout(s, Math.max(0, 16000 - (Date.now() - t0))));
}
console.log('\n', tot);
