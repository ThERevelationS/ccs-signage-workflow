// Enrich imported estimates after passes 2/3: CoreBridge order history -> notes_log, order notes -> notes,
// part/modifier detail (price/cost/margin) -> first line's product_notes. CAS writes; stale reads go to retry.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { login, read, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/';
const jl = (f) => existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const p2 = new Map(jl(D + 'orders/orders-pass2.jsonl').map((r) => [String(r.order_id), r]));
const p3 = new Map(jl(D + 'orders/orders-pass3.jsonl').map((r) => [String(r.order_id), r]));
const targets = jl(D + 'estimate-lines-done.jsonl');
const DONE = D + 'estimate-enrich-done.jsonl';
const done = new Set(jl(DONE).map((r) => r.source_id));
const parseAt = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i); if (!m) return ''; let h = Number(m[4]) % 12; if (/PM/i.test(m[6])) h += 12; return `${m[3]}-${m[1]}-${m[2]}T${String(h).padStart(2, '0')}:${m[5]}:00`; };
await login();
let n = 0, ok = 0, retry = 0, skip = 0;
const queue = []; const seenQ = new Set();
for (const t of targets) { if (done.has(t.source_id) || seenQ.has(t.source_id)) continue; seenQ.add(t.source_id); queue.push(t); }
async function work() { while (queue.length) { const t = queue.shift();
  const a = p2.get(t.source_id), b = p3.get(t.source_id);
  if (!a || !b) { skip++; continue; }
  const r = await read({ entity: 'AllInOneEstimate', id: t.target_id }); const e = r.item || r.items?.[0] || r;
  if (!e?.id) { skip++; continue; }
  const patch = {};
  const log = (b.history || []).map((h) => ({ text: `[CoreBridge] ${h.event}`.slice(0, 4000), by: h.user || '', at: parseAt(h.at) || h.at || '' }));
  if (!(e.notes_log || []).some((x) => String(x.text || '').startsWith('[CoreBridge]')) && log.length) patch.notes_log = [...(e.notes_log || []), ...log];
  if (b.notes_text && !String(e.notes || '').includes('Order notes')) patch.notes = `${e.notes || ''}\n\nOrder notes${b.notes_important ? ' (IMPORTANT)' : ''}:\n${b.notes_text}`.trim();
  const li = e.line_items || [];
  if (li.length && a.detail_text && !String(li[0].product_notes || '').includes('CoreBridge order detail')) {
    patch.line_items = li.map((l, i) => (i === 0 ? { ...l, product_notes: `${l.product_notes || ''}\n\nCoreBridge order detail (parts · price · cost · margin):\n${a.detail_text.slice(0, 20000)}` } : l));
  }
  if (Object.keys(patch).length) {
    try { await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: e.id, query: { id: e.id, updated_date: e.updated_date }, update: { $set: patch } }); ok++; }
    catch (x) { retry++; appendFileSync(D + 'estimate-enrich-retry.jsonl', JSON.stringify({ ...t, error: String(x.message).slice(0, 160) }) + '\n'); continue; }
  }
  appendFileSync(DONE, JSON.stringify({ source_id: t.source_id, fields: Object.keys(patch) }) + '\n');
  if (++n % 200 === 0) process.stdout.write(`\nenriched ${n} ok=${ok} retry=${retry} skip=${skip}`);
  await new Promise((s) => setTimeout(s, 250));
} }
await Promise.all([work(), work(), work(), work()]);
console.log(`\nDONE n=${n} ok=${ok} retry=${retry} skipped(no pass2/3 yet)=${skip}`);
