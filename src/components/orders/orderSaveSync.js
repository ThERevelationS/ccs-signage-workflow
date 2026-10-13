import { queueSmartsheetSync } from "@/components/admin/syncRequestQueue";
import { normalizeOrderLinkedCustomerReviews } from "@/components/orders/orderLinkedCustomerReviewPresentation.mjs";

function safeMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

export async function previewOrderCustomerDecision({ sessionToken, review, decision } = {}) {
  if (!String(sessionToken ?? '').trim()) throw new Error('Your Order Form session expired. Sign in again.');
  if (!['keep_linked_job', 'adopt_smartsheet_unlink_job'].includes(decision) || !review?.orderId) {
    throw new Error('Select a valid customer decision from the latest review.');
  }
  const response = await queueSmartsheetSync({
    action: 'preview_order_customer_decision',
    session_token: sessionToken,
    decision,
    review: {
      order_id: review.orderId, sheet_id: review.sheetId, row_id: review.rowId,
      work_order_id: review.workOrderId,
      local_customer_name: review.localCustomerName,
      smartsheet_customer_name: review.smartsheetCustomerName,
      order_updated_date: review.orderUpdatedDate,
      remote_modified_at: review.remoteModifiedAt,
    },
  }, { attempts: 1, retryRateLimit: false, retryCoordinatorBusy: false });
  const result = response?.data || response;
  if (!result?.success || result?.state !== 'verified_read_only' ||
      result?.read_only !== true || result?.writes_attempted !== false ||
      result?.decision !== decision || result?.order_id !== review.orderId ||
      result?.sheet_id !== review.sheetId || result?.row_id !== review.rowId) {
    throw new Error(result?.error || 'The decision evidence could not be verified. Run Sync and review the Order again.');
  }
  return result;
}

export async function pushSavedOrdersToSmartsheet({ sessionToken, orderIds } = {}) {
  const token = String(sessionToken || "").trim();
  const rawIds = Array.isArray(orderIds) ? orderIds : [];
  const ids = [...new Set(rawIds
    .filter((id) => typeof id === "string")
    .map((id) => id.trim()).filter(Boolean))];
  if (!token) throw new Error("Your Sign Shop session expired. Sign in again before syncing.");
  if (!ids.length) return { success: true, sync_complete: true, needs_review: false, results: [] };
  if (ids.length !== rawIds.length || ids.some((id) => !/^[A-Za-z0-9_-]{6,80}$/.test(id))) {
    throw new Error("Saved Orders contain an invalid or duplicate permanent ID. Reload before syncing.");
  }

  try {
    const response = await queueSmartsheetSync({
      action: "push_saved_orders",
      session_token: token,
      order_ids: ids,
    }, {
      // The backend already retries safe, definitive 429 write rejections and
      // preserves per-Order partial results. Never replay the entire Order action
      // from the browser after a rate limit; that can include already-completed rows.
      retryRateLimit: false,
      retryCoordinatorBusy: true,
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "Saved Orders could not be synced.");
    return data;
  } catch (error) {
    throw new Error(safeMessage(error, "Saved Orders could not be synced to Smartsheet safely."));
  }
}

// Manual Order Form Sync is pull-only. Reuse the guarded permanent-ID pull;
 // never turn this button into a mass Order push or automatic record create.
export async function pullOrdersFromSmartsheet({ sessionToken } = {}) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("Your Sign Shop session expired. Sign in again before syncing.");

  try {
    const response = await queueSmartsheetSync({
      action: "pull_dataset",
      dataset: "orders",
      session_token: token,
    }, {
      retryRateLimit: false,
      retryCoordinatorBusy: true,
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "Order pull could not be completed.");
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length !== 1 || results[0]?.dataset !== "orders" ||
        results[0]?.direction !== "pull") {
      throw new Error("Smartsheet did not confirm one isolated Order-only pull.");
    }
    if (results[0]?.skipped) {
      throw new Error(results[0]?.reason || "The Order pull was skipped safely.");
    }
    if (!Number.isSafeInteger(results[0]?.updated) || results[0].updated < 0) {
      throw new Error("Smartsheet did not return a verifiable Order update count.");
    }
    const nameReviewCount = results[0]?.linked_customer_name_review_count;
    const linkedCustomerNameReviewCount = Number.isSafeInteger(nameReviewCount) && nameReviewCount >= 0
      ? nameReviewCount : 0;
    const linkedCustomerNameReviewItems = normalizeOrderLinkedCustomerReviews(
      results[0]?.linked_customer_name_review_items, linkedCustomerNameReviewCount,
    );
    const linkedCustomerNameReviewRowIds = linkedCustomerNameReviewItems.map(item => item.rowId);
    return {
      updated: results[0].updated,
      needsReview: data.needs_review === true || data.sync_complete !== true || linkedCustomerNameReviewCount > 0,
      linkedCustomerNameReviewCount,
      linkedCustomerNameReviewRowIds,
      linkedCustomerNameReviewItems,
    };
  } catch (error) {
    throw new Error(safeMessage(error, "Could not check Smartsheet for Order changes safely."));
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
  if (expected === 0) {
    return results.length === 0 && result?.success === true && result?.sync_complete === true && result?.needs_review === false
      ? { ok: true, message: "Saved changes are already synchronized." }
      : { ok: false, message: "Smartsheet returned an unexpected Order sync result when no Orders were requested." };
  }
  if (
    result?.success !== true ||
    result?.configured !== true ||
    result?.write_actions_available !== true ||
    result?.sync_complete !== true ||
    result?.needs_review !== false
  ) {
    return {
      ok: false,
      message: "Smartsheet did not return an explicit writable, configured Order sync confirmation. The requested Orders will stay queued.",
    };
  }
  const orderResults = results.filter((row) => row?.dataset === "orders");
  if (orderResults.length !== 1 || results.length !== 1) {
    return { ok: false, message: "Smartsheet did not return exactly one isolated, verifiable Order sync result." };
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
  const accounted = created + updated + unchanged + errors + conflicts;
  if (expected > 0 && accounted !== expected) {
    return {
      ok: false,
      message: `Smartsheet accounted for ${accounted} of ${expected} requested Orders. Unaccounted Orders will stay queued.`,
    };
  }
  const missingPermanentRows = item?.missing_permanent_row_links === undefined
    ? 0 : readCount(item.missing_permanent_row_links);
  if (missingPermanentRows === null) {
    return { ok: false, message: "Smartsheet returned an invalid missing-row review count. The requested Orders will stay queued." };
  }
  if (missingPermanentRows > 0) {
    return {
      ok: false,
      message: `${missingPermanentRows} Order${missingPermanentRows === 1 ? " has" : "s have"} a stored permanent Smartsheet row ID that no longer exists. Base44 preserved the original link and local data. Review permanent IDs; no automatic relink or replacement-row create was attempted.`,
    };
  }
  const remainingRecords = item?.remaining_records === undefined ? 0 : readCount(item.remaining_records);
  if (remainingRecords === null || remainingRecords > 0) {
    return {
      ok: false,
      message: remainingRecords === null
        ? "Smartsheet returned an invalid remaining Order count. The requested Orders will stay queued."
        : `Smartsheet still has ${remainingRecords} Order${remainingRecords === 1 ? "" : "s"} queued. Save & Sync is not complete yet.`,
    };
  }
  if (result?.sync_complete !== true || result?.needs_review || item?.skipped || item?.partial || item?.time_budget_reached || errors > 0 || conflicts > 0) {
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