// Contract checks for masterplan item C-07 — queue auto-refresh with budget
// discipline. The scheduling core (createAutoRefreshController in
// src/components/queues/useQueueAutoRefresh.js) is pure: clock, visibility and
// timers are injected, so this suite drives it with a fake clock + fake timer
// queue and asserts the whole interval/visibility/cursor policy without a DOM.
//
//   - clamp: every interval request floors at 30s (boardFeed's cache cadence)
//   - hidden pause: ticks fire but never call refresh while hidden
//   - regain-visible: ONE refresh, debounced 2s, coalesced against ticks
//   - cursor threading: res.next_cursor becomes the next call's {since}
//   - error capture: failures land in state, the cadence survives
//   - no double-fire: concurrent triggers collapse; cleanup leaks no timer
//
// Run: node scripts/test-queue-auto-refresh.mjs  →  prints "PASS queue-auto-refresh"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-qar.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/queues/useQueueAutoRefresh.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  // The hook half needs react; the controller under test does not. Leave the
  // import external — node resolves the repo's react fine.
  external: ['react'],
  alias: { '@': resolve(here, '../src') },
});
const M = await import(pathToFileURL(out).href);
const {
  QUEUE_REFRESH_MIN_INTERVAL_MS,
  QUEUE_REFRESH_RESUME_DEBOUNCE_MS,
  clampQueueRefreshInterval,
  createAutoRefreshController,
  useQueueAutoRefresh,
} = M;

// --- harness: fake clock + fake timer queue -----------------------------------

function harness({ interval_ms, initialCursor, refreshImpl, onStateChange } = {}) {
  let t = 1_000;
  let visible = true;
  let nextHandle = 1;
  const pending = new Map(); // handle -> {fn, ms}
  const calls = [];
  const ctl = createAutoRefreshController({
    interval_ms,
    initialCursor,
    now: () => t,
    isVisible: () => visible,
    setTimeoutImpl: (fn, ms) => { const h = nextHandle++; pending.set(h, { fn, ms }); return h; },
    clearTimeoutImpl: (h) => { pending.delete(h); },
    onError: () => {}, // error asserted via getState(); silence the logger
    onStateChange,
    refresh: async (args) => {
      calls.push(args);
      return refreshImpl ? refreshImpl(args) : { next_cursor: `c${calls.length}` };
    },
  });
  return {
    ctl, calls, pending,
    setVisible: (v) => { visible = v; },
    advance: (ms) => { t += ms; },
    delays: () => [...pending.values()].map((s) => s.ms),
    handles: () => [...pending.keys()],
    // Fire the pending timer armed with `ms` delay; awaits async callbacks.
    async fireDelay(ms) {
      const entry = [...pending.entries()].find(([, s]) => s.ms === ms);
      assert.ok(entry, `expected a pending timer armed at ${ms}ms (have: ${[...pending.values()].map((s) => s.ms).join(',') || 'none'})`);
      pending.delete(entry[0]);
      await entry[1].fn();
    },
  };
}

// --- 1. clamp semantics ---------------------------------------------------------

assert.equal(QUEUE_REFRESH_MIN_INTERVAL_MS, 30000, 'floor constant = boardFeed 30s cadence');
assert.equal(QUEUE_REFRESH_RESUME_DEBOUNCE_MS, 2000, 'resume debounce = 2s');
assert.equal(clampQueueRefreshInterval(5000), 30000, 'sub-floor request clamps up');
assert.equal(clampQueueRefreshInterval(30000), 30000, 'floor itself preserved');
assert.equal(clampQueueRefreshInterval(60000), 60000, 'slower cadence preserved');
assert.equal(clampQueueRefreshInterval(0), 30000, 'zero -> floor');
assert.equal(clampQueueRefreshInterval(-5000), 30000, 'negative -> floor');
assert.equal(clampQueueRefreshInterval(NaN), 30000, 'NaN -> floor');
assert.equal(clampQueueRefreshInterval(undefined), 30000, 'unset -> floor');
assert.equal(clampQueueRefreshInterval('45000'), 45000, 'numeric string honored');
assert.equal(typeof useQueueAutoRefresh, 'function', 'hook export present');
assert.equal(typeof createAutoRefreshController, 'function', 'controller export present');
assert.throws(() => createAutoRefreshController({}), TypeError, 'refresh is required');

// --- 2. clamped cadence + hidden pause -------------------------------------------

