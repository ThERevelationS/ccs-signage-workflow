import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const r = await fetch('https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const d = await fetch('https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions/staffDataRead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'AllInOneEstimate', id: process.argv[2] || '6af57b6612721a693b40308a', limit: 51, session_token: r.token }) }).then((x) => x.json());
const it = d?.item || {};
console.log(JSON.stringify({ id: it.id, status: it.status, quote_total: it.quote_total, total_cost: it.total_cost, quote_version: it.quote_version, line_items: (it.line_items || []).length, wo: it.work_order_id }));
