import {
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

const EDITABLE_FIELDS = [
  "user_name",
  "weekly_hours_capacity",
  "daily_hours_capacity",
  "skills",
  "role_preferences",
  "time_off_dates",
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function pickEditableFields(source = {}) {
  const result = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) result[field] = source[field];
  }
  return result;
}

export async function loadSingleUserCapacity({ entity, userEmail, label = "User capacity" } = {}) {
  const email = String(userEmail || "").trim();
  if (!email || typeof entity?.filter !== "function") throw new Error(`${label} could not load its saved capacity.`);
  const rows = await entity.filter({ user_email: email });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a capacity list.`);
  const matches = rows.filter((row) => normalizeEmail(row?.user_email) === normalizeEmail(email));
  if (matches.length > 1) throw new Error(`${label} has ${matches.length} records for ${email}. No capacity was changed; review the duplicate records first.`);
  return matches[0] || null;
}

export async function saveUserCapacityIfUnchanged({ entity, loadedRecord, userEmail, nextFields, label = "User capacity" } = {}) {
  const email = String(userEmail || "").trim();
  if (!email || typeof entity?.filter !== "function" || typeof entity?.create !== "function") throw new Error(`${label} could not initialize its concurrency-safe save.`);
  const desired = { user_email: email, ...pickEditableFields(nextFields) };

  if (loadedRecord?.id) {
    if (normalizeEmail(loadedRecord.user_email) !== normalizeEmail(email)) throw new Error(`${label} loaded a different employee. Reload before saving.`);
    return replaceEntityFieldsIfUnchanged({
      entity,
      id: loadedRecord.id,
      expectedUpdatedAt: loadedRecord.updated_date || "",
      expectedFields: expectedEntityFields(loadedRecord, pickEditableFields(desired)),
      nextFields: pickEditableFields(desired),
      guardFields: { user_email: loadedRecord.user_email },
      label,
    });
  }

  const before = await loadSingleUserCapacity({ entity, userEmail: email, label });
  if (before?.id) throw new Error(`${label} was created in another session after this page loaded. Reload before saving so the newer capacity is not overwritten.`);

  let created = null;
  let createError = null;
  try {
    created = await entity.create(desired);
  } catch (error) {
    createError = error;
  }

  const after = await entity.filter({ user_email: email });
  if (!Array.isArray(after)) throw new Error(`${label} final verification did not return a capacity list.`);
  const matches = after.filter((row) => normalizeEmail(row?.user_email) === normalizeEmail(email));
  if (matches.length > 1) throw new Error(`${label} was created concurrently more than once. No capacity row was deleted automatically; review duplicates before retrying.`);
  if (matches.length === 1) return matches[0];
  if (createError) throw createError;
  if (created?.id) throw new Error(`${label} returned a create receipt but could not be verified. Do not retry blindly; reload first.`);
  throw new Error(`${label} could not verify whether the capacity was created.`);
}
