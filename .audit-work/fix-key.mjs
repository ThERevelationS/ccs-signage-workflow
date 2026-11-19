import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const m = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8'));
const rule = m.rows.find((r) => r.address_key === '5649 main st' && r.active !== false);
console.log('found:', rule?.id);
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'update', id: rule.id, data: { address_key: '5649 main st b' } }) }).then((x) => x.json());
console.log('updated:', w?.success, w?.record?.address_key);
if (w?.success) { rule.address_key = '5649 main st b'; fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m)); }
