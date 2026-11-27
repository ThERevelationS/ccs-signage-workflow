// needs-review-adjudication.mjs — SWE-2.1 adjudication lane helpers.
//
// The researcher/verifier tiers prove positive evidence. They intentionally do
// NOT prove negatives: after every tier fails, an office lands in the person's
// "Needs you" ledger even when the office is a placeholder for a role that does
// not exist locally. This module builds one low-priority adjudication unit per
// office, validates the model's verdict with deterministic guards, and builds
// the exact patch that may be written. Nothing in here performs network or
// entity writes itself — the ai-auditor owns IO and read-back verification.
import { createHash } from 'node:crypto';
import { ohioCertifiedDept, kyElectricalRoster } from './rosters/certified-depts.mjs';
import { regionalProvidersFor } from '../../base44/shared/regionalProviders.mjs';

export const ADJUDICATION_PROMPT_VERSION = 'needs-review-adjudication-v1';
export const VERDICTS = ['not_applicable', 'covered_elsewhere', 'exists_unproven'];
export const MIN_CONFIDENCE = 0.8;

const sha1 = (v) => createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const uniq = (a) => [...new Set((a || []).filter(Boolean))];
const nowIso = () => new Date().toISOString();

/** Roles not tombstoned as not-applicable/covered elsewhere. */
export const activeAuthorityRoles = (o) => (o?.authority_roles || []).filter((r) => !o?.not_applicable_roles?.[r]);

/** Resolve the office-state row for a ledger row (ledger rows carry names, not ids). */
export function officeStateForLedger(row, officeState) {
  const rows = Object.values(officeState?.offices || {});
  const exact = rows.filter((r) => r.locality_id === row.locality_id && norm(r.office_name) === norm(row.office));
  if (exact.length === 1) return exact[0];
  // Degenerate duplicate names are unsafe to adjudicate by name alone.
  return null;
}

/** Find the live office for a needs_review row; missing/archived rows are skipped. */
export function liveOfficeForLedger(row, loc, officeState) {
  const st = officeStateForLedger(row, officeState);
  const offices = loc?.offices || [];
  let office = st?.office_id ? offices.find((o) => (o.id || o.name) === st.office_id) : null;
  if (!office) {
    const matches = offices.filter((o) => norm(o.name) === norm(row.office));
    if (matches.length === 1) office = matches[0];
  }
  return office || null;
}

/** Structural facts the model may cite. Facts are deterministic inputs, not model invention. */
export function structuralFactsFor(loc, profile, countyProfile = null) {
  const facts = [];
  const county = loc?.county_name || loc?.parent_county_name || profile?.parent_county?.name || profile?.county_name || countyProfile?.name || null;
  const state = loc?.state || profile?.state || null;
  const jname = loc?.name || profile?.name || '';
  if (state === 'OH') {
    facts.push({
      key: 'ohio_bbs_certification',
      applies_to_roles: ['building', 'electrical_permit', 'electrical_inspection'],
      certified: ohioCertifiedDept(jname),
      fact: ohioCertifiedDept(jname)
        ? `${jname} is on the Ohio Board of Building Standards certified-jurisdiction roster, so building/electrical permitting is locally administered.`
        : `${jname} is not on the Ohio Board of Building Standards certified-jurisdiction roster; non-certified areas ordinarily fall to the county or state for building/electrical enforcement.`,
      source: 'Ohio Board of Building Standards certified jurisdiction roster',
    });
  }
  if (state === 'KY') {
    const ky = kyElectricalRoster();
    facts.push({ key: 'ky_dhbc_electrical', applies_to_roles: ['electrical_permit', 'electrical_inspection'], fact: ky.fact, source: ky.source, url: ky.roster_url });
  }
  for (const rp of regionalProvidersFor(county, state)) {
    facts.push({ key: `regional_provider:${rp.name}`, applies_to_roles: ['planning', 'zoning', 'sign_permit', 'historic_review'], fact: `${rp.name} is a regional provider serving ${county} County, ${state}.`, provider: rp.name, url: rp.evidence_url, source: 'regional provider registry' });
  }
  if (countyProfile) {
    facts.push({ key: 'county_profile', applies_to_roles: ['building', 'electrical_permit', 'electrical_inspection', 'planning', 'zoning', 'sign_permit', 'right_of_way', 'historic_review'], fact: `${countyProfile.name || county} County has a county jurisdiction profile${countyProfile.website_url ? ` at ${countyProfile.website_url}` : ''}.`, provider: countyProfile.name, url: countyProfile.website_url || countyProfile.permitting_url || null, source: 'county jurisdiction profile' });
  }
  return facts;
}

