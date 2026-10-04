import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBacklogRows,
  profileMatchesQueueRow,
  researchRequestPayload,
} from "../base44/shared/permittingResearchBacklog.mjs";

test("dispatcher fills available capacity without any total backlog ceiling", () => {
  const queueRows = Array.from({ length: 1200 }, (_, i) => ({
    id: `q-${i}`,
    jurisdiction_name: `Jurisdiction ${i}`,
    state: i % 2 ? "OH" : "KY",
    jurisdiction_type: "city",
    parent_county_name: `County ${i}`,
  }));
  const plan = classifyBacklogRows({
    queueRows,
    profiles: [],
    inFlightCount: 225,
    inFlightTarget: 250,
    maxDispatchPerRun: 50,
  });
  assert.equal(plan.room, 25);
  assert.equal(plan.dispatch.length, 25);
  assert.equal(plan.reconcile.length, 0);
});

test("dispatcher pauses at capacity rather than depending on a magic batch total", () => {
  const plan = classifyBacklogRows({
    queueRows: [{ id: "1", jurisdiction_name: "A", state: "OH", jurisdiction_type: "city", parent_county_name: "X County" }],
    profiles: [],
    inFlightCount: 250,
    inFlightTarget: 250,
    maxDispatchPerRun: 50,
  });
  assert.equal(plan.atCapacity, true);
  assert.equal(plan.dispatch.length, 0);
});

test("existing profile reconciles a stale not-started row instead of creating duplicate research", () => {
  const row = { id: "1", jurisdiction_name: "Lincoln Heights", state: "OH", jurisdiction_type: "village", parent_county_name: "Hamilton County" };
  const profile = { id: "p1", name: "Lincoln Heights", state: "OH", type: "village" };
  assert.equal(profileMatchesQueueRow(row, profile, [profile]), true);
  const plan = classifyBacklogRows({ queueRows: [row], profiles: [profile], inFlightCount: 0 });
  assert.equal(plan.reconcile.length, 1);
  assert.equal(plan.dispatch.length, 0);
});

test("same locality name in different counties remains disambiguated", () => {
  const row = { jurisdiction_name: "Fairfield", state: "OH", jurisdiction_type: "city", parent_county_name: "Butler County" };
  const wrong = { name: "Fairfield", state: "OH", type: "city", parent_county: { name: "Other County" } };
  const right = { name: "Fairfield", state: "OH", type: "city", parent_county: { name: "Butler County" } };
  assert.equal(profileMatchesQueueRow(row, wrong, [wrong, right]), false);
  assert.equal(profileMatchesQueueRow(row, right, [wrong, right]), true);
});

test("research payload supports profile-less expansion requests", () => {
  assert.deepEqual(researchRequestPayload({
    jurisdiction_name: "Green Township",
    state: "OH",
    jurisdiction_type: "township",
    parent_county_name: "Hamilton County",
  }), {
    jurisdiction_name: "Green Township",
    state: "OH",
    city: "Green Township",
    county: "Hamilton County",
    ccs_jurisdiction_id: null,
    status: "pending",
    requested_by: "continuous_backlog_dispatcher",
  });
});
