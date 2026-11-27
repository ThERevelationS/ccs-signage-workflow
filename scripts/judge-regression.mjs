#!/usr/bin/env node
// judge-regression — run the promotion-judge fixture and Brett's 40-case
// holdout through the REAL judge path (judgeUnit → devin ACP → guarded verdict)
// on an isolated queue. No verdicts are written to judge-verdicts.jsonl.
process.env.DEVIN_LLM_QUEUE = process.env.DEVIN_LLM_QUEUE || 'judge-regression';
process.env.DEVIN_LLM_BATCH = process.env.DEVIN_LLM_BATCH || '8';

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, dflt) => args.includes(name) ? args[args.indexOf(name) + 1] : dflt;
const FIXTURE = arg('--fixture', '.audit-work/judge-fixture.json');
const HOLDOUT = arg('--holdout', '.audit-work/judge-holdout.json');
const VERDICTS = arg('--verdicts', '.audit-work/judge-verdicts.jsonl');
const CANDIDATES = arg('--candidates', '.audit-work/promote-candidates.jsonl');
const OUT_FILE = arg('--out', '.audit-work/judge-v2-regression.json');
const SESSIONS = Math.max(1, Number(arg('--sessions', '2')) || 2);
const DEADLINE_MS = Math.max(5, Number(arg('--deadline-min', '35')) || 35) * 60e3;
const ONLY = args.includes('--fixture-only') ? 'fixture' : args.includes('--holdout-only') ? 'holdout' : 'both';

const llm = await import('./lib/devin-llm.mjs');
const { judgeUnit, judgeUnitId, candHash, applyJudgeGuards } = await import('./lib/promote-judge.mjs');
const readJsonl = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function baseCase(r, label, source) {
  const row = {
    source, label, expected: r.expected, locality_id: r.locality_id || null,
    jurisdiction: r.jurisdiction, office_id: r.office_id, office_name: r.office_name,
    role: r.role, entry_office_name: r.entry_office_name || r.office_name,
    quote: clean(r.quote), url: r.url || null,
  };
  row.cand_hash = candHash({ office_id: row.office_id, role: row.role, quote: row.quote });
  return row;
}
function loadFixtureCases() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')).map((r, i) => baseCase(r, `F${i + 1}`, 'fixture'));
}
function loadHoldoutCases() {
  const h = JSON.parse(readFileSync(HOLDOUT, 'utf8'));
  const verdicts = readJsonl(VERDICTS), candidates = readJsonl(CANDIDATES), out = [];
  for (const [sampleKind, expected] of [['yes', 'yes'], ['no', 'no']]) {
    for (const [i, r] of (h.sample?.[sampleKind] || []).entries()) {
      const v = verdicts.find((x) => x.role === r.role && x.url === r.url && x.reason === r.reason)
        || verdicts.find((x) => x.role === r.role && x.url === r.url);
      const c = v ? candidates.find((x) => x.office_id === v.office_id && x.role === v.role && (x.cand_hash === v.cand_hash || !v.cand_hash)) : null;
      out.push(baseCase({
        expected, locality_id: v?.locality_id || null, jurisdiction: r.jurisdiction,
        office_id: v?.office_id || `holdout-${sampleKind}-${i}`, office_name: v?.office_name || r.office_name,
        role: r.role, entry_office_name: v?.entry_office_name || c?.entry_office_name || r.office_name,
        quote: c?.quote || r.quote, url: r.url,
      }, `${sampleKind === 'yes' ? 'Y' : 'N'}${i}`, 'holdout'));
    }
  }
  return out;
}