function slimOffice(o) {
  return {
    office_id: o.id || o.name,
    name: o.name,
    roles: o.authority_roles || [],
    status: o.authority_verification_status || null,
    verified_at: o.authority_verified_at || o.verified_at || null,
    contact: [o.contact_phone, o.contact_email, o.website_url || o.permitting_url].filter(Boolean).join(' | ') || null,
    evidence: (o.authority_evidence || []).slice(0, 5).map((e) => ({
      role: e.role || null,
      quote: e.quote || e.responsibility_quote || null,
      url: e.source_url || e.official_source_url || null,
    })).filter((e) => e.quote || e.url),
  };
}

/** Evidence context hash — a changed sibling/evidence set reopens adjudication. */
export function adjudicationHash(row, loc, office, facts) {
  return sha1({
    v: ADJUDICATION_PROMPT_VERSION,
    locality: loc?.id,
    office: office?.id || office?.name,
    roles: office?.authority_roles || [],
    missing: row?.missing_roles || [],
    evidence: (office?.authority_evidence || []).map((e) => [e.role, e.quote || e.responsibility_quote, e.source_url || e.official_source_url]),
    siblings: (loc?.offices || []).filter((o) => o !== office).map((o) => [o.id || o.name, o.name, o.authority_roles, o.authority_verification_status, (o.authority_evidence || []).length]),
    facts: facts.map((f) => [f.key, f.certified, f.provider, f.url]),
  });
}

/** Build one unit per office. The prompt gives positive evidence AND structural facts; absence of evidence must never be treated as proof of absence. */
export function buildAdjudicationUnit(row, loc, office, officeState, profile = null, countyProfile = null) {
  const facts = structuralFactsFor(loc, profile, countyProfile);
  const siblings = (loc.offices || []).filter((o) => o !== office).map(slimOffice);
  const st = officeStateForLedger(row, officeState) || {};
  const target = slimOffice(office);
  const hash = adjudicationHash(row, loc, office, facts);
  const id = `adjudicate-${sha1(`${loc.id}:${office.id || office.name}:${hash}`).slice(0, 28)}`;
  const context = {
    jurisdiction: { name: loc.name, state: loc.state, type: loc.jurisdiction_type, county: loc.county_name || loc.parent_county_name || profile?.parent_county?.name || profile?.county_name || null },
    target_office: { ...target, missing_roles: uniq(row.missing_roles), verification_attempts: row.attempts ?? st.attempts ?? null, failure_reasons: uniq(row.reasons), tiers_tried: row.tiers_tried || [] },
    sibling_offices_same_locality_record: siblings,
    structural_facts: facts,
  };
  const prompt = [
    `Classify whether this needs_review permit office is real for ${loc.name}, ${loc.state}.`,
    'You are adjudicating an office after repeated official-source research failed. This is a legal/structural classification task, not a guessing task.',
    'Choose exactly one verdict:',
    '1. not_applicable — the missing role structurally does not exist as a separate local responsibility for this jurisdiction. Use only when a provided structural fact or quoted official evidence proves the negative (examples: no local historic/design-review district or ordinance; building/electrical enforcement is not local because the jurisdiction is not certified). Never use not_applicable merely because research failed.',
    '2. covered_elsewhere — the duty exists for this jurisdiction, but a sibling office or an identified county/regional/state provider already covers it. The covering office/provider must be named and must plausibly cover at least one missing role. Never invent a provider.',
    '3. exists_unproven — the office/role may exist locally, but available evidence is insufficient. Use this whenever evidence is ambiguous or silent. This verdict causes targeted research; it does not write entity data.',
    'Hard rules: absence of evidence is not evidence of absence; do not infer from town size; do not mark right-of-way/street duties not applicable unless evidence says the jurisdiction has no such local permitting authority; do not mark historic review not applicable unless evidence proves there is no local historic district/design-review/landmark ordinance or authority; do not mark building/electrical not applicable in an Ohio BBS-certified jurisdiction; Kentucky electrical may be structurally covered by DHBC-certified inspectors rather than a city office.',
    'Evidence quotes must be copied verbatim from supplied office evidence or structural facts. If you rely on a structural fact, list its key in structural_fact_keys.',
    'roles_resolved must contain only roles from missing_roles that this verdict actually resolves. If no role is resolved with high confidence, verdict must be exists_unproven.',
    'Return JSON matching the schema exactly.',
    `CONTEXT: ${JSON.stringify(context)}`,
  ].join('\n');
  return {
    id,
    prompt,
    schema: {
      verdict: 'not_applicable|covered_elsewhere|exists_unproven',
      confidence: 'number 0..1',
      roles_resolved: ['subset of missing_roles'],
      reason: 'specific evidence-based explanation',
      evidence_quotes: ['verbatim quote or structural fact text'],
      structural_fact_keys: ['keys from structural_facts, if relied on'],
      covering_office_id: 'office_id from sibling_offices_same_locality_record or null',
      covering_office_name: 'office/provider name or null',
      covering_source_url: 'source url or null',
      proof_expectation: 'for exists_unproven: exactly what official proof researchers should find',
    },
    kind: 'needs-review-adjudication',
    meta: {
      prompt_version: ADJUDICATION_PROMPT_VERSION,
      locality_id: loc.id,
      jurisdiction: loc.name,
      state: loc.state,
      office_id: office.id || office.name,
      office_name: office.name,
      missing_roles: uniq(row.missing_roles),
      hash,
      facts,
      context,
    },
  };
}

