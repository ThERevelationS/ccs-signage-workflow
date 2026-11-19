import { readFileSync } from 'node:fs';
import { get } from './cb-http.mjs';
import { historyRows } from './cb-orderlib.mjs';
const L = readFileSync('imports/corebridge-2026-11-16/orders/orders.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
// find an order whose history mentions notes
const withNoteEvent = L.find((o) => o.history.some((h) => /note/i.test(h.event)));
console.log('note-event order', withNoteEvent?.order_id, withNoteEvent?.history.find((h) => /note/i.test(h.event))?.event.slice(0, 200));
const id = withNoteEvent?.order_id || 9000;
const t = (await get(`/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=${id}`)).text;
const i = t.indexOf('divDynamicNotes'); console.log('NOTES HTML around div:\n', t.slice(i - 300, i + 1500).replace(/\s+/g, ' '));
const big = L.find((o) => o.history.length === 16);
const h1 = (await get(`/SalesModule/Orders/OrderView/OrderHistory.aspx?OrderId=${big.order_id}&PageIndex=`)).text;
console.log('\nHIST order', big.order_id, 'rows', historyRows(h1).length, 'pager bits:', [...new Set(h1.match(/.{60}(PageIndex|Page\$|pager|Next|&gt;&gt;).{60}/gi) || [])].slice(0, 6));
const h2 = (await get(`/SalesModule/Orders/OrderView/OrderHistory.aspx?OrderId=${big.order_id}&PageIndex=2`)).text;
const r2 = historyRows(h2); console.log('page2 rows', r2.length, r2[0]?.event?.slice(0, 80), '| page1 first', historyRows(h1)[0]?.event?.slice(0, 80));
