// test-gap-targets — pure selection/tier/cooldown for verification gap-target
// research. No mirrors, no network.
import assert from 'node:assert';
import { gapTargets, gapTargetScan, REVIEW_ATTEMPTS } from './permitting-local-researcher.mjs';
import { nextTierFor, tierExhausted, TIER_CD, GAP_TIERS } from './lib/research-claims.mjs';

// Office-state keys are `${locId}:${office.id || office.name}` — live offices
// only, so test localities carry matching offices[] rows.
const mkLoc = (id, name, state = 'OH', offices = ['Office A']) => ({
  id, name, state, jurisdiction_type: 'city',
  offices: offices.map((n, i) => ({ id: `${id}-o${i}`, name: n, authority_roles: ['sign_permit'] })),
});
const key = (locId, i = 0) => `${locId}:${locId}-o${i}`;
const off = (locality_id, reasons, missing, attempts = 0, status = 'needs_verification') => ({ locality_id, status, reasons, missing_roles: missing, attempts });
const NOW = Date.now();
const ago = (ms) => new Date(NOW - ms).toISOString();

// ── reason inclusion: every non-terminal reason is chaseable ─────────────
{
  const locs = [mkLoc('L1', 'Alpha'), mkLoc('L2', 'Beta'), mkLoc('L3', 'Gamma'), mkLoc('L4', 'Delta'), mkLoc('L5', 'Echo'), mkLoc('L6', 'Foxtrot'), mkLoc('L7', 'Golf')];
  const state = { offices: {
    [key('L1')]: off('L1', ['no_research'], ['sign_permit']),
    [key('L2')]: off('L2', ['unofficial_source'], ['zoning']),
    [key('L3')]: off('L3', ['county_scope'], ['sign_permit']),
    [key('L4')]: off('L4', ['other'], ['building']),
    [key('L5')]: off('L5', ['no_quote'], ['zoning']),
    [key('L6')]: off('L6', ['non_permit_body'], ['zoning']),          // correct rejection — never a target
    [key('L7')]: off('L7', ['no_research'], [], 0, 'staff_verified'), // verified — skip
  } };
  const t = gapTargets(state, locs, {}, NOW);
  assert.deepEqual(t.map((x) => x.locality_id).sort(), ['L1', 'L2', 'L3', 'L4', 'L5']);
}

// ── tier assignment: fresh localities start T1, attempted ones resume T2 ─
{
  const locs = [mkLoc('L1', 'Alpha'), mkLoc('L2', 'Beta'), mkLoc('L3', 'Gamma'), mkLoc('L4', 'Delta')];
  const state = { offices: {
    [key('L1')]: off('L1', ['no_research'], ['sign_permit']),          // no attempts → T1
    [key('L2')]: off('L2', ['no_quote'], ['zoning'], 4),               // attempts = T1 done → T2
    [key('L3')]: off('L3', ['no_quote'], ['zoning'], 0),               // cooldown tiers [1] → T2
    [key('L4')]: off('L4', ['no_quote'], ['zoning'], 0),               // cooldown tiers [1,2,3] → T4
  } };
  const cds = {
    'gap-L3': { result: 'none', tiers: [1], at: ago(TIER_CD + 1000) },
    'gap-L4': { result: 'none', tiers: [1, 2, 3], at: ago(TIER_CD + 1000) },
  };
  const t = gapTargets(state, locs, cds, NOW);
  const byId = Object.fromEntries(t.map((x) => [x.locality_id, x.tier]));
  assert.equal(byId.L1, 1); assert.equal(byId.L2, 2); assert.equal(byId.L3, 2); assert.equal(byId.L4, 4);
}

// ── held offices re-admit at T2 (the strike count alone never holds) ─────
{
  const locs = [mkLoc('L1', 'Alpha')];
  const state = { offices: { [key('L1')]: off('L1', ['no_quote'], ['zoning'], REVIEW_ATTEMPTS) } };
  const t = gapTargets(state, locs, {}, NOW);
  assert.equal(t.length, 1);
  assert.equal(t[0].tier, 2); // attempts≥3 used to hold forever — now T2
  assert.equal(REVIEW_ATTEMPTS, 20); // strike limit bumped per spec
}

// ── 2h inter-tier cooldown: fresh → cooling, stale → target ──────────────
{
  const locs = [mkLoc('L1', 'Alpha')];
  const state = { offices: { [key('L1')]: off('L1', ['no_research'], ['sign_permit']) } };
  const fresh = { 'gap-L1': { result: 'none', tiers: [1], at: ago(3600e3) } }; // 1h ago — inside 2h
  const scan1 = gapTargetScan(state, locs, fresh, NOW);
  assert.equal(scan1.targets.length, 0);
  assert.equal(scan1.cooling.length, 1);
  assert.ok(scan1.nextRelease > NOW);
  const stale = { 'gap-L1': { result: 'none', tiers: [1], at: ago(TIER_CD + 1000) } };
  const scan2 = gapTargetScan(state, locs, stale, NOW);
  assert.equal(scan2.targets.length, 1);
  assert.equal(scan2.targets[0].tier, 2);
}

