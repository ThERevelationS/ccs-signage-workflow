// Comprehensive integrity audit — re-judges EVERY staff_verified office (any
// verified_by) against the current guard stack, plus office-name coherence,
// cross-jurisdiction leaks, stub-office verifications, rule integrity, and
// fleet/outbox health. Demotions go through the outbox tagged 'audit-sweep'.
import { readFileSync, openSync, writeFileSync } from 'node:fs';
import { enqueue } from './lib/outbox.mjs';
import { mirrorApply } from './lib/entity-mirror.mjs';

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'full-audit', ...e }) + '\n', { flag: 'a' }); } catch {} };
const clean = (v) => String(v || '').trim();
const norm = (v) => clean(v).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const NF = /information not found|not available|unknown/i;
const REJECT = /facebook|linkedin|twitter|instagram|yelp|wikipedia|blogspot|wordpress|wixsite|weebly|squarespace|google\.com|mapquest|zoominfo|yellowpages|manta|patch\.com|nextdoor/i;
const STOP = new Set(['city','township','village','of','the','county','town','oh','ky','ohio','kentucky','new','north','south','east','west','upper','lower']);
const nameTokens = (n) => norm(n).split(' ').filter((t) => t.length >= 4 && !STOP.has(t));
const QUOTE_TOPIC = /permit|inspection|licen[cs]e|application|ordinance|enforce|planning|zoning|building|sign\b|electric|right.?of.?way|road depart|roadway|encroach|historic|landmark|plat|subdivis|variance|appeal|code official|certificate|fee schedule|land use/i;
const QUOTE_ACTION = /\b(is|are|was|were|has|have|do|does|shall|must|will|may|can)\b|administ|issu|review|enforc|responsib|approv|inspect|contact|call\b|visit|submit|obtain|requir|process|handl|oversee|maintain|regulat|licens|adopt|provid|manag|coordinat|located/i;
const TITLE_WORDS = /permit|inspection|inspector|licen[cs]e|application|ordinance|enforce|planning|planner|zoning|building|sign|electric|right|way|road|encroach|historic|landmark|plat|subdivis|variance|appeal|code|official|certificate|fee|schedule|land|use|department|commission|authority|office|officer|director|administrator|administration|clerk|city|county|township|village|municipal|of|the|for|and|dept|local|individual|or|board|review|agent|contact|staff|safety|public|service|works|division|section|unit|area|state|general|engineer|trustee|surveyor|sanitarian|supervisor|superintendent|manager|assistant|chief|marshal|warden|regional|district|joint|association|council/gi;
const titleOnly = (q) => clean(q).replace(TITLE_WORDS, ' ').replace(/[^a-z0-9]/gi, '').length < 10;
const quoteEvidences = (q) => QUOTE_TOPIC.test(q) && !titleOnly(q) && (q.length >= 60 || QUOTE_ACTION.test(q) || /:\s*[A-Z][a-z]+\s+[A-Z]/.test(q));
const ROLE_DEPT = {
  sign_permit: /sign|zoning|planning|building|development|community|permit|code|inspect|engineer|administ|clerk|commission/i,
  zoning: /zoning|planning|building|development|community|permit|code|inspect|commission|administ|clerk/i,
  building: /building|housing|planning|development|community|permit|code|inspect|zoning|certified/i,
  electrical_permit: /electr|building|housing|development|community|code|certified|division of industrial|dhbc/i,
  electrical_inspection: /electr|building|housing|development|community|code|certified|division of industrial|dhbc/i,
  right_of_way: /street|road|engineer|public works|service|utility|highway|right|way/i,
  historic_review: /historic|preserv|landmark|architectural|design|certified local/i,
};
const ROLE_FUNC = {
  sign_permit: /sign/i, zoning: /zoning|land use|plat|subdivis/i, building: /building|construct|permit/i,
  electrical_permit: /electr/i, electrical_inspection: /electr/i,
  right_of_way: /right.?of.?way|road|street|encroach|highway/i, historic_review: /historic|preserv|landmark|architectural/i,
};
const SCOPE_OK = /unincorporated|township|outside.{0,30}(city|village|incorporat|municipal)|rural|county.?wide|all areas|entire county/i;
const STUB_OFFICE = /sign permit issuer|zoning authority|building dept|permit office|permits?|government|jurisdiction|municipal|permitting/;
const isStub = (n, locName) => { const k = norm(n); return !k || (norm(locName) && k.includes(norm(locName))) || STUB_OFFICE.test(k); };
function isOfficial(url, profile) {
  const u = clean(url);
  if (!/^https?:\/\//i.test(u) || REJECT.test(u) || NF.test(u)) return false;
  const host = u.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().replace(/^www\./, '');
  if (/\.gov$|\.us$|ohio\.gov$|ky\.gov$/i.test(host)) return true;
  for (const site of [profile?.website_url, profile?.permitting_url]) {
    const h = clean(site).replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().replace(/^www\./, '');
    if (h && (host === h || host.endsWith(`.${h}`) || h.endsWith(`.${host}`))) return true;
  }
  const compact = host.replace(/[^a-z0-9]/g, '');
  return [...nameTokens(profile?.name), ...nameTokens(profile?.county_name)].some((t) => compact.includes(t));
}
function entryPasses(role, e, profile) {
  if (String(e?.applicability) !== 'potentially_applicable') return false;
  if (!isOfficial(e?.official_source_url, profile)) return false;
  const q = clean(e?.responsibility_quote);
  if (!q || q.length < 20 || NF.test(q) || !quoteEvidences(q)) return false;
  const on = clean(e.office_name);
  if (on && ROLE_DEPT[role] && !ROLE_DEPT[role].test(on) && !ROLE_FUNC[role]?.test(q)) return false;
  if (/county/i.test(profile?.type || '')) {
    const area = `${clean(e.service_area)} ${clean(e.applicability)}`.toLowerCase();
    if (area && !SCOPE_OK.test(area) && !SCOPE_OK.test(q)) return false;
  }
  return true;
}

const mirror = (n) => { try { return JSON.parse(readFileSync(`.audit-work/mirrors/${n}.json`, 'utf8')).rows || []; } catch { return []; } };
const locs = mirror('localities');
const profiles = new Map([...mirror('profiles-oh'), ...mirror('profiles-ky')].map((p) => [p.id, p]));
const rules = mirror('rules');
const RT = { sign_permit: 'Sign permit', zoning: 'Zoning', building: 'Building', electrical_permit: 'Electrical permit', electrical_inspection: 'Electrical inspection', right_of_way: 'Right of way', historic_review: 'Historic review' };
const locNameSet = new Map();
for (const l of locs) { const k = norm(`${l.name} ${l.state}`); if (!locNameSet.has(k)) locNameSet.set(k, []); locNameSet.get(k).push(l); }

const R = { verified: 0, roleLoss: 0, demoted: 0, locsWritten: 0, byGap: {}, byVerifiedBy: {}, anomalies: { policeLike: [], nameless: [], crossLeak: [], stubVerified: [], noRoles: [] }, ready: 0, noVer: 0, onlySign: 0, onlyZoning: 0 };
const DRY = process.argv.includes('--dry');
for (const loc of locs) {
  const p = profiles.get(loc.jurisdiction_profile_id);
  const entries = p?.office_research?.roles || [];
  let changed = false, hasVer = false, s = false, z = false;
  const offices = (loc.offices || []).map((o) => ({ ...o }));
  const locKey = norm(`${loc.name} ${loc.state}`);
  for (const o of offices) {
    if (!clean(o?.name)) { R.anomalies.nameless.push(`${loc.name}, ${loc.state}`); }
    if (o?.authority_verification_status !== 'staff_verified') continue;
    hasVer = true;
    const vb = o.verified_by || '(blank)';
    R.byVerifiedBy[vb] = (R.byVerifiedBy[vb] || 0) + 1;
    R.verified++;
    // office-name coherence — a police/fire/utility office can't hold planning roles
    if (/police|fire dept|fire department|utility billing|sanitation|cemetery|parks? (and|&) rec|auto license/i.test(o.name) && !(o.authority_roles || []).every((r) => /right_of_way/.test(r))) {
      R.anomalies.policeLike.push(`${loc.name}, ${loc.state} | ${o.name} | ${(o.authority_roles || []).join('+')}`);
    }
    if (isStub(o.name, loc.name)) R.anomalies.stubVerified.push(`${loc.name}, ${loc.state} | ${o.name}`);
    // cross-jurisdiction leak — office names a DIFFERENT locality (same state)
    const onorm = norm(o.name);
    for (const [k, lset] of locNameSet) {
      if (k === locKey) continue;
      const other = lset[0];
      if (other.state !== loc.state) continue;
      const oname = norm(other.name);
      if (oname.length >= 6 && onorm.includes(oname) && !norm(loc.name).includes(oname)) {
        // county names are legitimately inside office names ("<X> County ...")
        if (!/county/i.test(other.type || other.name)) R.anomalies.crossLeak.push(`${loc.name}, ${loc.state} | "${o.name}" names ${other.name}`);
        break;
      }
    }
    if (!p) continue;
    const kept = [], lost = [];
    for (const r of o.authority_roles || []) {
      if (entries.some((e) => e?.role === r && entryPasses(r, e, p))) kept.push(r);
      else { lost.push(r); R.byGap[r] = (R.byGap[r] || 0) + 1; }
    }
    if (!lost.length) { if (kept.includes('sign_permit')) s = true; if (kept.includes('zoning')) z = true; continue; }
    changed = true;
    R.roleLoss += lost.length;
    o.authority_roles = kept;
    o.auto_verification_gaps = [...new Set([...(o.auto_verification_gaps || []), ...lost.map((r) => `${r}:audit_fail`)])];
    o.unproven_roles = [...new Set([...(o.unproven_roles || []), ...lost])];
    if (!kept.length) { o.authority_verification_status = 'needs_verification'; o.verified_by = 'audit-sweep'; R.demoted++; }
    else {
      if (Array.isArray(o.office_types)) o.office_types = kept.map((r) => RT[r] || r);
      if (o.office_type) o.office_type = RT[kept[0]] || o.office_type;
      if (kept.includes('sign_permit')) s = true; if (kept.includes('zoning')) z = true;
    }
  }
  if (changed && !DRY) {
    enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices }, note: `full-audit — ${loc.name}` });
    mirrorApply('localities', { id: loc.id, offices });
    R.locsWritten++;
  }
  if (s && z) R.ready++; else if (!hasVer) R.noVer++;
  else { if (!s && z) R.onlyZoning++; if (!z && s) R.onlySign++; }
  for (const o of offices) if (o?.authority_verification_status === 'staff_verified' && !(o.authority_roles || []).length) R.anomalies.noRoles.push(`${loc.name}, ${loc.state} | ${o.name}`);
}

