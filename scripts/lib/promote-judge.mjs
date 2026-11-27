// AI promotion judge — SWE-2.1 decides whether an evidence quote actually
// says THIS provider handles THIS permit type for THIS jurisdiction. The
// deterministic strict check can't tell a responsibility sentence from a
// nav title, a pothole line, or a different jurisdiction's page — the judge
// closes that gap. Nothing promotes on the strict check alone anymore.
//
//   candidates  .audit-work/promote-candidates.jsonl — verifier appends
//               strict-pass offices awaiting judgment.
//   judge units audit-queue/judge-v2-<office_id>.json — one office per unit,
//               all candidate roles; claimed ahead of audit units.
//   verdicts    .audit-work/judge-verdicts.jsonl — one row per role:
//               {office_id, locality_id, role, verdict, provider,
//                same_jurisdiction, reason, entry_office_name, url,
//                cand_hash, prompt_version, model_verdict, guard}
//
// Promote a role only when: verdict yes on judge_prompt_v2 · no deterministic
// guard fired · (same_jurisdiction or the provider covers the jurisdiction) ·
// strict check passes · live re-fetch verbatim. v1 verdicts remain in the log
// for audit history but are outside the v2 keyspace and can never promote.
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const JUDGE_PROMPT_VERSION = 'judge_prompt_v2';
export const JUDGE_PROMPT_TAG = 'v2';
export const LEGACY_PROMPT_VERSION = 'judge_prompt_v1';
export const CANDIDATES_FILE = '.audit-work/promote-candidates.jsonl';
export const VERDICTS_FILE = '.audit-work/judge-verdicts.jsonl';
export const UNCLEAR_FILE = '.audit-work/judge-unclear.jsonl';

const readJsonl = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

export const candKey = (c) => `${c.office_id}|${c.role}|${(c.quote || '').slice(0, 40)}`;
export const candHash = (c) => createHash('sha1').update(candKey(c)).digest('hex').slice(0, 16);

// Verdicts and pending candidates key on the CANDIDATE *and the prompt
// version*: when researchers land new evidence for a role the judge already
// said 'no' to, the new quote is a different candidate hash and gets re-judged;
// when the prompt changes, the same evidence is re-judged rather than
// inheriting a verdict written under older rules.
export const vkey = (officeId, role, hash, promptVersion = JUDGE_PROMPT_VERSION) => `${officeId}|${role}|${hash || ''}|${promptVersion}`;
const verdictVersion = (v) => v?.prompt_version || LEGACY_PROMPT_VERSION;

// ── candidates: verifier appends strict-pass offices awaiting judgment ────
// One row per office+role+evidence. opts.retro marks retro-pass rows.
export function appendCandidates(locality, office, roles, opts = {}) {
  const rows = [];
  for (const r of roles) {
    const row = {
      at: new Date().toISOString(),
      locality_id: locality.id,
      jurisdiction: { name: locality.name, type: locality.jurisdiction_type, county: locality.county_name, state: locality.state },
      office_id: office.id, office_name: office.name, status_before: office.authority_verification_status,
      role: r.role, entry_office_name: r.entry_office_name || null, quote: r.quote || null, url: r.url || null,
      verified_at: office.verified_at || null,
    };
    row.cand_hash = candHash(row);
    if (opts.retro) row.retro = true;
    rows.push(row);
  }
  if (rows.length) try { appendFileSync(CANDIDATES_FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); } catch {}
  return rows.length;
}

// Pending candidates keyed by the CURRENT vkey (office|role|cand_hash|prompt).
// The candidate itself is evidence, not a prompt-v1 artifact — an already
// emitted candidate is re-judged under a new prompt without being duplicated.
export function pendingCandidates(file = CANDIDATES_FILE) {
  const byKey = new Map();
  for (const c of readJsonl(file)) if (c.office_id && c.role) byKey.set(vkey(c.office_id, c.role, c.cand_hash || candHash(c)), c);
  return byKey;
}

