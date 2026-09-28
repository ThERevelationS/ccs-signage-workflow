import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active sign-in session is required.");
  return token;
}

export async function loadAuthorizedUserDirectory({ sessionToken } = {}) {
  try {
    const response = await base44.functions.invoke("listAuthorizedUserDirectory", {
      session_token: requireSessionToken(sessionToken),
    });
    const data = response?.data || response;
    if (!data?.success || !Array.isArray(data?.users) || !data?.viewer?.email) {
      throw new Error(data?.error || "The authorized user directory could not be verified.");
    }
    return {
      viewer: data.viewer,
      users: data.users,
    };
  } catch (error) {
    throw new Error(
      error?.response?.data?.error ||
      error?.data?.error ||
      error?.message ||
      "The authorized user directory could not be loaded safely."
    );
  }
}
