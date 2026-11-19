import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const rule = { rule_type: 'address_override', entered_name: '', state: 'OH', county: 'coshocton', address_key: '52567 oh-651', jurisdiction_name: 'mill creek township', jurisdiction_type: 'township', geoid: '', source: 'burn_geocode_batch', evidence: 'Manual: Fresno OH is unincorporated — Mill Creek Township, Coshocton County.', created_from_address: '52567 OH-651, Fresno, OH 43824', active: true };
const w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'create', data: rule }) }).then((x) => x.json());
console.log('fresno override:', w?.success ? 'ok' : JSON.stringify(w).slice(0, 80));
if (w?.success) { const m = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8')); m.rows.push(w.record); fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m)); }
