import { queueSmartsheetSync } from "@/components/admin/syncRequestQueue";

function safeMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

export async function pushSavedSalesToSmartsheet({ sessionToken, workOrderIds } = {}) {
  const token = String(sessionToken || "").trim();
  const ids = [...new Set((Array.isArray(workOrderIds) ? workOrderIds : [])
    .map((id) => String(id || "").trim()).filter(Boolean))];
  if (!token) throw new Error("Your Sign Shop session expired. Sign in again before syncing.");
  if (!ids.length) return { sync_complete: true, needs_review: false, results: [] };

  try {
    const response = await queueSmartsheetSync({
      action: "push_saved_sales",
      session_token: token,
      work_order_ids: ids,
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "Saved Sales changes could not be synced.");
    return data;
  } catch (error) {
    throw new Error(safeMessage(error, "Saved Sales changes could not be synced to Smartsheet safely."));
  }
}

export function summarizeSavedSalesSync(result) {
  const item = Array.isArray(result?.results) ? result.results.find((row) => row?.dataset === "sales") : null;
  if (!item) {
    return result?.sync_complete === true
      ? { ok: true, message: "Saved Sales changes are already synchronized." }
      : { ok: false, message: "Smartsheet did not return a verifiable Sales sync result." };
  }
  if (result?.needs_review || item?.skipped || Number(item?.errors || 0) > 0 || Number(item?.conflicts || 0) > 0) {
    return {
      ok: false,
      message: item?.reason || item?.error_details?.[0] ||
        (Number(item?.conflicts || 0) + " conflict(s) and " + Number(item?.errors || 0) + " error(s) need review."),
    };
  }
  const changed = Number(item?.updated || 0) + Number(item?.created || 0);
  const unchanged = Number(item?.unchanged_skipped || 0);
  return {
    ok: true,
    message: changed > 0
      ? (changed + " Sales " + (changed === 1 ? "record" : "records") + " synced to Smartsheet.")
      : unchanged > 0
        ? (unchanged + " Sales " + (unchanged === 1 ? "record already matched" : "records already matched") + " Smartsheet.")
        : "Saved Sales changes are synchronized.",
  };
}