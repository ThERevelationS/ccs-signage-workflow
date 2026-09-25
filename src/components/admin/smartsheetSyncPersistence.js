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
      !Array.isArray(result?.cases) || !Number.isFinite(Number(result?.candidate_count_in_push_window))) {
    throw new Error("The Sales snapshot preview did not return a verifiable read-only result.");
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