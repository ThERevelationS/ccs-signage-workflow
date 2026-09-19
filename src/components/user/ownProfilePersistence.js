import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active sign-in session is required.");
  return token;
}

async function invokeOwnProfile(payload) {
  try {
    const response = await base44.functions.invoke("manageOwnProfile", payload);
    const data = response?.data || response;
    if (!data?.success || !data?.record?.id) {
      throw new Error(data?.error || "Your profile save could not be verified.");
    }
    return data.record;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.data?.error || error?.message || "Your profile could not be saved safely.");
  }
}

export async function updateOwnUsername({ userData, username, sessionToken } = {}) {
  if (!userData?.id) throw new Error("Your profile is not loaded. Reload before saving.");
  return invokeOwnProfile({
    action: "update_username",
    session_token: requireSessionToken(sessionToken),
    username,
    expected_username: userData.username ?? null,
  });
}

export async function updateOwnHrData({ userData, hrData, sessionToken } = {}) {
  if (!userData?.id) throw new Error("Your profile is not loaded. Reload before saving.");
  return invokeOwnProfile({
    action: "update_hr",
    session_token: requireSessionToken(sessionToken),
    hr_data: hrData,
    expected_hr_data: userData.hr_data ?? null,
  });
}
