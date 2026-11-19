// Read-only: FoundationProject rows created/updated since the Nov-11 legacyFoundationCalc
// clobber (098a2e5a9, 2026-11-11T00:37:48Z) — priced without supplier-availability holds.
import { readFileSync, writeFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const read = async (payload) => { const res = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, session_token: login.token }) }); const b = await res.json(); if (res.status !== 200) throw new Error(`HTTP ${res.status} ${JSON.stringify(b).slice(0, 150)}`); return b?.data || b; };
const ts = (v) => { const s = String(v || ''); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); };
const START = Date.parse('2026-11-11T00:37:48Z');
const rows = []; for (let skip = 0; ; skip += 997) { const p = await read({ entity: 'FoundationProject', sort: '-updated_date', limit: 997, skip }); rows.push(...(p.items || [])); if (!p.truncated) break; }
const count = (await read({ entity: 'FoundationProject', count: true })).count;
const hit = rows.filter((r) => ts(r.updated_date) >= START || ts(r.created_date) >= START);
const isProbe = (r) => /^(ZZ|\[LIVE)/i.test(String(r.project_name || '')) || /ZZ|probe/i.test(String(r.client_name || ''));
const out = hit.map((r) => ({ id: r.id, project_name: r.project_name, client_name: r.client_name, created: r.created_date, updated: r.updated_date, status: r.status, estimate_id: r.estimate_id || null, excavation_method: r.excavation_method || null, selected_concrete_id: r.selected_concrete_id || null, items: (r.items || []).length, probe: isProbe(r) }));
writeFileSync('.audit-work/window-audit-foundation.json', JSON.stringify({ scanned: rows.length, count, windowStart: '2026-11-11T00:37:48Z', rows: out }, null, 1));
console.log(`scanned=${rows.length} gatewayCount=${count} inWindow=${out.length} (non-probe=${out.filter((r) => !r.probe).length})`);
for (const r of out) console.log(`${r.probe ? 'PROBE ' : 'REAL  '} ${String(r.updated).slice(0, 16)} ${r.id} "${String(r.project_name).slice(0, 40)}" client="${String(r.client_name || '').slice(0, 28)}" est=${r.estimate_id ? 'y' : 'n'} items=${r.items} concrete=${r.selected_concrete_id ? 'set' : '-'}`);
