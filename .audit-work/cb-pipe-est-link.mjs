// Link Sales Pipeline WorkOrders to imported CoreBridge estimates by the EST/INV number in est_inv_at
// (or OrderId in corbridge_link). Fills an EMPTY estimate_id only (not a Smartsheet-mapped field). CAS writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { login, read, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const mode = process.argv[2] || 'plan';
const done = readFileSync(D + 'estimate-lines-done.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const bySource = new Map(done.map((d) => [d.source_id, d.target_id]));
const rows = JSON.parse(readFileSync(D + 'rows-estimates.json', 'utf8'));
const byDigits = new Map();
for (const r of rows) { const dgt = String(r.estimate_number || '').replace(/\D/g, ''); if (!dgt || !bySource.has(r.__source_id__)) continue; if (!byDigits.has(dgt)) byDigits.set(dgt, []); byDigits.get(dgt).push({ source: r.__source_id__, number: r.estimate_number, status: r.status }); }
await login();
const all = []; for (let s = 0; ; s += 1000) { const p = await read({ entity: 'WorkOrder', limit: 1000, skip: s, sort: 'created_date' }); all.push(...p.items); if (p.items.length < 1000) break; }
const plan = [], ambiguous = [], none = [];
for (const w of all) {
  if (w.estimate_id) continue;
  const viaLink = (String(w.corbridge_link || '').match(/OrderId=(\d+)/) || [])[1];
  let pick = viaLink && bySource.has(viaLink) ? { source: viaLink, how: 'corbridge_link' } : null;
  if (!pick) {
    const nums = String(w.est_inv_at || '').split(/[^0-9]+/).filter(Boolean);
    if (!nums.length) continue;
    const cands = nums.flatMap((d) => byDigits.get(d) || []);
    if (cands.length === 1) pick = { source: cands[0].source, how: 'number' };
    else if (cands.length > 1) { const live = cands.filter((c) => !/-V$/i.test(c.number)); const inv = live.length === 1 ? live : live.filter((c) => /^INV/.test(c.number)); if (inv.length === 1) pick = { source: inv[0].source, how: 'number_inv' }; else { ambiguous.push({ id: w.id, client: w.client_name, est_inv_at: w.est_inv_at, cands }); continue; } }
    else { none.push({ id: w.id, client: w.client_name, est_inv_at: w.est_inv_at }); continue; }
  }
  plan.push({ id: w.id, updated_date: w.updated_date, estimate_id: bySource.get(pick.source), source: pick.source, how: pick.how });
}
writeFileSync(D + 'pipeline-estimate-link-plan.json', JSON.stringify({ plan, ambiguous, none }, null, 1));
const how = {}; for (const p of plan) how[p.how] = (how[p.how] || 0) + 1;
console.log({ workorders: all.length, to_link: plan.length, how, ambiguous: ambiguous.length, not_imported_yet_or_missing: none.length });
if (mode === 'apply') {
  let ok = 0, skip = 0;
  for (const p of plan) {
    try { await call('staffEntityWrite', { entity: 'WorkOrder', op: 'updateMany', id: p.id, query: { id: p.id, updated_date: p.updated_date }, update: { $set: { estimate_id: p.estimate_id } } }); ok++; } catch { skip++; }
    await new Promise((s) => setTimeout(s, 300));
  }
  console.log(`linked=${ok} skipped=${skip}`);
}
