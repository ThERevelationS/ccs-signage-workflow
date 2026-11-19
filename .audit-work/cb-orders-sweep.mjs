// Read-only archive of every CoreBridge order/estimate: header (orderObj), line items
// (GetOrderProductsView), order notes, order history. Resumable JSONL, secrets scrubbed.
// usage: node cb-orders-sweep.mjs <fromId> <toId> [concurrency]
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { get, post } from './cb-http.mjs';
import { extractJsonAfter, scrub, textOf, historyRows } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/orders/';
mkdirSync(DIR, { recursive: true });
const OUT = DIR + 'orders.jsonl', MISS = DIR + 'missing.jsonl', ERR = DIR + 'errors.jsonl';
const from = Number(process.argv[2] || 1), to = Number(process.argv[3] || 11400), conc = Number(process.argv[4] || 6);
const done = new Set();
for (const f of [OUT, MISS]) if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) if (l) { try { done.add(JSON.parse(l).order_id); } catch {} }
const ids = []; for (let i = from; i <= to; i++) if (!done.has(i)) ids.push(i);
console.log(`todo ${ids.length} (already ${done.size})`);
let n = 0, ok = 0, miss = 0, err = 0; const t0 = Date.now();
async function one(id) {
  const page = await get(`/SalesModule/Orders/Order.aspx?OrderId=${id}`);
  const title = ((page.text.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  const o = page.status === 200 ? extractJsonAfter(page.text, 'var orderObj = ') : null;
  if (!o || !o.Id) { appendFileSync(MISS, JSON.stringify({ order_id: id, status: page.status, title }) + '\n'); miss++; return; }
  const pv = await post('/Api/OrderViewBase/GetOrderProductsView', { OrderId: id, OrderStatus: o.OrderStatus, OrderAccountId: o.AccountId, OrderCompanyName: o.CompanyName });
  let products = null, productsError = null;
  try { const j = JSON.parse(pv.text); if (j.IsSuccess === false && !j.OrderProducts) productsError = j.Message; products = (j.OrderProducts || []).map((p) => scrub(p)); } catch (e) { productsError = `parse ${pv.status}`; }
  const notesHtml = (await get(`/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=${id}`)).text;
  const nm = notesHtml.match(/id="divDynamicNotes"[^>]*>([\s\S]*?)<\/div>\s*(<\/div>|<div|<input|<script)/i);
  const important = /id="chkMarkedAsImportant"[^>]*checked/i.test(notesHtml);
  const histHtml = (await get(`/SalesModule/Orders/OrderView/OrderHistory.aspx?OrderId=${id}&PageIndex=`)).text;
  const history = historyRows(histHtml);
  const histPaged = /PageIndex=\d|gvOrderHistory\$|Page\$\d/i.test(histHtml);
  appendFileSync(OUT, JSON.stringify({ order_id: id, title, header: scrub(o), products, products_error: productsError, notes_html: nm ? nm[1].trim() : '', notes_text: nm ? textOf(nm[1]) : '', notes_important: important, history, history_paged: histPaged, captured_at: new Date().toISOString() }) + '\n');
  ok++;
}
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    try { await one(id); } catch (e) { err++; appendFileSync(ERR, JSON.stringify({ order_id: id, error: String(e.message || e).slice(0, 300) }) + '\n'); if (/REDIRECT/.test(e.message)) { console.log('\nSESSION LOST', e.message); process.exit(3); } }
    if (++n % 50 === 0) { const rate = n / ((Date.now() - t0) / 1000); process.stdout.write(`\n${n}/${ids.length} ok=${ok} missing=${miss} err=${err} ${rate.toFixed(1)}/s eta ${Math.round((ids.length - n) / rate / 60)}min`); }
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`\nDONE ok=${ok} missing=${miss} err=${err}`);