{
  const h = harness({ interval_ms: 1000 }); // asks for 1s — must schedule 30s
  assert.equal(h.ctl.intervalMs, 30000, 'controller clamps the requested interval');
  h.ctl.start();
  assert.deepEqual(h.delays(), [30000], 'first tick armed at clamped 30s, never faster');

  h.setVisible(false);
  h.ctl.notifyVisibility(); // hiding schedules nothing
  assert.deepEqual(h.delays(), [30000], 'hiding adds no timers');
  await h.fireDelay(30000); // tick fires while hidden
  assert.equal(h.calls.length, 0, 'hidden tick never calls refresh');
  assert.deepEqual(h.delays(), [30000], 'cadence keeps running while hidden');
  await h.fireDelay(30000);
  assert.equal(h.calls.length, 0, 'still hidden, still paused');

  // Regain visible -> exactly one debounced resume refresh.
  h.setVisible(true);
  h.ctl.notifyVisibility();
  assert.deepEqual(h.delays().sort((a, b) => a - b), [2000, 30000],
    'regain-visible arms a 2s resume alongside the tick');
  await h.fireDelay(2000);
  assert.equal(h.calls.length, 1, 'regain-visible fires one immediate refresh');
  assert.deepEqual(h.calls[0], { since: null }, 'first call is a full pull (null cursor)');
  assert.ok(h.ctl.getState().lastRefreshAt !== null, 'lastRefreshAt stamped on success');
  assert.deepEqual(h.delays(), [30000], 'post-refresh cadence re-armed');
  h.ctl.dispose();
}

// --- 3. cursor threading ----------------------------------------------------------

{
  const h = harness({ interval_ms: 45000 });
  h.ctl.start();
  await h.fireDelay(45000);
  assert.equal(h.calls.length, 1);
  assert.equal(h.ctl.getState().cursor, 'c1', 'next_cursor captured into the delta chain');
  await h.fireDelay(45000);
  assert.deepEqual(h.calls[1], { since: 'c1' }, 'next pull threads the cursor');
  assert.equal(h.ctl.getState().cursor, 'c2', 'cursor advances again');
  h.ctl.dispose();
}

{
  // A response without next_cursor leaves the chain alone (never restarts it).
  const h = harness({ refreshImpl: async () => ({ rows: [] }) });
  h.ctl.resetCursor('keep-me');
  h.ctl.start();
  await h.fireDelay(30000);
  assert.equal(h.ctl.getState().cursor, 'keep-me', 'missing next_cursor does not clobber');
  h.ctl.dispose();
}

{
  const h = harness({ initialCursor: 'seed-1' });
  h.ctl.start();
  await h.fireDelay(30000);
  assert.deepEqual(h.calls[0], { since: 'seed-1' }, 'initialCursor honored on first pull');
  h.ctl.resetCursor(); // cursorKey change -> chain invalidated
  await h.fireDelay(30000);
  assert.deepEqual(h.calls[1], { since: null }, 'resetCursor -> next pull is a clean full fetch');
  h.ctl.dispose();
}

// --- 4. error capture; cadence survives -------------------------------------------

{
  let fail = true;
  const h = harness({
    refreshImpl: async () => { if (fail) throw new Error('boom'); return { next_cursor: 'ok' }; },
  });
  h.ctl.start();
  await h.fireDelay(30000);
  assert.equal(h.calls.length, 1, 'failing call still counted');
  assert.equal(h.ctl.getState().error?.message, 'boom', 'error captured in state');
  assert.equal(h.ctl.getState().refreshing, false, 'refreshing cleared after failure');
  assert.deepEqual(h.delays(), [30000], 'a failed refresh keeps the timer alive');
  fail = false;
  await h.fireDelay(30000);
  assert.equal(h.ctl.getState().error, null, 'success clears the error');
  assert.equal(h.ctl.getState().cursor, 'ok', 'cadence retried and threaded the cursor');
  h.ctl.dispose();
}

// --- 5. no double-fire --------------------------------------------------------------

{
  // Concurrent triggers collapse on the in-flight guard.
  let release;
  const gate = new Promise((r) => { release = r; });
  const h = harness({ refreshImpl: () => gate.then(() => ({ next_cursor: 'g' })) });
  h.ctl.start();
  const p1 = h.ctl.refreshNow();
  const p2 = h.ctl.refreshNow();
  assert.equal(await p2, false, 'concurrent refreshNow is a no-op');
  assert.equal(h.calls.length, 1, 'only one underlying call in flight');
  release();
  assert.equal(await p1, true, 'the single call resolves true');
  h.ctl.dispose();
}

{
  // Regain-visible resume coalesces against a tick that already ran.
  const h = harness();
  h.ctl.start();
  h.setVisible(false);
  h.ctl.notifyVisibility();
  await h.fireDelay(30000);            // hidden tick skipped, re-armed
  h.setVisible(true);
  h.ctl.notifyVisibility();            // resume armed at +2s; tick still pending
  await h.fireDelay(30000);            // tick's refresh runs first
  assert.equal(h.calls.length, 1);
  await h.fireDelay(2000);             // stale resume fires — covered by the tick
  assert.equal(h.calls.length, 1, 'resume coalesced — no double-fire');
  h.ctl.dispose();
}

