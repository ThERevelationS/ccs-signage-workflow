import { replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export async function loadSingleGlobalSetting({ entity, settingKey, label = "Global setting" } = {}) {
  const key = String(settingKey || "").trim();
  if (!key || typeof entity?.filter !== "function") {
    throw new Error(`${label} could not load its saved setting.`);
  }
  const rows = await entity.filter({ setting_key: key });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
  if (rows.length > 1) {
    throw new Error(`${label} has ${rows.length} records for setting key ${key}. No value was changed; review the duplicate settings first.`);
  }
  return rows[0] || null;
}

export async function saveGlobalSettingValueIfUnchanged({
  entity,
  loadedRecord,
  settingKey,
  nextValue,
  label = "Global setting",
} = {}) {
  const key = String(settingKey || "").trim();
  if (!key || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe save.`);
  }

  if (loadedRecord?.id) {
    if (String(loadedRecord.setting_key || "") !== key) {
      throw new Error(`${label} loaded a different setting key. Reload before saving.`);
    }
    return replaceEntityFieldsIfUnchanged({
      entity,
      id: loadedRecord.id,
      expectedUpdatedAt: loadedRecord.updated_date || "",
      expectedFields: { setting_value: loadedRecord.setting_value },
      nextFields: { setting_value: nextValue },
      guardFields: { setting_key: key },
      label,
    });
  }

  const before = await loadSingleGlobalSetting({ entity, settingKey: key, label });
  if (before?.id) {
    throw new Error(`${label} was created in another session after this dialog loaded. Reload settings before saving so the newer value is not overwritten.`);
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ setting_key: key, setting_value: nextValue });
  } catch (error) {
    createError = error;
  }

  let after;
  try {
    after = await entity.filter({ setting_key: key });
  } catch (verifyError) {
    if (createError) throw createError;
    throw verifyError;
  }
  if (!Array.isArray(after)) throw new Error(`${label} final verification did not return a record list.`);
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently in more than one session. No duplicate setting was deleted automatically; review the ${after.length} rows before saving again.`);
  }
  if (after.length === 1) {
    const saved = after[0];
    if (!sameValue(saved.setting_value, nextValue)) {
      throw new Error(`${label} was created concurrently with a different value. Reload and review the saved setting.`);
    }
    return saved;
  }

  if (createError) throw createError;
  if (created?.id) {
    throw new Error(`${label} returned a create receipt but could not be verified. Do not retry blindly; reload settings first.`);
  }
  throw new Error(`${label} could not verify whether the setting was created.`);
}
