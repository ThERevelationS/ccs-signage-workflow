import { permitCreds } from '../scripts/lib/permit-creds.mjs';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const l = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json());
const rows = [];
for (let skip = 0; ; skip += 1000) {
  const j = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: l.token, entity: 'PermitLocality', limit: 1000, skip }) }).then((r) => r.json());
  if (!Array.isArray(j?.items)) throw new Error('read failed ' + JSON.stringify(j).slice(0, 120));
  rows.push(...j.items);
  if (j.items.length < 1000) break;
}
const n = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const ck = (v) => String(v ?? '').split('/').map((p) => n(p).replace(/ county$/, '')).filter(Boolean).sort().join('/');
const live = rows.filter((r) => !String(r.duplicate_of || '').trim());
const tomb = rows.length - live.length;
const groups = {};
for (const r of live) { const k = [n(r.name), n(r.state), n(r.jurisdiction_type), ck(r.county_name || r.parent_county_name)].join('|'); (groups[k] = groups[k] || []).push(r); }
const identical = Object.entries(groups).filter(([, g]) => g.length > 1);
const noCounty = live.filter((r) => !String(r.county_name || r.parent_county_name || '').trim());
const noType = live.filter((r) => !String(r.jurisdiction_type || '').trim());
const amb = noCounty.filter((r) => live.some((o) => o.id !== r.id && n(o.name) === n(r.name) && n(o.state) === n(r.state)));
console.log(JSON.stringify({ total: rows.length, live: live.length, tombstoned: tomb, withCounty: live.length - noCounty.length, noCounty: noCounty.length, noType: noType.length, identicalGroups: identical.length, ambiguousNoCounty: amb.length }, null, 1));
console.log('identical groups:', identical.slice(0, 20).map(([k, g]) => `${k}(${g.length})`).join(' · '));