{
  // Flicker: visible->hidden->visible->visible stays a single debounced call,
  // and re-hiding before the debounce fires cancels it outright.
  const h = harness();
  h.ctl.start();
  h.setVisible(true);
  h.ctl.notifyVisibility();
  h.setVisible(false);
  h.ctl.notifyVisibility();            // hides again — pending resume cancelled
  assert.equal(h.delays().filter((d) => d === 2000).length, 0, 're-hide cancels the queued resume');
  h.setVisible(true);
  h.ctl.notifyVisibility();
  h.ctl.notifyVisibility();            // duplicate notification re-arms, never stacks
  assert.equal(h.delays().filter((d) => d === 2000).length, 1, 'repeated visible -> one resume');
  await h.fireDelay(2000);
  assert.equal(h.calls.length, 1, 'flicker resolves to a single refresh');
  h.ctl.dispose();
}

{
  // Resume re-checks visibility at fire time (edge: hidden without a notify).
  const h = harness();
  h.ctl.start();
  h.ctl.notifyVisibility();            // already-visible notify still arms (harmless)
  h.setVisible(false);                 // tab goes hidden behind the listener's back
  await h.fireDelay(2000);
  assert.equal(h.calls.length, 0, 'resume fire re-checks visibility — no hidden call');
  h.ctl.dispose();
}

// --- 6. refreshNow semantics ---------------------------------------------------------

{
  const h = harness();
  h.ctl.start();
  const before = h.handles()[0];
  await h.ctl.refreshNow();
  assert.deepEqual(h.calls[0], { since: null }, 'refreshNow threads the same delta cursor');
  const after = h.handles()[0];
  assert.notEqual(after, before, 'manual refresh re-arms the tick (budget reset)');
  assert.deepEqual(h.delays(), [30000], 'next auto tick pushed a full interval out');

  // Manual refresh while hidden is still honored — it is an explicit caller
  // action, not part of the passive cadence.
  h.setVisible(false);
  assert.equal(await h.ctl.refreshNow(), true, 'explicit manual call honored even hidden');
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1], { since: 'c1' }, 'second manual call uses the advanced cursor');
  h.ctl.dispose();
}

// --- 7. lifecycle -----------------------------------------------------------------------

{
  const h = harness();
  h.ctl.start();
  h.ctl.start();
  assert.equal(h.pending.size, 1, 'start is idempotent — never two timers');
  h.ctl.notifyVisibility();
  assert.equal(h.pending.size, 2, 'tick + resume armed');

  h.ctl.dispose();
  assert.equal(h.pending.size, 0, 'dispose clears every pending timer');
  h.ctl.notifyVisibility();
  assert.equal(h.pending.size, 0, 'post-dispose notify is a no-op');
  assert.equal(await h.ctl.refreshNow(), false, 'post-dispose refreshNow is a no-op');
  assert.equal(h.calls.length, 0, 'disposed controller never called refresh');
}

{
  // stop() pauses without killing — the hook's enabled toggle path.
  const h = harness();
  h.ctl.start();
  h.ctl.stop();
  assert.equal(h.pending.size, 0, 'stop clears all timers');
  h.ctl.start();
  assert.equal(h.pending.size, 1, 'stop -> start re-arms cleanly');
  await h.fireDelay(30000);
  assert.equal(h.calls.length, 1, 'restarted cadence calls refresh');
  h.ctl.dispose();
}

{
  // setIntervalMs (prop drift) re-clamps at runtime.
  const h = harness();
  h.ctl.setIntervalMs(100);
  assert.equal(h.ctl.intervalMs, 30000, 'runtime interval change still floored');
  h.ctl.setIntervalMs(90000);
  assert.equal(h.ctl.intervalMs, 90000, 'slower runtime interval honored');
  h.ctl.dispose();
}

{
  // onStateChange observes each transition (hook's re-render channel), and
  // getState exposes exactly the documented shape.
  let emits = 0;
  const h = harness({ onStateChange: () => { emits += 1; } });
  h.ctl.start();
  await h.fireDelay(30000);
  assert.ok(emits >= 2, 'state transitions emitted (refresh begin + end)');
  const s = h.ctl.getState();
  assert.deepEqual(Object.keys(s).sort(), ['cursor', 'error', 'lastRefreshAt', 'refreshing'],
    'getState shape = hook return payload');
  h.ctl.dispose();
}

rmSync(out, { force: true });
console.log('PASS queue-auto-refresh');
