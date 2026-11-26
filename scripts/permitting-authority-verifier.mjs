#!/usr/bin/env node
// Authority verifier — the last automation gate. Locality offices arrive from
// the seed scan at authority_verification_status 'needs_verification'; nothing
// ever promotes them, so every resolved address dead-ends in human review.
//
// This worker applies the same evidence guards the manual verifyEvidence path
// checks (official source, quoted responsibility, explicit coverage) against
// the linked profile's office_research.roles and promotes evidence-backed
// offices to staff_verified with verified_by 'evidence-pipeline' — the status
// the resolver's verified_roles / apply_allowed gate already accepts.
//
// All-or-nothing per office: EVERY role in authority_roles must carry passing
// evidence or the office stays needs_verification and gets
// auto_verification_gaps + unproven_roles written for the (<1%) review list.
// That mirrors the resolver's own .every(role => AUTHORITY_ROLES.has(role))
// check — a partially-evidenced office can never satisfy the gate anyway.
//
// Mirror-first: reads localities + state profile mirrors, CAS-writes through
// entity_updateMany {id,updated_date}, then mirrorApply so the fleet sees it.
//
// Usage: node scripts/permitting-authority-verifier.mjs [--once]
//        [--slice i --slices n] [--delay-ms 900]
// Emits auth_verify_* stages to .live-events.jsonl.
import { openSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { normalizePermitJurisdictionName } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { idleWait } from './lib/event-tail.mjs';
import { enqueue } from './lib/outbox.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { ohioCertifiedDept, kyElectricalRoster } from './lib/rosters/certified-depts.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { buildIdentityIndex, withUnionResearch } from './lib/profile-identity.mjs';
import { readCooldowns, tierExhausted, tiersDone } from './lib/research-claims.mjs';
import { cleanOfficeName, isGenericOfficeName, isNonPermitOfficeName, isPlaceholderOffice } from './lib/office-name-clean.mjs';
import { appendCandidates, verdictMap, pendingCandidates, candHash, vkey, resolveJudged } from './lib/promote-judge.mjs';
import { addBoost } from './lib/research-boost.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);

// Canonical authority-role vocabulary — staffEntityWrite validates
// PermitLineItem.office_types against this set. Office records also carry
// display labels in office_type/office_types ("Permitting", "Building"), so
// line creates must derive types from authority_roles, never the labels.
const KNOWN_ROLE_SET = new Set(['sign_permit', 'zoning', 'building', 'electrical', 'electrical_permit', 'electrical_inspection', 'right_of_way', 'historic_review', 'planning', 'transportation', 'other']);
const ONCE = args.includes('--once');
const SLICE = args.includes('--slice') ? Number(args[args.indexOf('--slice') + 1]) : 0;
const SLICES = args.includes('--slices') ? Number(args[args.indexOf('--slices') + 1]) : 1;
const DELAY = args.includes('--delay-ms') ? Number(args[args.indexOf('--delay-ms') + 1]) : 900;
const PASS_SLEEP = 10 * 60 * 1000;
const DRY = args.includes('--dry-run');
const EVENTS = '.live-events.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── app plumbing ──
let token = '';
async function freshToken() {
  for (let i = 0; i < 5; i += 1) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return; }
    await sleep(3000 + i * 3000);
  }
  throw new Error('login failed');
}
async function call(fn, body, retried = false, serverRetry = 0) {
  await paceCall(fn);
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }) });
  if ((r.status === 401 || r.status === 403) && !retried) { await freshToken(); return call(fn, body, true); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(4000); return call(fn, body, retried, serverRetry); }
  if ((r.status >= 500 || j?.error === 'user-exception') && serverRetry < 6) {
    await sleep(3000 * (serverRetry + 1));
    return call(fn, body, retried, serverRetry + 1);
  }
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}

