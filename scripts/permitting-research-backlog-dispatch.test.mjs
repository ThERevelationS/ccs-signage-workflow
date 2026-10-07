import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBacklogRows,
  ohioFirstResearchRows,
  jurisdictionProfileTypeForQueueRow,
  profileHasResearchEvidence,
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
  const profile = { id: "p1", name: "Lincoln Heights", state: "OH", type: "municipality", website_url: "https://example.gov" };
  assert.equal(profileMatchesQueueRow(row, profile, [profile]), true);
  const plan = classifyBacklogRows({ queueRows: [row], profiles: [profile], inFlightCount: 0 });
  assert.equal(plan.reconcile.length, 1);
  assert.equal(plan.dispatch.length, 0);
});

test("placeholder profiles are not treated as researched evidence", () => {
  const row = { id: "1", jurisdiction_name: "Example Village", state: "OH", jurisdiction_type: "village", parent_county_name: "Example County" };
  const placeholder = { id: "p1", name: "Example Village", state: "OH", type: "municipality", parent_county: { name: "Example County" } };
  assert.equal(jurisdictionProfileTypeForQueueRow(row), "village");
  assert.equal(profileHasResearchEvidence(placeholder), false);
  const researchedProfiles = [placeholder].filter(profileHasResearchEvidence);
  const plan = classifyBacklogRows({ queueRows: [row], profiles: researchedProfiles, inFlightCount: 0 });
  assert.equal(plan.reconcile.length, 0);
  assert.equal(plan.dispatch.length, 1);
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

test("Ohio takes release priority over older Kentucky rows without mutating queue order", () => {
  const rows = ['KY','OH','KY','OH'].map((state,i)=>({id:`p${i}`,state,jurisdiction_name:`Place ${i}`,jurisdiction_type:'county'}));
  const before=JSON.stringify(rows);
  const plan=classifyBacklogRows({queueRows:rows,profiles:[],inFlightCount:0,inFlightTarget:20,maxDispatchPerRun:2});
  assert.deepEqual(plan.dispatch.map(r=>r.id),['p1','p3']);
  assert.equal(JSON.stringify(rows),before);
});

test("Kentucky follows remaining eligible Ohio; researched Ohio does not stall backlog", () => {
  const rows=[{id:'ky',state:'KY',jurisdiction_name:'Kentucky County',jurisdiction_type:'county'},
    {id:'done',state:'OH',jurisdiction_name:'Done County',jurisdiction_type:'county'},
    {id:'oh',state:' oh ',jurisdiction_name:'Ohio County',jurisdiction_type:'county'}];
  const plan=classifyBacklogRows({queueRows:rows,profiles:[{name:'Done County',state:'OH',type:'county'}],maxDispatchPerRun:5,inFlightTarget:20});
  assert.deepEqual(plan.dispatch.map(r=>r.id),['oh','ky']);assert.deepEqual(plan.reconcile.map(r=>r.id),['done']);
});

test("Ohio first still preserves capacity and stable identity deduplication", () => {
  const row={id:'a',state:'OH',jurisdiction_name:'Ohio County',jurisdiction_type:'county'};
  const plan=classifyBacklogRows({queueRows:[{...row,id:'ky',state:'KY'},row,{...row,id:'duplicate'}],inFlightCount:19,inFlightTarget:20,maxDispatchPerRun:5});
  assert.deepEqual(plan.dispatch.map(r=>r.id),['a']);assert.equal(plan.room,1);
});

test("claimed execution rows are reordered Ohio first with stable state order", () => {
 const rows=[{id:'k1',state:'KY'},{id:'o1',state:'OH'},{id:'o2',state:'oh'},{id:'k2',state:'KY'}];
 assert.deepEqual(ohioFirstResearchRows(rows).map(r=>r.id),['o1','o2','k1','k2']);
 assert.deepEqual(rows.map(r=>r.id),['k1','o1','o2','k2']);
});
