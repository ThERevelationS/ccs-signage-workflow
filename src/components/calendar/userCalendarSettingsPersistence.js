import {
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

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

export function editableUserCalendarSettings(settings = {}, userEmail = "") {
  const fields = {
    user_email: String(userEmail || settings.user_email || "").trim(),
    show_universal: settings.show_universal,
    show_work_orders: settings.show_work_orders,
    show_site_surveys: settings.show_site_surveys,
    show_installs: settings.show_installs,
    show_personal: settings.show_personal,
    default_view: settings.default_view,
    work_order_stages: settings.work_order_stages,
    outlook_connected: settings.outlook_connected,
    google_connected: settings.google_connected,
    outlook_calendar_id: settings.outlook_calendar_id,
    google_calendar_id: settings.google_calendar_id,
    color_scheme: settings.color_scheme,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export async function loadSingleUserCalendarSettings({ entity, userEmail, label = "User calendar settings" } = {}) {
  const email = String(userEmail || "").trim();
  if (!email || typeof entity?.filter !== "function") throw new Error(`${label} could not load without a user email.`);
  const rows = await entity.filter({ user_email: email });
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
  if (rows.length > 1) throw new Error(`${label} has ${rows.length} records for ${email}. No value was changed; review the duplicates first.`);
  return rows[0] || null;
}

export async function saveUserCalendarSettingsIfUnchanged({ entity, loadedRecord, userEmail, nextSettings, label = "User calendar settings" } = {}) {
  const desired = editableUserCalendarSettings(nextSettings, userEmail);
  const email = desired.user_email;
  if (!email || typeof entity?.create !== "function" || typeof entity?.filter !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe save.`);
  }

  if (loadedRecord?.id) {
    if (String(loadedRecord.user_email || "") !== email) throw new Error(`${label} loaded a different user. Reload before saving.`);
    return replaceEntityFieldsIfUnchanged({
      entity,
      id: loadedRecord.id,
      expectedUpdatedAt: loadedRecord.updated_date || "",
      expectedFields: expectedEntityFields(loadedRecord, desired),
      nextFields: desired,
      guardFields: { user_email: email },
      label,
    });
  }

  const before = await loadSingleUserCalendarSettings({ entity, userEmail: email, label });
  if (before?.id) throw new Error(`${label} was created in another session after this page loaded. Reload before saving.`);

  let created = null;
  let createError = null;
  try {
    created = await entity.create(desired);
  } catch (error) {
    createError = error;
  }

  const after = await entity.filter({ user_email: email }).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  if (!Array.isArray(after)) throw new Error(`${label} final verification did not return a record list.`);
  if (after.length > 1) throw new Error(`${label} was created concurrently more than once. No duplicate was deleted automatically; reload and review the records.`);
  if (after.length === 1) {
    const saved = after[0];
    if (!Object.entries(desired).every(([field, value]) => sameValue(saved[field], value))) {
      throw new Error(`${label} was created concurrently with different values. Reload before saving again.`);
    }
    return saved;
  }
  if (createError) throw createError;
  if (created?.id) throw new Error(`${label} returned a create receipt but could not be verified. Do not retry blindly; reload first.`);
  throw new Error(`${label} could not verify whether the settings were created.`);
}