// ── deterministic post-judge guards ──────────────────────────────────────
// The model's output is never trusted by itself. These guards encode the
// evidence classes Brett identified in the holdout review and only ever move
// a yes to no/unclear — never the other direction.
const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const escRe = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CONDITIONAL_OR_ASPIRATIONAL = /may\s+(still\s+)?be\s+required|we\s+are\s+proud|strive\s+to|our\s+goal/i;
const MISSION_STANDARDS = /ensuring[^.]{0,140}(?:meet|meets|standards|safe|safety)/i;
const APPEALS_BODY = /\b(?:board\s+of\s+(?:(?:zoning|building)(?:\s*(?:and|&)\s*(?:zoning|building))?\s+)?appeals|zoning\s+appeals\s+board|board\s+of\s+appeals|bza)\b/i;
const PLANNING_COMMISSION = /\b(?:planning|zoning)(?:\s*(?:and|&)\s*(?:planning|zoning))?\s+commission\b/i;
const AMENDMENT_REVIEW = /\breviews?\s+(?:proposed\s+)?(?:amendments|site\s+plans|development\s+plans|plat\s+applications)|makes\s+recommendations\s+to\s+(?:the\s+)?council/i;
const ZONING_PERMIT_AUTHORITY = /(?:issues?|issuing|administers?|administering|enforces?|enforcing|approves?|approving)[^.]{0,70}\bzoning\s+permits?\b|\bzoning\s+permits?\b[^.]{0,70}\b(?:issued|administered|enforced|approved)\b/i;
const COUNTY_BORDERS_ONLY = /\bwithin\s+(?:the\s+)?(?:borders|boundaries)\s+of\s+(?:the\s+)?county\b/i;

const countyStem = (county) => normText(county).replace(/\bcounty\b/g, '').replace(/\s+/g, ' ').trim();
const countyNamesIn = (text) => {
  const out = [];
  const re = /\b([a-z']+(?:\s+[a-z']+){0,2})\s+county\b/gi;
  for (const m of String(text || '').matchAll(re)) {
    // The permissive capture can pick up glue ("of Van Wert County"); strip it.
    let c = normText(m[1]);
    for (;;) {
      const next = c.replace(/^(?:of|the|for|and|in)\s+/, '');
      if (next === c) break;
      c = next;
    }
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
};
const localityBase = (name) => normText(name)
  .replace(/^(?:city|village|township)\s+of\s+/, '')
  .replace(/\s+(?:city|village|township)$/, '')
  .trim();

// Positive inclusion, not a mere mention: "outside the city limits of Celina"
// mentions Celina but does NOT include it. Generic inclusion language ("within
// the Village", "for the City") counts because the evidence is already on the
// jurisdiction's own official page when the strict lane reaches the judge.
export function quoteIncludesJurisdiction(quote, jurisdiction) {
  const qn = ` ${normText(quote)} `;
  if (!qn.trim()) return false;
  if (/\b(?:in|within|inside|throughout|for|serving|serves|served|covering|covers|covered|including|included)\s+(?:the\s+)?(?:city|village|township)\b/.test(qn)) return true;
  if (/\bon\s+behalf\s+of\s+(?:the\s+)?(?:city|village|township)\b/.test(qn)) return true;
  const base = localityBase(jurisdiction?.name);
  if (!base) return false;
  const b = escRe(base).replace(/\s+/g, '\\s+');
  const positive = [
    new RegExp(`\\b(?:in|within|inside|throughout|for|serving|serves|served|covering|covers|covered|including|included)\\s+(?:the\\s+)?(?:(?:city|village|township)\\s+)?(?:of\\s+)?${b}\\b`),
    new RegExp(`\\bon\\s+behalf\\s+of\\s+(?:the\\s+)?(?:(?:city|village|township)\\s+)?(?:of\\s+)?${b}\\b`),
    new RegExp(`\\b${b}\\s+(?:is|are|lies|located)\\s+(?:within|inside|included|covered|served)\\b`),
    new RegExp(`\\b${b}\\s+(?:is|are)\\s+included\\b`),
  ];
  return positive.some((re) => re.test(qn));
}

