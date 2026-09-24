import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';
import {
  buildCells,
  buildSnapshot,
  getMappableFields,
  parseRowToFields,
} from '../../shared/smartsheetSyncFields.ts';

const TOKEN_SECRET_NAME = 'SMARTSHEET_API_TOKEN';
const API_BASE = 'https://api.smartsheet.com/2.0';
const MAX_RESPONSE_BYTES = 2_000_000;
const SETTING_KEY = 'smartsheetSyncConfig';

function cleanText(value: unknown, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeUpstreamError(status: number) {
  if (status === 401 || status === 403) return 'Smartsheet rejected the configured API token or its permissions.';
  if (status === 404) return 'The requested Smartsheet resource was not found or is not accessible to this token.';
  if (status === 429) return 'Smartsheet rate-limited the request. Retry later.';
  if (status >= 500) return 'Smartsheet is temporarily unavailable.';
  return `Smartsheet returned HTTP ${status}.`;
}

async function readJson(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error('Smartsheet response exceeded the diagnostic size limit.'), { status: 502 });
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error('Smartsheet response exceeded the diagnostic size limit.'), { status: 502 });
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Smartsheet returned an unreadable response.'), { status: 502 });
  }
}

async function smartsheetGet(path: string, token: string) {
  const safePath = String(path || '').trim();
  if (!safePath.startsWith('/') || safePath.includes('://')) {
    throw Object.assign(new Error('Invalid Smartsheet API path.'), { status: 400 });
  }
  const url = `${API_BASE}${safePath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await safeExternalFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'smartsheet-integration-source': 'APPLICATION,CincinnatiCustomSigns,Base44-Smartsheet-Sync',
      },
      signal: controller.signal,
    }, 0);
    if (!response.ok) {
      throw Object.assign(new Error(safeUpstreamError(response.status)), {
        status: response.status === 429 ? 429 : 502,
        upstreamStatus: response.status,
      });
    }
    return { status: response.status, body: await readJson(response) };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      throw Object.assign(new Error('Smartsheet request timed out.'), { status: 502 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSheets(body: any) {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((sheet: any) => ({
    id: String(sheet?.id ?? ''),
    name: cleanText(sheet?.name, 300),
    access_level: cleanText(sheet?.accessLevel, 80),
    owner: cleanText(sheet?.owner, 320),
    modified_at: cleanText(sheet?.modifiedAt, 80),
  })).filter((sheet: any) => sheet.id && sheet.name);
}

function normalizeColumns(body: any) {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return rows.map((column: any) => ({
    id: String(column?.id ?? ''),
    title: cleanText(column?.title, 300),
    type: cleanText(column?.type, 80),
    primary: column?.primary === true,
    system_column_type: cleanText(column?.systemColumnType, 80),
    validation: column?.validation === true,
    options: Array.isArray(column?.options)
      ? column.options.map((option: unknown) => cleanText(option, 300)).filter(Boolean).slice(0, 500)
      : [],
  })).filter((column: any) => column.id && column.title);
}

function normalizeCellPayload(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return cleanText(value, 4000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return cleanText(JSON.stringify(value), 4000);
  } catch {
    return cleanText(value, 4000);
  }
}

function normalizeSheetRows(body: any) {
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  return rows.map((row: any) => ({
    id: String(row?.id ?? ''),
    row_number: Number(row?.rowNumber || 0) || null,
    parent_id: row?.parentId ? String(row.parentId) : '',
    modified_at: cleanText(row?.modifiedAt, 80),
    cells: (Array.isArray(row?.cells) ? row.cells : []).map((cell: any) => ({
      column_id: String(cell?.columnId ?? ''),
      value: normalizeCellPayload(cell?.value),
      display_value: cleanText(cell?.displayValue, 4000),
    })).filter((cell: any) => cell.column_id),
  })).filter((row: any) => row.id);
}

function numericIdList(value: unknown, maxItems = 100) {
  const source = Array.isArray(value) ? value : [];
  const ids = [...new Set(source.map((item) => cleanText(item, 40)).filter((item) => /^\d+$/.test(item)))];
  return ids.slice(0, maxItems);
}

async function smartsheetWrite(method: 'POST' | 'PUT', path: string, token: string, jsonBody: unknown) {
  const safePath = String(path || '').trim();
  if (!safePath.startsWith('/') || safePath.includes('://')) {
    throw Object.assign(new Error('Invalid Smartsheet API path.'), { status: 400 });
  }
  const url = `${API_BASE}${safePath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await safeExternalFetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'smartsheet-integration-source': 'APPLICATION,CincinnatiCustomSigns,Base44-Smartsheet-Sync',
      },
      body: JSON.stringify(jsonBody),
      signal: controller.signal,
    }, 0);
    if (!response.ok) {
      throw Object.assign(new Error(safeUpstreamError(response.status)), {
        status: response.status === 429 ? 429 : 502,
        upstreamStatus: response.status,
      });
    }
    return { status: response.status, body: await readJson(response) };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      throw Object.assign(new Error('Smartsheet write timed out.'), { status: 502 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Compare current Smartsheet cell values against the last-sync snapshot stored
// on the Base44 record. Returns true if Smartsheet was edited since the last
// sync (a conflict — someone changed the row outside Base44).
function detectConflict(
  currentSmartsheetCells: { column_id: string; value: string | number | null; display_value?: string }[],
  snapshot: Record<string, string | number | null> | null,
  bindings: Record<string, string>,
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false; // no prior sync → no conflict
  const bindingColumnIds = new Set(Object.values(bindings || {}).map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id)));
  for (const cell of currentSmartsheetCells) {
    const colId = String(cell.column_id || cell.columnId || '');
    if (!bindingColumnIds.has(colId)) continue;
    const current = cell.display_value != null ? String(cell.display_value) : (cell.displayValue != null ? String(cell.displayValue) : (cell.value == null ? '' : String(cell.value)));
    const last = snapshot[colId];
    const lastStr = last == null ? '' : String(last);
    if (current.trim() !== lastStr.trim()) return true;
  }
  return false;
}

