import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const m = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8'));
for (const [en, st, jn] of [['burlington','KY','burlington'],['cleveland','OH','cleveland']]) {
  const rule = { rule_type: 'postal_name_map', entered_name: en, state: st, county: '', jurisdiction_name: jn, jurisdiction_type: 'municipality', geoid: '', source: 'burn_geocode_batch', evidence: 'Auto-mint: unique incorporated match.', active: true };
  const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'create', data: rule }) }).then((x) => x.json()).catch(() => null);
  console.log(en, w?.success ? 'ok' : 'fail');
  if (w?.success) m.rows.push(w.record);
  await sleep(400);
}
fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m));
const byAddr = {};
for (const l of fs.readFileSync('.live-events.jsonl', 'utf8').trim().split('\n')) { try { const e = JSON.parse(l); if (e.address && !e.step && e.stage) byAddr[e.address] = e; } catch {} }
const tg = Object.entries(byAddr).filter(([a, e]) => e.stage === 'geocode').map(([a]) => a);
fs.writeFileSync('.geocode-retry10.json', JSON.stringify(tg, null, 1));
console.log('retry:', tg.length);
