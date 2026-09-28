import test from "node:test";
import assert from "node:assert/strict";
import { deleteFleetRecordIfCurrent, FleetRecordConflictError } from "../base44/shared/fleetRecordPersistence.ts";

function entity({ result = { deleted: 1 }, current = { id: "policy-1", updated_date: "v1" } } = {}) {
  const calls = [];
  return {
    calls,
    async deleteMany(query) { calls.push(["deleteMany", query]); return result; },
    async get(id) { calls.push(["get", id]); return current; },
  };
}

test("deletes only the exact expected Fleet record version", async () => {
  const fake = entity();
  const result = await deleteFleetRecordIfCurrent({
    entity: fake, id: "policy-1", expectedUpdatedAt: "v1", label: "Fleet policy",
  });
  assert.deepEqual(result, { deleted: true, reused: false });
  assert.deepEqual(fake.calls, [["deleteMany", { id: "policy-1", updated_date: "v1" }]]);
});

test("changed record is preserved and reported as a conflict", async () => {
  const fake = entity({ result: { deleted: 0 }, current: { id: "policy-1", updated_date: "v2" } });
  await assert.rejects(
    () => deleteFleetRecordIfCurrent({ entity: fake, id: "policy-1", expectedUpdatedAt: "v1", label: "Fleet policy" }),
    err => err instanceof FleetRecordConflictError && /newer data was preserved/.test(err.message),
  );
  assert.deepEqual(fake.calls, [
    ["deleteMany", { id: "policy-1", updated_date: "v1" }],
    ["get", "policy-1"],
  ]);
});

test("lost delete acknowledgement can safely reuse an already-absent result", async () => {
  const fake = entity({ result: { deleted: 0 }, current: null });
  const result = await deleteFleetRecordIfCurrent({
    entity: fake, id: "policy-1", expectedUpdatedAt: "v1", label: "Fleet policy",
  });
  assert.deepEqual(result, { deleted: true, reused: true });
});

test("missing version fails before any delete is attempted", async () => {
  const fake = entity();
  await assert.rejects(
    () => deleteFleetRecordIfCurrent({ entity: fake, id: "policy-1", expectedUpdatedAt: "", label: "Fleet policy" }),
    /concurrency-safe delete/,
  );
  assert.deepEqual(fake.calls, []);
});

test("unverifiable delete result fails closed", async () => {
  const fake = entity({ result: {} });
  await assert.rejects(
    () => deleteFleetRecordIfCurrent({ entity: fake, id: "policy-1", expectedUpdatedAt: "v1", label: "Fleet policy" }),
    /could not be verified/,
  );
});

test("impossible multi-record delete fails closed", async () => {
  const fake = entity({ result: { deleted: 2 } });
  await assert.rejects(
    () => deleteFleetRecordIfCurrent({ entity: fake, id: "policy-1", expectedUpdatedAt: "v1", label: "Fleet policy" }),
    /impossible multi-record delete count/,
  );
});
