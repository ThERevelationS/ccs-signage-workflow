import { get } from './cb-http.mjs';
const h = (await get('/SalesModule/Orders/Order.aspx?OrderId=9000')).text;
const srcs = [...h.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /orders_management|order_entry/.test(s));
for (const s of srcs) {
  const url = s.replace(/^(\.\.\/)+/, '/');
  const t = (await get(url)).text;
  for (const k of ['hdnOrderNotes', 'divDynamicNotes', 'OrderNotes.aspx', 'GetOrderNotes', 'OrderLevelNotes']) {
    let i = -1, c = 0; while ((i = t.indexOf(k, i + 1)) >= 0 && c < 3) { console.log(url.split('?')[0], k, '::', t.slice(Math.max(0, i - 250), i + 250).replace(/\s+/g, ' ')); c++; }
  }
}
for (const k of ['hdnOrderNotes', 'OrderNotes', 'lnkNotesTab']) { let i = -1, c = 0; while ((i = h.indexOf(k, i + 1)) >= 0 && c < 4) { console.log('PAGE', k, '::', h.slice(Math.max(0, i - 200), i + 300).replace(/\s+/g, ' ')); c++; } }
