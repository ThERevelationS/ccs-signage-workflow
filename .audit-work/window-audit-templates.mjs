// Read-only: ProjectTemplate rows created/updated since FoundationTemplateDialog lost its
// saveDisabled gate (0349e6da2, 2026-11-10T18:26:32Z).
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const read = async (payload) => { const res = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, session_token: login.token }) }); const b = await res.json(); if (res.status !== 200) throw new Error(`HTTP ${res.status} ${JSON.stringify(b).slice(0, 150)}`); return b?.data || b; };
const ts = (v) => { const s = String(v || ''); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); };
const START = Date.parse('2026-11-10T18:26:32Z');
const rows = []; for (let skip = 0; ; skip += 991) { const p = await read({ entity: 'ProjectTemplate', sort: '-updated_date', limit: 991, skip }); rows.push(...(p.items || [])); if (!p.truncated) break; }
const count = (await read({ entity: 'ProjectTemplate', count: true })).count;
const types = {}; for (const r of rows) { const k = r.module_key || r.template_type || r.project_type || '?'; types[k] = (types[k] || 0) + 1; }
const hit = rows.filter((r) => ts(r.updated_date) >= START || ts(r.created_date) >= START);
console.log(`scanned=${rows.length} gatewayCount=${count} byType=${JSON.stringify(types)} inWindow=${hit.length}`);
for (const r of hit) console.log(` ${String(r.updated_date).slice(0, 16)} ${r.id} type=${r.module_key || r.template_type || r.project_type} "${String(r.template_name || '').slice(0, 40)}"`);
