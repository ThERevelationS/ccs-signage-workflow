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
