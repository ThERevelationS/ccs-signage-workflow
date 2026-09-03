const text = (value) => String(value ?? "");

export function changedSettingRows(rows = [], values = {}, originalValues = {}) {
  return (rows || []).filter((row) =>
    text(values[row.setting_name]) !== text(originalValues[row.setting_name])
  );
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

  // Preflight every changed record before writing any of them. Settings directly
  // affect estimator cost/customer pricing, so a stale admin browser must not
  // overwrite a newer Settings edit from another session.
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
