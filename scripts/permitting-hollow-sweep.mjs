// One-shot repair: offices promoted by 'evidence-pipeline' are re-judged
// against the strengthened quote guard (QUOTE_TOPIC in authority-verifier).
// A role keeps its verification only if SOME potentially_applicable entry
// still passes every guard; otherwise it moves to auto_verification_gaps as
// quote_off_topic. Offices left with zero roles demote to needs_verification.
// Writes through the local outbox (controlled-rate flusher owns remote).
import { readFileSync, openSync, writeFileSync } from 'node:fs';
import { enqueue } from './lib/outbox.mjs';
import { mirrorApply } from './lib/entity-mirror.mjs';
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'hollow-sweep', ...e }) + '\n', { flag: 'a' }); } catch {} };

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
    const SCOPE_OK = /unincorporated|township|outside.{0,30}(city|village|incorporat|municipal)|rural|county.?wide|all areas|entire county/i;
    const area = `${clean(e.service_area)} ${clean(e.applicability)}`.toLowerCase();
    if (area && !SCOPE_OK.test(area) && !SCOPE_OK.test(q)) return false;
  }
  return true;
}

const mirror = (n) => JSON.parse(readFileSync(`.audit-work/mirrors/${n}.json`, 'utf8'));
const locs = mirror('localities').rows || [];
const profiles = new Map([...mirror('profiles-oh').rows || [], ...mirror('profiles-ky').rows || []].map((p) => [p.id, p]));
const RT = { sign_permit: 'Sign permit', zoning: 'Zoning', building: 'Building', electrical_permit: 'Electrical permit', electrical_inspection: 'Electrical inspection', right_of_way: 'Right of way', historic_review: 'Historic review', planning: 'Planning', transportation: 'Transportation', other: 'Permitting' };

let checked = 0, rolesLost = 0, demoted = 0, writes = 0;
for (const loc of locs) {
  const p = profiles.get(loc.jurisdiction_profile_id);
  if (!p) continue;
  const entries = p.office_research?.roles || [];
  let changed = false;
  const offices = (loc.offices || []).map((o) => ({ ...o }));
  for (const o of offices) {
    if (o?.authority_verification_status !== 'staff_verified' || o?.verified_by !== 'evidence-pipeline') continue;
    checked++;
    const kept = [], lost = [];
    for (const r of (o.authority_roles || [])) {
      if (entries.some((e) => e?.role === r && entryPasses(r, e, p))) kept.push(r);
      else lost.push(r);
    }
    if (!lost.length) continue;
    changed = true;
    rolesLost += lost.length;
    o.authority_roles = kept;
    const gap = o.auto_verification_gaps || [];
    o.auto_verification_gaps = [...new Set([...gap, ...lost.map((r) => `${r}:quote_off_topic`)])];
    o.unproven_roles = [...new Set([...(o.unproven_roles || []), ...lost])];
    if (!kept.length) {
      o.authority_verification_status = 'needs_verification';
      o.verified_by = 'hollow-sweep';
      demoted++;
    } else {
      if (Array.isArray(o.office_types)) o.office_types = kept.map((r) => RT[r] || r);
      if (o.office_type) o.office_type = RT[kept[0]] || o.office_type;
    }
  }
  if (!changed) continue;
  enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices }, note: `hollow-sweep — ${loc.name}` });
  mirrorApply('localities', { id: loc.id, offices });
  emit({ stage: 'hollow_sweep', address: loc.name, ok: true, detail: `re-judged: ${rolesLost} role(s) lost${demoted ? ' · office demoted' : ''}` });
  writes++;
}
emit({ stage: 'hollow_sweep_done', ok: true, detail: `checked ${checked} evidence-pipeline offices · ${rolesLost} hollow roles · ${demoted} demoted · ${writes} localities written` });
console.log(`checked ${checked} · roles lost ${rolesLost} · demoted ${demoted} · localities written ${writes}`);