// ── cooling fallback ordering: least-recently-tried first (no-idle) ──────
{
  const locs = [mkLoc('L1', 'Alpha'), mkLoc('L2', 'Beta'), mkLoc('L3', 'Gamma')];
  const state = { offices: {
    [key('L1')]: off('L1', ['no_quote'], ['zoning']),
    [key('L2')]: off('L2', ['no_quote'], ['zoning']),
    [key('L3')]: off('L3', ['no_quote'], ['zoning']),
  } };
  const cds = {
    'gap-L1': { tiers: [1], at: ago(60e3) },   // most recent → last
    'gap-L2': { tiers: [1], at: ago(90e3) },
    'gap-L3': { tiers: [1], at: ago(119e3) },  // least recent → first
  };
  const scan = gapTargetScan(state, locs, cds, NOW);
  assert.equal(scan.targets.length, 0);            // all inside 2h
  assert.deepEqual(scan.cooling.map((c) => c.locality_id), ['L3', 'L2', 'L1']);
}

// ── exhausted localities leave the target list (needs_review) ────────────
{
  const locs = [mkLoc('L1', 'Alpha'), mkLoc('L2', 'Beta')];
  const state = { offices: {
    [key('L1')]: off('L1', ['no_quote'], ['zoning'], 8),
    [key('L2')]: off('L2', ['no_quote'], ['zoning'], 8),
  } };
  const cds = { 'gap-L1': { result: 'none', tiers: [1, 2, 3, 4], at: ago(TIER_CD + 1) } };
  const scan = gapTargetScan(state, locs, cds, NOW);
  assert.deepEqual(scan.targets.map((t) => t.locality_id), ['L2']);
  assert.deepEqual(scan.exhausted, ['L1']);
  assert.equal(tierExhausted(cds['gap-L1'], true), true);
  assert.equal(tierExhausted(cds['gap-L1'] && { tiers: [1] }, true), false);
}

// ── ordering: most gap offices first, then lowest tier ───────────────────
{
  const locs = [mkLoc('L1', 'Alpha', 'OH', ['A', 'B']), mkLoc('L2', 'Beta', 'OH', ['A', 'B', 'C']), mkLoc('L3', 'Gamma', 'OH', ['A', 'B', 'C'])];
  const state = { offices: {
    [key('L1', 0)]: off('L1', ['no_research'], ['sign_permit']),
    [key('L1', 1)]: off('L1', ['no_quote'], ['zoning']),
    [key('L2', 0)]: off('L2', ['no_research'], ['sign_permit']),
    [key('L2', 1)]: off('L2', ['no_research'], ['zoning']),
    [key('L2', 2)]: off('L2', ['no_research'], ['building']),
    [key('L3', 0)]: off('L3', ['no_research'], ['sign_permit']),
    [key('L3', 1)]: off('L3', ['no_research'], ['zoning']),
    [key('L3', 2)]: off('L3', ['no_research'], ['building']),
  } };
  const cds = { 'gap-L2': { tiers: [1], at: ago(TIER_CD + 1) } }; // L2 next tier 2
  const t = gapTargets(state, locs, cds, NOW);
  assert.deepEqual(t.map((x) => [x.locality_id, x.tier]), [['L3', 1], ['L2', 2], ['L1', 1]]); // offices desc, tier asc
}

// ── records for dead offices (renamed/retired) never spawn targets ───────
{
  const locs = [mkLoc('L1', 'Alpha')]; // has L1-o0 only
  const state = { offices: {
    [key('L1')]: off('L1', ['no_research'], ['sign_permit']),
    'L1:deleted-office': off('L1', ['no_quote'], ['zoning']), // dead record
  } };
  const t = gapTargets(state, locs, {}, NOW);
  assert.equal(t.length, 1);
  assert.equal(t[0].gap_offices, 1); // dead record not counted
}

// ── tombstoned / missing localities are excluded ─────────────────────────
{
  const state = { offices: { [key('L1')]: off('L1', ['no_research'], ['sign_permit']), [key('L2')]: off('L2', ['no_research'], ['zoning']) } };
  const locs = [{ ...mkLoc('L1', 'Alpha'), duplicate_of: 'other' }, mkLoc('L2', 'Beta')];
  assert.equal(gapTargets(state, locs, {}, NOW).length, 1);
}

// ── tier helpers ─────────────────────────────────────────────────────────
{
  assert.equal(nextTierFor(null, false), 1);
  assert.equal(nextTierFor(null, true), 2);            // attempts = T1 done
  assert.equal(nextTierFor({ result: 'none' }, false), 2); // legacy entry = T1 done
  assert.equal(nextTierFor({ tiers: [1, 3] }, false), 2);  // lowest untried
  assert.equal(nextTierFor({ tiers: [1, 2, 3, 4] }, false), null);
  assert.equal(GAP_TIERS, 4);
}

console.log('PASS gap-targets');
