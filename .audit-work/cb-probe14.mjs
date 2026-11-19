import { get } from './cb-http.mjs';
const h = (await get('/SalesModule/Orders/Order.aspx?OrderId=11280')).text;
let i = -1; const out = [];
while ((i = h.indexOf('DetailedOrderView', i + 1)) >= 0 && out.length < 8) out.push(h.slice(Math.max(0, i - 200), i + 400).replace(/\s+/g, ' '));
console.log(out.join('\n-----\n'));
const scripts = [...h.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /order/i.test(s));
console.log(scripts);
for (const s of scripts) { const t = (await get(s.startsWith('/') ? s : '/SalesModule/Orders/' + s)).text; let j = t.indexOf('DetailedOrderView'); if (j >= 0) console.log('IN', s, t.slice(j - 100, j + 800).replace(/\s+/g, ' ')); }