const roleKeyword = (role) => ({
  sign_permit: /sign/i,
  zoning: /zoning|land\s+use/i,
  building: /building|construction/i,
  electrical: /electric/i,
  electrical_permit: /electric/i,
  electrical_inspection: /electric/i,
  right_of_way: /right\s+of\s+way|road|street|driveway|encroach/i,
  historic_review: /historic|landmark|preserv/i,
  planning: /planning|zoning|land\s+use/i,
  transportation: /transport|road|street/i,
  other: /permit/i,
}[role] || /permit/i);

// An appeals board issuing "Conditional Use permits" is still not the issuing
// authority for building/electrical/historic/sign/right-of-way roles. The
// exception needs the role's own permit language or an unqualified general
// "issues permits" statement — a different named permit type does not count.
function appealsQuoteConfersRole(quote, role) {
  const q = String(quote || '');
  if (!/(?:issues?|issuing|administers?|administering)[^.]{0,90}\bpermits?\b|\bpermits?\b[^.]{0,90}\b(?:issued|administered)\b/i.test(q)) return false;
  if (roleKeyword(role).test(q)) return true;
  return /(?:issues?|issuing|administers?|administering)\s+(?:all\s+|most\s+|required\s+)?permits\b/i.test(q);
}

const INSPECTION_RESPONSIBILITY = /responsible\s+for[^.]{0,100}\binspect|(?:perform|provide|conduct|handle|schedule|administer|enforce)\w*[^.]{0,100}\binspect|contract\w*[^.]{0,120}\binspect|\binspect\w*\s+(?:are|is|performed|provided|conducted|handled|scheduled|administered|enforced)|(?:call|contact|request)[^.]{0,80}\binspect/i;
const providerAppealish = (provider) => APPEALS_BODY.test(provider) || /^\s*the\s+board\s*$/i.test(provider);

