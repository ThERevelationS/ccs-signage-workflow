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

export function summarizeSavedOrderSync(result, { expectedOrderCount = 0 } = {}) {
  const expected = (
    typeof expectedOrderCount === "number" && Number.isSafeInteger(expectedOrderCount) && expectedOrderCount >= 0
      ? expectedOrderCount
      : null
  );
  const readCount = (value) => (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
  );
  if (expected === null) {
    return {
      ok: false,
      message: "The requested Order count could not be verified. The Orders will stay queued.",
    };
  }
  const results = Array.isArray(result?.results) ? result.results : [];
  const orderResults = results.filter((row) => row?.dataset === "orders");
  if (orderResults.length !== 1 || results.length !== 1) {
    return expected === 0 && results.length === 0 && result?.sync_complete === true
      ? { ok: true, message: "Saved changes are already synchronized." }
      : { ok: false, message: "Smartsheet did not return exactly one isolated, verifiable Order sync result." };
  }
  const [item] = orderResults;
  if (item?.direction !== "push") {
    return {
      ok: false,
      message: "Smartsheet did not return a verifiable Order push result. The requested Orders will stay queued.",
    };
  }
  const recordsExamined = readCount(item?.records_examined);
  const created = readCount(item?.created);
  const updated = readCount(item?.updated);
  const unchanged = readCount(item?.unchanged_skipped);
  const errors = readCount(item?.errors);
  const conflicts = readCount(item?.conflicts);
  if ([recordsExamined, created, updated, unchanged, errors, conflicts].some((count) => count === null)) {
    return {
      ok: false,
      message: "Smartsheet returned invalid Order sync counts. The requested Orders will stay queued.",
    };
  }
  if (expected > 0 && recordsExamined !== expected) {
    return {
      ok: false,
      message: `Smartsheet verified ${recordsExamined} of ${expected} requested Orders. The remaining Orders will stay queued.`,
    };
  }
  const accounted = created + updated + unchanged;
  if (expected > 0 && accounted !== expected && errors === 0 && conflicts === 0) {
    return {
      ok: false,
      message: `Smartsheet accounted for ${accounted} of ${expected} requested Orders. Unaccounted Orders will stay queued.`,
    };
  }
  if (result?.sync_complete !== true || result?.needs_review || item?.skipped || errors > 0 || conflicts > 0) {
    return {
      ok: false,
      message: item?.reason ||
        item?.error_details?.[0] ||
        (result?.sync_complete !== true
          ? "Smartsheet did not confirm that the Order sync completed."
          : `${conflicts} conflict(s) and ${errors} error(s) need review.`),
    };
  }
  const changed = updated + created;
  let message = "Saved changes are synchronized.";
  if (created > 0 && updated > 0) {
    message = `${created} new Order${created === 1 ? "" : "s"} added and ${updated} existing Order${updated === 1 ? "" : "s"} updated in Smartsheet.`;
  } else if (created > 0) {
    message = `${created} new Order${created === 1 ? "" : "s"} added to Smartsheet.`;
  } else if (updated > 0) {
    message = `${updated} Order${updated === 1 ? "" : "s"} updated in Smartsheet.`;
  } else if (unchanged > 0) {
    message = `${unchanged} Order${unchanged === 1 ? "" : "s"} already matched Smartsheet.`;
  } else if (changed > 0) {
    message = `${changed} Order${changed === 1 ? "" : "s"} synced to Smartsheet.`;
  }
  return { ok: true, message };
}