// Normalize Smartsheet text values to Base44 enum values for known enum fields.
function normalizePullValue(fieldKey: string, value: any): any {
  if (value === null || value === undefined || value === "") return undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  const lower = str.toLowerCase();
  if (fieldKey === "sales_status") {
    if (["lead", "new", "open"].includes(lower)) return "lead";
    if (["quoted", "quote sent", "proposal sent", "estimate sent"].includes(lower)) return "quoted";
    if (["follow_up", "follow up", "following up", "follow-up", "followup"].includes(lower)) return "follow_up";
    if (["won", "closed won", "deal won", "yes", "win"].includes(lower)) return "won";
    if (["lost", "closed lost", "deal lost", "no"].includes(lower)) return "lost";
    if (["on_hold", "on hold", "hold", "paused", "pending"].includes(lower)) return "on_hold";
    return undefined;
  }
  if (fieldKey === "status") {
    if (["pending", "not started", "new", "requested", "todo"].includes(lower)) return "pending";
    if (["ordered", "submitted", "placed", "in progress"].includes(lower)) return "ordered";
    if (["received", "complete", "done", "fulfilled", "delivered"].includes(lower)) return "received";
    if (["cancelled", "canceled", "void", "closed"].includes(lower)) return "cancelled";
    return undefined;
  }
  if (fieldKey === "request_type") {
    if (lower.includes("substrate")) return "Substrate";
    if (lower.includes("vinyl")) return "Vinyl";
    if (lower.includes("suppl")) return "Supplies";
    return "Other";
  }
  if (fieldKey === "permitting") {
    if (["yes", "y", "required", "true"].includes(lower)) return "yes";
    if (["no", "n", "not required", "false"].includes(lower)) return "no";
    if (["maybe", "perhaps", "uncertain", "tbd", "unsure"].includes(lower)) return "maybe";
    return "na";
  }
  return str;
}

