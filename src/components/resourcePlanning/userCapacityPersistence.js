import { base44 } from "@/api/base44Client";

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

export async function saveUserCapacityIfUnchanged({ loadedRecord, userEmail, nextFields, sessionToken, label = "User capacity" } = {}) {
  const email = String(userEmail || "").trim();
  const token = String(sessionToken || "").trim();
  if (!email || !token) throw new Error(`${label} requires an active Resource Planning sign-in.`);
  if (loadedRecord?.id && normalizeEmail(loadedRecord.user_email) !== normalizeEmail(email)) {
    throw new Error(`${label} loaded a different employee. Reload before saving.`);
  }

  try {
    const response = await base44.functions.invoke("manageUserCapacity", {
      session_token: token,
      user_email: email,
      expected_id: loadedRecord?.id || "",
      expected_updated_date: loadedRecord?.updated_date || "",
      next_fields: pickEditableFields(nextFields),
    });
    const data = response?.data || response;
    if (!data?.record?.id) throw new Error(`${label} save could not be verified.`);
    return data.record;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || `${label} could not be saved safely.`);
  }
}
