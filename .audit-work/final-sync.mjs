import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const all = [];
for (let p = 0; p < 20; p++) {
  const r = await fetch(FN + '/staffDataRead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', query: { active: true }, limit: 500, offset: p * 500 }) }).then((x) => x.json());
  const rows = r.items || r.rows || r.records || [];
  all.push(...rows);
  if (rows.length < 500) break;
}
console.log('remote active:', all.length, '| minted:', all.filter((x) => x.source === 'burn_geocode_batch').length);
const seen = new Map(), dups = [];
for (const r of all) {
  const k = (r.rule_type || '') + '|' + String(r.entered_name || r.address_key || '').toLowerCase() + '|' + (r.state || '') + '|' + (r.county || '');
  if (seen.has(k)) { const a = seen.get(k); const keep = String(a.created_date || '') <= String(r.created_date || '') ? a : r; dups.push(keep === a ? r : a); seen.set(k, keep); }
  else seen.set(k, r);
}
console.log('dupes to deactivate:', dups.length);
let n = 0;
for (const d of dups) {
  const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'update', id: d.id, query: { id: d.id }, update: { $set: { active: false } } }) }).then((x) => x.json()).catch(() => null);
  if (w?.success) { n++; d.active = false; }
  await sleep(250);
}
fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify({ at: Date.now(), rows: all.filter((x) => x.active !== false) }));
console.log('deactivated:', n, '| mirror:', all.length - n);