async function pullDataset(
  base44: any,
  token: string,
  dataset: 'sales' | 'orders',
  profile: any,
  globalConfig: any,
) {
  const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
  if (!/^\d+$/.test(sheetId)) {
    return { dataset, direction: 'pull', skipped: true, reason: 'No numeric Smartsheet sheet ID configured.' };
  }
  const bindings = profile?.column_bindings && typeof profile.column_bindings === 'object' ? profile.column_bindings : {};
  const boundColumnCount = Object.values(bindings).filter((id: any) => /^\d+$/.test(String(id).trim())).length;
  if (boundColumnCount === 0) {
    return { dataset, direction: 'pull', skipped: true, reason: 'No column bindings configured for this dataset.' };
  }

  // Fetch all rows from the Smartsheet sheet using only bound column IDs
  const columnIds = Object.values(bindings).map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id));
  const allRows: any[] = [];
  let page = 1;
  const pageSize = 200;
  let totalRowCount = 0;
  while (page <= 100) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      columnIds: columnIds.join(','),
      exclude: 'nonexistentCells',
    });
    const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
    const rows = normalizeSheetRows(result.body);
    if (page === 1) totalRowCount = Number(result.body?.totalRowCount || 0);
    allRows.push(...rows);
    if (allRows.length >= totalRowCount || rows.length === 0) break;
    page++;
  }

  const massLimit = Math.max(1, Number(globalConfig?.mass_change_limit_count) || 25);
  if (allRows.length > massLimit) {
    return {
      dataset,
      direction: 'pull',
      skipped: true,
      reason: `${allRows.length} Smartsheet rows exceed the mass-change hard stop of ${massLimit}. Raise the limit in settings.`,
    };
  }

  // Load existing Base44 records already linked to this Smartsheet sheet.
  // Filtering by smartsheet_sheet_id returns only synced records, avoiding the
  // 500-record default limit and preventing duplicate creates on re-pulls.
  const entityName = dataset === 'sales' ? 'WorkOrder' : 'Order';
  let existingRecords: any[] = [];
  if (dataset === 'sales') {
    existingRecords = await base44.asServiceRole.entities.WorkOrder.filter({ smartsheet_sheet_id: sheetId }, '-updated_date', 5000);
  } else {
    existingRecords = await base44.asServiceRole.entities.Order.filter({ smartsheet_sheet_id: sheetId }, '-updated_date', 5000);
  }
  existingRecords = (Array.isArray(existingRecords) ? existingRecords : []).filter((r: any) => !r?.deleted);
  const recordsByRowId: Record<string, any> = {};
  for (const rec of existingRecords) {
    const rowId = cleanText(rec?.smartsheet_row_id, 40);
    if (rowId && /^\d+$/.test(rowId)) recordsByRowId[rowId] = rec;
  }

  // Collect records to create and update
  const toCreate: any[] = [];
  const toUpdate: any[] = [];

  for (const row of allRows) {
    const rowId = row.id;
    if (!rowId || !/^\d+$/.test(rowId)) continue;

    const rawFields = parseRowToFields(row, bindings, dataset);
    // Normalize enum fields to valid Base44 values
    const fieldValues: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawFields)) {
      const normalized = normalizePullValue(key, val);
      if (normalized !== undefined) fieldValues[key] = normalized;
    }

    const existing = recordsByRowId[rowId];
    if (existing) {
      toUpdate.push({ id: existing.id, ...fieldValues, smartsheet_last_synced_at: new Date().toISOString() });
    } else if (profile?.create_base44_from_smartsheet) {
      const newRecord: any = { ...fieldValues };
      if (dataset === 'sales') {
        if (!newRecord.title) newRecord.title = newRecord.client_name || `Smartsheet row ${rowId}`;
        if (!newRecord.client_name) newRecord.client_name = 'Unknown';
        newRecord.in_pipeline = true;
      } else {
        if (!newRecord.customer_name) newRecord.customer_name = 'Unknown';
        if (!newRecord.request_type) newRecord.request_type = 'Other';
        if (!newRecord.description) newRecord.description = `Imported from Smartsheet row ${rowId}`;
      }
      newRecord.smartsheet_row_id = rowId;
      newRecord.smartsheet_sheet_id = sheetId;
      newRecord.smartsheet_last_synced_at = new Date().toISOString();
      toCreate.push(newRecord);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  // Debug: log first update batch
  if (toUpdate.length > 0) {
    console.log('DEBUG toUpdate first 2:', JSON.stringify(toUpdate.slice(0, 2)));
  }

  // Bulk create in batches of 100 to avoid rate limits
  for (let i = 0; i < toCreate.length; i += 100) {
    const batch = toCreate.slice(i, i + 100);
    try {
      const result = await base44.asServiceRole.entities[entityName].bulkCreate(batch);
      createdCount += Array.isArray(result) ? result.length : 0;
    } catch (err) {
      errors.push(`Create batch ${Math.floor(i / 100) + 1}: ${(err as any)?.message || 'unknown error'}`);
    }
  }

  // Bulk update in batches of 100
  for (let i = 0; i < toUpdate.length; i += 100) {
    const batch = toUpdate.slice(i, i + 100);
    try {
      const result = await base44.asServiceRole.entities[entityName].bulkUpdate(batch);
      updatedCount += Array.isArray(result) ? result.length : 0;
    } catch (err) {
      errors.push(`Update batch ${Math.floor(i / 100) + 1}: ${(err as any)?.message || 'unknown error'}`);
    }
  }

  return {
    dataset,
    direction: 'pull',
    sheet_id: sheetId,
    rows_examined: allRows.length,
    records_examined: allRows.length,
    created: createdCount,
    updated: updatedCount,
    errors: errors.length,
    error_details: errors.slice(0, 10),
  };
}

