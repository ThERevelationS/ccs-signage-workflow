// Contract checks for masterplan item M-05 — the shared poll registry
// (src/lib/pollRegistry.js). The registry core is pure: clock, hidden probe,
// timers and the visibility listener are injected, so this suite drives it
// with a fake clock + fake interval queue + fake visibility switch — no DOM,
// no esbuild (the module is plain ESM, imported directly).
//
//   - sharing: ONE timer per unique interval serves every registered fn
//   - hidden pause: ticks still fire but ZERO fn-calls while hidden
//   - run_when_hidden: flagged fns keep firing in a background tab
//   - resume: regain-visible dispatches every due entry once (never-ran = due)
//   - overlap: an in-flight call is skipped, never stacked
//   - lifecycle: last-key-removal clears the timer; dispose clears everything
//   - singleton: one registry per process (idempotent imports)
//
// Run: node scripts/test-poll-registry.mjs  →  prints "PASS poll-registry"

import assert from 'node:assert/strict';
import {
  createPollRegistry,
  getPollRegistry,
  registerPoll,
  unregisterPoll,
  pollNow,
  setPollInterval,
  pollRegistryStats,
  POLL_REGISTRY_MIN_INTERVAL_MS,
} from '../src/lib/pollRegistry.js';

let ASSERT_COUNT = 0;
const check = (cond, msg) => { ASSERT_COUNT += 1; assert.ok(cond, msg); };
const eq = (a, b, msg) => { ASSERT_COUNT += 1; assert.equal(a, b, msg); };

// --- harness: fake clock + fake interval table + fake visibility ------------

function harness() {
  let t = 1_000;
  let hidden = false;
  let nextHandle = 1;
  const intervals = new Map(); // handle -> {fn, ms}
  const visCbs = new Set();
  const errors = [];
  const reg = createPollRegistry({
    now: () => t,
    isHidden: () => hidden,
    setIntervalImpl: (fn, ms) => {
      const h = nextHandle++;
      intervals.set(h, { fn, ms });
      return h;
    },
    clearIntervalImpl: (h) => intervals.delete(h),
    addVisibilityListener: (cb) => {
      visCbs.add(cb);
      return () => visCbs.delete(cb);
    },
    onError: (err) => errors.push(err),
  });
  return {
    reg, intervals, errors,
    setHidden: (v) => { hidden = v; },
    // Simulate the browser event: flip the probe, then notify listeners.
    flip: (v) => { hidden = v; for (const cb of [...visCbs]) cb(); },
    advance: (ms) => { t += ms; },
    now: () => t,
    // Fire every interval armed at `ms` (order = arming order).
    async tick(ms) {
      const hits = [...intervals.values()].filter((s) => s.ms === ms);
      check(hits.length > 0, `expected ≥1 interval armed at ${ms}ms (have: ${[...intervals.values()].map((s) => s.ms).join(',') || 'none'})`);
      for (const s of hits) await s.fn();
    },
    visListenerCount: () => visCbs.size,
    armedMs: () => [...intervals.values()].map((s) => s.ms).sort((a, b) => a - b),
    timerCount: () => intervals.size,
  };
}

// --- 1. registration + interval sharing --------------------------------------

{
  const h = harness();
  const calls = { a: 0, b: 0, c: 0 };
  const ha = h.reg.registerPoll('a', { interval_ms: 60000, fn: () => { calls.a += 1; } });
  check(ha && ha.key === 'a' && typeof ha.unregister === 'function', 'registerPoll returns {key, unregister}');
  eq(h.timerCount(), 1, 'first registration arms one timer');
  eq(h.armedMs()[0], 60000, 'timer armed at interval_ms');
  eq(h.visListenerCount(), 1, 'one visibility listener attached at creation');

  h.reg.registerPoll('b', { interval_ms: 60000, fn: () => { calls.b += 1; } });
  eq(h.timerCount(), 1, 'second key at the same interval shares the timer — one setInterval per unique interval');

  h.reg.registerPoll('c', { interval_ms: 30000, fn: () => { calls.c += 1; } });
  eq(h.timerCount(), 2, 'a different interval arms a second timer');
  eq(h.reg.stats().registered, 3, 'stats.registered counts keys');
  eq(h.reg.stats().intervals, 2, 'stats.intervals counts timer groups');

  await h.tick(60000);
  eq(calls.a, 1, 'tick fires listener a');
  eq(calls.b, 1, 'shared tick fires listener b too');
  eq(calls.c, 0, 'other interval group untouched');
  eq(h.reg.stats().last_tick_at, h.now(), 'last_tick_at stamped on tick');
  eq(h.reg.stats().fired_calls, 2, 'fired_calls counts dispatches');

  await h.tick(30000);
  eq(calls.c, 1, '30s group fires its own key');
  eq(calls.a, 1, '60s group not re-fired by the 30s tick');
  h.reg.dispose();
}

