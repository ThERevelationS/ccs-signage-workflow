// test-gap-targets — pure selection/ordering/cooldown for verification
// gap-target research. No mirrors, no network.
import assert from 'node:assert';
import { gapTargets, GAP_CD } from './permitting-local-researcher.mjs';

const loc = (id, name, state = 'OH') => ({ id, name, state, jurisdiction_type: 'city' });
const off = (locality_id, reasons, missing, attempts = 0, status = 'needs_verification') => ({ locality_id, status, reasons, missing_roles: missing, attempts });
const NOW = Date.now();

// ── selection: only gap-reason failures below the review threshold ───────
{
  const state = { offices: {
    a: off('L1', ['no_research'], ['sign_permit']),
    b: off('L1', ['no_quote'], ['zoning']),
    c: off('L2', ['unofficial_source'], ['zoning']),     // not a researchable gap
    d: off('L3', ['no_role_match'], ['building'], 3),    // attempts at REVIEW_ATTEMPTS → held
    e: off('L4', ['county_scope'], ['sign_permit']),     // evidence guard, not a gap
    f: off('L5', ['no_research'], [], 0, 'staff_verified'), // verified — skip
  } };
  const locs = [loc('L1', 'Alpha'), loc('L2', 'Beta'), loc('L3', 'Gamma'), loc('L4', 'Delta'), loc('L5', 'Echo')];
  const t = gapTargets(state, locs, {}, NOW);
  assert.equal(t.length, 1);
  assert.equal(t[0].locality_id, 'L1');
  assert.equal(t[0].gap_offices, 2);
  assert.deepEqual(t[0].missing_roles.sort(), ['sign_permit', 'zoning']);
}

// ── ordering: most gap offices first ─────────────────────────────────────
{
  const state = { offices: {
    a: off('L1', ['no_research'], ['sign_permit']),
    b: off('L2', ['no_research'], ['zoning']),
    c: off('L2', ['no_quote'], ['building']),
    d: off('L2', ['no_role_match'], ['right_of_way']),
  } };
  const t = gapTargets(state, [loc('L1', 'Alpha'), loc('L2', 'Beta')], {}, NOW);
  assert.deepEqual(t.map((x) => x.locality_id), ['L2', 'L1']);
  assert.equal(t[0].gap_offices, 3);
}

// ── no slicing: every gap locality is a shared target — claims, not hash
// slices, prevent two researchers working the same one ────────────────────
{
  const state = { offices: Object.fromEntries([...Array(40)].map((_, i) => [`o${i}`, off(`L${i}`, ['no_research'], ['sign_permit'])])) };
  const locs = [...Array(40)].map((_, i) => loc(`L${i}`, `Town${i}`));
  const all = new Set(gapTargets(state, locs, {}, NOW).map((t) => t.locality_id));
  assert.equal(all.size, 40); // every target visible to every researcher
}

// ── cooldown: fresh claims suppress, stale claims re-queue ───────────────
{
  const state = { offices: { a: off('L1', ['no_research'], ['sign_permit']) } };
  const locs = [loc('L1', 'Alpha')];
  const claims = { 'gap-L1': { result: 'none', at: new Date(NOW - 3600e3).toISOString() } }; // 1h ago, no new evidence
  assert.equal(gapTargets(state, locs, claims, NOW).length, 0); // 24h cooldown holds
  claims['gap-L1'].at = new Date(NOW - GAP_CD.none - 1000).toISOString();
  assert.equal(gapTargets(state, locs, claims, NOW).length, 1); // stale 'none' re-queues
  claims['gap-L1'] = { result: 'new', at: new Date(NOW - 10 * 60e3).toISOString() };
  assert.equal(gapTargets(state, locs, claims, NOW).length, 0); // 'new' grace holds
  claims['gap-L1'].at = new Date(NOW - GAP_CD.new - 1000).toISOString();
  assert.equal(gapTargets(state, locs, claims, NOW).length, 1); // 'new' cooldown shorter than 'none'
  assert.ok(GAP_CD.new < GAP_CD.none);
}

// ── tombstoned / missing localities are excluded ─────────────────────────
{
  const state = { offices: { a: off('L1', ['no_research'], ['sign_permit']), b: off('L2', ['no_research'], ['zoning']) } };
  const locs = [{ ...loc('L1', 'Alpha'), duplicate_of: 'other' }];
  assert.equal(gapTargets(state, locs, {}, NOW).length, 0);
}

console.log('PASS gap-targets');
