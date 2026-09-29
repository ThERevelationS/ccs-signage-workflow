import { base44 } from "@/api/base44Client";

function errorMessage(error) {
  return error?.response?.data?.error || error?.data?.error || error?.message ||
    "The stalled Order sync could not be closed safely.";
}

export async function recoverStalledOrderSync({ sessionToken, expectedStartedAt } = {}) {
  const token = String(sessionToken || "").trim();
  const startedAt = String(expectedStartedAt || "").trim();
  if (!token) throw new Error("Your Sign Shop session expired. Sign in again before recovering the stalled sync.");
  if (!startedAt) throw new Error("The stalled sync has no stable run identity. Reload before retrying.");

  try {
    const response = await base44.functions.invoke("smartsheetSyncAction", {
      action: "recover_stale_order_run",
      session_token: token,
      expected_started_at: startedAt,
    });
    const data = response?.data || response;
    if (!data?.success || data?.recovered !== true) {
      throw new Error(data?.error || "The stalled Order sync was not recovered.");
    }
    return data;
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
