import fs from 'node:fs';
const creds = JSON.parse(fs.readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+(city|village|town|county|township|twp\.?|tp\.?|hts|heights)$/, '').replace(/^mt\b/, 'mount').replace(/^st\b/, 'saint').replace(/\bct hs\b/, 'court house').replace(/^wshngtn\b/, 'washington').replace(/\s+/g, ' ');
const rules = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8')).rows || [];
const lm = JSON.parse(fs.readFileSync('.audit-work/mirrors/localities.json', 'utf8'));
const ruleSet = new Set(rules.filter((r) => r.rule_type === 'postal_name_map' && r.active !== false && !r.county).map((r) => norm(r.entered_name) + '|' + r.state));
const byName = new Map();
for (const l of lm.rows || []) {
  const k = norm(l.name) + '|' + l.state;
  if (!byName.has(k)) byName.set(k, []);
  if (!byName.get(k).some((x) => x.name === l.name)) byName.get(k).push(l);
}
const guess = (n) => /township|twp\b/i.test(n) ? 'township' : /\bcounty\b/i.test(n) ? 'county' : /village/i.test(n) ? 'village' : 'municipality';
const mintable = [];
for (const [k, list] of byName) {
  const [c, st] = k.split('|');
  if (!c || ruleSet.has(k)) continue;
  const incorp = list.filter((x) => !['township', 'county'].includes(guess(x.name)));
  const cand = incorp.length ? incorp : list;
  if (!cand.length || new Set(cand.map((x) => x.name.toLowerCase())).size !== 1) continue;
  mintable.push({ en: c, st, jn: cand[0].name.toLowerCase(), jt: guess(cand[0].name) });
}
console.log('mintable:', mintable.length);
const t = await fetch(FN + '/verifyLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: creds.user, password: creds.pass }) }).then((r) => r.json());
const tk = t.session_token || t.token;
const m = JSON.parse(fs.readFileSync('.audit-work/mirrors/rules.json', 'utf8'));
let ok = 0, fail = 0;
for (const r of mintable) {
  const rule = { rule_type: 'postal_name_map', entered_name: r.en, state: r.st, county: '', jurisdiction_name: r.jn, jurisdiction_type: r.jt, geoid: '', source: 'burn_geocode_batch', evidence: 'Bulk mint: unique incorporated locality, no collision.', active: true };
  let w = null;
  for (let a = 0; a < 3; a++) {
    try { w = await fetch(FN + '/staffEntityWrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, entity: 'PermitResolutionRule', op: 'create', data: rule }) }).then((x) => x.json()); } catch {}
    if (w?.success && w.record?.id) break;
    await sleep(1500);
  }
  if (w?.success && w.record?.id) { m.rows.push(w.record); ok++; } else fail++;
  if ((ok + fail) % 100 === 0) fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m));
  await sleep(400);
}
fs.writeFileSync('.audit-work/mirrors/rules.json', JSON.stringify(m));
fs.writeFileSync('.audit-work/bulk-mint-done.json', JSON.stringify({ ok, fail, total: mintable.length, at: Date.now() }));
console.log('DONE ok:' + ok + ' fail:' + fail);
