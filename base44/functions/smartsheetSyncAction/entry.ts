import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';

const TOKEN_SECRET_NAME = 'SMARTSHEET_API_TOKEN';
const API_BASE = 'https://api.smartsheet.com/2.0';
const MAX_RESPONSE_BYTES = 2_000_000;

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
    }

    const action = cleanText(body?.action, 80).toLowerCase() || 'status';
    const token = String(secrets.get(TOKEN_SECRET_NAME) || '').trim();
    const configured = Boolean(token);

    if (action === 'status') {
      return Response.json({
        success: true,
        configured,
        read_only: true,
        secret_name: TOKEN_SECRET_NAME,
        api_base_url: API_BASE,
        supported_actions: ['status', 'test_connection', 'list_sheets', 'sheet_columns', 'sheet_rows'],
        write_actions_available: false,
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
