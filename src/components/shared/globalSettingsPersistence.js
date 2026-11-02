import { replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { withRateLimitRetry } from "@/components/estimator/loadAllEntityRows";

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

// Settings change rarely but are read on nearly every panel/page mount —
// without dedupe each mount burst pays one staffDataRead per key, and the same
// keys (salesTaskDescriptions, dropdownConditions, …) are pulled again by every
// page that shares them. Cache per entity object: a short TTL collapses
// back-to-back mounts, and an in-flight entry lets simultaneous callers share
// one read. Successful writes evict/refresh the key so later loads stay true.
const SETTING_READ_TTL_MS = 60 * 1000;
const settingReadCache = new WeakMap(); // entity -> Map<key, {at, promise|value}>

// The settings table is a small KV store (~27 rows today): one unfiltered read
// warms every key at once, so a mount burst costs one staffDataRead instead of
// one per key. If the table ever grows past TABLE_WARM_LIMIT the warm is marked
// incomplete — present keys still cache, but absent keys fall back to a
// targeted read because truncation can hide them.
const TABLE_WARM_LIMIT = 400;
const TABLE_WARM_KEY = "__table_warm__";

const cacheBucket = (entity) => {
  let bucket = settingReadCache.get(entity);
  if (!bucket) {
    bucket = new Map();
    settingReadCache.set(entity, bucket);
  }
  return bucket;
};

async function warmSettingsTable(entity, bucket, label) {
  const existing = bucket.get(TABLE_WARM_KEY);
  if (existing?.promise) return existing.promise;
  const promise = (async () => {
    const rows = await withRateLimitRetry(() => entity.filter({}, null, TABLE_WARM_LIMIT + 1));
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    const complete = rows.length <= TABLE_WARM_LIMIT;
    const seen = new Set();
    const dupKeys = new Set();
    const rowsByKey = new Map();
    for (const row of rows) {
      const key = String(row?.setting_key || "").trim();
      if (!key) continue;
      if (seen.has(key)) {
        dupKeys.add(key);
        // The first row was optimistically cached above — evict it so loads
        // fall through to the dupKeys throw instead of answering from one row.
        bucket.delete(key);
        continue; // first row per key wins, matching rows[0]
      }
      seen.add(key);
      rowsByKey.set(key, row);
      const prev = bucket.get(key);
      if (!prev?.promise) bucket.set(key, { at: Date.now(), value: row });
    }
    bucket.set(TABLE_WARM_KEY, { at: Date.now(), complete, seen, rowsByKey, dupKeys });
    return complete;
  })();
  bucket.set(TABLE_WARM_KEY, { ...(existing || {}), promise });
  try {
    return await promise;
  } finally {
    const current = bucket.get(TABLE_WARM_KEY);
    if (current?.promise === promise) {
      bucket.set(TABLE_WARM_KEY, { ...current, promise: null });
    }
  }
}

export function invalidateGlobalSettingRead(entity, settingKey) {
  const key = String(settingKey || "").trim();
  if (!key) return;
  const bucket = settingReadCache.get(entity);
  if (!bucket) return;
  bucket.delete(key);
  // The warm snapshot still believes the old row — drop it so the next load
  // re-warms with the post-write truth instead of answering from a stale copy.
  bucket.delete(TABLE_WARM_KEY);
}

export async function loadSingleGlobalSetting({ entity, settingKey, label = "Global setting", fresh = false } = {}) {
  const key = String(settingKey || "").trim();
  if (!key || typeof entity?.filter !== "function") {
    throw new Error(`${label} could not load its saved setting.`);
  }
  const bucket = cacheBucket(entity);
  if (!fresh) {
    const hit = bucket.get(key);
    if (hit?.promise) return hit.promise;
    if (hit && Date.now() - hit.at < SETTING_READ_TTL_MS) return hit.value;
    const warm = bucket.get(TABLE_WARM_KEY);
    if (warm?.complete && warm.seen && Date.now() - warm.at < SETTING_READ_TTL_MS) {
      if (!warm.seen.has(key)) {
        bucket.set(key, { at: Date.now(), value: null });
        return null;
      }
    }
  }
  const promise = (async () => {
    if (!fresh) {
      let warm = bucket.get(TABLE_WARM_KEY);
      if (!warm?.seen || Date.now() - warm.at >= SETTING_READ_TTL_MS) {
        try {
          await warmSettingsTable(entity, bucket, label);
        } catch {
          // Warm failed — fall back to the targeted read so one bad table scan
          // does not block every setting.
        }
        warm = bucket.get(TABLE_WARM_KEY);
      }
      if (warm?.seen && Date.now() - warm.at < SETTING_READ_TTL_MS) {
        // A warm that saw the key answers from its rows; absence is only
        // conclusive when the table scan was complete (not truncated). The
        // targeted path throws on duplicate keys — match that here so callers
        // relying on the duplicate alarm behave identically on warm hits.
        if (warm.seen.has(key)) {
          if (warm.dupKeys?.has(key)) {
            throw new Error(`${label} has multiple records for setting key ${key}. No value was changed; review the duplicate settings first.`);
          }
          return warm.rowsByKey.get(key) || null;
        }
        if (warm.complete) return null;
      }
    }
    const rows = await withRateLimitRetry(() => entity.filter({ setting_key: key }));
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    if (rows.length > 1) {
      throw new Error(`${label} has ${rows.length} records for setting key ${key}. No value was changed; review the duplicate settings first.`);
    }
    return rows[0] || null;
  })();
  bucket.set(key, { at: Date.now(), promise });
  try {
    const value = await promise;
    bucket.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    bucket.delete(key);
    throw error;
  }
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
    const saved = await withRateLimitRetry(() => replaceEntityFieldsIfUnchanged({
      entity,
      id: loadedRecord.id,
      expectedUpdatedAt: loadedRecord.updated_date || "",
      expectedFields: { setting_value: loadedRecord.setting_value },
      nextFields: { setting_value: nextValue },
      guardFields: { setting_key: key },
      label,
    }));
    // The server stamped a new updated_date we cannot synthesize — evict so the
    // next load re-reads the true record rather than anchoring CAS on a guess.
    invalidateGlobalSettingRead(entity, key);
    return saved;
  }

  const before = await loadSingleGlobalSetting({ entity, settingKey: key, label, fresh: true });
  if (before?.id) {
    throw new Error(`${label} was created in another session after this dialog loaded. Reload settings before saving so the newer value is not overwritten.`);
  }

  let created = null;
  let createError = null;
  try {
    created = await withRateLimitRetry(() => entity.create({ setting_key: key, setting_value: nextValue }));
  } catch (error) {
    createError = error;
  }

  let after;
  try {
    after = await withRateLimitRetry(() => entity.filter({ setting_key: key }));
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
    const bucket = cacheBucket(entity);
    bucket.set(key, { at: Date.now(), value: saved });
    // A warm snapshot taken before this create believes the key is absent —
    // fold the verified row into it rather than forcing a re-warm.
    const warm = bucket.get(TABLE_WARM_KEY);
    if (warm?.seen) {
      warm.seen.add(key);
      warm.rowsByKey?.set(key, saved);
    }
    return saved;
  }

  if (createError) throw createError;
  if (created?.id) {
    throw new Error(`${label} returned a create receipt but could not be verified. Do not retry blindly; reload settings first.`);
  }
  throw new Error(`${label} could not verify whether the setting was created.`);
}