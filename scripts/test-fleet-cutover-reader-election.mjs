import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shared = readFileSync("base44/shared/fleetCutoverState.ts", "utf8").replace(/\r\n/g, "\n");

const buildHelper = () => {
  const body = shared
    .replace(/^export /gm, "")
    .replace(/:(any|string|number|boolean|any\[\])(\s*[,)=])/g, "$2");
  return new Function(`${body}\nreturn { canonicalCutoverRow, getCanonicalCutoverState };`)();
};

const READERS = [
  "fleetMeterMaintenanceGeneration",
  "fleetNotificationDispatcher",
  "fleetNotificationWorker",
  "fleetPublicIssueReport",
  "fleetScheduledMaintenanceGeneration",
  "fleetScheduledReminders",
];

test("canonicalCutoverRow: elects the lowest-id row even when duplicates exist", () => {
  const { canonicalCutoverRow } = buildHelper();
  const winner = canonicalCutoverRow([
    { id: "zz-dup", notifications_enabled: false },
    { id: "aa-canon", notifications_enabled: true },
    { id: "mm-dup", notifications_enabled: false },
  ]);
  assert.equal(winner.id, "aa-canon");
  assert.equal(winner.notifications_enabled, true);
});

test("canonicalCutoverRow: returns null for an empty table and never mutates input order", () => {
  const { canonicalCutoverRow } = buildHelper();
  assert.equal(canonicalCutoverRow([]), null);
  assert.equal(canonicalCutoverRow(null), null);
  const rows = [{ id: "b" }, { id: "a" }];
  canonicalCutoverRow(rows);
  assert.equal(rows[0].id, "b", "input order must not be mutated");
});

test("getCanonicalCutoverState: filters the primary state_key and elects canonically", async () => {
  const { getCanonicalCutoverState } = buildHelper();
  let filterArg = null;
  const base44 = { asServiceRole: { entities: { FleetCutoverState: {
    filter: async (arg) => { filterArg = arg; return [{ id: "b" }, { id: "a" }]; },
  } } } };
  const row = await getCanonicalCutoverState(base44);
  assert.deepEqual(filterArg, { state_key: "primary" });
  assert.equal(row.id, "a");
});

test("every FleetCutoverState reader routes through the shared canonical helper", () => {
  for (const fn of READERS) {
    const src = readFileSync(`base44/functions/${fn}/entry.ts`, "utf8");
    assert.match(src, /getCanonicalCutoverState/, `${fn} must use the shared accessor`);
    assert.ok(
      !/FleetCutoverState\.filter\([\s\S]{0,80}?\)\s*(?:\?\.\[0\]|\.sort|;\s*\n?\s*const cutover = cutoverRows)/.test(src),
      `${fn} must not pick cutover rows[0] directly`
    );
  }
});

test("fleetCutoverControl elects canonically via the shared helper for reads and create contention", () => {
  const src = readFileSync("base44/functions/fleetCutoverControl/entry.ts", "utf8");
  assert.match(src, /import { canonicalCutoverRow } from '\.\.\/\.\.\/shared\/fleetCutoverState\.ts';/);
  assert.ok(
    (src.match(/canonicalCutoverRow\(/g) || []).length >= 2,
    "cutover control must elect canonically in both the read path and post-create contention check"
  );
});
