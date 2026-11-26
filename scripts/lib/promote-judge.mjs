// AI promotion judge — SWE-2.1 decides whether an evidence quote actually
// says THIS provider handles THIS permit type for THIS jurisdiction. The
// deterministic strict check can't tell a responsibility sentence from a
// nav title, a pothole line, or a different jurisdiction's page — the judge
// closes that gap. Nothing promotes on the strict check alone anymore.
//
//   candidates  .audit-work/promote-candidates.jsonl — verifier appends
//               strict-pass offices awaiting judgment.
//   judge units audit-queue/judge-<office_id>.json — one office per unit,
//               all candidate roles; claimed ahead of audit units.
//   verdicts    .audit-work/judge-verdicts.jsonl — one row per role:
//               {office_id, locality_id, role, verdict, provider,
//                same_jurisdiction, reason, entry_office_name, url}
//
// Promote a role only when: verdict yes · (same_jurisdiction or the provider
// covers the jurisdiction) · strict check passes · live re-fetch verbatim.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const CANDIDATES_FILE = '.audit-work/promote-candidates.jsonl';
export const VERDICTS_FILE = '.audit-work/judge-verdicts.jsonl';
export const UNCLEAR_FILE = '.audit-work/judge-unclear.jsonl';

const readJsonl = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

export const candKey = (c) => `${c.office_id}|${c.role}|${(c.quote || '').slice(0, 40)}`;
export const candHash = (c) => createHash('sha1').update(candKey(c)).digest('hex').slice(0, 16);

// Verdicts and pending candidates key on the CANDIDATE, not just the
// office+role: when researchers land new evidence for a role the judge
// already said 'no' to, the new quote is a different candidate hash and
// gets re-judged instead of inheriting the stale verdict.
export const vkey = (officeId, role, hash) => `${officeId}|${role}|${hash || ''}`;

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

// Pending candidates keyed by vkey (office|role|cand_hash) — last wins.
export function pendingCandidates(file = CANDIDATES_FILE) {
  const byKey = new Map();
  for (const c of readJsonl(file)) if (c.office_id && c.role) byKey.set(vkey(c.office_id, c.role, c.cand_hash || candHash(c)), c);
  return byKey;
}

// ── judge unit: one office, all its candidate roles ───────────────────────
export function judgeUnit(officeId, meta, roles) {
  const lines = roles.map((r, i) => `  ${i + 1}. ROLE "${r.role}" — PROVIDER: ${JSON.stringify(r.entry_office_name || r.office_name)}\n     QUOTE: ${JSON.stringify((r.quote || '').slice(0, 500))}\n     URL: ${r.url || 'none'}`);
  return {
    id: `judge-${String(officeId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}`,
    meta: { ...meta, office_id: officeId, kind: 'judge', roles: roles.map((r) => ({ role: r.role, entry_office_name: r.entry_office_name, url: r.url, cand_hash: r.cand_hash || candHash({ office_id: officeId, role: r.role, quote: r.quote }) })) },
    prompt: [
      'You are judging whether evidence quotes actually support permitting authority claims, for a permit-office directory.',
      `JURISDICTION: ${JSON.stringify(meta.jurisdiction)}`,
      `OFFICE NAME IN RECORD: ${JSON.stringify(meta.office_name)}`,
      'For EACH numbered role below, decide whether the QUOTE itself says the PROVIDER issues, reviews, administers, enforces, or inspects that permit type for THIS jurisdiction — or for an area that includes it.',
      ...lines,
      'For EACH role return {"role","verdict","provider","same_jurisdiction","reason"}:',
      '- verdict "yes" = the quote itself states the provider issues, reviews, administers, enforces, or inspects this permit type, AND the jurisdiction scope matches. "Enforce/administer the <X> code" counts as handling X permits.',
      '- Jurisdiction scope: if the PROVIDER is a county/state/regional body and this jurisdiction sits inside it, the provider\'s general statement of its own duties ("County road rights-of-way", "issues permits", "enforces the code", "for the above jurisdictions") counts as coverage — UNLESS the quote limits the duty to unincorporated areas only or names a different scope.',
      '- verdict "no" = the quote is off-topic for this duty: a nav menu or list of link/form titles, a mission/"our goal"/services blurb, an agenda or resolution title, a pothole/contact line, a job posting, a subdivision-review rule, or it assigns this duty to a DIFFERENT body than the provider. Saying paperwork is FILED with an office does not make that office the issuer/inspector — filing location is not authority.',
      '- verdict "unclear" = the quote is on-topic (it names the permit type and plausibly this provider) but does not establish WHO does it — e.g. a fee schedule or requirement text that mentions the trade without saying who issues/reviews/inspects it.',
      '- provider = the body the quote says does the work (quote verbatim if possible).',
      '- same_jurisdiction = true if the quote names this jurisdiction or the provider\'s stated scope includes it per the coverage rule above.',
      'Prefer "yes" or "no" over "unclear": a quote that clearly assigns (or clearly does not assign) the duty is not unclear.',
    ].join('\n'),
    schema: { results: [{ role: 'string', verdict: 'yes|no|unclear', provider: 'string', same_jurisdiction: 'boolean', reason: 'string' }] },
  };
}

// ── verdicts: judge lane writes, verifier + retro consume ────────────────
export function appendVerdict(officeId, localityId, officeName, role, v, entry, retro = false) {
  const row = {
    at: new Date().toISOString(), office_id: officeId, locality_id: localityId, office_name: officeName,
    role, verdict: v?.verdict || 'unclear', provider: v?.provider || null,
    same_jurisdiction: Boolean(v?.same_jurisdiction), reason: v?.reason || null,
    entry_office_name: entry?.entry_office_name || null, url: entry?.url || null,
    cand_hash: entry?.cand_hash || null, retro,
  };
  try { appendFileSync(VERDICTS_FILE, JSON.stringify(row) + '\n'); } catch {}
  return row;
}

// Latest verdict per vkey (office|role|cand_hash).
export function verdictMap(retroOnly = false, file = VERDICTS_FILE) {
  const m = new Map();
  for (const v of readJsonl(file)) {
    if (retroOnly && !v.retro) continue;
    m.set(vkey(v.office_id, v.role, v.cand_hash), v);
  }
  return m;
}

// Per-role gate decision for a strict-pass candidate set — the single place
// the verdicts map is consulted. roles: [roleName]; hashOf: role→cand_hash.
// Returns {judged:[roles promotable], gaps:[reason strings], noBoosts:[{role,reason}]}.
export function resolveJudged(officeId, roles, hashOf, verdicts) {
  const judged = [], gaps = [], noBoosts = [];
  for (const r of roles) {
    const v = verdicts.get(vkey(officeId, r, hashOf(r)));
    if (promotable(v)) { judged.push(r); continue; }
    gaps.push(v?.verdict === 'no' ? `${r}:ai_judge_no` : `${r}:awaiting_judge`);
    if (v?.verdict === 'no') noBoosts.push({ role: r, reason: v.reason });
  }
  return { judged, gaps, noBoosts };
}

// A role's verdict is promotable: yes + (same_jurisdiction or the provider
// explicitly covers — provider naming the county while the office record is
// county-administered is coverage, not mismatch).
export function promotable(v) {
  return v && v.verdict === 'yes' && (v.same_jurisdiction || /county|state|district|regional/i.test(v.provider || ''));
}