const badEvidence = (q) => !q || String(q).trim().length < 20 || /\b(unknown|unclear|probably|likely|seems|no evidence found)\b/i.test(String(q));
const subset = (xs, ys) => (xs || []).every((x) => (ys || []).includes(x));

function siblingByIdOrName(loc, id, name) {
  const offices = loc?.offices || [];
  if (id) return offices.find((o) => (o.id || o.name) === id) || null;
  if (name) {
    const matches = offices.filter((o) => norm(o.name) === norm(name));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function structuralFactApplies(fact, roles) {
  return !fact.applies_to_roles?.length || roles.some((r) => fact.applies_to_roles.includes(r));
}

/**
 * Deterministic acceptance guards. Returns {ok, errors[]} — no verdict that
 * fails a guard may write or boost. The guards deliberately reject common
 * hallucination/shortcut shapes even when the prose sounds confident.
 */
export function validateAdjudicationVerdict(verdict, meta, loc) {
  const errors = [];
  const missing = uniq(meta?.missing_roles);
  const roles = uniq(verdict?.roles_resolved);
  const facts = meta?.facts || [];
  const factKeys = new Set(facts.map((f) => f.key));
  if (!verdict || typeof verdict !== 'object') errors.push('missing verdict object');
  if (!VERDICTS.includes(verdict?.verdict)) errors.push('invalid verdict');
  const confidence = Number(verdict?.confidence);
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) errors.push(`confidence below ${MIN_CONFIDENCE}`);
  if (!roles.length) errors.push('roles_resolved empty');
  if (!subset(roles, missing)) errors.push('roles_resolved outside missing_roles');
  if (String(verdict?.reason || '').trim().length < 35) errors.push('reason too short or missing');
  const quotes = Array.isArray(verdict?.evidence_quotes) ? verdict.evidence_quotes.filter(Boolean) : [];
  if (verdict?.verdict !== 'exists_unproven' && !quotes.length) errors.push('positive resolution requires evidence');
  for (const q of quotes) if (badEvidence(q)) errors.push('weak or non-verbatim evidence quote');
  const citedFacts = uniq(verdict?.structural_fact_keys).map((k) => facts.find((f) => f.key === k)).filter(Boolean);
  for (const k of uniq(verdict?.structural_fact_keys)) if (!factKeys.has(k)) errors.push(`unknown structural fact key ${k}`);
  if (verdict?.verdict === 'not_applicable') {
    if (!citedFacts.length && quotes.length < 1) errors.push('not_applicable requires a structural fact or verbatim official evidence');
    if (citedFacts.length && !citedFacts.some((f) => structuralFactApplies(f, roles))) errors.push('cited structural facts do not apply to resolved roles');
    const ohFact = facts.find((f) => f.key === 'ohio_bbs_certification');
    if (ohFact?.certified && roles.some((r) => ['building', 'electrical_permit', 'electrical_inspection'].includes(r))) {
      errors.push('Ohio certified jurisdiction cannot be not_applicable for building/electrical');
    }
    if (roles.includes('historic_review')) {
      const negativeProof = [verdict?.reason, ...quotes].join(' ');
      if (!/no (local )?(historic|landmark|design review)|no (historic|landmark|design-review) (district|ordinance|authority)|not subject to (historic|design) review/i.test(negativeProof)) {
        errors.push('historic_review not_applicable requires explicit no-district/no-authority evidence');
      }
    }
    if (roles.includes('right_of_way')) {
      const negativeProof = [verdict?.reason, ...quotes].join(' ');
      if (!/no (local )?(right[- ]of[- ]way|road|street)|county (maintains|has jurisdiction)|state (maintains|has jurisdiction)|not responsible for (right[- ]of[- ]way|roads|streets)/i.test(negativeProof)) {
        errors.push('right_of_way not_applicable requires explicit no-local-road/authority evidence');
      }
    }
  }
  if (verdict?.verdict === 'covered_elsewhere') {
    const sibling = siblingByIdOrName(loc, verdict?.covering_office_id, verdict?.covering_office_name);
    const providerNamed = verdict?.covering_office_name && facts.some((f) => f.provider && norm(f.provider) === norm(verdict.covering_office_name));
    if (!sibling && !providerNamed) errors.push('covering office/provider not found in supplied siblings or structural facts');
    if (sibling) {
      if (sibling.authority_verification_status !== 'staff_verified') errors.push('covering sibling is not staff_verified');
      if (!roles.some((r) => (sibling.authority_roles || []).includes(r))) errors.push('covering sibling lacks the resolved role');
    }
    if (!providerNamed && !verdict?.covering_source_url && !(sibling?.authority_evidence || []).length) errors.push('coverage lacks source/evidence');
    const ohFact = facts.find((f) => f.key === 'ohio_bbs_certification');
    if (ohFact?.certified && roles.some((r) => ['building', 'electrical_permit', 'electrical_inspection'].includes(r)) && /county|state/i.test(String(verdict?.covering_office_name || ''))) {
      errors.push('Ohio certified jurisdiction building/electrical cannot be pushed to county/state');
    }
  }
  if (verdict?.verdict === 'exists_unproven') {
    const pe = String(verdict?.proof_expectation || '').trim();
    if (pe.length < 35 || /^(find|look for|research)( more)?( information| evidence)?\.?$/i.test(pe)) errors.push('exists_unproven requires a specific proof expectation');
  }
  return { ok: errors.length === 0, errors: uniq(errors) };
}

/**
 * Build the resolution patch from CURRENT live offices. The target office is
 * never hard-deleted: if all of its roles resolve away it moves into
 * archived_offices with its full snapshot, and the active office is removed.
 */
export function buildResolutionPatch(live, targetOfficeId, verdict, { by = 'needs-review-adjudicator' } = {}) {
  const officesIn = Array.isArray(live?.offices) ? live.offices : [];
  const target = officesIn.find((o) => (o.id || o.name) === targetOfficeId);
  if (!target) return { error: 'target office missing from live record' };
  const roles = uniq(verdict.roles_resolved);
  if (!roles.length || !roles.every((r) => (target.authority_roles || []).includes(r))) return { error: 'resolved roles are not current target office roles' };
  const at = nowIso();
  const resolution = {
    na_reason: String(verdict.reason || '').slice(0, 1000),
    na_at: at,
    na_by: by,
    verdict: verdict.verdict,
    confidence: Number(verdict.confidence),
    evidence: quotesEvidence(verdict),
    covering_office: verdict.covering_office_name || verdict.covering_office_id || null,
  };
  const offices = [];
  let changed = null;
  for (const o of officesIn) {
    if ((o.id || o.name) !== targetOfficeId) { offices.push(o); continue; }
    const remaining = (o.authority_roles || []).filter((r) => !roles.includes(r));
    const notApplicable = { ...(o.not_applicable_roles || {}) };
    for (const r of roles) notApplicable[r] = resolution;
    changed = { ...o, authority_roles: remaining, not_applicable_roles: notApplicable };
    if (remaining.length) offices.push(changed);
  }
  let archived_offices = Array.isArray(live.archived_offices) ? [...live.archived_offices] : [];
  let archived = false;
  if (changed && !(changed.authority_roles || []).length) {
    archived = true;
    archived_offices.push({
      ...changed,
      retired_reason: `${verdict.verdict}: ${String(verdict.reason || '').slice(0, 300)}`,
      retired_at: at,
      retired_by: by,
    });
  }
  const office_change_log = [...(live.office_change_log || []), {
    at,
    summary: `${by}: ${verdict.verdict} resolved ${roles.join('+')} on ${target.name}${archived ? ' — office archived' : ''}`,
    office_count: offices.length,
    verified_count: offices.filter((o) => o.authority_verification_status === 'staff_verified').length,
  }].slice(-20);
  return { data: { offices, archived_offices, office_change_log }, target, changed, archived, at };
}

function quotesEvidence(verdict) {
  return (verdict.evidence_quotes || []).slice(0, 5).map((quote) => ({ quote: String(quote).slice(0, 1000), source_url: verdict.covering_source_url || null, adjudication: true }));
}

/** Validate the patch against the pre-write live record before enqueue. */
export function validateResolutionPatch(live, targetOfficeId, verdict, patch) {
  const errors = [];
  const before = Array.isArray(live?.offices) ? live.offices : [];
  const after = patch?.data?.offices || [];
  const target = before.find((o) => (o.id || o.name) === targetOfficeId);
  if (!target) errors.push('target office missing before write');
  if (!patch?.data) errors.push('patch missing data');
  const beforeIds = new Set(before.map((o) => o.id || o.name));
  const afterIds = new Set(after.map((o) => o.id || o.name));
  for (const id of afterIds) if (!beforeIds.has(id)) errors.push(`write introduces new office ${id}`);
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  if (removed.some((id) => id !== targetOfficeId)) errors.push('write removes offices other than target');
  const archivedTarget = (patch.data?.archived_offices || []).find((o) => (o.id || o.name) === targetOfficeId);
  if (removed.includes(targetOfficeId) && !archivedTarget) errors.push('target removed without archived snapshot');
  if (archivedTarget) {
    for (const r of archivedTarget.authority_roles || []) if (!(target?.authority_roles || []).includes(r)) errors.push(`archived snapshot adds role ${r}`);
    for (const r of uniq(verdict?.roles_resolved)) if (!archivedTarget.not_applicable_roles?.[r]?.verdict) errors.push(`archived snapshot lacks NA metadata for ${r}`);
  }
  const afterTarget = after.find((o) => (o.id || o.name) === targetOfficeId);
  const beforeRoles = target?.authority_roles || [];
  const afterRoles = afterTarget?.authority_roles || [];
  for (const r of afterRoles) if (!beforeRoles.includes(r)) errors.push(`write adds role ${r}`);
  const removedRoles = beforeRoles.filter((r) => !afterRoles.includes(r));
  if (!subset(removedRoles, uniq(verdict.roles_resolved))) errors.push('write removes roles outside verdict.roles_resolved');
  for (const o of after) {
    if ((o.id || o.name) === targetOfficeId) continue;
    const old = before.find((x) => (x.id || x.name) === (o.id || o.name));
    if (old && JSON.stringify({ ...old }) !== JSON.stringify({ ...o })) errors.push(`write mutates non-target office ${o.name || o.id}`);
  }
  return { ok: errors.length === 0, errors: uniq(errors) };
}

/** Choose pilot/scale targets in ledger order, skipping offices already adjudicated for the same evidence hash. */
export function adjudicationTargets({ ledgerRows = [], localities = [], officeState = {}, adjudicated = {}, limit = 20, locById = null } = {}) {
  const byId = locById || new Map(localities.map((l) => [l.id, l]));
  const out = [];
  const seen = new Set();
  // Ledger order is volatile (the verifier re-sorts by current attempt count).
  // The pilot cap must name a stable population, so adjudicate in deterministic
  // locality/office order instead of whichever 20 happen to sort first today.
  const rows = [...ledgerRows].sort((a, b) => String(a.locality_id).localeCompare(String(b.locality_id)) || String(a.office).localeCompare(String(b.office)));
  for (const row of rows) {
    if (out.length >= limit) break;
    const loc = byId.get(row.locality_id);
    if (!loc || loc.duplicate_of) continue;
    const office = liveOfficeForLedger(row, loc, officeState);
    if (!office) continue;
    if ((office.authority_verification_status || '') !== 'needs_verification') continue;
    const oid = office.id || office.name;
    const key = `${loc.id}:${oid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const facts = structuralFactsFor(loc, null, null);
    const hash = adjudicationHash(row, loc, office, facts);
    const prior = adjudicated[key];
    if (prior?.hash === hash && ['not_applicable', 'covered_elsewhere', 'exists_unproven'].includes(prior.verdict)) continue;
    out.push({ row, loc, office, key, hash, prior });
  }
  return out;
}