// ---- rules audit ----
const ruleIssues = { badCounty: [], dupes: [], nonCanon: [] };
const seen = new Map();
for (const r of rules) {
  if (String(r.status) !== 'active') continue;
  const c = clean(r.county);
  if (/^county$/i.test(c)) ruleIssues.badCounty.push(r.address_key);
  const k = `${r.address_key}|${r.state}|${norm(r.county)}`;
  if (seen.has(k)) ruleIssues.dupes.push(`${r.address_key} (${r.state})`);
  seen.set(k, 1);
  if (/twp\.?$/i.test(clean(r.jurisdiction_name))) ruleIssues.nonCanon.push(`${r.address_key} → ${r.jurisdiction_name}`);
}
// ---- fleet + outbox ----
const fs = await import('node:fs');
const outbox = { pending: 0, errors: 0 };
try { outbox.pending = fs.readFileSync('.audit-work/outbox.jsonl', 'utf8').trim().split('\n').filter(Boolean).length; } catch {}
try { outbox.errors = fs.readFileSync('.audit-work/outbox-errors.jsonl', 'utf8').trim().split('\n').filter(Boolean).length; } catch {}

const report = {
  applyReady: R.ready, noVerifiedOffice: R.noVer, onlySignMissing: R.onlySign, onlyZoningMissing: R.onlyZoning,
  verifiedOfficesAudited: R.verified, byVerifiedBy: R.byVerifiedBy,
  hollowRolesFound: R.roleLoss, roleLossByRole: R.byGap, officesFullyDemoted: R.demoted, localitiesWritten: R.locsWritten,
  anomalies: { policeFireHoldingRoles: R.anomalies.policeLike, namelessOffices: R.anomalies.nameless, crossJurisdictionNames: R.anomalies.crossLeak.slice(0, 25), stubOfficesStillVerified: R.anomalies.stubVerified.slice(0, 25), verifiedWithZeroRoles: R.anomalies.noRoles },
  rules: { active: seen.size, ...ruleIssues },
  outbox,
};
writeFileSync('.audit-work/full-audit-report.json', JSON.stringify(report, null, 1));
emit({ stage: 'full_audit_done', ok: true, detail: `ready ${R.ready} · audited ${R.verified} verified offices · ${R.roleLoss} hollow roles · ${R.demoted} demoted · rules ${seen.size} active${DRY ? ' (DRY)' : ''}` });
console.log(JSON.stringify(report, null, 1));
