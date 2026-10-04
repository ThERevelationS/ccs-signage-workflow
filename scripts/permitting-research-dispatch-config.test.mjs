import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PERMITTING_RESEARCH_CONFIG,
  normalizePermittingResearchConfig,
  normalizedResearchState,
  researchCycleDecision,
} from "../base44/shared/permittingResearchDispatchConfig.mjs";

test("cost controls default to 15-minute, bounded research", () => {
  assert.deepEqual(DEFAULT_PERMITTING_RESEARCH_CONFIG, {
    enabled: true,
    interval_minutes: 15,
    max_dispatch_per_cycle: 5,
    max_in_flight: 20,
    daily_dispatch_limit: 40,
    retry_limit: 3,
  });
});

test("settings clamp unsafe values", () => {
  const out = normalizePermittingResearchConfig({
    interval_minutes: 1,
    max_dispatch_per_cycle: 9999,
    max_in_flight: 0,
    daily_dispatch_limit: 999999,
    retry_limit: 99,
  });
  assert.equal(out.interval_minutes, 15);
  assert.equal(out.max_dispatch_per_cycle, 100);
  assert.equal(out.max_in_flight, 1);
  assert.equal(out.daily_dispatch_limit, 5000);
  assert.equal(out.retry_limit, 10);
});

test("scheduled cycles respect interval and daily cap", () => {
  const now = new Date("2026-10-04T16:00:00Z");
  const config = normalizePermittingResearchConfig({ interval_minutes: 15, daily_dispatch_limit: 40 });
  const tooSoon = researchCycleDecision({
    config,
    state: { last_cycle_at: "2026-10-04T15:50:00Z", daily_day_key: "2026-10-04", dispatched_today: 5 },
    now,
  });
  assert.equal(tooSoon.due, false);
  assert.equal(tooSoon.reason, "interval");

  const capped = researchCycleDecision({
    config,
    state: { last_cycle_at: "2026-10-04T15:00:00Z", daily_day_key: "2026-10-04", dispatched_today: 40 },
    now,
  });
  assert.equal(capped.due, false);
  assert.equal(capped.reason, "daily_limit");
});

test("daily counter resets on a new Eastern calendar day", () => {
  const now = new Date("2026-10-05T05:00:00Z");
  const state = normalizedResearchState({
    daily_day_key: "2026-10-04",
    dispatched_today: 40,
  }, now);
  assert.equal(state.daily_day_key, "2026-10-05");
  assert.equal(state.dispatched_today, 0);
});
