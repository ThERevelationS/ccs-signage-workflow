import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const transpile = (file) => ts.transpileModule(
  readFileSync(path.join(root, file), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;
const importTs = async (file) => import("data:text/javascript;base64," + Buffer.from(transpile(file)).toString("base64"));
const { requireFleetInventoryExpectedVersion } = await importTs("base44/shared/fleetInventoryVersion.ts");
const { updateFleetRecordIfCurrent } = await importTs("base44/shared/fleetRecordPersistence.ts");
const endpoint = readFileSync(path.join(root, "base44/functions/fleetInventoryAction/entry.ts"), "utf8");

test("inventory update requires the version from the opened Fleet record", () => {
  assert.match(endpoint, /requireFleetInventoryExpectedVersion\(body\?\.expected_updated_date\)/);
  assert.doesNotMatch(endpoint, /body\?\.expected_updated_date\s*\|\|\s*existing\.updated_date/);
  assert.equal(requireFleetInventoryExpectedVersion(undefined), "");
  assert.equal(requireFleetInventoryExpectedVersion("  version-opened  "), "version-opened");
});

function fixture() {
  const row = { id: "part-1", updated_date: "version-opened", quantity_on_hand: 8, notes: "original" };
  const writes = [];
  const entity = {
    async updateMany(filter, update) {
      writes.push({ filter, update });
      if (filter.id !== row.id || filter.updated_date !== row.updated_date) return { updated: 0 };
      Object.assign(row, update.$set, { updated_date: "version-saved" });
      return { updated: 1 };
    },
    async get(id) { return id === row.id ? structuredClone(row) : null; },
  };
  return { row, writes, entity };
}

test("delayed Fleet inventory edit conflicts after another save wins", async () => {
  const { row, writes, entity } = fixture();
  row.updated_date = "newer-server-version";
  await assert.rejects(
    () => updateFleetRecordIfCurrent({
      entity, id: row.id, expectedUpdatedAt: requireFleetInventoryExpectedVersion("version-opened"),
      patch: { notes: "stale edit" }, label: "Fleet Part",
    }),
    error => error?.code === "FLEET_RECORD_CONFLICT",
  );
  assert.equal(row.notes, "original");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filter.updated_date, "version-opened");
});

test("matching Fleet inventory version saves normally", async () => {
  const { row, entity } = fixture();
  const saved = await updateFleetRecordIfCurrent({
    entity, id: row.id, expectedUpdatedAt: requireFleetInventoryExpectedVersion("version-opened"),
    patch: { notes: "current edit" }, label: "Fleet Part",
  });
  assert.equal(saved.notes, "current edit");
  assert.equal(saved.updated_date, "version-saved");
});

test("missing client version fails before any Fleet write", async () => {
  const { row, writes, entity } = fixture();
  await assert.rejects(
    () => updateFleetRecordIfCurrent({
      entity, id: row.id, expectedUpdatedAt: requireFleetInventoryExpectedVersion(""),
      patch: { quantity_on_hand: 0 }, label: "Fleet Part",
    }),
    /could not initialize its concurrency-safe update/,
  );
  assert.equal(writes.length, 0);
  assert.equal(row.quantity_on_hand, 8);
});
