import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("base44/shared/bouncie.ts", "utf8").replace(/\r\n/g, "\n");

const extract = (marker) => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing marker: ${marker}`);
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `missing end for: ${marker}`);
  return source.slice(start, end + 3)
    .replace(/^export /gm, "")
    .replace(/:(any|string|number|boolean)(\s*[,)])/g, "$2");
};

const body = `${extract("export async function getActiveConnection")}\n${extract("export async function saveConnection")}`;
const buildFns = () => new Function(`${body}\nreturn { getActiveConnection, saveConnection };`)();

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

// Simulates BouncieConnection where two concurrent first connections each see
// an empty list, then both create — the singleton split-brain.
const racingEntity = () => {
  const rows = [];
  const deleted = [];
  let nextId = 0;
  let createCalls = 0;
  let firstCreateGate = null;
  const entity = {
    rows, deleted,
    get createCalls() { return createCalls; },
    releaseFirstCreate: () => firstCreateGate?.resolve(),
    list: async () => rows.slice(),
    create: async (data) => {
      createCalls += 1;
      if (createCalls === 1) {
        firstCreateGate = deferred();
        await firstCreateGate.promise;
      }
      const row = {
        ...data,
        id: `conn-${++nextId}`,
        created_date: new Date(2026, 9, 23, 12, 0, nextId).toISOString(),
        updated_date: new Date(2026, 9, 23, 12, 0, nextId).toISOString(),
      };
      rows.push(row);
      return row;
    },
    update: async (id, patch) => {
      const row = rows.find(r => r.id === id);
      if (row) Object.assign(row, patch, { updated_date: new Date().toISOString() });
      return row;
    },
    delete: async (id) => {
      deleted.push(id);
      const idx = rows.findIndex(r => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
      return {};
    },
  };
  return entity;
};

test("saveConnection: a concurrent first-connection loser retires its duplicate and both callers get the canonical row", async () => {
  const entity = racingEntity();
  const base44 = { asServiceRole: { entities: { BouncieConnection: entity } } };
  const { saveConnection } = buildFns();

  const first = saveConnection(base44, { access_token: "a" });
  const second = saveConnection(base44, { access_token: "b" });
  await new Promise(r => setImmediate(r));
  entity.releaseFirstCreate();
  const [r1, r2] = await Promise.all([first, second]);

  assert.equal(entity.rows.length, 1, "exactly one BouncieConnection row may survive");
  assert.equal(entity.deleted.length, 1, "the losing create must be retired");
  assert.equal(r1.id, r2.id, "both callers must converge on the canonical connection");
  assert.equal(entity.rows[0].id, r1.id);
});

test("saveConnection: an existing connection is updated, not duplicated", async () => {
  const entity = racingEntity();
  entity.rows.push({ id: "conn-9", access_token: "old", created_date: "2026-01-01T00:00:00Z", updated_date: "2026-01-01T00:00:00Z" });
  const base44 = { asServiceRole: { entities: { BouncieConnection: entity } } };
  const { saveConnection } = buildFns();
  const row = await saveConnection(base44, { access_token: "new" });
  assert.equal(row.id, "conn-9");
  assert.equal(row.access_token, "new");
  assert.equal(entity.createCalls, 0);
  assert.equal(entity.deleted.length, 0);
});

test("getActiveConnection: picks the most recently updated row deterministically", async () => {
  const entity = racingEntity();
  entity.rows.push(
    { id: "conn-1", updated_date: "2026-01-01T00:00:00Z" },
    { id: "conn-3", updated_date: "2026-03-01T00:00:00Z" },
    { id: "conn-2", updated_date: "2026-02-01T00:00:00Z" },
  );
  const base44 = { asServiceRole: { entities: { BouncieConnection: entity } } };
  const { getActiveConnection } = buildFns();
  const row = await getActiveConnection(base44);
  assert.equal(row.id, "conn-3");
});
