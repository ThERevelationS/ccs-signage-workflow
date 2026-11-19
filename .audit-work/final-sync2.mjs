import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const r = await fetch(FN + '/staffDataRead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', query: { active: true }, limit: 5000 }) }).then((x) => x.json());
const all = r.items || r.rows || r.records || [];
console.log('real remote active:', all.length, '| minted:', all.filter((x) => x.source === 'burn_geocode_batch').length);
const seen = new Map(), dups = [];
for (const row of all) {
  const k = (row.rule_type || '') + '|' + String(row.entered_name || row.address_key || '').toLowerCase() + '|' + (row.state || '') + '|' + (row.county || '');
  if (seen.has(k)) { const a = seen.get(k); const keep = String(a.created_date || '') <= String(row.created_date || '') ? a : row; dups.push(keep === a ? row : a); seen.set(k, keep); }
  else seen.set(k, row);
}
console.log('real dupes:', dups.length);
fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify({ at: Date.now(), rows: all }));