// --- 2. the hidden pause: zero fn-calls while document.hidden -----------------

{
  const h = harness();
  const calls = { a: 0, b: 0, bg: 0 };
  h.reg.registerPoll('a', { interval_ms: 60000, fn: () => { calls.a += 1; } });
  h.reg.registerPoll('b', { interval_ms: 60000, fn: () => { calls.b += 1; } });
  h.reg.registerPoll('bg', { interval_ms: 60000, run_when_hidden: true, fn: () => { calls.bg += 1; } });

  h.setHidden(true); // probe only — a tick while hidden suppresses calls
  await h.tick(60000);
  eq(calls.a, 0, 'hidden: listener a suppressed');
  eq(calls.b, 0, 'hidden: listener b suppressed');
  eq(calls.bg, 1, 'run_when_hidden fires in a hidden tab');
  eq(h.reg.stats().suppressed_ticks, 2, 'suppressed_ticks counts skipped calls');
  eq(h.reg.stats().active_listeners, 1, 'active_listeners while hidden = run_when_hidden count');
  eq(h.reg.stats().hidden, true, 'stats.hidden reflects the probe');

  await h.tick(60000);
  eq(calls.a, 0, 'still hidden: still zero calls');
  eq(h.reg.stats().suppressed_ticks, 4, 'suppressed_ticks accumulates');
  eq(calls.bg, 2, 'run_when_hidden keeps its cadence hidden');
  h.reg.dispose();
}

// --- 3. resume-on-visible -----------------------------------------------------

{
  const h = harness();
  const calls = { a: 0, fresh: 0, quiet: 0 };
  h.reg.registerPoll('a', { interval_ms: 60000, fn: () => { calls.a += 1; } });
  h.reg.registerPoll('quiet', { interval_ms: 60000, refresh_on_visible: false, fn: () => { calls.quiet += 1; } });
  await h.tick(60000); // both ran at t=1000
  eq(calls.a, 1); eq(calls.quiet, 1);

  h.flip(true); // hide via the listener path — nothing fires on hide
  h.advance(120000); // both entries now due
  h.flip(false);   // regain visible → due entries resume immediately
  eq(calls.a, 2, 'due entry refreshed once on regain-visible');
  eq(calls.quiet, 1, 'refresh_on_visible:false stays quiet on regain');
  eq(calls.fresh, 0);

  // An entry that ran recently is NOT due — flicker adds no calls.
  h.advance(5000); // only 5s of the 60s interval elapsed
  h.flip(true); h.flip(false);
  eq(calls.a, 2, 'recent entry not due → no extra call on flicker');

  // An entry registered while hidden and never run is due on first visible.
  const h2 = harness();
  const late = { n: 0 };
  h2.setHidden(true);
  h2.reg.registerPoll('late', { interval_ms: 60000, fn: () => { late.n += 1; } });
  h2.flip(true); h2.flip(false);
  eq(late.n, 1, 'never-ran entry counts as due on first visible');
  h.reg.dispose(); h2.reg.dispose();
}

// --- 4. unregister + group lifecycle ------------------------------------------

