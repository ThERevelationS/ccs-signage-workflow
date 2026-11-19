const fs = require('fs'); const D = 'imports/corebridge-2026-11-16/';
const wo = JSON.parse(fs.readFileSync(D + 'app-WorkOrder-snapshot.json', 'utf8'));
const cb = JSON.parse(fs.readFileSync(D + 'accounts-detail.json', 'utf8')).accounts;
const app = JSON.parse(fs.readFileSync(D + 'app-customers-before.json', 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|llc|inc|incorporated|co|company|corp|corporation|ltd|pllc|pc|lp|llp)\b/g, ' ').replace(/\s+/g, ' ').trim();
const cbN = new Map(); for (const a of cb) { const k = norm(a.company_name); cbN.set(k, (cbN.get(k) || []).concat(a.acct_id)); }
const apN = new Map(); for (const r of app) { const k = norm(r.company_name); apN.set(k, (apN.get(k) || []).concat(r.id)); }
const names = new Map(); for (const w of wo) { const k = norm(w.client_name); if (!names.has(k)) names.set(k, { raw: w.client_name, n: 0, linked: 0 }); const e = names.get(k); e.n++; if (w.customer_id) e.linked++; }
let rowsCb1 = 0, rowsCbMulti = 0, rowsAppOnly = 0, rowsNone = 0, nCb1 = 0, nNone = 0; const none = [];
for (const [k, e] of names) { const c = cbN.get(k) || []; if (c.length === 1) { rowsCb1 += e.n; nCb1++; } else if (c.length > 1) rowsCbMulti += e.n; else if (apN.get(k)) rowsAppOnly += e.n; else { rowsNone += e.n; nNone++; none.push([e.n, e.raw]); } }
console.log({ workorders: wo.length, distinct_names: names.size, rows_exact_one_cb: rowsCb1, names_exact_one_cb: nCb1, rows_cb_dupe: rowsCbMulti, rows_app_only: rowsAppOnly, rows_no_match: rowsNone, names_no_match: nNone });
console.log(none.sort((a, b) => b[0] - a[0]).slice(0, 40).map((x) => x.join(' x ')).join(' | '));
const st = {}; for (const w of wo) st[w.stage] = (st[w.stage] || 0) + 1; console.log(st);
