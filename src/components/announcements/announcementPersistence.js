import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken, label) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error(`${label} requires an active admin session.`);
  return token;
}

async function invokeAnnouncement(payload) {
  try {
    const response = await base44.functions.invoke("manageAnnouncements", payload);
    return response?.data || response;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || "Announcement could not be changed safely.");
  }
}

export async function createAnnouncementWithRecovery({ data, sessionToken, label = "Announcement" } = {}) {
  const result = await invokeAnnouncement({
    action: "create",
    data,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} create could not be verified.`);
  return result;
}

export async function updateAnnouncementIfUnchanged({ record, nextFields, sessionToken, label = "Announcement" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const result = await invokeAnnouncement({
    action: "update",
    id: record.id,
    expected_updated_date: record.updated_date,
    next_fields: nextFields,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deleteAnnouncementIfUnchanged({ record, sessionToken, label = "Announcement deletion" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return invokeAnnouncement({
    action: "delete",
    id: record.id,
    expected_updated_date: record.updated_date,
    session_token: requireSessionToken(sessionToken, label),
  });
}

export async function publishAnnouncementSafely({
  loadedRecord = null,
  form,
  sessionToken,
  label = "Announcement broadcast",
} = {}) {
  const result = await invokeAnnouncement({
    action: "publish",
    id: loadedRecord?.id || "",
    expected_updated_date: loadedRecord?.updated_date || "",
    form,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.published?.id || !result?.winner?.id) {
    throw new Error(`${label} could not verify the published announcement.`);
  }
  return result;
}

export async function stopAnnouncementIfUnchanged({ record, sessionToken, label = "Stop live announcement" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is no longer loaded. Reload before stopping it.`);
  const result = await invokeAnnouncement({
    action: "stop",
    id: record.id,
    expected_updated_date: record.updated_date,
    session_token: requireSessionToken(sessionToken, label),
  });
  return result?.record || record;
}
