import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const m = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8'));
const seen = new Map(), dups = [];
for (const r of m.rows) {
  const k = (r.rule_type || '') + '|' + String(r.entered_name || r.address_key || '').toLowerCase() + '|' + (r.state || '') + '|' + (r.county || '');
  if (seen.has(k)) { const a = seen.get(k); const keep = String(a.created_date || '') <= String(r.created_date || '') ? a : r; dups.push(keep === a ? r : a); seen.set(k, keep); }
  else seen.set(k, r);
}
console.log('deactivating', dups.length);
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
let n = 0;
for (const d of dups) {
  const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'update', id: d.id, data: { active: false } }) }).then((x) => x.json()).catch(() => null);
  if (w?.success) { n++; const i = m.rows.findIndex((x) => x.id === d.id); if (i > -1) m.rows[i].active = false; }
  if (n % 200 === 0 && n) fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m));
  await sleep(250);
}
fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify({ at: Date.now(), rows: m.rows.filter((x) => x.active !== false) }));
fs.writeFileSync('.audit-work/dedupe-done.json', JSON.stringify({ deactivated: n, attempted: dups.length }));
console.log('deactivated:', n);
