import { base44 } from "@/api/base44Client";

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

function requireSessionToken(sessionToken, label) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error(`${label} requires an active sign-in.`);
  return token;
}

async function invokeCalendarSettings(payload) {
  try {
    const response = await base44.functions.invoke("manageUserCalendarSettings", payload);
    return response?.data || response;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || "Calendar settings could not be handled safely.");
  }
}

export async function loadSingleUserCalendarSettings({ sessionToken, label = "User calendar settings" } = {}) {
  const data = await invokeCalendarSettings({
    action: "load",
    session_token: requireSessionToken(sessionToken, label),
  });
  return data?.record || null;
}

export async function saveUserCalendarSettingsIfUnchanged({ loadedRecord, userEmail, nextSettings, sessionToken, label = "User calendar settings" } = {}) {
  const desired = editableUserCalendarSettings(nextSettings, userEmail);
  const email = String(userEmail || "").trim();
  if (!email) throw new Error(`${label} could not initialize without a user email.`);
  if (loadedRecord?.id && String(loadedRecord.user_email || "").trim().toLowerCase() !== email.toLowerCase()) {
    throw new Error(`${label} loaded a different user. Reload before saving.`);
  }

  const data = await invokeCalendarSettings({
    action: "save",
    session_token: requireSessionToken(sessionToken, label),
    expected_id: loadedRecord?.id || "",
    expected_updated_date: loadedRecord?.updated_date || "",
    next_settings: desired,
  });
  if (!data?.record?.id) throw new Error(`${label} save could not be verified.`);

  const saved = data.record;
  const compare = editableUserCalendarSettings(saved, email);
  const expected = editableUserCalendarSettings(desired, email);
  for (const [field, value] of Object.entries(expected)) {
    if (field === "user_email") continue;
    if (!sameValue(compare[field], value)) throw new Error(`${label} save could not be verified.`);
  }
  return saved;
}