{
  const h = harness();
  const calls = { a: 0, b: 0 };
  const ha = h.reg.registerPoll('a', { interval_ms: 60000, fn: () => { calls.a += 1; } });
  h.reg.registerPoll('b', { interval_ms: 60000, fn: () => { calls.b += 1; } });
  eq(h.reg.unregisterPoll('a'), true, 'unregisterPoll returns true for a live key');
  eq(h.timerCount(), 1, 'group survives while a key remains');
  await h.tick(60000);
  eq(calls.a, 0, 'unregistered key never fires again');
  eq(calls.b, 1, 'sibling keeps firing');
  eq(h.reg.unregisterPoll('b'), true, 'last key unregisters');
  eq(h.timerCount(), 0, 'last key out → timer cleared (no orphan interval)');
  eq(h.reg.unregisterPoll('b'), false, 'double unregister is a no-op false');
  eq(h.reg.unregisterPoll('never'), false, 'unknown key unregister is false');

  // Re-register same key = replace, not stack.
  h.reg.registerPoll('x', { interval_ms: 60000, fn: () => { calls.a += 1; } });
  h.reg.registerPoll('x', { interval_ms: 60000, fn: () => { calls.b += 1; } });
  eq(h.reg.stats().registered, 1, 're-register replaces — still one key');
  eq(h.timerCount(), 1, 're-register does not stack timers');
  await h.tick(60000);
  eq(calls.b, 2, 'replacement fn fires');
  eq(calls.a, 0, 'replaced fn is gone');

  // handle.unregister() === unregisterPoll(key)
  const hy = h.reg.registerPoll('y', { interval_ms: 60000, fn: () => {} });
  eq(hy.unregister(), true, 'handle.unregister works');
  eq(h.reg.stats().registered, 1, 'handle.unregister removes the key');
  h.reg.dispose();
}

// --- 5. pollNow + setPollInterval ---------------------------------------------

{
  const h = harness();
  const calls = { a: 0 };
  h.reg.registerPoll('a', { interval_ms: 60000, fn: () => { calls.a += 1; } });
  h.setHidden(true);
  eq(h.reg.pollNow('a'), true, 'pollNow dispatches a live key');
  eq(calls.a, 1, 'pollNow runs even while hidden (manual override)');
  eq(h.reg.pollNow('missing'), false, 'pollNow on unknown key is false');

  eq(h.reg.setPollInterval('a', 30000), true, 'setPollInterval moves the entry');
  eq(h.armedMs().includes(30000), true, 'new group timer armed');
  eq(h.armedMs().includes(60000), false, 'old group timer cleared when emptied');
  eq(h.reg.setPollInterval('a', 30000), true, 'same-interval set is a cheap true');
  eq(h.reg.setPollInterval('missing', 1000), false, 'setPollInterval unknown key false');
  h.reg.dispose();
}

// --- 6. in-flight overlap + error survival ------------------------------------

{
  const h = harness();
  let release = null;
  const slow = { n: 0 };
  h.reg.registerPoll('slow', {
    interval_ms: 60000,
    fn: () => { slow.n += 1; return new Promise((r) => { release = r; }); },
  });
  await h.tick(60000);
  eq(slow.n, 1, 'slow fn dispatched');
  await h.tick(60000);
  eq(slow.n, 1, 'in-flight call skipped at the next tick — never stacked');
  eq(h.reg.stats().skipped_in_flight, 1, 'skipped_in_flight counted');
  eq(h.reg.pollNow('slow'), false, 'pollNow respects in-flight too');
  release();
  await Promise.resolve();
  await h.tick(60000);
  eq(slow.n, 2, 'settled call frees the next tick');

  // A throwing fn must not kill the cadence or its group siblings.
  const h2 = harness();
  const calls = { bad: 0, good: 0 };
  h2.reg.registerPoll('bad', { interval_ms: 60000, fn: () => { calls.bad += 1; throw new Error('boom'); } });
  h2.reg.registerPoll('good', { interval_ms: 60000, fn: () => { calls.good += 1; } });
  await h2.tick(60000);
  eq(calls.bad, 1, 'throwing fn ran');
  eq(calls.good, 1, 'sibling still ran after a throwing fn');
  eq(h2.errors.length, 1, 'sync throw routed to onError');
  await h2.tick(60000);
  eq(calls.bad, 2, 'cadence survives a throwing fn');
  eq(h2.errors.length, 2, 'second tick of the throwing fn routes a second error');

  // Rejections too.
  h2.reg.registerPoll('rej', { interval_ms: 30000, fn: () => Promise.reject(new Error('nope')) });
  await h2.tick(30000);
  await Promise.resolve();
  eq(h2.errors.length, 3, 'rejection routed to onError');
  h.reg.dispose(); h2.reg.dispose();
}