const cases = [
  ...(ONLY !== 'holdout' ? loadFixtureCases() : []),
  ...(ONLY !== 'fixture' ? loadHoldoutCases() : []),
];
if (!cases.length) throw new Error('no regression cases loaded');
const byOffice = new Map();
for (const c of cases) {
  const g = byOffice.get(c.office_id) || { meta: { locality_id: c.locality_id, jurisdiction: c.jurisdiction, office_name: c.office_name, regression: true }, roles: [], expected: [] };
  g.roles.push({ role: c.role, entry_office_name: c.entry_office_name, quote: c.quote, url: c.url, cand_hash: c.cand_hash });
  g.expected.push(c); byOffice.set(c.office_id, g);
}
if (args.includes('--plan')) {
  console.log(JSON.stringify({ cases: cases.length, offices: byOffice.size, fixture: cases.filter((c) => c.source === 'fixture').length, holdout: cases.filter((c) => c.source === 'holdout').length, sample: cases.filter((c) => ['Y1', 'Y8', 'Y10', 'Y11', 'Y22', 'Y24'].includes(c.label)).map((c) => ({ label: c.label, office_id: c.office_id, entry: c.entry_office_name, hash: c.cand_hash, quote_len: c.quote.length })) }, null, 1));
  process.exit(0);
}
for (const officeId of byOffice.keys()) llm.clearUnit(judgeUnitId(officeId));
for (const [officeId, g] of byOffice) llm.enqueueUnit(judgeUnit(officeId, g.meta, g.roles));
console.log(`enqueued ${byOffice.size} judge units (${cases.length} role-cases) on isolated '${process.env.DEVIN_LLM_QUEUE}' queue`);
if (await llm.probeAuth() !== 'ok') throw new Error('SWE-2.1 ACP credentials unavailable');
llm.setSessionTarget(SESSIONS);
const t0 = Date.now();
let last = -1;
while (Date.now() - t0 < DEADLINE_MS) {
  const d = llm.queueDepth();
  if (d !== last) { console.log(`queue depth ${d} · elapsed ${Math.round((Date.now() - t0) / 1000)}s`); last = d; }
  if (d === 0) break;
  await llm.drainQueue({ maxBatches: Math.max(2, SESSIONS * 2), sleepMs: 2500 });
  await new Promise((r) => setTimeout(r, 2000));
}

const rows = [];
for (const [officeId, g] of byOffice) {
  const out = llm.outputFor(judgeUnitId(officeId));
  const meta = out?.meta || {};
  const results = Array.isArray(out?.output?.results) ? out.output.results : [];
  for (const exp of g.expected) {
    const raw = results.find((x) => x?.role === exp.role) || null;
    const found = (meta.roles || []).find((r) => r.role === exp.role) || {};
    const entry = { ...found, role: exp.role, quote: exp.quote, entry_office_name: exp.entry_office_name, office_name: exp.office_name };
    const guarded = raw ? applyJudgeGuards({ ...raw, verdict: ['yes', 'no', 'unclear'].includes(raw.verdict) ? raw.verdict : 'unclear' }, entry, exp.jurisdiction) : null;
    rows.push({
      ...exp, model_verdict: raw?.verdict || 'no_output', verdict: guarded?.verdict || 'no_output',
      guard: guarded?.guard || null, provider: guarded?.provider || raw?.provider || null,
      same_jurisdiction: Boolean(guarded?.same_jurisdiction), reason: guarded?.reason || raw?.reason || null, output: Boolean(out),
    });
  }
}