const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `authverif${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };

// ── verification ledger (OPERATIONS_MASTERPLAN §1E) ─────────────────────
// verification-ledger.json is rewritten at the end of every pass: the
// fleet's position for the dashboard/status, the gap-reason breakdown, and
// the held (needs_review) list Brett clears by hand.
const LEDGER_FILE = '.audit-work/verification-ledger.json';
const OFFICE_STATE_FILE = '.audit-work/verify-office-state.json';
const PROMOTIONS_LOG = '.audit-work/verify-promotions.jsonl';
const REVIEW_ATTEMPTS = 20; // strikes before an office is held — and even then
// only once its locality's research tiers are exhausted (research-claims.mjs).
// ...spread out — an attempt counts only once per ATTEMPT_SPACING so
// restart-bunched passes re-judging the SAME research can't burn strikes
// while new research is still flowing in.
const ATTEMPT_SPACING_MS = 1 * 3600e3;
const GAP_CATEGORY = {
  no_official_source: 'unofficial_source',
  no_responsibility_quote: 'no_quote',
  quote_off_topic: 'no_quote',
  county_not_unincorporated: 'county_scope',
  non_permit_office: 'non_permit_body',
  research_denied: 'no_role_match',
  role_office_mismatch: 'no_role_match',
  role_keyword_missing: 'no_quote',
  office_name_junk: 'no_role_match',
  office_name_absent_from_evidence: 'no_role_match',
  unknown_role: 'no_role_match',
  no_research_entry: 'no_research',
  research_unknown: 'no_research',
};
const gapCat = (reason) => GAP_CATEGORY[reason] || 'other';
const readControl = () => readJSON('.audit-work/server-control.json', {});
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

// ── evidence guards (mirroring verifyEvidence's checks, adapted for
//    research-extracted roles rather than staff-selected page quotes) ──
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (s) => String(s || '').trim();

const REJECT_HOST = /facebook|linkedin|twitter|instagram|yelp|wikipedia|blogspot|wordpress|wixsite|weebly|squarespace|google\.com|mapquest|zoominfo|yellowpages|manta|patch\.com|nextdoor/i;
const NOT_FOUND = /information not found|not available|unknown/i;
const STOP_WORDS = new Set(['city', 'township', 'village', 'of', 'the', 'county', 'town', 'oh', 'ky', 'ohio', 'kentucky', 'new', 'north', 'south', 'east', 'west', 'upper', 'lower']);
const nameTokens = (n) => norm(n).split(' ').filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
export function isOfficialSource(url, profile) {
  const u = clean(url);
  if (!/^https?:\/\//i.test(u) || REJECT_HOST.test(u) || NOT_FOUND.test(u)) return false;
  const host = u.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().replace(/^www\./, '');
  if (/\.gov$|\.us$|\.oh\.us$|\.ky\.us$|ohio\.gov$|kentucky\.gov$|ky\.gov$/i.test(host)) return true;
  for (const site of [profile?.website_url, profile?.permitting_url]) {
    const h = clean(site).replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().replace(/^www\./, '');
    if (h && (host === h || host.endsWith(`.${h}`) || h.endsWith(`.${host}`))) return true;
  }
  // Jurisdiction-name domain — how a human recognizes "cityofdayton.org".
  const compact = host.replace(/[^a-z0-9]/g, '');
  return [...nameTokens(profile?.name), ...nameTokens(profile?.county_name)].some((t) => compact.includes(t));
}
// Per-role evidence verdict for one research entry (already applicability-positive).
// A "responsibility quote" must actually talk about permitting work — v1-era
// extraction stamped footers, nav menus, privacy policies and welcome text as
// quotes (>=20 chars, no NOT_FOUND words → passed). Requiring topic language
// rejects boilerplate while keeping real referral/permitting statements.
const QUOTE_TOPIC = /permit|inspection|licen[cs]e|application|ordinance|enforce|planning|zoning|building|sign\b|electric|right.?of.?way|road depart|roadway|encroach|historic|landmark|plat|subdivis|variance|appeal|code official|certificate|fee schedule|land use/i;
// Nav-labels ("Ordinances Planning & Zoning") carry topic words but state no
// responsibility. Require an action/verb — or a "Title: Person" pattern, or
// enough length to be real prose — before a quote can evidence a role.
const QUOTE_ACTION = /\b(is|are|was|were|has|have|do|does|shall|must|will|may|can)\b|administ|issu|review|enforc|responsib|approv|inspect|contact|call\b|visit|submit|obtain|requir|process|handl|oversee|maintain|regulat|licens|adopt|provid|manag|coordinat|located/i;
// "Zoning Zoning Inspector" — an office TITLE, not a responsibility quote. It
// sneaks past topic+action checks ("Inspector" contains "inspect"). A real
// quote has content beyond the title vocabulary; stripping every role/agent/
// glue word from a title-only quote leaves ~nothing.
const TITLE_WORDS = /permit|inspection|inspector|licen[cs]e|application|ordinance|enforce|planning|planner|zoning|building|sign|electric|right|way|road|encroach|historic|landmark|plat|subdivis|variance|appeal|code|official|certificate|fee|schedule|land|use|department|commission|authority|office|officer|director|administrator|administration|clerk|city|county|township|village|municipal|of|the|for|and|dept|local|individual|or|board|review|agent|contact|staff|safety|public|service|works|division|section|unit|area|state|general|engineer|trustee|surveyor|sanitarian|supervisor|superintendent|manager|assistant|chief|marshal|warden|regional|district|joint|association|council/gi;
const titleOnly = (q) => clean(q).replace(TITLE_WORDS, ' ').replace(/[^a-z0-9]/gi, '').length < 10;
const quoteEvidences = (q) => QUOTE_TOPIC.test(q) && !titleOnly(q) && (q.length >= 60 || QUOTE_ACTION.test(q) || /:\s*[A-Z][a-z]+\s+[A-Z]/.test(q));
// Role↔office coherence: extraction stamps one page's office (zoning contact,
// license bureau) onto every role. An entry may claim electrical for a zoning
// inspector — incoherent unless the office name fits the role's department
// family or the quote itself names the function.
// (no bare "department|office|city|county" — every office name carries those;
// coherence must come from role-family words or the quote naming the function)
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
// Bodies that never issue sign/zoning/building/electrical/ROW/historic permits.
// "Community Corrections Planning Board" passed the zoning dept check on the
// word "Planning" and was promoted as three townships' zoning office.
const NON_PERMIT_BODY = /correction|probation|parole|\btax\b|taxation|auditor|treasurer|sheriff|police|court|coroner|recorder|prosecutor|library|school|cemetery|senior|veteran|election|board of health|health (dep|dist)|animal|dog warden|jail|\b911\b|\bems\b|emergency management|soil (and|&) water|job and family|children services|mental health|developmental disabilit/i;
export function roleEvidence(role, entry, profile) {
  const gaps = [];
  const src = clean(entry?.official_source_url);
  if (!src || !isOfficialSource(src, profile)) gaps.push(`${role}:no_official_source`);
  const q = clean(entry?.responsibility_quote);
  if (!q || q.length < 20 || NOT_FOUND.test(q)) gaps.push(`${role}:no_responsibility_quote`);
  else if (!quoteEvidences(q)) gaps.push(`${role}:quote_off_topic`);
  const on = clean(entry?.office_name);
  if (on && NON_PERMIT_BODY.test(on)) gaps.push(`${role}:non_permit_office`);
  if (on && ROLE_DEPT[role] && !ROLE_DEPT[role].test(on) && !ROLE_FUNC[role]?.test(q)) gaps.push(`${role}:role_office_mismatch`);
  // County roles must be unincorporated-only — the "never combine" rule.
  // Ohio counties' unincorporated territory IS the townships, and county sites
  // phrase scope as "outside city limits" or put it inside the quote itself —
  // accept every honest spelling of county-scope, never a municipal claim.
  if (profile?.type === 'county') {
    const SCOPE_OK = /unincorporated|township|outside.{0,30}(city|village|incorporat|municipal)|rural|county.?wide|all areas|entire county/i;
    const area = `${clean(entry?.service_area)} ${clean(entry?.applicability)}`.toLowerCase();
    if (area && !SCOPE_OK.test(area) && !SCOPE_OK.test(clean(entry?.responsibility_quote))) gaps.push(`${role}:county_not_unincorporated`);
  }
  return gaps;
}
// One research role entry supplies one role's evidence for one office.
// Direct path: provider names must substring-match. Stub offices ("Zoning
// authority", "Sign permit issuer", "City of <Jurisdiction>") carry a role
// but no real provider name — county-administered / shared-service research
// (joint planning commissions, county building depts serving villages)
// can never substring-match those, so they blocked forever with no gap
// recorded. Fallback accepts research that is tagged county-administered,
// names the parent county, or names the jurisdiction itself. roleEvidence()
// gates (official URL, quote, county-unincorporated) still apply downstream.
const STUB_OFFICE = /sign permit issuer|zoning authority|building dept|permit office|permits?|government|jurisdiction|municipal|permitting/;
function isStubOffice(officeName, locName) {
  const key = norm(officeName), locKey = norm(locName);
  return !key || (locKey && key.includes(locKey)) || STUB_OFFICE.test(key);
}
// Extraction noise can role-type a page's office_name wrong (a zoning
// quote scraped off a police page). Wrong-domain providers can't carry
// permitting roles — filtering them keeps role-attribution honest.
const WRONG_DEPT = /police|fire\b|ems\b|sheriff|water\b|sewer|utility|sanitation|parks?\b|recreation|library|school|cemetery|transit|ambulance/i;
// Evidence lookup, three levels (fixed 2026-11-26 — record names drifted
// from research names, so ~1/3 of verified offices found no evidence at all):
//   L1 office_id — future research may stamp the office record it describes;
//   L2 cleaned/normalized name + aliases — match BOTH the entry's
//      office_name and its label, against the raw and cleaned office name;
//   L3 profile union — every same-role entry in the profile (minus
//      wrong-domain providers). Candidates only: the tightened check below
//      still requires the office name in the quote or the entry name.
export function researchForOffice(profile, officeName, loc, officeRoles = [], officeId = null, countyProfile = null) {
  const roles = Array.isArray(profile?.office_research?.roles) ? profile.office_research.roles : [];
  // Provider-county profiles: a village office named "X County Building
  // Department" is county-administered — its evidence was researched on the
  // parent county's profile, which the own-profile lookup can never see.
  const countyRoles = countyProfile && countyProfile !== profile
    ? (Array.isArray(countyProfile?.office_research?.roles) ? countyProfile.office_research.roles : []) : [];
  // L1 — research stamped with the office record id.
  if (officeId) {
    const byId = roles.filter((r) => r?.office_id && r.office_id === officeId);
    if (byId.length) return byId;
  }
  // L2 — name/alias, trying the entry's office_name AND label, in the own
  // profile and the county profile's research. An exact normalized match in
  // either pool outranks a substring containment in the other — "Test County
  // Building Department" is the county entry verbatim, not the village's own
  // "Building Department" which merely sits inside the longer name.
  const keys = new Set([norm(officeName), norm(cleanOfficeName(officeName).clean)].filter(Boolean));
  const namesOf = (r) => [r?.office_name, r?.label].map(norm).filter(Boolean);
  const exactHit = (r) => namesOf(r).some((rn) => keys.has(rn));
  const nameHit = (r) => namesOf(r).some((rn) => [...keys].some((k) => rn === k || rn.includes(k) || k.includes(rn)));
  const exact = [...roles.filter(exactHit), ...countyRoles.filter(exactHit)];
  if (exact.length) return exact;
  const hits = roles.filter(nameHit);
  if (hits.length) return hits;
  const countyHits = countyRoles.filter(nameHit);
  if (countyHits.length) return countyHits;
  // Stub offices: county-administered / shared-service / loc-named loose
  // match (unchanged — see block comment above).
  let loose = [];
  if (isStubOffice(officeName, loc?.name)) {
    const countyToks = nameTokens(profile?.county_name || loc?.parent_county_name || loc?.county_name || '');
    const locToks = nameTokens(loc?.name || '');
    loose = roles.filter((r) => {
      const rn = norm(r?.office_name || r?.label);
      if (!rn) return false;
      if (/county.administered|county.wide|unincorporated/i.test(`${r?.service_area || ''} ${r?.notes || ''}`)) return true;
      if (countyToks.length && countyToks.every((t) => rn.includes(t))) return true;
      if (locToks.length && locToks.every((t) => rn.includes(t))) return true;
      return false;
    });
    if (loose.length) return loose;
  }
  // L3 — profile union (+ county union): a same-role entry IS the discovered
  // authority for a stub, and a candidate for a drifted real name. The
  // strict check gates misattribution (office name must appear in the quote
  // or the entry name).
  if (officeRoles.length) {
    const byRole = [...roles, ...countyRoles].filter((r) => officeRoles.includes(r?.role) && !WRONG_DEPT.test(String(r?.office_name || r?.label || '')));
    if (byRole.length) return byRole;
  }
  return loose;
}

// The strict bar: everything roleEvidence checks AND the quote carries the
// role's own keyword (the old OR-coherence let a dept word in the office NAME
// substitute for role evidence), AND the office's cleaned name isn't junk /
// generic / non-permit / placeholder, AND its distinctive tokens appear in
// the quote or in the entry's provider name (the alias path — a "Sign permit
// issuer" entry still counts when it names this office's real provider).
// A quote missing the role keyword may still be rescued by its own page:
// the role keyword in the URL path or the stored page title counts when the
// quote is a real responsibility sentence (permit/issue/review/administer/
// inspect/enforce verb, ≥40 chars — nav and title-only quotes never qualify)
// and the source is official. sign_permit is NOT rescued by a /zoning or
// /building path; electrical is not rescued by /building-inspections.
const RESP_VERB = /permits?|issu|review|administ|inspect|enforc/i;
const urlPath = (u) => { try { return new URL(u).pathname; } catch { return String(u || ''); } };
export function strictRoleEvidence(role, entry, officeName, locName, profile) {
  const gaps = roleEvidence(role, entry, profile);
  const q = clean(entry?.responsibility_quote);
  let kwOk = !ROLE_FUNC[role] || ROLE_FUNC[role].test(q);
  if (!kwOk && ROLE_FUNC[role] && q.length >= 40 && RESP_VERB.test(q)) {
    const src = clean(entry?.official_source_url);
    if (src && isOfficialSource(src, profile) && (ROLE_FUNC[role].test(urlPath(src)) || ROLE_FUNC[role].test(clean(entry?.page_title) || clean(entry?.title)))) kwOk = true;
  }
  if (!kwOk) gaps.push(`${role}:role_keyword_missing`);
  const cname = cleanOfficeName(officeName).clean;
  if (!cname || isGenericOfficeName(cname) || isNonPermitOfficeName(officeName) || isPlaceholderOffice(officeName, locName)) {
    gaps.push(`${role}:office_name_junk`);
  } else {
    const toks = nameTokens(cname);
    if (toks.length) {
      const has = (hay) => { const h = ` ${norm(hay)} `; return toks.every((t) => h.includes(` ${t} `) || h.includes(t)); };
      if (!has(q) && !has(`${entry?.office_name || ''} ${entry?.label || ''}`)) gaps.push(`${role}:office_name_absent_from_evidence`);
    }
  }
  return gaps;
}

const AUTHORITY_ROLES = new Set(['sign_permit', 'zoning', 'building', 'electrical', 'electrical_permit', 'electrical_inspection', 'right_of_way', 'historic_review', 'planning', 'transportation', 'other']);

async function loadProfiles() {
  const [oh, ky] = await Promise.all([
    mirrorRead('profiles-oh.slim', 45 * 60 * 1000, async () => null),
    mirrorRead('profiles-ky.slim', 45 * 60 * 1000, async () => null),
  ]);
  const rows = [...(oh || []), ...(ky || [])];
  const byId = new Map(), byKey = new Map();
  for (const p of rows) {
    if (p?.id) byId.set(p.id, p);
    const k = `${p?.state}|${normalizePermitJurisdictionName(p?.name || '')}|${normalizePermitJurisdictionName(p?.county_name || '')}`;
    if (p?.name && !byKey.has(k)) byKey.set(k, p);
  }
  return { rows, byId, byKey, identity: buildIdentityIndex(rows) };
}
async function loadLocalities() {
  return (await mirrorRead('localities', 20 * 60 * 1000, async () => null)) || [];
}

// Provider-county index: `${state}|${norm(county name)}` → county profile.
// A village office named "X County Building Department" is county-administered
// — its evidence was researched on the county's profile, which its own
// linked profile never contains (the 650-office no_matching_entry class).
export function buildCountyIndex(rows) {
  const m = new Map();
  for (const p of rows || []) {
    if (String(p?.type) !== 'county' || !p?.name) continue;
    const k = `${String(p.state || '').toUpperCase().trim()}|${normalizePermitJurisdictionName(p.name)}`;
    const prev = m.get(k);
    if (!prev) { m.set(k, p); continue; }
    // Identity-equal county dupes carry research too (Darke County has an
    // 8-entry row and an empty one) — union the roles so the empty row
    // can't shadow the researched one.
    const extra = p.office_research?.roles || [];
    if (extra.length) m.set(k, { ...prev, office_research: { ...(prev.office_research || {}), roles: [...(prev.office_research?.roles || []), ...extra] } });
  }
  return m;
}
export function countyProfileFor(loc, countyIndex) {
  if (!loc || !countyIndex) return null;
  const st = String(loc.state || '').toUpperCase().trim();
  for (const part of String(loc.county_name || loc.parent_county_name || '').split('/')) {
    const hit = countyIndex.get(`${st}|${normalizePermitJurisdictionName(part.trim())}`);
    if (hit) return hit;
  }
  return null;
}

function profileFor(loc, idx) {
  if (loc.jurisdiction_profile_id && idx.byId.has(loc.jurisdiction_profile_id)) return idx.byId.get(loc.jurisdiction_profile_id);
  return idx.byKey.get(`${loc.state}|${normalizePermitJurisdictionName(loc.name || '')}|${normalizePermitJurisdictionName(loc.county_name || '')}`) ||
    idx.byKey.get(`${loc.state}|${normalizePermitJurisdictionName(loc.name || '')}|`) || null;
}

// Page text vs stored quote: research stored decoded text ("Planning & Zoning")
// while raw HTML carries entities ("&amp;") — undecoded, only ~1 in 70 live
// pages ever matched, so nothing was promoted. Decode entities, drop
// script/style, and fold smart quotes/dashes on both sides.
const decodeEntities = (s) => String(s || '')
  .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'").replace(/&ldquo;|&rdquo;/gi, '"')
  .replace(/&ndash;|&mdash;/gi, '-').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const comparableText = (s) => decodeEntities(s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').toLowerCase().trim();
const pageText = (html) => comparableText(String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));

async function pass(onlyNames = null) {
  const [idx, localities] = await Promise.all([loadProfiles(), loadLocalities()]);
  const countyIndex = buildCountyIndex(idx.rows);
  // promote_hold: strict-pass offices are CANDIDATES for the AI judge, not
  // promotions. Verdicts accumulate in judge-verdicts.jsonl; when the hold
  // lifts, promotion requires a 'yes' verdict per role on top of strict +
  // live re-fetch. If the judge is unreachable, candidates keep holding —
  // nothing ever promotes on the strict check alone anymore.
  const holdOn = readControl().promote_hold !== false;
  const judgeVerdicts = verdictMap();
  const judgeNoBoosts = []; // {locality_id, office_name, role} — 'no' verdicts needing re-research
  const pendingCands = pendingCandidates(); // dedupe repeated candidate emission
  const only = onlyNames ? new Set(onlyNames.map((h) => `${String(h.name || '').toLowerCase().trim()}|${String(h.state || '').toUpperCase().trim()}`)) : null;
  // Fresh-first ordering: enrichers append name|state to verify-first.jsonl
  // the moment evidence lands — re-judging those localities immediately cuts
  // promotion lag from a full scan position to seconds. Stale entries (>20m)
  // are dead weight; feed file self-trims.
  const first = new Set();
  try {
    const lines = readFileSync('.audit-work/verify-first.jsonl', 'utf8').trim().split('\n');
    const fresh = [];
    for (const l of lines) {
      try { const e = JSON.parse(l); if (Date.now() - (e.at || 0) < 20 * 60e3) { first.add(`${String(e.name || '').toLowerCase().trim()}|${String(e.state || '').toUpperCase().trim()}`); fresh.push(l); } } catch {}
    }
    if (lines.length > 400 || fresh.length !== lines.length) writeFileSync('.audit-work/verify-first.jsonl', fresh.slice(-300).join('\n') + (fresh.length ? '\n' : ''));
  } catch {}
  if (first.size) localities.sort((a, b) => Number(first.has(`${String(b.name || '').toLowerCase().trim()}|${String(b.state || '').toUpperCase().trim()}`)) - Number(first.has(`${String(a.name || '').toLowerCase().trim()}|${String(a.state || '').toUpperCase().trim()}`)));
  emit({ stage: 'auth_verify_pass', detail: `${localities.length} localities · ${idx.rows.length} profiles${first.size ? ` · ${first.size} verify-first` : ''}` });
  let promoted = 0, gapped = 0, wrote = 0, scanned = 0;
  const passStart = Date.now();
  // Office-state ledger: per-office failure state persists across passes so
  // attempt counts and the held-review list survive restarts.
  const officeState = readJSON(OFFICE_STATE_FILE, { offices: {} });
  const st = officeState.offices;
  const recordOffice = (loc, o, outcome) => {
    const k = `${loc.id}:${o.id || o.name}`;
    const prev = st[k] || { attempts: 0 };
    const earns = outcome.countAttempt && Date.now() - (prev.last_attempt_at || 0) >= ATTEMPT_SPACING_MS;
    st[k] = {
      locality_id: loc.id, jurisdiction: `${loc.name}, ${loc.state}`, office_id: o.id || null, office_name: o.name,
      status: outcome.status, reasons: outcome.reasons || [], missing_roles: outcome.missing || [],
      attempts: outcome.status === 'staff_verified' ? 0 : (earns ? (prev.attempts || 0) + 1 : (prev.attempts || 0)),
      last_attempt_at: earns ? Date.now() : (prev.last_attempt_at || 0),
      last_at: new Date().toISOString(),
    };
  };
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  let lastLedgerWrite = Date.now(), scannedLocs = 0;
  for (const loc of localities) {
    // Mid-pass checkpoint every 90s: a pass runs ~30min and restarts/culls
    // used to leave the ledger stale (the unlock gate needs it fresh) and
    // drop a pass's attempt bookkeeping.
    if (Date.now() - lastLedgerWrite > 90e3) {
      writeVerificationLedger(localities, officeState, passStart);
      heartbeat('authority-verifier', 'busy', `verify pass ${scannedLocs}/${localities.length}`);
      lastLedgerWrite = Date.now();
    }
    scannedLocs++;
    // Tombstoned rows (duplicate_of set) are dead — relink/researchers skip
    // them already; scanning their offices wastes pass time and counts dead
    // offices in the ledger.
    if (loc?.duplicate_of) continue;
    if (only && !only.has(`${String(loc.name || '').toLowerCase().trim()}|${String(loc.state || '').toUpperCase().trim()}`)) continue;
    if (SLICES > 1 && Math.abs(hash(loc.id)) % SLICES !== SLICE) continue;
    const offices = Array.isArray(loc.offices) ? loc.offices : [];
    const candidates = offices.filter((o) => (o?.authority_verification_status === 'needs_verification' || o?.authority_verification_status === 'needs_recheck') && Array.isArray(o?.authority_roles) && o.authority_roles.length);
    if (!candidates.length) continue;
    const profile = profileFor(loc, idx);
    if (!profile) { for (const o of candidates) recordOffice(loc, o, { status: 'needs_verification', reasons: ['no_profile'], missing: o.authority_roles }); continue; } // no repository identity — the sweep/research pipeline owns that gap
    // Research union: the linked profile's roles PLUS every identity-equal
    // profile's (historical dupes carry research too), deduped role+url+quote.
    const researchProfile = withUnionResearch(idx.identity, profile);
    const countyProfile = countyProfileFor(loc, countyIndex);
    let changed = false;
    const okList = [];
    const next = offices.map((o) => ({ ...o }));
    for (const o of next) {
      if ((o?.authority_verification_status !== 'needs_verification' && o?.authority_verification_status !== 'needs_recheck') || !Array.isArray(o?.authority_roles) || !o.authority_roles.length) continue;
      scanned += 1;
      const hits = researchForOffice(researchProfile, o.name, loc, o.authority_roles, o.id, countyProfile);
      // Research hasn't reached this office yet — WIP, not a gap. Recorded
      // as no_research but no attempt is burned (nothing evaluated).
      if (!hits.length) { recordOffice(loc, o, { status: 'needs_verification', reasons: ['no_research'], missing: o.authority_roles }); continue; }
      // Repair model: the seed bridge claimed every researched role including
      // 'unknown'/'not_applicable_candidate' entries. Keep only roles carrying
      // a potentially_applicable entry that passes the evidence guards;
      // denied/unproven roles move to unproven_roles + auto_verification_gaps
      // for the (<1%) review list. An office whose entire set is unproven
      // stays needs_verification — it contributes nothing to apply_allowed.
      const proven = [], trimmed = [];
      let providerName = null;
      const passingEntries = {};
      const tiers = {};
      for (const r of o.authority_roles) {
        if (!AUTHORITY_ROLES.has(r)) { trimmed.push(`${r}:unknown_role`); continue; }
        const entries = hits.filter((h) => h?.role === r);
        const denied = entries.length && entries.every((e) => String(e?.applicability) === 'not_applicable_candidate');
        if (denied) { trimmed.push(`${r}:research_denied`); continue; }
        const passing = entries.find((e) => String(e?.applicability) === 'potentially_applicable' && strictRoleEvidence(r, e, o.name, loc?.name, profile).length === 0);
        if (passing) {
          proven.push(r); passingEntries[r] = passing; providerName = providerName || clean(passing.office_name || passing.label) || null;
          // MP-5.2 — corroboration tier: distinct evidence hosts backing
          // this role. ≥2 sources = corroborated; 1 = single-source.
          const hosts = new Set(entries.filter((e) => String(e?.applicability) === 'potentially_applicable')
            .map((e) => { try { return new URL(e.official_source_url).host.toLowerCase().replace(/^www\./, ''); } catch { return null; } }).filter(Boolean));
          // MP-4.3 roster corroboration — an OH BBS-certified dept is a
          // second source for its own roles; KY electrical roles carry the
          // DHBC structural fact (all KY electrical inspection is by
          // state-certified inspectors).
          if (String(profile.state || '').toUpperCase() === 'OH' && ohioCertifiedDept(profile.name)) hosts.add('ohio-bbs-cert');
          if (String(profile.state || '').toUpperCase() === 'KY' && /electric/i.test(r)) hosts.add('ky-dhbc');
          tiers[r] = hosts.size >= 2 ? 'verified' : 'single_source';
          continue;
        }
        const applicable = entries.find((e) => String(e?.applicability) === 'potentially_applicable');
        if (applicable) trimmed.push(...strictRoleEvidence(r, applicable, o.name, loc?.name, profile));
        else trimmed.push(`${r}:${entries.length ? 'research_unknown' : 'no_research_entry'}`);
      }
      if (proven.length) {
        // MP-5.1 adversarial re-fetch — before promoting, re-GET each distinct
        // evidence URL and require the quote verbatim in live page text. A
        // stale/404/moved source demotes that role to `stale_source` instead
        // of stamping verification on evidence that no longer exists.
        const checked = new Map(); // url -> 'live'|'dead'
        const stillProven = [];
        for (const r of proven) {
          const e = passingEntries[r] || {};
          const url = clean(e.official_source_url);
          const quote = clean(e.responsibility_quote);
          if (!url || !quote) { stillProven.push(r); continue; }
          if (!checked.has(url)) {
            let verdict = 'dead';
            try {
              // Browser UA — com.ohio.gov and similar .gov hosts 404 bot UAs,
              // which stale_source-demoted live BBS roster evidence. A human
              // sees this page, so the check must fetch what a human gets.
              const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
              if (resp.ok) {
                const ct = String(resp.headers.get('content-type') || '');
                // Binary source (PDF roster like the OH BBS certified list):
                // verbatim-quote can't apply to a compressed stream — the
                // claim was verified by harvest-time parse of THIS document,
                // so document liveness is the correct residual check.
                if (/pdf|octet-stream/i.test(ct) || /\.pdf([?#]|$)/i.test(url)) verdict = 'live';
                else {
                  const text = pageText(await resp.text());
                  if (text.includes(comparableText(quote).slice(0, 60))) verdict = 'live';
                }
              }
            } catch {}
            checked.set(url, verdict);
          }
          if (checked.get(url) === 'live') stillProven.push(r);
          else trimmed.push(`${r}:stale_source`);
        }
        proven.length = 0; proven.push(...stillProven);
      }
      if (proven.length) {
        // Judge gate — a strict pass makes these roles CANDIDATES, not
        // promotions. The AI promotion judge decides per-role; nothing
        // promotes on the strict check alone.
        const fresh = proven.map((r) => {
          const e = passingEntries[r] || {};
          return { role: r, entry_office_name: clean(e.office_name || e.label), quote: clean(e.responsibility_quote), url: clean(e.official_source_url) };
        });
        // Verdicts key on office|role|evidence-hash — new research produces a
        // new hash and gets re-judged instead of inheriting a stale verdict.
        const cleanQ = new Map(fresh.map((r) => [r.role, r.quote]));
        const hashOf = (r) => candHash({ office_id: o.id, role: r, quote: cleanQ.get(r) });
        const toQueue = fresh.filter((r) => !pendingCands.has(vkey(o.id, r.role, candHash({ office_id: o.id, role: r.role, quote: r.quote }))));
        if (toQueue.length) appendCandidates(loc, o, toQueue);
        if (holdOn) {
          recordOffice(loc, o, { status: o.authority_verification_status === 'needs_recheck' ? 'needs_recheck' : 'needs_verification', reasons: ['promote_hold'], missing: [] });
          continue;
        }
        const dj = resolveJudged(o.id, proven, hashOf, judgeVerdicts);
        trimmed.push(...dj.gaps);
        for (const b of dj.noBoosts) judgeNoBoosts.push({ locality_id: loc.id, office_name: o.name, role: b.role, reason: b.reason });
        proven.length = 0; proven.push(...dj.judged);
      }
      if (proven.length) {
        o.authority_roles = proven;
        // Stub names ("Zoning authority", "City of <Jurisdiction>", role
        // templates like "Right-of-way authority") carry no real provider
        // identity — upgrade to the judged/researched provider name so the
        // app shows who actually administers the role.
        if (providerName && (isStubOffice(o.name, loc?.name) || isPlaceholderOffice(o.name, loc?.name)) && norm(providerName) !== norm(o.name)) {
          const v0 = judgeVerdicts.get(vkey(o.id, proven[0], candHash({ office_id: o.id, role: proven[0], quote: clean(passingEntries[proven[0]]?.responsibility_quote) })));
          o.name = v0?.provider && norm(v0.provider) === norm(providerName) ? v0.provider : providerName;
        }
        // keep display labels consistent with the repaired role set
        const RT = { sign_permit: 'Sign permit', zoning: 'Zoning', building: 'Building', electrical: 'Electrical', electrical_permit: 'Electrical permit', electrical_inspection: 'Electrical inspection', right_of_way: 'Right of way', historic_review: 'Historic review', planning: 'Planning', transportation: 'Transportation', other: 'Permitting' };
        if (Array.isArray(o.office_types)) o.office_types = proven.map((r) => RT[r] || r);
        if (o.office_type) o.office_type = RT[proven[0]] || o.office_type;
        o.authority_verification_status = 'staff_verified';
        delete o.recheck_reason; delete o.recheck_at; // re-proven — the needs_recheck label clears
        o.verified_by = 'evidence-pipeline';
        o.verified_at = new Date().toISOString();
        // MP-5.2 — office-level tier: 'verified' only when EVERY proven role
        // has ≥2 distinct evidence hosts.
        const tierList = proven.map((r) => tiers[r] || 'single_source');
        o.corroboration_tier = tierList.every((t) => t === 'verified') ? 'verified' : 'single_source';
        o.corroboration_tiers = tiers;
        // W5.1 — completeness flag: single-source promotes only when the record
        // is COMPLETE. A verified office with zero contact channels stays
        // verified (the evidence is real) but flags for a contact-fill pass —
        // it joins the <1% review surface instead of silently shipping thin.
        const hasContact = ['contact_phone', 'contact_email', 'contact_website', 'contact_address', 'contact_person'].some((f) => String(o[f] || '').trim());
        if (hasContact) delete o.completeness_flag;
        else o.completeness_flag = 'no_contact';
        if (trimmed.length) { o.auto_verification_gaps = trimmed; o.unproven_roles = trimmed.map((g) => g.split(':')[0]); }
        else { delete o.auto_verification_gaps; delete o.unproven_roles; }
        o.contact_notes = `${clean(o.contact_notes)} [evidence-pipeline: ${proven.join('+')} verified ${new Date().toISOString().slice(0, 10)} from official sources on ${profile.name}${profile.state ? `, ${profile.state}` : ''}${trimmed.length ? `; trimmed ${trimmed.length} unproven` : ''}]`.trim();
        promoted += 1; changed = true;
        recordOffice(loc, o, { status: 'staff_verified' });
        // emit only after the write confirms — phantom oks lied last pass
        okList.push({ office: o.name, roles: proven, trimmed: trimmed.length });
      } else {
        const before = JSON.stringify(o.auto_verification_gaps || []);
        o.auto_verification_gaps = trimmed;
        o.unproven_roles = trimmed.map((g) => g.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i);
        if (JSON.stringify(o.auto_verification_gaps) !== before) changed = true;
        gapped += 1;
        // Evaluated and held — the failure earns an attempt; REVIEW_ATTEMPTS
        // of these move the office to the human-review list in the ledger.
        // Name-structural failures (junk name, name absent from evidence) are
        // record problems for the researcher, not evidence gaps — retrying
        // them only floods the review list, so they earn no attempt.
        const NAME_STRUCT = /office_name_junk|office_name_absent_from_evidence|awaiting_judge|ai_judge/;
        const burnable = trimmed.some((g) => !NAME_STRUCT.test(g));
        const missing = trimmed.map((g) => g.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i);
        // A needs_recheck office that still fails keeps its recheck status in
        // the office-state ledger — it is its own bucket, not a fresh gap.
        const outStatus = o.authority_verification_status === 'needs_recheck' ? 'needs_recheck' : 'needs_verification';
        recordOffice(loc, o, { status: outStatus, reasons: trimmed.map((g) => gapCat(g.split(':').slice(1).join(':'))), missing, countAttempt: burnable });
      }
    }
    if (changed && !DRY) {
      try {
        // Local-first writes: apply my deltas onto the mirror snapshot (loc is
        // mirror-fresh from this pass) and enqueue the update — the flusher
        // streams it to the app at a capped rate instead of every promote
        // hammering staffEntityWrite live. mirrorApply keeps local state true
        // immediately so later passes/verifier sees the promotion now.
        const delta = new Map(next.filter((o) => o?.id).map((o) => [o.id, o]));
        const merged = offices.map((o) => (o?.id && delta.has(o.id) ? { ...o, ...delta.get(o.id) } : o));
        enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices: merged }, mirror: 'localities', note: `${loc.name}, ${loc.state} — authority promote`, priority: 1 });
        wrote += 1;
        mirrorApply('localities', { ...loc, offices: merged });
        for (const k of okList) {
          try { appendFileSync(PROMOTIONS_LOG, JSON.stringify({ at: Date.now(), locality_id: loc.id, jurisdiction: `${loc.name}, ${loc.state}`, office: k.office, roles: k.roles }) + '\n'); } catch {}
          emit({ stage: 'auth_verify_ok', jurisdiction: `${loc.name}, ${loc.state}`, address: `${loc.name}, ${loc.state}`, detail: `${k.office} → ${k.roles.join('+')}${k.trimmed ? ` (trimmed ${k.trimmed})` : ''}` });
        }
      } catch (e) {
        emit({ stage: 'auth_verify_error', jurisdiction: `${loc.name}, ${loc.state}`, detail: String(e?.message || e).slice(0, 140) });
      }
      await sleep(DELAY);
    }
  }
  // Pending "apply when verified" requests — the picker's background path.
  // Once a locality is apply-ready (some office staff_verified for sign_permit
  // AND some for zoning), its queued work orders get their permit lines here —
  // the same create shape the Permitting page uses — then the queue clears.
  if (!DRY && SLICE === 0) await consumePendingApplies(localities);
  // 'no' verdicts target re-research on exactly the rejected roles — the
  // judge says the current evidence is for something/somewhere else.
  if (judgeNoBoosts.length) {
    const byLoc = new Map();
    for (const b of judgeNoBoosts) {
      const cur = byLoc.get(b.locality_id) || { roles: new Set(), offices: new Set() };
      cur.roles.add(b.role); cur.offices.add(b.office_name); byLoc.set(b.locality_id, cur);
    }
    for (const [locality_id, b] of byLoc) addBoost({ locality_id, type: 'needs_recheck', finding: { type: 'needs_recheck', roles: [...b.roles], offices: [...b.offices], reason: `AI judge: evidence rejected for ${[...b.roles].join(', ')}` } });
  }
  writeVerificationLedger(localities, officeState, passStart);
  emit({ stage: 'auth_verify_done', detail: `scanned ${scanned} offices · promoted ${promoted} · gapped ${gapped} · wrote ${wrote}` });
}

// Ledger tallies cover the WHOLE mirror — the fleet's position, not just
// what this pass scanned. Gap reasons aggregate the primary failure per
// failing office; held offices (>=REVIEW_ATTEMPTS failed evaluations)
// surface on the dashboard instead of looping forever.
function writeVerificationLedger(localities, officeState, passStart) {
  try {
    const st = officeState.offices || {};
    const jur = { all_verified: 0, some_verified: 0, none_verified: 0, no_offices: 0 };
    const offices = { total: 0, staff_verified: 0, needs_verification: 0, needs_review: 0, needs_recheck: 0 };
    const gapReasons = {}, missingRoles = {};
    const tomb = new Set(localities.filter((l) => l?.duplicate_of).map((l) => l.id));
    // Needs-a-person requires both strikes AND research exhaustion — offices
    // with untried tiers stay workable needs_verification. Cooldown entries
    // record which tiers ran; any attempts count as T1 done.
    const cds = readCooldowns();
    const exh = (locId, attempts) => tierExhausted(cds[`gap-${locId}`], (attempts || 0) > 0);
    const tried = (locId, attempts) => [...tiersDone(cds[`gap-${locId}`], (attempts || 0) > 0)].sort();
    // Localities declared as having no permitting authority (paper records
    // tombstoned onto the county/state jurisdiction that actually permits).
    const notPermitting = localities
      .filter((l) => l?.duplicate_of && /no permitting authority/i.test(`${l.name || ''} ${l.permit_required_summary || ''}`))
      .map((l) => ({ name: String(l.name || '').replace(/ *[(][^)]*[)]/g, '').trim(), state: l.state, county: l.county_name, handled_by: l.permit_required_summary || null }))
      .slice(0, 100);
    for (const l of localities) {
      if (l?.duplicate_of) continue;
      const offs = (Array.isArray(l.offices) ? l.offices : []).filter((o) => Array.isArray(o?.authority_roles) && o.authority_roles.length);
      if (!offs.length) { jur.no_offices++; continue; }
      const v = offs.filter((o) => o.authority_verification_status === 'staff_verified').length;
      if (v === offs.length) jur.all_verified++; else if (v) jur.some_verified++; else jur.none_verified++;
      for (const o of offs) {
        offices.total++;
        if (o.authority_verification_status === 'needs_recheck') { offices.needs_recheck++; continue; }
        const ok = o.authority_verification_status === 'staff_verified';
        if (ok) { offices.staff_verified++; continue; }
        const rec = st[`${l.id}:${o.id || o.name}`];
        if ((rec?.attempts || 0) >= REVIEW_ATTEMPTS && exh(l.id, rec.attempts)) { offices.needs_review++; continue; }
        offices.needs_verification++;
      }
    }
    // Failing-office breakdown from the per-office state written this pass
    // AND prior passes — a held office's reason stays attached. Records for
    // renamed/soft-retired offices are dead weight — the live key set drops
    // them from gap tallies and the needs-a-person list.
    const live = new Set();
    for (const l of localities) {
      if (l?.duplicate_of) continue;
      for (const o of l.offices || []) live.add(`${l.id}:${o.id || o.name}`);
    }
    const held = [];
    for (const [k, rec] of Object.entries(st)) {
      if (!rec || rec.status !== 'needs_verification') continue;
      if (tomb.has(rec.locality_id) || !live.has(k)) continue;
      const primary = (rec.reasons || [])[0] || 'other';
      gapReasons[primary] = (gapReasons[primary] || 0) + 1;
      for (const r of rec.missing_roles || []) missingRoles[r] = (missingRoles[r] || 0) + 1;
      if ((rec.attempts || 0) >= REVIEW_ATTEMPTS && exh(rec.locality_id, rec.attempts)) held.push({ locality_id: rec.locality_id, jurisdiction: rec.jurisdiction, office: rec.office_name, reasons: rec.reasons, missing_roles: rec.missing_roles, attempts: rec.attempts, last_at: rec.last_at, tiers_tried: tried(rec.locality_id, rec.attempts) });
    }
    held.sort((a, b) => b.attempts - a.attempts || String(a.jurisdiction).localeCompare(b.jurisdiction));
    const hour = Date.now() - 3600e3, day = Date.now() - 86400e3;
    let promos = [];
    try { promos = readFileSync(PROMOTIONS_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
    const h = promos.filter((p) => p.at >= hour).length, d = promos.filter((p) => p.at >= day).length;
    const perHour = d / 24;
    const remaining = offices.needs_verification;
    let held_relinks = [];
    try { held_relinks = readFileSync('.audit-work/relink-needs-review.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
    const ledger = {
      at: new Date().toISOString(),
      pass_ms: Date.now() - passStart,
      jurisdictions: jur,
      offices,
      gap_reasons: gapReasons,
      missing_roles: Object.fromEntries(Object.entries(missingRoles).sort((a, b) => b[1] - a[1]).slice(0, 15)),
      promotions: { last_hour: h, last_24h: d, last_at: promos.length ? new Date(Math.max(...promos.map((p) => p.at))).toISOString() : null },
      eta: { needs_verification: remaining, promotions_per_hour: Math.round(perHour * 100) / 100, hours: perHour > 0 ? Math.round(remaining / perHour) : null },
      held_relinks: held_relinks.slice(-50),
      not_permitting: notPermitting,
      needs_review: held.slice(0, 200),
      needs_review_total: held.length,
    };
    writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 1));
    writeFileSync(OFFICE_STATE_FILE, JSON.stringify(officeState));
  } catch (e) {
    emit({ stage: 'verify_ledger_error', ok: false, detail: String(e?.message || e).slice(0, 160) });
  }
}

const applyReadyOffices = (offices) => {
  const has = (role) => (offices || []).some((o) => o?.authority_verification_status === 'staff_verified' && (o.authority_roles || []).includes(role));
  return has('sign_permit') && has('zoning');
};

async function consumePendingApplies(localities) {
  const wants = localities.filter((l) => !l?.duplicate_of && Array.isArray(l?.pending_applies) && l.pending_applies.length);
  for (const loc of wants) {
    const fresh = await call('staffDataRead', { entity: 'PermitLocality', query: { id: loc.id }, limit: 1 }).then((r) => (r?.records || r?.data || r?.items || [])[0]).catch(() => null);
    if (!fresh) continue;
    const pend = Array.isArray(fresh.pending_applies) ? fresh.pending_applies : [];
    if (!pend.length) continue;
    const ready = applyReadyOffices(fresh.offices);
    if (!ready) emit({ stage: 'pending_apply_wait', jurisdiction: `${fresh.name}, ${fresh.state}`, detail: `${pend.length} job(s) queued — offices not verified yet` });
    let remaining = [...pend];
    for (const p of pend) {
      const woId = String(p?.work_order_id || '');
      if (!woId) { remaining = remaining.filter((x) => x !== p); continue; }
      const wo = await call('staffDataRead', { entity: 'WorkOrder', query: { id: woId }, limit: 1 }).then((r) => (r?.records || r?.data || r?.items || [])[0]).catch(() => null);
      if (!wo) { remaining = remaining.filter((x) => x !== p); continue; }
      const existing = await call('staffDataRead', { entity: 'PermitLineItem', query: { work_order_id: woId }, limit: 200 }).then((r) => r?.records || r?.data || r?.items || []).catch(() => []);
      if ((existing || []).some((li) => String(li.locality_id || '') === String(loc.id))) {
        if (!ready) continue; // lines exist, still unverified — keep the entry queued for the upgrade pass
        // Lines already on the job — the "add now + auto-verify" path leaves
        // them marked 'Applied before office verification'. Upgrade those
        // placeholders with the real verified office data instead of skipping.
        const mine = existing.filter((li) => String(li.locality_id || '') === String(loc.id));
        const verifiedOffices = (fresh.offices || []).filter((o) => o?.authority_verification_status === 'staff_verified');
        let upgraded = 0;
        for (const li of mine) {
          if (!/before office verification/i.test(String(li.notes || ''))) continue;
          const ltypes = Array.isArray(li.office_types) && li.office_types.length ? li.office_types : li.office_type ? [li.office_type] : [];
          const match = verifiedOffices.find((o) => {
            const ot = Array.isArray(o.office_types) && o.office_types.length ? o.office_types : o.office_type ? [o.office_type] : [];
            return ltypes.some((t) => ot.includes(t));
          }) || verifiedOffices[0];
          const patch = { notes: `Offices verified ${new Date().toISOString().slice(0, 10)} — permit line auto-updated by the evidence pipeline.` };
          if (match) {
            patch.row_name = match.name || li.row_name;
            patch.office_type = (Array.isArray(match.office_types) && match.office_types[0]) || match.office_type || li.office_type;
            patch.office_types = Array.isArray(match.office_types) && match.office_types.length ? match.office_types : (match.office_type ? [match.office_type] : li.office_types);
            patch.locality_office_id = String(match.id || '').trim();
            patch.steps = (match.workflow_steps || []).map((s) => ({ ...s, value: '', checked: false }));
          }
          enqueue({ entity: 'PermitLineItem', op: 'update', id: li.id, data: patch, note: `upgrade pending line — ${wo.client_name || woId}`, priority: 1 });
          upgraded++;
        }
        remaining = remaining.filter((x) => x !== p);
        emit({ stage: 'pending_apply_done', jurisdiction: `${fresh.name}, ${fresh.state}`, detail: `upgraded ${upgraded} pending line(s) on ${wo.client_name || woId} — offices now verified` });
        enqueue({ entity: 'WorkOrder', op: 'updateMany', id: woId, query: { id: woId, updated_date: wo.updated_date }, update: { $set: { pending_permit_locality_id: '', pending_permit_locality_name: '' } }, note: `clear pending marker — ${wo.client_name || woId}`, priority: 1 });
        continue;
      }
      const skipKeys = new Set(Array.isArray(p.skip_office_keys) ? p.skip_office_keys : []);
      const officesToCreate = (Array.isArray(fresh.offices) ? fresh.offices : [])
        .filter((o, i) => !skipKeys.has(o.id || `office-${i}`))
        .map((o) => {
          const roles = (Array.isArray(o?.authority_roles) ? o.authority_roles : []).filter((r) => KNOWN_ROLE_SET.has(r));
          const declared = Array.isArray(o?.office_types) && o.office_types.length ? o.office_types : o?.office_type ? [o.office_type] : [];
          const types = roles.length ? roles : declared.filter((t) => KNOWN_ROLE_SET.has(t));
          return { name: o.name || types[0] || 'Office', office_types: types, office_type: o?.office_type || declared[0] || '', office_id: o.id, steps: (o.workflow_steps || []).map((s) => ({ ...s, value: '', checked: false })) };
        })
        .filter((o) => !p.exclude_electrical || !(o.office_types.some((t) => /electrical/i.test(t)) || /electrical/i.test(o.office_type)));
      const toCreate = officesToCreate.length ? officesToCreate : [{ name: fresh.name || 'Office', office_types: [], office_type: '', office_id: '', steps: [] }];
      let ok = true;
      for (const office of toCreate) {
        // Enqueue through the outbox — the flusher streams creates at the
        // capped rate. Dedupe already happened above against live lines.
        const queued = enqueue({
          entity: 'PermitLineItem', op: 'create',
          data: {
            work_order_id: woId,
            work_order_title: wo.client_name || '',
            work_order_description: wo.description || '',
            row_name: office.name,
            office_type: office.office_type,
            office_types: office.office_types,
            locality_id: loc.id,
            locality_name: fresh.name || '',
            locality_office_id: String(office.office_id || '').trim(),
            status: 'active',
            assigned_to: wo.current_task_assigned_to || wo.assigned_to || '',
            applied_by: `${p.requested_by || 'staff'} (auto-applied${ready ? ' after verification' : ' — pending verification'})`,
            applied_date: new Date().toISOString().slice(0, 10),
            // Lines created before sign+zoning verify carry the same visible
            // needs-review marker the page's "use anyway" path stamps — the
            // upgrade pass swaps it for the verified note once evidence lands.
            ...(ready ? {} : { notes: `Applied before office verification — ${fresh.name || 'this office'} does not have verified sign and zoning offices on file yet. Review this line when verification completes.` }),
            steps: office.steps,
            priority: 0,
          },
          note: `${fresh.name}, ${fresh.state} → ${wo.client_name || woId}`,
          priority: 1,
        });
        if (!queued) { ok = false; emit({ stage: 'pending_apply_error', jurisdiction: `${fresh.name}, ${fresh.state}`, detail: 'outbox enqueue failed' }); }
      }
      if (ok) {
        emit({ stage: 'pending_apply_done', jurisdiction: `${fresh.name}, ${fresh.state}`, detail: `${toCreate.length} permit line(s) ${ready ? 'applied' : 'added marked needs-review'} to ${wo.client_name || woId} — queued by ${p.requested_by || 'staff'}` });
        if (ready) {
          // Verified apply consumes the entry + clears the chip. Unverified
          // lines stay queued — the next pass upgrades them when evidence lands.
          remaining = remaining.filter((x) => x !== p);
          enqueue({ entity: 'WorkOrder', op: 'updateMany', id: woId, query: { id: woId, updated_date: wo.updated_date }, update: { $set: { pending_permit_locality_id: '', pending_permit_locality_name: '' } }, note: `clear pending marker — ${wo.client_name || woId}`, priority: 1 });
        }
      }
    }
    if (remaining.length !== pend.length) {
      enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { pending_applies: remaining }, mirror: 'localities', note: `pending_applies trim — ${fresh.name}, ${fresh.state}`, priority: 1 });
      mirrorApply('localities', { ...fresh, pending_applies: remaining });
    }
  }
}

async function main() {
  console.log(`[auth-verifier] slice ${SLICE}/${SLICES} ${ONCE ? 'once' : 'loop'} — evidence-based staff_verified promotion`);
  await freshToken();
  do {
    await waitWhilePaused('authority-verifier', { item: 'verify pass' });
    try { await pass(); } catch (e) { emit({ stage: 'auth_verify_error', detail: String(e?.message || e).slice(0, 200) }); console.error('[auth-verifier] pass error:', e?.message || e); }
    // Trigger-aware idle: backfilled offices wake a targeted scan within
    // ~20s; the full pass still runs on the 10-min schedule as backstop.
    if (!ONCE) { heartbeat('authority-verifier', 'idle', 'between passes'); await idleWait(PASS_SLEEP, 'verify', async (hints) => {
      emit({ stage: 'auth_verify_trigger', detail: `${hints.length} hint(s) — targeted verify now` });
      await pass(hints);
    }, { emit }); }
  } while (!ONCE);
}
// isMain guard — the researcher and ai-auditor import isOfficialSource /
// roleEvidence from this module; without it every import spawns a verifier.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
