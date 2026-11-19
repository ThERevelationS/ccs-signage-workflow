import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
for (const entity of ['Customer', 'CustomerContact', 'CustomerLocation', 'MarkupTier', 'PricingTierMatrix', 'MigrationBatch']) {
  const res = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity, count: true, session_token: login.token }) });
  const b = await res.json().catch(() => ({})); console.log(entity.padEnd(18), res.status, JSON.stringify(b?.data || b).slice(0, 120));
}