const fixtureRows = rows.filter((r) => r.source === 'fixture');
const holdoutYes = rows.filter((r) => r.source === 'holdout' && r.label.startsWith('Y'));
const holdoutNo = rows.filter((r) => r.source === 'holdout' && r.label.startsWith('N'));
const fixtureMatched = fixtureRows.filter((r) => r.expected === r.verdict).length;
// Brett's no-fixture labels include classes v2 intentionally calls unclear
// (foreign-county caveat, inspection-not-stated, conditional). SAFE non-yes is
// operationally correct; exact matches are reported separately.
const fixtureCorrect = fixtureRows.filter((r) => r.expected === r.verdict || (r.expected === 'no' && r.verdict !== 'yes' && r.verdict !== 'no_output')).length;
const fixtureBadYes = fixtureRows.filter((r) => r.expected === 'no' && r.verdict === 'yes').length;
const byLabel = new Map(rows.map((r) => [r.label, r]));
const requiredFlips = ['Y1', 'Y8', 'Y10'].map((l) => ({ label: l, ok: ['no', 'unclear'].includes(byLabel.get(l)?.verdict), verdict: byLabel.get(l)?.verdict || 'missing' }));
const requiredUnclear = ['Y11', 'Y22', 'Y24'].map((l) => ({ label: l, ok: byLabel.get(l)?.verdict === 'unclear', verdict: byLabel.get(l)?.verdict || 'missing' }));
const excludedYes = new Set([1, 8, 10, 26, 11, 22, 24, 13, 14]); // wrong/unclear/borderline; other 21 are correct yeses
const correctYes = holdoutYes.filter((r) => !excludedYes.has(Number(r.label.slice(1))));
const correctYesFlips = correctYes.filter((r) => r.verdict !== 'yes');
const holdoutNoYes = holdoutNo.filter((r) => r.verdict === 'yes');
const passFixture = fixtureRows.length === 0 || (fixtureCorrect >= 16 && fixtureBadYes === 0);
const holdoutPass = holdoutYes.length === 0 || (requiredFlips.every((r) => r.ok) && requiredUnclear.every((r) => r.ok) && correctYesFlips.length <= 2);
const summary = {
  at: new Date().toISOString(), total: rows.length,
  fixture: { total: fixtureRows.length, matched_exact: fixtureMatched, correct_or_safe: fixtureCorrect, bad_to_yes: fixtureBadYes, pass: passFixture },
  holdout: {
    yes_total: holdoutYes.length, no_total: holdoutNo.length, required_flips: requiredFlips, required_unclear: requiredUnclear,
    correct_yes_total: correctYes.length,
    correct_yes_flipped: correctYesFlips.map((r) => ({ label: r.label, verdict: r.verdict, jurisdiction: r.jurisdiction?.name, office_name: r.office_name, role: r.role })),
    holdout_no_to_yes: holdoutNoYes.map((r) => r.label), pass: holdoutPass,
  },
  pass: passFixture && holdoutPass,
};
writeFileSync(OUT_FILE, JSON.stringify({ summary, rows }, null, 1));
console.log('\n=== FIXTURE ===');
for (const r of fixtureRows) console.log(`${r.expected === r.verdict ? 'OK  ' : (r.expected === 'no' && r.verdict !== 'yes' && r.verdict !== 'no_output' ? 'SAFE' : 'MISS')} ${r.label} exp=${r.expected.padEnd(7)} got=${r.verdict.padEnd(9)} model=${r.model_verdict.padEnd(9)}${r.guard ? ` guard=${r.guard}` : ''} ${r.jurisdiction?.name} — ${r.role}`);
console.log(`fixture exact ${fixtureMatched}/${fixtureRows.length} · correct/safe ${fixtureCorrect}/${fixtureRows.length} · bad->yes ${fixtureBadYes}`);
console.log('\n=== HOLDOUT ===');
for (const r of [...holdoutYes, ...holdoutNo]) console.log(`${r.label.padEnd(4)} exp=${r.expected.padEnd(7)} got=${r.verdict.padEnd(9)} model=${r.model_verdict.padEnd(9)}${r.guard ? ` guard=${r.guard}` : ''} ${String(r.jurisdiction?.name || '').padEnd(20)} ${r.role}`);
console.log('\nrequired flips:', JSON.stringify(requiredFlips));
console.log('required unclear:', JSON.stringify(requiredUnclear));
console.log(`correct-yes flips ${correctYesFlips.length}/2 max:`, correctYesFlips.map((r) => `${r.label}:${r.verdict}`).join(' ') || 'none');
console.log(`holdout no->yes: ${holdoutNoYes.length ? holdoutNoYes.map((r) => r.label).join(' ') : 'none'}`);
console.log(`\n${summary.pass ? 'PASS' : 'FAIL'} judge-regression — wrote ${OUT_FILE}`);
process.exit(summary.pass ? 0 : 1);
