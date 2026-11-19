import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const r = await fetch(FN + '/staffDataRead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', query: { active: false }, limit: 500 }) }).then((x) => x.json());
const rows = r.items || r.rows || r.records || [];
const cutoff = Date.now() - 3 * 60 * 1000;
const mine = rows.filter((x) => new Date(x.updated_date).getTime() > cutoff);
console.log('inactive rows:', rows.length, '| deactivated in last 3min:', mine.length);
let n = 0;
for (const d of mine) {
  const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'update', id: d.id, query: { id: d.id }, update: { $set: { active: true } } }) }).then((x) => x.json()).catch(() => null);
  if (w?.success) n++;
  await sleep(250);
}
console.log('reactivated:', n);