// Apply the deterministic guards to one model verdict. entry carries
// {role, entry_office_name, office_name, quote/responsibility_quote}; the
// jurisdiction carries {name,type,county,state}. The return object preserves
// the model's fields and adds guard/guard_reason. Guards never produce yes.
export function applyJudgeGuards(v, entry = {}, jurisdiction = {}) {
  const base = { ...(v || {}) };
  const role = entry.role || base.role || '';
  const quote = String(entry.quote || entry.responsibility_quote || '');
  const providerParts = [base.provider, entry.entry_office_name, entry.office_name].filter((x) => String(x || '').trim());
  const provider = providerParts.join(' | ');
  const force = (verdict, guard, why) => ({
    ...base,
    verdict,
    guard,
    guard_reason: why,
    reason: `${why}${base.reason ? ` — model: ${base.reason}` : ''}`,
  });

  // Conditional or aspirational text is not a statement of authority, even
  // when the same truncated extract later gestures at permitting.
  if (CONDITIONAL_OR_ASPIRATIONAL.test(quote)) {
    return force('unclear', 'conditional_or_aspirational', 'guard: conditional/aspirational language ("may be required", pride, striving, or goals) is not evidence of authority');
  }

  // A safety/standards mission statement ("responsible for ensuring buildings
  // meet standards") does not say the body issues or enforces permits.
  if (MISSION_STANDARDS.test(quote) && !/permit|inspection|enforc/i.test(quote)) {
    return force('unclear', 'mission_standards', 'guard: a mission statement about safe or standards-compliant buildings does not establish permit authority');
  }

  // Appeals bodies hear appeals; they are not permit issuing/reviewing
  // authorities for these roles unless the quote confers THIS role's permit
  // duty. Conditional-use/variance power is not building/historic authority.
  if (providerParts.some((p) => providerAppealish(p)) && !appealsQuoteConfersRole(quote, role)) {
    return force('no', 'appeals_body', 'guard: an appeals body hearing appeals is not the issuing/reviewing authority for this permit role');
  }

  // Being the body whose decisions are appealable is not authority either.
  // Example shape: "BZA is the appeal body for decisions of the Landmarks
  // Commission" — the Commission is mentioned, but not as the reviewer.
  const providerNames = providerParts.map((p) => normText(p)).filter((p) => p && p.split(' ').length >= 2);
  const quoteSentences = String(quote || '').split(/[.!?;\n]+/);
  for (const p of providerNames) {
    const pb = escRe(p).replace(/\s+/g, '\\s+');
    for (const sentence of quoteSentences) {
      const ns = normText(sentence);
      const pIdx = ns.indexOf(p);
      if (pIdx < 0) continue;
      const before = ns.slice(Math.max(0, pIdx - 160), pIdx);
      const appealObject = /decisions\s+of|appeals?\s+(?:from|relating\s+to)/.test(before);
      if (!appealObject) continue;
      const active = new RegExp(`${pb}.{0,80}(?:issues?|reviews?|administers?|enforces?|inspects?|approves?)`).test(ns)
        || new RegExp(`(?:issues?|reviews?|administers?|enforces?|inspects?|approves?).{0,80}${pb}`).test(ns);
      if (!active) return force('no', 'appeal_subject_not_authority', 'guard: being named as the body whose decisions are appealed is not authority to issue or review');
    }
  }

  // A provider from a DIFFERENT county needs explicit positive inclusion of
  // this jurisdiction. A mention inside a caveat or exclusion is not coverage.
  const ownCounty = countyStem(jurisdiction?.county);
  const mentionedCounties = countyNamesIn(provider);
  const foreignCounty = ownCounty && mentionedCounties.length && !mentionedCounties.includes(ownCounty);
  if (foreignCounty && !quoteIncludesJurisdiction(quote, jurisdiction)) {
    return force('unclear', 'provider_county_mismatch', `guard: provider names ${mentionedCounties[0]} County but the jurisdiction is in ${jurisdiction?.county || 'another county'}, and the quote does not positively include the jurisdiction`);
  }

  // Bare county-boundary language does not resolve the incorporated/unincorporated
  // question for a city/village. Narrow by design: broad service statements
  // ("throughout most of the county") and county road right-of-way evidence
  // are different evidence classes.
  if (!/county/i.test(String(jurisdiction?.type || '')) && COUNTY_BORDERS_ONLY.test(quote) && !quoteIncludesJurisdiction(quote, jurisdiction)) {
    return force('unclear', 'county_scope_boundary_only', 'guard: "within the borders of the County" does not establish authority inside an incorporated municipality');
  }

  // Permit administration is not inspection performance. Inspection roles need
  // inspection responsibility in the quote itself.
  if (/inspection/i.test(role) && !INSPECTION_RESPONSIBILITY.test(quote)) {
    return force('unclear', 'inspection_not_stated', 'guard: inspection roles require the quote to assign inspection responsibility, not just permit administration');
  }

  // Advisory planning/zoning commission work (amendments, site plans,
  // recommendations to council) is not zoning permit authority.
  const planningProvider = PLANNING_COMMISSION.test(provider);
  if (planningProvider && AMENDMENT_REVIEW.test(quote) && !ZONING_PERMIT_AUTHORITY.test(quote)) {
    return force('unclear', 'planning_commission_advisory', 'guard: reviewing amendments/site plans and making recommendations is advisory, not zoning permit authority');
  }

  return { ...base, guard: null, guard_reason: null };
}

// ── judge unit: one office, all its candidate roles ───────────────────────
export function judgeUnitId(officeId, promptTag = JUDGE_PROMPT_TAG) {
  return `judge-${promptTag}-${String(officeId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}`;
}

