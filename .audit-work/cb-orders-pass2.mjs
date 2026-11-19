// Pass 2 per archived order: DetailedOrderView (parts/modifiers with price/cost/margin, raw HTML gz),
// payments (GetOrderPayments2) and refunds (GetOrderRefunds). Resumable. Read-only.
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { get, post } from './cb-http.mjs';
import { scrub, textOf } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/orders/';
const RAW = DIR + 'detail-html/'; mkdirSync(RAW, { recursive: true });
const OUT = DIR + 'orders-pass2.jsonl', ERR = DIR + 'errors-pass2.jsonl';
const conc = Number(process.argv[2] || 4);
const ids = [...new Set(readFileSync(DIR + 'orders.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).order_id))];
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).order_id) : []);
const todo = ids.filter((i) => !done.has(i));
console.log(`todo ${todo.length} of ${ids.length}`);
const unD = (r) => { try { const j = JSON.parse(r.text); const d = j.d ?? j; return typeof d === 'string' ? JSON.parse(d) : d; } catch { return { parse_error: r.status, raw: r.text.slice(0, 300) }; } };
function rowsOf(html) {
  const out = [];
  for (const tr of String(html).match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((c) => textOf(c)).filter((c) => c !== '');
    if (cells.length) out.push(cells);
  }
  return out;
}
let n = 0, ok = 0, err = 0, next = 0; const t0 = Date.now();
async function one(id) {
  const dv = await get(`/SalesModule/Orders/DetailedOrderView.aspx?orderId=${id}`);
  writeFileSync(RAW + id + '.html.gz', gzipSync(dv.text));
  const pay = scrub(unD(await post('/SalesModule/Reports/Reports.asmx/GetOrderPayments2', { OrderId: id, IsPaymentHistoryOverride: true })));
  const ref = scrub(unD(await post('/SalesModule/Reports/Reports.asmx/GetOrderRefunds', { OrderId: id, IsPaymentHistoryOverride: true })));
  appendFileSync(OUT, JSON.stringify({ order_id: id, detail_status: dv.status, detail_rows: rowsOf(dv.text), detail_text: textOf(dv.text), payments: pay?.ReportResults ?? pay, refunds: ref?.ReportResults ?? ref, captured_at: new Date().toISOString() }) + '\n');
  ok++;
}
async function worker() {
  while (next < todo.length) {
    const id = todo[next++];
    try { await one(id); } catch (e) { err++; appendFileSync(ERR, JSON.stringify({ order_id: id, error: String(e.message || e).slice(0, 300) }) + '\n'); if (/REDIRECT/.test(e.message)) { console.log('\nSESSION LOST'); process.exit(3); } }
    if (++n % 100 === 0) { const rate = n / ((Date.now() - t0) / 1000); process.stdout.write(`\n${n}/${todo.length} ok=${ok} err=${err} ${rate.toFixed(1)}/s eta ${Math.round((todo.length - n) / rate / 60)}min`); }
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`\nDONE ok=${ok} err=${err}`);
