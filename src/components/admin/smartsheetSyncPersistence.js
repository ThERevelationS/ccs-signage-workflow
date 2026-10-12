import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active sign-in session is required.");
  return token;
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

async function invokeSmartsheet(action, sessionToken, extra = {}) {
  try {
    const response = await base44.functions.invoke("smartsheetSyncAction", {
      action,
      session_token: requireSessionToken(sessionToken),
      ...extra,
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "Smartsheet request could not be verified.");
    return data;
  } catch (error) {
    throw new Error(errorMessage(error, "Smartsheet request could not be completed safely."));
  }
}

export async function getSmartsheetSyncStatus({ sessionToken } = {}) {
  return invokeSmartsheet("status", sessionToken);
}

export async function getSmartsheetSyncConfig({ sessionToken } = {}) {
  const result = await invokeSmartsheet("config_get", sessionToken);
  return result?.record || null;
}

export async function saveSmartsheetSyncConfig({ sessionToken, loadedRecord, settingValue } = {}) {
  const record = loadedRecord && typeof loadedRecord === "object" ? loadedRecord : null;
  if (!record?.id || !record?.updated_date || !record?.setting_value) {
    throw new Error("Smartsheet sync settings are missing their loaded save baseline. Reload before saving.");
  }
  const result = await invokeSmartsheet("config_save", sessionToken, {
    expected_updated_date: record.updated_date,
    expected_setting_value: record.setting_value,
    setting_value: settingValue,
  });
  if (!result?.record?.id || !result?.record?.updated_date || !result?.record?.setting_value) {
    throw new Error("Smartsheet sync settings saved but the result could not be verified.");
  }
  return result.record;
}

export async function testSmartsheetConnection({ sessionToken } = {}) {
  return invokeSmartsheet("test_connection", sessionToken);
}

export async function listSmartsheetSheets({ sessionToken } = {}) {
  return invokeSmartsheet("list_sheets", sessionToken);
}

export async function getSmartsheetColumns({ sessionToken, sheetId } = {}) {
  return invokeSmartsheet("sheet_columns", sessionToken, { sheet_id: String(sheetId || "").trim() });
}

export async function getSmartsheetRows({ sessionToken, sheetId, columnIds = [], page = 1, pageSize = 100 } = {}) {
  return invokeSmartsheet("sheet_rows", sessionToken, {
    sheet_id: String(sheetId || "").trim(),
    column_ids: Array.isArray(columnIds) ? columnIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
    page: Math.max(1, Number(page) || 1),
    page_size: Math.max(1, Math.min(200, Number(pageSize) || 100)),
  });
}

// Admin-only, read-only review of legacy Sales Est / Inv # snapshots.
// The backend chooses the persisted sheet/binding and never repairs records.
export async function previewSmartsheetSalesEstInv({ sessionToken, sampleOffset = 0, sampleSize = 20 } = {}) {
  const result = await invokeSmartsheet("preview_sales_est_inv_snapshot", sessionToken, {
    sample_offset: Math.max(0, Math.min(499, Math.floor(Number(sampleOffset) || 0))),
    sample_size: Math.max(1, Math.min(25, Math.floor(Number(sampleSize) || 20))),
  });
  if (result?.read_only !== true || result?.dataset !== "sales" ||
      !Array.isArray(result?.cases) || !Number.isFinite(Number(result?.candidate_count_in_push_window)) ||
      (result.cases.length > 0 && !String(result.verified_column_title ?? "").trim())) {
    throw new Error("The Sales snapshot preview did not return a verifiable read-only result.");
  }
  return result;
}

export async function auditSalesSmartsheetPermanentOwnership({sessionToken}={}) {
  const result=await invokeSmartsheet("audit_sales_permanent_ownership",sessionToken);
  if (result?.read_only!==true || result?.writes_attempted!==false ||
      result?.dataset!=="sales" || !Array.isArray(result.cases) ||
      !Number.isFinite(Number(result.review_count)) ||
      result.unique_constraint_verified!==false) {
    throw new Error("Sales ownership audit did not confirm a complete read-only result.");
  }
  return result;
}

export async function auditSalesSmartsheetCreateAttempts({ sessionToken } = {}) {
  const result = await invokeSmartsheet("audit_sales_create_attempts", sessionToken);
  if (result.read_only !== true || result.writes_attempted !== false ||
      result.dataset !== "sales" || !Array.isArray(result.cases)) {
    throw new Error("Sales creation audit did not confirm its read-only evidence.");
  }
  return result;
}

export async function reviewSalesSmartsheetCreateCandidate({ sessionToken, workOrderId, rowId } = {}) {
  const result = await invokeSmartsheet("review_sales_create_candidate", sessionToken, {
    workorder_id: String(workOrderId || "").trim(),
    smartsheet_row_id: String(rowId || "").trim(),
  });
  if (result.read_only !== true || result.writes_attempted !== false ||
      result.dataset !== "sales" || !result.classification ||
      String(result.workorder_id) !== String(workOrderId || "").trim() ||
      String(result.entered_row_id) !== String(rowId || "").trim()) {
    throw new Error("Sales create candidate did not return verified read-only evidence.");
  }
  return result;
}

export async function recoverVerifiedSalesSmartsheetCreate({
  sessionToken,workOrderId,rowId,expectedVersion,expectedAttemptId,
} = {}) {
  const result = await invokeSmartsheet("recover_verified_sales_create",sessionToken,{
    workorder_id:String(workOrderId || "").trim(),
    smartsheet_row_id:String(rowId || "").trim(),
    expected_updated_date:String(expectedVersion || "").trim(),
    expected_attempt_id:String(expectedAttemptId || "").trim(),
    confirm_exact_recorded_row:true,
  });
  if (!result?.recovered || result?.dataset !== "sales" ||
      result.remote_writes_attempted !== false || result.history_verified !== true ||
      String(result.workorder_id) !== String(workOrderId || "").trim() ||
      String(result.row_id) !== String(rowId || "").trim() ||
      String(result.reviewed_workorder_version) !== String(expectedVersion || "").trim()) {
    throw new Error("Sales recovery did not return a fully verified link and history acknowledgment. Reload and inspect the original WorkOrder.");
  }
  return result;
}

export async function auditSalesSmartsheetRecoveryHistory({sessionToken,workOrderId}={}) {
  const result = await invokeSmartsheet("audit_sales_recovery_history",sessionToken,{
    workorder_id:String(workOrderId || "").trim(),
  });
  if (result?.read_only !== true || result?.writes_attempted !== false ||
      result?.dataset !== "sales" || !result.status ||
      String(result.workorder_id) !== String(workOrderId || "").trim()) {
    throw new Error("Sales history review did not confirm exact read-only evidence.");
  }
  return result;
}

export async function acknowledgeSalesSmartsheetRecoveryHistory({
  sessionToken,workOrderId,expectedVersion,expectedAttemptId,eventId,
}={}) {
  const result = await invokeSmartsheet("acknowledge_sales_recovery_history",sessionToken,{
    workorder_id:String(workOrderId || "").trim(),
    expected_updated_date:String(expectedVersion || "").trim(),
    expected_attempt_id:String(expectedAttemptId || "").trim(),
    expected_history_event_id:String(eventId || "").trim(),
    confirm_existing_event:true,
  });
  if (!result?.reconciled || result?.dataset !== "sales" ||
      result.history_created !== false || result.smartsheet_writes_attempted !== false ||
      result.workorder_link_unchanged !== true ||
      String(result.workorder_id) !== String(workOrderId || "").trim() ||
      String(result.history_event_id) !== String(eventId || "").trim()) {
    throw new Error("Sales history acknowledgment could not be fully verified. Reload; do not retry blindly.");
  }
  return result;
}

export async function runSmartsheetSync({ sessionToken, dataset } = {}) {
  return invokeSmartsheet("run_sync", sessionToken, dataset ? { dataset } : {});
}

export async function getSmartsheetColumnsForBindings({ sessionToken, sheetId } = {}) {
  return invokeSmartsheet("sheet_columns", sessionToken, { sheet_id: String(sheetId || "").trim() });
}

export async function getAllSmartsheetRows({
  sessionToken,
  sheetId,
  columnIds = [],
  pageSize = 200,
  maxRows = 10000,
} = {}) {
  const safeMaxRows = Math.max(1, Number(maxRows) || 10000);
  const rows = [];
  const seen = new Set();
  let page = 1;
  let expectedTotal = null;
  let sheetVersion = null;

  while (rows.length < safeMaxRows) {
    const result = await getSmartsheetRows({
      sessionToken,
      sheetId,
      columnIds,
      page,
      pageSize,
    });
    const pageRows = Array.isArray(result.rows) ? result.rows : [];
    const total = Number(result.total_row_count || 0);

    if (expectedTotal == null) expectedTotal = total;
    if (total !== expectedTotal) {
      throw new Error("Smartsheet row count changed during the dry run. Retry before reviewing matches.");
    }
    if (sheetVersion == null) sheetVersion = result.sheet_version ?? null;
    if (result.sheet_version != null && sheetVersion != null && result.sheet_version !== sheetVersion) {
      throw new Error("Smartsheet changed during the dry run. Retry before reviewing matches.");
    }
    if (expectedTotal > safeMaxRows) {
      throw new Error(`Smartsheet contains ${expectedTotal.toLocaleString()} rows, above the ${safeMaxRows.toLocaleString()}-row dry-run safety limit.`);
    }

    for (const row of pageRows) {
      const rowId = String(row?.id || "");
      if (!rowId || seen.has(rowId)) continue;
      seen.add(rowId);
      rows.push(row);
    }

    if (rows.length >= expectedTotal) break;
    if (pageRows.length === 0) {
      throw new Error("Smartsheet dry run ended before all rows were retrieved. No partial preview was accepted.");
    }
    page += 1;
  }

  if (expectedTotal != null && rows.length !== expectedTotal) {
    throw new Error(`Smartsheet dry run retrieved ${rows.length.toLocaleString()} of ${expectedTotal.toLocaleString()} rows. No partial preview was accepted.`);
  }

  return {
    success: true,
    read_only: true,
    sheet_id: String(sheetId || ""),
    sheet_version: sheetVersion,
    total_row_count: expectedTotal ?? rows.length,
    returned_row_count: rows.length,
    page_number: 1,
    page_size: pageSize,
    pages_loaded: page,
    rows,
  };
}