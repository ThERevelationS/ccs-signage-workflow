const text = (value) => String(value ?? "");

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

  await preflightSettingsRows({ SettingsEntity, rows, values, originalValues, changedRows: changed });

  await Promise.all(changed.map((row) =>
    SettingsEntity.update(row.id, { setting_value: text(values[row.setting_name]) })
  ));

  // Refresh the changed records so their new updated_date becomes the baseline for
  // the next save in this same browser session.
  const refreshed = await Promise.all(changed.map((row) => SettingsEntity.get(row.id)));
  const refreshedById = new Map(refreshed.map((row) => [row.id, row]));
  const nextRows = rows.map((row) => refreshedById.get(row.id) || row);
  const snapshot = Object.fromEntries(nextRows.map((row) => [row.setting_name, text(values[row.setting_name])]));

  return { changedCount: changed.length, rows: nextRows, snapshot };
}
