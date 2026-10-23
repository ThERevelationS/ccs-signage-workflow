import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("base44/functions/fleetCutoverControl/entry.ts", "utf8").replace(/\r\n/g, "\n");

const start = source.indexOf("async function getCutoverState");
assert.notEqual(start, -1, "getCutoverState not found");
const end = source.indexOf("\n}\n", start);
assert.notEqual(end, -1, "getCutoverState body end not found");
const body = source.slice(start, end + 3).replace(/:(any|string|number|boolean)(\s*[,)])/g, "$2");

const buildFn = () => {
  const ctx = { CUTOVER_STATE_KEY: "primary" };
  const fn = new Function(
    ...Object.keys(ctx),
    `${body}\nreturn getCutoverState;`,
  )(...Object.values(ctx));
  return fn;
};

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Simulates the entity where two concurrent first calls each see an empty
// filter, then both create — the classic singleton split-brain.
const racingEntity = () => {
  const rows = [];
  const created = [];
  const deleted = [];
  let nextId = 0;
  let createCalls = 0;
  let firstCreateGate = null;
  return {
    rows, created, deleted,
    get createCalls() { return createCalls; },
    holdFirstCreate: (gate) => { firstCreateGate = gate; },
    filter: async () => rows.slice(),
    create: async (data) => {
      createCalls += 1;
      // Hold the first create so the second call also observes an empty table.
      if (createCalls === 1 && firstCreateGate) await firstCreateGate.promise;
      const row = { ...data, id: `row-${++nextId}` };
      rows.push(row);
      created.push(row);
      return row;
    },
    delete: async (id) => {
      deleted.push(id);
      const idx = rows.findIndex(r => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
      return {};
    },
  };
};

test("fleetCutoverControl: a concurrent first-call loser retires its duplicate row and returns the canonical state", async () => {
  const entity = racingEntity();
  const gate = deferred();
  entity.holdFirstCreate(gate);
  const base44 = { asServiceRole: { entities: { FleetCutoverState: entity } } };
  const getState = buildFn(entity);

  const first = getState(base44, true);
  const second = getState(base44, true);
  await new Promise(r => setImmediate(r));
  gate.resolve();

  const [firstRow, secondRow] = await Promise.all([first, second]);
  const survivorId = entity.rows[0]?.id;
  assert.equal(entity.rows.length, 1, "exactly one FleetCutoverState row may survive");
  assert.equal(entity.deleted.length, 1, "the losing create must be retired");
  assert.equal(firstRow.id, survivorId);
  assert.equal(secondRow.id, survivorId, "both callers must agree on the canonical row");
});

test("fleetCutoverControl: an existing row short-circuits without creating or deleting", async () => {
  const entity = racingEntity();
  entity.rows.push({ id: "row-9", state_key: "primary", notifications_enabled: true });
  const base44 = { asServiceRole: { entities: { FleetCutoverState: entity } } };
  const getState = buildFn(entity);
  const row = await getState(base44, true);
  assert.equal(row.id, "row-9");
  assert.equal(entity.createCalls, 0);
  assert.equal(entity.deleted.length, 0);
});

test("fleetCutoverControl: a missing row stays missing when creation is not requested", async () => {
  const entity = racingEntity();
  const base44 = { asServiceRole: { entities: { FleetCutoverState: entity } } };
  const getState = buildFn(entity);
  const row = await getState(base44, false);
  assert.equal(row, null);
  assert.equal(entity.createCalls, 0);
});

test("fleetCutoverControl: multiple pre-existing duplicates resolve to the lowest id deterministically", async () => {
  const entity = racingEntity();
  entity.rows.push(
    { id: "row-2", state_key: "primary" },
    { id: "row-1", state_key: "primary" },
    { id: "row-3", state_key: "primary" },
  );
  const base44 = { asServiceRole: { entities: { FleetCutoverState: entity } } };
  const getState = buildFn(entity);
  const row = await getState(base44, true);
  assert.equal(row.id, "row-1");
});
