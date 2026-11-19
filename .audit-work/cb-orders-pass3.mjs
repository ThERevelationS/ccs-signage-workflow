// Pass 3 per archived order: order notes (hdnOrderNotes hidden field) + full paged order history.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { get } from './cb-http.mjs';
import { textOf, historyRows } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/orders/';
const OUT = DIR + 'orders-pass3.jsonl', ERR = DIR + 'errors-pass3.jsonl';
const conc = Number(process.argv[2] || 4);
const ids = [...new Set(readFileSync(DIR + 'orders.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).order_id))];
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).order_id) : []);
const todo = ids.filter((i) => !done.has(i));
console.log(`todo ${todo.length} of ${ids.length}`);
const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const maxPage = (h) => Math.max(1, ...[...h.matchAll(/Page\$(\d+)/g)].map((m) => Number(m[1])));
let next = 0, n = 0, withNotes = 0, err = 0;
async function one(id) {
  const nh = (await get(`/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=${id}`)).text;
  const tag = (nh.match(/<input[^>]*id="hdnOrderNotes"[^>]*>/i) || [])[0] || '';
  const notesHtml = decode((tag.match(/value="([^"]*)"/) || [])[1] || '');
  const important = /id="chkMarkedAsImportant"[^>]*checked/i.test(nh);
  if (notesHtml.trim()) withNotes++;
  const pages = []; let page = 1, last = 1;
  do {
    const h = (await get(`/SalesModule/Orders/OrderView/OrderHistory.aspx?OrderId=${id}&PageIndex=${page === 1 ? '' : page}`)).text;
    const rows = historyRows(h).filter((r) => !/^\d+(\s+\d+)*$/.test(r.event));
    last = Math.max(last, maxPage(h));
    pages.push(rows);
    page++;
  } while (page <= last && page <= 200);
  const history = pages.flat();
  appendFileSync(OUT, JSON.stringify({ order_id: id, notes_html: notesHtml, notes_text: textOf(notesHtml), notes_important: important, history, history_pages: pages.length }) + '\n');
}
async function worker() {
  while (next < todo.length) {
    const id = todo[next++];
    try { await one(id); } catch (e) { err++; appendFileSync(ERR, JSON.stringify({ order_id: id, error: String(e.message).slice(0, 200) }) + '\n'); if (/REDIRECT/.test(e.message)) { console.log('SESSION LOST'); process.exit(3); } }
    if (++n % 250 === 0) process.stdout.write(`\n${n}/${todo.length} notes=${withNotes} err=${err}`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`\nDONE ${n} notes=${withNotes} err=${err}`);