export function judgeUnit(officeId, meta, roles) {
  const lines = roles.map((r, i) => `  ${i + 1}. ROLE "${r.role}" — PROVIDER: ${JSON.stringify(r.entry_office_name || r.office_name)}\n     QUOTE: ${JSON.stringify((r.quote || '').slice(0, 500))}\n     URL: ${r.url || 'none'}`);
  return {
    id: judgeUnitId(officeId),
    meta: {
      ...meta,
      office_id: officeId,
      kind: 'judge',
      prompt_version: JUDGE_PROMPT_VERSION,
      roles: roles.map((r) => ({ role: r.role, entry_office_name: r.entry_office_name, url: r.url, quote: r.quote, cand_hash: r.cand_hash || candHash({ office_id: officeId, role: r.role, quote: r.quote }) })),
    },
    prompt: [
      `You are the permit-authority evidence judge (${JUDGE_PROMPT_VERSION}). Judge ONLY what each quote itself proves; never infer authority from a page title, a department name, or what an office plausibly does.`,
      `JURISDICTION: ${JSON.stringify(meta.jurisdiction)}`,
      `OFFICE NAME IN RECORD: ${JSON.stringify(meta.office_name)}`,
      'For EACH numbered role below, decide whether the QUOTE itself says the PROVIDER issues, reviews, administers, enforces, or inspects that permit type for THIS jurisdiction — or for an area that includes it. Use the URL as context: a quote on the jurisdiction\'s own official site or municipal code is evidence presented as that jurisdiction\'s permitting instruction.',
      ...lines,
      'For EACH role return {"role","verdict","provider","same_jurisdiction","reason"}:',
      '- verdict "yes" requires ALL THREE: (1) the quote states the provider performs the duty with language such as issues, reviews, administers, enforces, inspects, approves, provides services related to issuance, or is responsible for that duty; (2) the duty matches this role; (3) the quote or provider scope covers this jurisdiction. Coverage may be inferred when the evidence is presented on this jurisdiction\'s own official page or municipal code as the instruction for its residents/properties, but never when the quote contains a caveat/exclusion or leaves county-versus-municipal scope unresolved.',
      '- County provider nuance: when a city/village page directs its residents to a SAME-county county building department or says permits are obtained through that county, that is an affirmative assignment for this jurisdiction and can be yes. A SAME-county official county page is also countywide instruction: broad statements such as enforcing building codes throughout most/majority of the county, county permit requirements, or county road right-of-way permits count as coverage. Contract/regional permit bureaus named on that county page count as the county\'s designated provider. This is different from a provider in a DIFFERENT county, and different from narrow bare territory language such as only "within the borders of the County" with no broader countywide/service or road-right-of-way meaning.',
      '- A responsibility fragment can count when the quote tightly binds the provider to the role (for example, a "Building Permits & Inspections" heading immediately followed by "The Zoning Inspector is responsible for:"). A bare navigation/link list or a provider name with no responsibility tie still cannot.',
      '- Provider/county mismatch: if the provider is a department of a DIFFERENT county than the jurisdiction\'s county, verdict is "no" unless the quote explicitly names this jurisdiction as included in the provider\'s territory. A mention inside a caveat, exclusion, or "outside the city limits" sentence is not inclusion.',
      '- Appeals bodies: a Board of Zoning Appeals/Board of Appeals/BZA hearing appeals is NOT the issuing or reviewing authority for permit roles. Being the body whose decisions are appealed is also not authority. Verdict "no" unless the quote explicitly says that appeals body issues/administers THIS exact permit type; conditional-use permits or variances are not building, electrical, sign, historic, or right-of-way permit authority.',
      '- Conditional or aspirational language is not authority: "may be required", "may still be required", "we are proud", "strive to", "our goal", and mission statements about safety or meeting standards. Use "unclear" when this is the only support.',
      '- Inspection roles require inspection responsibility in the quote. Administering, issuing, or obtaining permits does not by itself prove the provider performs inspections.',
      '- A planning/zoning commission that reviews amendments, site plans, plats, or makes recommendations is advisory. It is not zoning permit authority unless the quote says it issues/administers/approves zoning permits.',
      '- County scope: for an incorporated city/village, bare county-boundary language such as "within the borders of the County" does not establish authority inside that municipality; use "unclear" unless municipalities/this jurisdiction are included. County road right-of-way duties and explicit county contracts or named municipal coverage can still count.',
      '- verdict "no" = the quote is off-topic for this duty: a nav menu or list of link/form titles, a mission/services blurb, an agenda or resolution title, a pothole/contact line, a job posting, a subdivision-review rule, or it assigns this duty to a DIFFERENT body than the provider. Saying paperwork is FILED with an office does not make that office the issuer/inspector — filing location is not authority.',
      '- verdict "unclear" = the quote is on-topic but does not establish WHO performs the duty, is conditional/aspirational, is truncated before the responsibility is stated, or leaves county/municipal scope unresolved. Do not guess yes.',
      '- provider = the body the quote says does the work (quote verbatim if possible), not the office record you wish were supported.',
      '- same_jurisdiction = true when the quote names this jurisdiction, states coverage that includes it, or is presented on this jurisdiction\'s own official page as its permitting instruction under the coverage rule above. Do not infer coverage merely because two places are in the same county, and do not use this inference for caveats/exclusions or unresolved county-boundary scope.',
    ].join('\n'),
    schema: { results: [{ role: 'string', verdict: 'yes|no|unclear', provider: 'string', same_jurisdiction: 'boolean', reason: 'string' }] },
  };
}

