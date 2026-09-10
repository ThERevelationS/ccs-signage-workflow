const normalize = (value: any): any => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out: any, key) => {
      if (value[key] !== undefined) out[key] = normalize(value[key]);
      return out;
    }, {});
  }
  return value;
};

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

export async function loadGlobalSettingSingleton({
  entity,
  settingKey,
  label = 'Global setting',
}: any) {
  if (!settingKey || typeof entity?.filter !== 'function') {
    throw new Error(`${label} could not initialize its singleton lookup.`);
  }
  const rows = await entity.filter({ setting_key: settingKey });
  if (!Array.isArray(rows)) {
    throw new Error(`${label} lookup did not return a verifiable record list.`);
  }
  if (rows.length > 1) {
    throw new Error(`${label} has ${rows.length} records for the same setting key. No ambiguous setting was changed; review the duplicates first.`);
  }
  return rows[0] || null;
}

export async function saveGlobalSettingFromSnapshot({
  entity,
  settingKey,
  settingValue,
  expectedId = '',
  expectedUpdatedDate = '',
  label = 'Global setting',
  settleMs = 40,
}: any) {
  if (!settingKey || typeof entity?.filter !== 'function' || typeof entity?.create !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe save.`);
  }

  const current = await loadGlobalSettingSingleton({ entity, settingKey, label });
  const expectedRecordId = String(expectedId || '').trim();
  const expectedVersion = String(expectedUpdatedDate || '').trim();

  if (expectedRecordId) {
    if (!current?.id || String(current.id) !== expectedRecordId) {
      throw new Error(`${label} changed records in another session. Reload before saving.`);
    }
    if (expectedVersion && String(current.updated_date || '') !== expectedVersion) {
      if (sameValue(current.setting_value, settingValue)) return { record: current, status: 'already_desired' };
      throw new Error(`${label} changed in another session. Reload before saving; no newer setting was overwritten.`);
    }
    if (sameValue(current.setting_value, settingValue)) return { record: current, status: 'already_desired' };

    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing version metadata. Reload before saving.`);

    let result;
    try {
      result = await entity.updateMany(
        { id: current.id, setting_key: settingKey, updated_date: version },
        { $set: { setting_value: settingValue } },
      );
    } catch (error) {
      const afterError = await loadGlobalSettingSingleton({ entity, settingKey, label }).catch(() => null);
      if (afterError?.id === current.id && sameValue(afterError.setting_value, settingValue)) {
        return { record: afterError, status: 'recovered_after_update_error' };
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 0) {
      const afterConflict = await loadGlobalSettingSingleton({ entity, settingKey, label });
      if (afterConflict?.id === current.id && sameValue(afterConflict.setting_value, settingValue)) {
        return { record: afterConflict, status: 'already_desired' };
      }
      throw new Error(`${label} changed in another session before the save completed. Reload before saving again.`);
    }

    const saved = await loadGlobalSettingSingleton({ entity, settingKey, label });
    if (!saved?.id || saved.id !== current.id || !sameValue(saved.setting_value, settingValue)) {
      throw new Error(`${label} save returned successfully but the saved value could not be verified.`);
    }
    return { record: saved, status: 'updated' };
  }

  // The caller loaded no record. If one now exists, only converge when it has
  // exactly the desired value; never overwrite a singleton created by another session.
  if (current?.id) {
    if (sameValue(current.setting_value, settingValue)) return { record: current, status: 'concurrent_existing' };
    throw new Error(`${label} was created in another session. Reload before saving; the new setting was preserved.`);
  }

  let created: any = null;
  let createError: any = null;
  try {
    created = await entity.create({ setting_key: settingKey, setting_value: settingValue });
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  if (pause) await new Promise((resolve) => setTimeout(resolve, pause));

  let afterCreate;
  try {
    afterCreate = await loadGlobalSettingSingleton({ entity, settingKey, label });
  } catch (verificationError) {
    throw new Error(
      `${label} create outcome could not be verified. No setting was deleted or overwritten; reload before retrying. ${verificationError?.message || ''}`.trim()
    );
  }

  if (afterCreate?.id) {
    if (!sameValue(afterCreate.setting_value, settingValue)) {
      throw new Error(`${label} was created concurrently with different data. The concurrent setting was preserved; reload before saving.`);
    }
    if (created?.id && String(afterCreate.id) !== String(created.id)) {
      throw new Error(`${label} detected simultaneous singleton creation. No setting was deleted automatically; review the records before retrying.`);
    }
    return {
      record: afterCreate,
      status: created?.id ? 'created' : 'recovered_after_create_error',
    };
  }

  if (createError) throw createError;
  if (created?.id) {
    throw new Error(`${label} returned a create receipt but could not be re-read. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}
