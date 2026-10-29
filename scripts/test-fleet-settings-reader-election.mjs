import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shared = readFileSync("base44/shared/fleetSettingsSingleton.ts", "utf8").replace(/\r\n/g, "\n");

const buildHelper = () => {
  const body = shared
    .replace(/^export /gm, "")
    .replace(/:(any|string|number|boolean|any\[\])(\s*[,)=])/g, "$2");
  return new Function(`${body}\nreturn { canonicalFleetSettingsRow, getCanonicalFleetSettings };`)();
};

const READERS = [
  "fleetNotificationDispatcher",
  "fleetNotificationWorker",
  "fleetScheduledReminders",
  "fleetSettingsAction",
];

test("canonicalFleetSettingsRow: elects the newest-updated row — the row the admin UI shows", () => {
  const { canonicalFleetSettingsRow } = buildHelper();
  const winner = canonicalFleetSettingsRow([
    { id: "old", updated_date: "2026-01-01T00:00:00Z", gmail_sender_name: "Old" },
    { id: "new", updated_date: "2026-06-01T00:00:00Z", gmail_sender_name: "New" },
    { id: "mid", updated_date: "2026-03-01T00:00:00Z", gmail_sender_name: "Mid" },
  ]);
  assert.equal(winner.id, "new");
});

test("canonicalFleetSettingsRow: id tiebreaks equal timestamps; null on empty; no input mutation", () => {
  const { canonicalFleetSettingsRow } = buildHelper();
  assert.equal(canonicalFleetSettingsRow([]), null);
  assert.equal(canonicalFleetSettingsRow(null), null);
  const tied = canonicalFleetSettingsRow([
    { id: "b", updated_date: "2026-01-01T00:00:00Z" },
    { id: "a", updated_date: "2026-01-01T00:00:00Z" },
  ]);
  assert.equal(tied.id, "a", "equal timestamps must elect the lowest id deterministically");
  const rows = [{ id: "b", updated_date: "2026-01-01T00:00:00Z" }, { id: "a", updated_date: "2026-02-01T00:00:00Z" }];
  canonicalFleetSettingsRow(rows);
  assert.equal(rows[0].id, "b", "input order must not be mutated");
});

test("getCanonicalFleetSettings: filters setting_type general and elects canonically", async () => {
  const { getCanonicalFleetSettings } = buildHelper();
  let filterArg = null;
  const base44 = { asServiceRole: { entities: { FleetSettings: {
    filter: async (arg) => { filterArg = arg; return [{ id: "old", updated_date: "2026-01-01T00:00:00Z" }, { id: "new", updated_date: "2026-02-01T00:00:00Z" }]; },
  } } } };
  const row = await getCanonicalFleetSettings(base44);
  assert.deepEqual(filterArg, { setting_type: "general" });
  assert.equal(row.id, "new");
});

test("every FleetSettings reader routes through the shared canonical helper", () => {
  for (const fn of READERS) {
    const src = readFileSync(`base44/functions/${fn}/entry.ts`, "utf8");
    assert.match(src, /getCanonicalFleetSettings/, `${fn} must use the shared accessor`);
    assert.ok(
      !/FleetSettings\.filter\([\s\S]{0,90}?\)\s*;\s*\n?\s*const settings = (settings)?[rR]ows\?\.\[0\]/.test(src),
      `${fn} must not pick settings rows[0] directly`
    );
  }
});

test("fleetCutoverControl uses the shared helper for both FleetSettings reads", () => {
  const src = readFileSync("base44/functions/fleetCutoverControl/entry.ts", "utf8");
  assert.match(src, /import { getCanonicalFleetSettings } from '\.\.\/\.\.\/shared\/fleetSettingsSingleton\.ts';/);
  assert.ok(
    (src.match(/getCanonicalFleetSettings\(/g) || []).length >= 2,
    "both evaluate() and the apply path must elect the canonical settings row"
  );
});
