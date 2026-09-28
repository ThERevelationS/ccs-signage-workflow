import { base44 } from "@/api/base44Client";

function safeMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

export async function pushSavedOrdersToSmartsheet({ sessionToken, orderIds } = {}) {
  const token = String(sessionToken || "").trim();
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [])
    .map((id) => String(id || "").trim()).filter(Boolean))];
  if (!token) throw new Error("Your Sign Shop session expired. Sign in again before syncing.");
  if (!ids.length) return { sync_complete: true, needs_review: false, results: [] };

  try {
    const response = await base44.functions.invoke("smartsheetSyncAction", {
      action: "push_saved_orders",
      session_token: token,
      order_ids: ids,
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "Saved Orders could not be synced.");
    return data;
  } catch (error) {
    throw new Error(safeMessage(error, "Saved Orders could not be synced to Smartsheet safely."));
  }
}

export function summarizeSavedOrderSync(result) {
  const item = Array.isArray(result?.results) ? result.results.find((row) => row?.dataset === "orders") : null;
  if (!item) {
    return result?.sync_complete === true
      ? { ok: true, message: "Saved changes are already synchronized." }
      : { ok: false, message: "Smartsheet did not return a verifiable Order sync result." };
  }
  if (result?.needs_review || item?.skipped || Number(item?.errors || 0) > 0 || Number(item?.conflicts || 0) > 0) {
    return {
      ok: false,
      message: item?.reason ||
        item?.error_details?.[0] ||
        `${Number(item?.conflicts || 0)} conflict(s) and ${Number(item?.errors || 0)} error(s) need review.`,
    };
  }
  const changed = Number(item?.updated || 0) + Number(item?.created || 0);
  const unchanged = Number(item?.unchanged_skipped || 0);
  return {
    ok: true,
    message: changed > 0
      ? `${changed} Order${changed === 1 ? "" : "s"} synced to Smartsheet.`
      : unchanged > 0
        ? `${unchanged} Order${unchanged === 1 ? "" : "s"} already matched Smartsheet.`
        : "Saved changes are synchronized.",
  };
}
