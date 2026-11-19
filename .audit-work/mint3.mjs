import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rules = [
  { rule_type: 'postal_name_map', entered_name: 'brooklyn', state: 'OH', county: '', jurisdiction_name: 'brooklyn', jurisdiction_type: 'municipality', geoid: '', source: 'burn_geocode_batch', evidence: 'Manual: postal Brooklyn OH = city of Brooklyn, Cuyahoga (Brooklyn Heights uses own postal name).', active: true },
  { rule_type: 'address_override', entered_name: '', state: 'KY', county: 'webster', address_key: '9000 ky-132', jurisdiction_name: 'clay', jurisdiction_type: 'municipality', geoid: '', source: 'burn_geocode_batch', evidence: 'Manual: parcel — KY-132/42404 = Clay, Webster County.', created_from_address: '9000 KY-132, Clay, KY 42404', active: true },
  { rule_type: 'address_override', entered_name: '', state: 'KY', county: 'webster', address_key: '5649 main st', jurisdiction_name: 'clay', jurisdiction_type: 'municipality', geoid: '', source: 'burn_geocode_batch', evidence: 'Manual: parcel — Clay KY 42404 = Webster County.', created_from_address: '5649 Main St b, Clay, KY 42404', active: true },
];
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const m = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8'));
for (const rule of rules) {
  const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'create', data: rule }) }).then((x) => x.json()).catch(() => null);
  console.log(rule.entered_name || rule.address_key, w?.success ? 'ok' : JSON.stringify(w).slice(0, 70));
  if (w?.success) m.rows.push(w.record);
  await sleep(500);
}
fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m));