// ── verdicts: judge lane writes, verifier + retro consume ────────────────
export function appendVerdict(officeId, localityId, officeName, role, v, entry, retro = false) {
  const modelVerdict = ['yes', 'no', 'unclear'].includes(v?.verdict) ? v.verdict : 'unclear';
  const entryWithRole = { ...(entry || {}), role, office_name: (entry || {})?.office_name || officeName };
  const guarded = applyJudgeGuards({ ...(v || {}), verdict: modelVerdict }, entryWithRole, entry?.jurisdiction || {});
  const row = {
    at: new Date().toISOString(), office_id: officeId, locality_id: localityId, office_name: officeName,
    role, verdict: guarded.verdict || 'unclear', provider: guarded.provider || null,
    same_jurisdiction: Boolean(guarded.same_jurisdiction), reason: guarded.reason || null,
    entry_office_name: entry?.entry_office_name || null, url: entry?.url || null,
    cand_hash: entry?.cand_hash || null, retro,
    prompt_version: JUDGE_PROMPT_VERSION,
    model_verdict: modelVerdict,
    guard: guarded.guard || null,
    guard_reason: guarded.guard_reason || null,
  };
  try { appendFileSync(VERDICTS_FILE, JSON.stringify(row) + '\n'); } catch {}
  return row;
}

// Latest verdict per versioned vkey (office|role|cand_hash|prompt_version).
// Rows without prompt_version are v1 history and never occupy a v2 key.
export function verdictMap(retroOnly = false, file = VERDICTS_FILE) {
  const m = new Map();
  for (const v of readJsonl(file)) {
    if (retroOnly && !v.retro) continue;
    m.set(vkey(v.office_id, v.role, v.cand_hash, verdictVersion(v)), v);
  }
  return m;
}

// Per-role gate decision for a strict-pass candidate set — the single place
// the verdicts map is consulted. roles: [roleName]; hashOf: role→cand_hash.
// Returns {judged, gaps, noBoosts, unclearBoosts}. Unclear never promotes,
// but it does target re-research for stronger evidence.
export function resolveJudged(officeId, roles, hashOf, verdicts) {
  const judged = [], gaps = [], noBoosts = [], unclearBoosts = [];
  for (const r of roles) {
    const v = verdicts.get(vkey(officeId, r, hashOf(r)));
    if (promotable(v)) { judged.push(r); continue; }
    if (v?.verdict === 'no') {
      gaps.push(`${r}:ai_judge_no`);
      noBoosts.push({ role: r, reason: v.reason });
    } else if (v?.verdict === 'unclear') {
      gaps.push(`${r}:ai_judge_unclear`);
      unclearBoosts.push({ role: r, reason: v.reason, cand_hash: v.cand_hash || hashOf(r) });
    } else {
      gaps.push(`${r}:awaiting_judge`);
    }
  }
  return { judged, gaps, noBoosts, unclearBoosts };
}

// A role's verdict is promotable: v2 yes + no guard + (same_jurisdiction or
// the provider covers — provider naming the county while the office record is
// county-administered is coverage, not mismatch). The prompt-version check is
// deliberate: even a hand-copied or malformed v1 row can never promote.
export function promotable(v) {
  return v && verdictVersion(v) === JUDGE_PROMPT_VERSION && v.verdict === 'yes' && !v.guard
    && (v.same_jurisdiction || /county|state|district|regional/i.test(v.provider || ''));
}
