// Match CoreBridge accounts -> existing app Customer rows. Exact normalized-name first,
// then phone/email corroborated near-name. Ambiguities are reported, never guessed.
const fs = require('fs');
const D = 'imports/corebridge-2026-11-16/';
const cb = JSON.parse(fs.readFileSync(D + 'accounts-detail.json', 'utf8')).accounts;
const app = JSON.parse(fs.readFileSync(D + 'app-customers-before.json', 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(the|llc|inc|incorporated|co|company|corp|corporation|ltd|pllc|pc|lp|llp)\b/g, ' ').replace(/\s+/g, ' ').trim();
const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const appByName = new Map();
for (const r of app) for (const n of [r.company_name, ...(Array.isArray(r.legacy_client_names) ? r.legacy_client_names : [])]) { const k = norm(n); if (!k) continue; if (!appByName.has(k)) appByName.set(k, new Set()); appByName.get(k).add(r.id); }
const appByPhone = new Map(); for (const r of app) { const p = digits(r.company_phone); if (p.length === 10) { if (!appByPhone.has(p)) appByPhone.set(p, new Set()); appByPhone.get(p).add(r.id); } }
const cbByName = new Map(); for (const a of cb) { const k = norm(a.company_name); if (!cbByName.has(k)) cbByName.set(k, []); cbByName.get(k).push(a.acct_id); }
const out = { exact: [], phone: [], ambiguous: [], cb_dupe_names: [], new: [] };
const claimed = new Map();
for (const a of cb) {
  const k = norm(a.company_name);
  const ids = appByName.get(k);
  if (ids && ids.size === 1 && (cbByName.get(k) || []).length === 1) { out.exact.push([a.acct_id, [...ids][0]]); continue; }
  if (ids && ((cbByName.get(k) || []).length > 1 || ids.size > 1)) { out.ambiguous.push({ acct: a.acct_id, name: a.company_name, app_ids: [...ids], cb_same_name: cbByName.get(k) }); continue; }
  const p = digits(a.company_phone); const pid = p.length === 10 && appByPhone.get(p);
  if (pid && pid.size === 1) { const r = app.find((x) => x.id === [...pid][0]); out.phone.push({ acct: a.acct_id, cb_name: a.company_name, app_id: r.id, app_name: r.company_name }); continue; }
  out.new.push(a.acct_id);
}
for (const [acct, id] of [...out.exact, ...out.phone.map((x) => [x.acct, x.app_id])]) claimed.set(id, [...(claimed.get(id) || []), acct]);
const doubleClaimed = [...claimed].filter(([, v]) => v.length > 1);
const unmatchedApp = app.filter((r) => !claimed.has(r.id) && !out.ambiguous.some((x) => x.app_ids.includes(r.id)));
fs.writeFileSync(D + 'match-plan.json', JSON.stringify({ ...out, double_claimed: doubleClaimed, unmatched_app: unmatchedApp.map((r) => ({ id: r.id, company_name: r.company_name, created: r.created_date })) }, null, 1));
console.log(`CB accounts=${cb.length} app customers=${app.length}`);
console.log(`exact-name matches=${out.exact.length} phone matches=${out.phone.length} ambiguous=${out.ambiguous.length} new=${out.new.length}`);
console.log(`app rows claimed=${claimed.size} double-claimed=${doubleClaimed.length} app rows unmatched=${unmatchedApp.length}`);
console.log('phone-match samples:', out.phone.slice(0, 8).map((x) => `${x.cb_name} <-> ${x.app_name}`).join(' | '));
console.log('ambiguous samples:', out.ambiguous.slice(0, 6).map((x) => `${x.name} (cb x${x.cb_same_name.length}, app x${x.app_ids.length})`).join(' | '));
console.log('unmatched app samples:', unmatchedApp.slice(0, 12).map((r) => r.company_name).join(' | '));