async function loadSyncConfig(base44: any) {
  const results = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: SETTING_KEY });
  const record = Array.isArray(results) ? results[0] : results;
  return { record, config: record?.setting_value || null };
}

// Store the last sync run status so the persistent UI widget can show it
// on every page. Best-effort — never blocks the sync itself.
async function saveSyncStatus(base44: any, status: any) {
  try {
    const existing = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'smartsheetSyncStatus' });
    const record = Array.isArray(existing) ? existing[0] : existing;
    const value = { ...status, updated_at: new Date().toISOString() };
    if (record?.id) {
      await base44.asServiceRole.entities.GlobalSettings.update(record.id, { setting_value: value });
    } else {
      await base44.asServiceRole.entities.GlobalSettings.create({ setting_key: 'smartsheetSyncStatus', setting_value: value });
    }
  } catch {
    // non-critical — sync status display is best-effort
  }
}

async function pushDataset(
  base44: any,
  token: string,
  dataset: 'sales' | 'orders',
  profile: any,
  globalConfig: any,
) {
  const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
  if (!/^\d+$/.test(sheetId)) {
    return { dataset, skipped: true, reason: 'No numeric Smartsheet sheet ID configured.' };
  }
  const bindings = profile?.column_bindings && typeof profile.column_bindings === 'object' ? profile.column_bindings : {};
  const boundColumnCount = Object.values(bindings).filter((id: any) => /^\d+$/.test(String(id).trim())).length;
  if (boundColumnCount === 0) {
    return { dataset, skipped: true, reason: 'No column bindings configured for this dataset.' };
  }

  // Load Base44 records for this dataset.
  let records: any[] = [];
  if (dataset === 'sales') {
    records = await base44.asServiceRole.entities.WorkOrder.filter({ in_pipeline: true }, '-updated_date', 500);
  } else {
    records = await base44.asServiceRole.entities.Order.list('-updated_date', 500);
  }
  records = (Array.isArray(records) ? records : []).filter((r: any) => !r?.deleted);

  const massLimit = Math.max(1, Number(globalConfig?.mass_change_limit_count) || 25);
  if (records.length > massLimit) {
    return {
      dataset,
      skipped: true,
      reason: `${records.length} records exceed the mass-change hard stop of ${massLimit}. Raise the limit or narrow the pipeline.`,
    };
  }

  // Backup before write: snapshot the whole target sheet into a BackupLog entry.
  if (globalConfig?.backup_before_write) {
    try {
      const backupResult = await smartsheetGet(`/sheets/${sheetId}?pageSize=200`, token);
      const backupRows = normalizeSheetRows(backupResult.body);
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'scheduled',
        data_types: [`smartsheet_${dataset}_sheet_${sheetId}`],
        results: [{
          type: `smartsheet_${dataset}`,
          filename: `sheet_${sheetId}_pre_sync_${new Date().toISOString()}`,
          success: true,
        }],
        success_count: 1,
        error_count: 0,
        triggered_by: 'smartsheet_sync',
      });
      void backupRows; // backup stored; rows available for audit if needed
    } catch (err) {
      return { dataset, skipped: true, reason: `Backup before write failed: ${(err as any)?.message || 'unknown error'}` };
    }
  }

  const created: string[] = [];
  const updated: string[] = [];
  const conflicts: string[] = [];
  const errors: string[] = [];

  for (const record of records) {
    const cells = buildCells(record, bindings, dataset);
    if (cells.length === 0) continue;
    const existingRowId = cleanText(record?.smartsheet_row_id, 40);
    const existingSheetId = cleanText(record?.smartsheet_sheet_id, 40);

    try {
      if (existingRowId && /^\d+$/.test(existingRowId) && existingSheetId === sheetId) {
        // UPDATE — conflict check first
        if (globalConfig?.backup_before_write !== false && record?.smartsheet_sync_snapshot) {
          const rowResult = await smartsheetGet(
            `/sheets/${sheetId}/rows?rowIds=${existingRowId}&columnIds=${cells.map((c) => c.columnId).join(',')}&exclude=nonexistentCells`,
            token,
          );
          const sheetRows = normalizeSheetRows(rowResult.body);
          const currentCells = sheetRows[0]?.cells || [];
          if (detectConflict(currentCells, record.smartsheet_sync_snapshot, bindings)) {
            conflicts.push(record.id);
            continue;
          }
        }
        await smartsheetWrite('PUT', `/sheets/${sheetId}/rows`, token, [{
          id: existingRowId,
          cells: cells.map((c) => ({ columnId: c.columnId, value: c.value })),
        }]);
        updated.push(record.id);
      } else {
        // CREATE new row
        const result = await smartsheetWrite('POST', `/sheets/${sheetId}/rows`, token, [{
          toTop: true,
          cells: cells.map((c) => ({ columnId: c.columnId, value: c.value })),
        }]);
        const newRowId = String(result?.body?.result?.id || result?.body?.id || '');
        if (newRowId && /^\d+$/.test(newRowId)) {
          await base44.asServiceRole.entities[dataset === 'sales' ? 'WorkOrder' : 'Order'].update(record.id, {
            smartsheet_row_id: newRowId,
            smartsheet_sheet_id: sheetId,
          });
        }
        created.push(record.id);
      }
      // Store fresh snapshot + timestamp on the record
      const snapshot = buildSnapshot(record, bindings, dataset);
      await base44.asServiceRole.entities[dataset === 'sales' ? 'WorkOrder' : 'Order'].update(record.id, {
        smartsheet_sync_snapshot: snapshot,
        smartsheet_last_synced_at: new Date().toISOString(),
      });
    } catch (err) {
      errors.push(`${record.id}: ${(err as any)?.message || 'unknown error'}`);
    }
  }

  return {
    dataset,
    sheet_id: sheetId,
    records_examined: records.length,
    created: created.length,
    updated: updated.length,
    conflicts: conflicts.length,
    errors: errors.length,
    error_details: errors.slice(0, 10),
    conflict_record_ids: conflicts.slice(0, 10),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 80).toLowerCase() || 'status';
    const token = String(secrets.get(TOKEN_SECRET_NAME) || '').trim();
    const configured = Boolean(token);

    // Manual UI calls pass a session_token and require admin auth. Scheduled
    // workflow calls have no session token and run as the service role, matching
    // the pattern used by the other scheduled fleet functions in this app.
    const hasSessionToken = Boolean(String(body?.session_token || '').trim());
    if (hasSessionToken) {
      const actor = await authenticateSignShopSession(base44, body?.session_token);
      if (actor?.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      }
    } else if (action !== 'run_sync' && action !== 'push_dataset' && action !== 'pull_dataset') {
      return Response.json({ success: false, error: 'Admin session is required for this action.' }, { status: 403 });
    }

    if (action === 'status') {
      return Response.json({
        success: true,
        configured,
        read_only: false,
        secret_name: TOKEN_SECRET_NAME,
        api_base_url: API_BASE,
        supported_actions: ['status', 'test_connection', 'list_sheets', 'sheet_columns', 'sheet_rows', 'run_sync', 'push_dataset', 'pull_dataset'],
        write_actions_available: true,
      });
    }

    if (!configured) {
      return Response.json({
        success: false,
        configured: false,
        error: `Smartsheet is not configured. Add the ${TOKEN_SECRET_NAME} Base44 app secret before connecting.`,
      }, { status: 503 });
    }

    if (action === 'test_connection') {
      const result = await smartsheetGet('/sheets?pageSize=1', token);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        http_status: result.status,
        total_accessible_sheets: Number(result.body?.totalCount || 0),
      });
    }

    if (action === 'list_sheets') {
      const result = await smartsheetGet('/sheets?includeAll=true', token);
      const sheets = normalizeSheets(result.body);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        total_accessible_sheets: sheets.length,
        sheets,
      });
    }

    if (action === 'sheet_columns') {
      const sheetId = cleanText(body?.sheet_id, 40);
      if (!/^\d+$/.test(sheetId)) {
        return Response.json({ success: false, error: 'A numeric Smartsheet sheet ID is required.' }, { status: 400 });
      }
      const result = await smartsheetGet(`/sheets/${sheetId}/columns?includeAll=true`, token);
      const columns = normalizeColumns(result.body);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        sheet_id: sheetId,
        columns,
      });
    }

    if (action === 'sheet_rows') {
      const sheetId = cleanText(body?.sheet_id, 40);
      if (!/^\d+$/.test(sheetId)) {
        return Response.json({ success: false, error: 'A numeric Smartsheet sheet ID is required.' }, { status: 400 });
      }
      const columnIds = numericIdList(body?.column_ids, 100);
      if (!columnIds.length) {
        return Response.json({ success: false, error: 'At least one verified numeric Smartsheet column ID is required.' }, { status: 400 });
      }
      const page = Math.max(1, Math.min(100000, Number(body?.page) || 1));
      const pageSize = Math.max(1, Math.min(200, Number(body?.page_size) || 100));
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        columnIds: columnIds.join(','),
        exclude: 'nonexistentCells',
      });
      const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
      const rows = normalizeSheetRows(result.body);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        sheet_id: sheetId,
        sheet_version: Number(result.body?.version || 0) || null,
        total_row_count: Number(result.body?.totalRowCount || rows.length),
        page_number: Number(result.body?.pageNumber || page),
        page_size: Number(result.body?.pageSize || pageSize),
        returned_row_count: rows.length,
        rows,
      });
    }

    if (action === 'run_sync' || action === 'push_dataset' || action === 'pull_dataset') {
      const { config } = await loadSyncConfig(base44);
      if (!config) {
        return Response.json({ success: false, error: 'No Smartsheet sync configuration saved yet. Configure and save settings first.' }, { status: 400 });
      }
      if (!config.global_enabled) {
        return Response.json({ success: false, error: 'Global sync kill switch is OFF. Enable it in settings before running sync.' }, { status: 400 });
      }
      if (config.observation_mode) {
        return Response.json({ success: false, error: 'Observation mode is ON. Turn it off in settings to allow writes.' }, { status: 400 });
      }

      const isSingleDataset = action === 'push_dataset' || action === 'pull_dataset';
      const datasetsToRun: ('sales' | 'orders')[] =
        isSingleDataset && body?.dataset === 'orders'
          ? ['orders']
          : isSingleDataset
            ? ['sales']
            : ['sales', 'orders'];

      // Build the list of steps so the UI can show a real progress bar.
      const steps: { dataset: string; direction: string; label: string }[] = [];
      for (const dataset of datasetsToRun) {
        const profile = config?.[dataset] || {};
        if (!profile.mirror_enabled) continue;
        const wantPull = action === 'pull_dataset' || (action === 'run_sync' && profile.pull_enabled);
        const wantPush = action === 'push_dataset' || (action === 'run_sync' && profile.push_enabled);
        if (wantPull) steps.push({ dataset, direction: 'pull', label: `${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} ← Smartsheet` });
        if (wantPush) steps.push({ dataset, direction: 'push', label: `${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} → Smartsheet` });
      }

      await saveSyncStatus(base44, {
        status: 'running',
        started_at: new Date().toISOString(),
        action,
        total_steps: steps.length,
        completed_steps: 0,
        current_step_label: steps[0]?.label || '',
        results: [],
      });

      const results: any[] = [];
      let completedSteps = 0;
      for (const dataset of datasetsToRun) {
        const profile = config?.[dataset] || {};
        if (!profile.mirror_enabled) {
          results.push({ dataset, skipped: true, reason: 'Mirror not enabled for this dataset.' });
          continue;
        }

        const wantPull = action === 'pull_dataset' || (action === 'run_sync' && profile.pull_enabled);
        const wantPush = action === 'push_dataset' || (action === 'run_sync' && profile.push_enabled);

        if (!wantPull && !wantPush) {
          results.push({ dataset, skipped: true, reason: 'Neither push nor pull enabled for this dataset.' });
          continue;
        }

        try {
          if (wantPull) {
            const stepLabel = steps.find(s => s.dataset === dataset && s.direction === 'pull')?.label || '';
            await saveSyncStatus(base44, {
              status: 'running',
              started_at: new Date().toISOString(),
              action,
              total_steps: steps.length,
              completed_steps: completedSteps,
              current_step_label: stepLabel,
              results,
            });
            const pullResult = await pullDataset(base44, token, dataset, profile, config);
            results.push(pullResult);
            completedSteps++;
          }
          if (wantPush) {
            const stepLabel = steps.find(s => s.dataset === dataset && s.direction === 'push')?.label || '';
            await saveSyncStatus(base44, {
              status: 'running',
              started_at: new Date().toISOString(),
              action,
              total_steps: steps.length,
              completed_steps: completedSteps,
              current_step_label: stepLabel,
              results,
            });
            const pushResult = await pushDataset(base44, token, dataset, profile, config);
            results.push(pushResult);
            completedSteps++;
          }
        } catch (err) {
          results.push({ dataset, skipped: true, reason: (err as any)?.message || 'Sync failed.' });
          completedSteps++;
        }
      }

      await saveSyncStatus(base44, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_steps: steps.length,
        completed_steps: steps.length,
        current_step_label: '',
        results,
      });

      return Response.json({
        success: true,
        configured: true,
        write_actions_available: true,
        results,
      });
    }

    return Response.json({ success: false, error: 'Invalid Smartsheet sync action.' }, { status: 400 });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    const safeStatus = [400, 401, 403, 429, 502, 503].includes(status) ? status : 500;
    console.error('smartsheetSyncAction error:', (error as any)?.message || error);
    return Response.json({
      success: false,
      error: safeStatus === 500 ? 'Smartsheet request could not be completed safely.' : (error as any)?.message,
    }, { status: safeStatus });
  }
});