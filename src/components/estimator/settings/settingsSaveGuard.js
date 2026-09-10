import { deleteEntityIfUnchanged, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const text = (value) => String(value ?? "");

function normalizeSettingValue(value) {
  if (Array.isArray(value)) return value.map(normalizeSettingValue);
  if (!value || typeof value !== "object") return value ?? "";
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalizeSettingValue(value[key]);
    return out;
  }, {});
}

function sameSettingField(a, b) {
  const leftEmpty = a === null || a === undefined || a === "";
  const rightEmpty = b === null || b === undefined || b === "";
  if (leftEmpty && rightEmpty) return true;
  return JSON.stringify(normalizeSettingValue(a)) === JSON.stringify(normalizeSettingValue(b));
}

function settingCreatePayloadMatches(row, payload) {
  return Boolean(row?.id) && Object.entries(payload).every(([field, value]) =>
    sameSettingField(row?.[field], value)
  );
}

export async function createSettingRowIfAbsent({
  SettingsEntity,
  data = {},
  label = "Setting",
} = {}) {
  const name = text(data?.setting_name).trim();
  if (!name || typeof SettingsEntity?.filter !== "function" || typeof SettingsEntity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const readMatches = async () => {
    const rows = await SettingsEntity.filter({ setting_name: name });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => text(row?.setting_name).trim() === name);
  };

  const before = await readMatches();
  if (before.length === 1) return { record: before[0], status: "existing" };
  if (before.length > 1) {
    throw new Error(`${label} has multiple stored rows for ${name}. No row was changed; review and resolve the duplicate records first.`);
  }

  const payload = { ...data, setting_name: name };
  let created = null;
  let createError = null;
  try {
    created = await SettingsEntity.create(payload);
  } catch (error) {
    createError = error;
  }

  // First-time Installation overrides are rare, but two admins can save the
  // same virtual setting concurrently. Give both create attempts a short settle
  // window before choosing a canonical row so neither session can immediately
  // return success while the other's row is still becoming visible.
  await new Promise((resolve) => setTimeout(resolve, 50));

  let after;
  try {
    after = await readMatches();
  } catch (verificationError) {
    if (created?.id) {
      throw new Error(`${label} was created, but its verification read failed. Do not retry blindly; reload this Settings page first. ${verificationError?.message || ""}`.trim());
    }
    throw new Error(`${label} create response was unavailable and its recovery lookup also failed. Do not retry blindly; reload this Settings page first. ${verificationError?.message || ""}`.trim());
  }

  if (after.length === 1) {
    const matched = settingCreatePayloadMatches(after[0], payload);
    if (!matched) {
      throw new Error(`${label} was created concurrently with different stored values. Reload this Settings page and review the current value before saving again.`);
    }
    const status = created?.id === after[0].id ? "created" : "recovered";
    return { record: after[0], status };
  }

  if (after.length > 1) {
    const ordered = [...after].sort((a, b) => {
      const dateCompare = text(a?.created_date).localeCompare(text(b?.created_date));
      return dateCompare || text(a?.id).localeCompare(text(b?.id));
    });
    const canonical = ordered[0];
    const ours = created?.id ? after.find((row) => row.id === created.id) : null;
    if (ours && ours.id !== canonical?.id) {
      await deleteEntityIfUnchanged({
        entity: SettingsEntity,
        record: ours,
        guardFields: { setting_name: name },
        label: `${label} concurrent duplicate cleanup`,
      });
      const finalRows = await readMatches();
      if (finalRows.length === 1) {
        return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review ${name}.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether ${name} was created. Reload before retrying.`);
}

export function changedSettingRows(rows = [], values = {}, originalValues = {}) {
  return (rows || []).filter((row) =>
    text(values[row.setting_name]) !== text(originalValues[row.setting_name])
  );
}

export async function preflightSettingsRows({
  SettingsEntity,
  rows = [],
  values = {},
  originalValues = {},
  changedRows = null,
}) {
  const changed = changedRows || changedSettingRows(rows, values, originalValues);
  if (!changed.length) return { changed, liveRows: [] };

  // Preflight every changed record before any caller writes. This is exported so
  // mixed Settings pages (Settings + another pricing entity) can validate the
  // entire transaction-like batch before its first write.
  const liveRows = await Promise.all(changed.map((row) => SettingsEntity.get(row.id)));
  const conflicts = changed.filter((row, index) => {
    const live = liveRows[index];
    if (!live) return true;
    const loadedDate = text(row.updated_date);
    const liveDate = text(live.updated_date);
    const loadedValue = text(originalValues[row.setting_name] ?? row.setting_value);
    const liveValue = text(live.setting_value);
    return (loadedDate && liveDate && loadedDate !== liveDate) || loadedValue !== liveValue;
  });

  if (conflicts.length) {
    const names = conflicts.map((row) => row.setting_name).join(", ");
    throw new Error(`These Settings changed in another session: ${names}. Reload this Settings page, review the latest values, and apply your changes again.`);
  }
  return { changed, liveRows };
}

export async function saveSettingsRowsSafely({
  SettingsEntity,
  rows = [],
  values = {},
  originalValues = {},
}) {
  const changed = changedSettingRows(rows, values, originalValues);
  if (!changed.length) {
    return {
      changedCount: 0,
      rows,
      snapshot: Object.fromEntries((rows || []).map((row) => [row.setting_name, text(values[row.setting_name])])),
    };
  }

  const preflight = await preflightSettingsRows({ SettingsEntity, rows, values, originalValues, changedRows: changed });
  const liveById = new Map(preflight.liveRows.map((row) => [row.id, row]));

  let confirmed = 0;
  for (const row of changed) {
    const live = liveById.get(row.id);
    const desiredValue = text(values[row.setting_name]);
    try {
      await replaceEntityFieldsIfUnchanged({
        entity: SettingsEntity,
        id: row.id,
        expectedUpdatedAt: live?.updated_date || "",
        expectedFields: { setting_value: text(live?.setting_value) },
        nextFields: { setting_value: desiredValue },
        label: `Setting ${row.setting_name}`,
      });
      confirmed += 1;
    } catch (error) {
      throw new Error(`Settings save stopped after ${confirmed} of ${changed.length} changed rows were confirmed. Reload this Settings page before retrying; remaining rows were not skipped automatically. ${error?.message || ""}`.trim());
    }
  }

  // Refresh and verify the changed records so their new updated_date becomes the
  // baseline for the next save in this same browser session.
  const refreshed = await Promise.all(changed.map((row) => SettingsEntity.get(row.id)));
  const failedVerification = changed.filter((row, index) => !refreshed[index] || text(refreshed[index].setting_value) !== text(values[row.setting_name]));
  if (failedVerification.length) {
    throw new Error(`Settings final verification found concurrent changes to: ${failedVerification.map((row) => row.setting_name).join(", ")}. Reload before saving again.`);
  }
  const refreshedById = new Map(refreshed.map((row) => [row.id, row]));
  const nextRows = rows.map((row) => refreshedById.get(row.id) || row);
  const snapshot = Object.fromEntries(nextRows.map((row) => [row.setting_name, text(values[row.setting_name])]));

  return { changedCount: changed.length, rows: nextRows, snapshot };
}