// --- 7. validation + clamping --------------------------------------------------

{
  const h = harness();
  let threw = 0;
  try { h.reg.registerPoll('', { interval_ms: 1000, fn: () => {} }); } catch { threw += 1; }
  try { h.reg.registerPoll('k1', { interval_ms: 1000 }); } catch { threw += 1; }
  try { h.reg.registerPoll('k2', { interval_ms: Number.NaN, fn: () => {} }); } catch { threw += 1; }
  try { h.reg.registerPoll('k3', { interval_ms: 'abc', fn: () => {} }); } catch { threw += 1; }
  eq(threw, 4, 'empty key / missing fn / NaN / non-numeric interval all throw');
  eq(h.reg.stats().registered, 0, 'thrown registrations leave no residue');

  h.reg.registerPoll('fast', { interval_ms: 1, fn: () => {} });
  eq(h.armedMs()[0], POLL_REGISTRY_MIN_INTERVAL_MS, 'sub-floor interval clamps to the floor');
  h.reg.registerPoll('neg', { interval_ms: -5000, fn: () => {} });
  eq(h.armedMs().every((ms) => ms >= POLL_REGISTRY_MIN_INTERVAL_MS), true, 'negative interval clamps too');
  h.reg.dispose();
}

// --- 8. dispose ----------------------------------------------------------------

{
  const h = harness();
  h.reg.registerPoll('a', { interval_ms: 60000, fn: () => {} });
  h.reg.registerPoll('b', { interval_ms: 30000, fn: () => {} });
  eq(h.timerCount(), 2);
  h.reg.dispose();
  eq(h.timerCount(), 0, 'dispose clears every timer');
  eq(h.visListenerCount(), 0, 'dispose removes the visibility listener');
  eq(h.reg.stats().disposed, true, 'disposed stat set');
  let threw = false;
  try { h.reg.registerPoll('z', { interval_ms: 1000, fn: () => {} }); } catch { threw = true; }
  check(threw, 'registerPoll after dispose throws');
}

// --- 9. process singleton (idempotent imports) ---------------------------------

{
  const r1 = getPollRegistry();
  const r2 = getPollRegistry();
  check(r1 === r2, 'getPollRegistry is one instance per process');
  const calls = { n: 0 };
  // The flat delegates hit the same singleton — real timer armed, removed
  // before it can fire.
  registerPoll('__test_singleton__', { interval_ms: 60000, fn: () => { calls.n += 1; } });
  eq(pollRegistryStats().registered >= 1, true, 'flat registerPoll lands on the singleton');
  eq(unregisterPoll('__test_singleton__'), true, 'flat unregisterPoll works');
  eq(pollNow('__test_singleton__'), false, 'pollNow after unregister is false');
  check(typeof setPollInterval === 'function', 'flat setPollInterval exported');
}

// --- 10. default wiring is SSR/Node-safe (no document, real timers) ------------

{
  const reg = createPollRegistry(); // no injections — Node has timers, no document
  let n = 0;
  reg.registerPoll('node', { interval_ms: POLL_REGISTRY_MIN_INTERVAL_MS, fn: () => { n += 1; } });
  await new Promise((r) => setTimeout(r, POLL_REGISTRY_MIN_INTERVAL_MS * 3));
  reg.dispose();
  check(n >= 1, 'default-wired registry ticks on real timers without a DOM');
  eq(reg.stats().hidden, false, 'no document → never hidden');
}

console.log(`PASS poll-registry (${ASSERT_COUNT} assertions)`);
