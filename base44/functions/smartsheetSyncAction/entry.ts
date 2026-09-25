import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { createSmartsheetOrderPageGuard } from '../../shared/smartsheetOrderPageGuard.mjs';
import { isValidContactEmail, sharedOrderRequestorColumnId } from '../../shared/smartsheetOrderContact.mjs';
import { auditOrderRequestorContacts } from '../../shared/smartsheetOrderContactAudit.mjs';
import { createOrderSmartsheetRowWithGuard, orderSmartsheetCreateNeedsReview } from '../../shared/smartsheetOrderCreateSafety.mjs';
import { orderStatusFromPulledDates } from '../../shared/smartsheetOrderReceivedState.mjs';
import { auditOrderCreateAttempts, verifyOrderCreateAuditSheetIdentity } from '../../shared/smartsheetOrderCreateReview.mjs';
import { auditOrderDateParity } from '../../shared/smartsheetOrderDateTranslation.mjs';
import {
  buildCells,
  buildSnapshot,
  parseRowToFields,
} from '../../shared/smartsheetSyncFields.ts';
import {
  filterSalesColumnBindings,
  salesPulledFieldsUnchanged,
  salesPullSnapshotAligned,
  salesPushRecordUnchanged,
  salesPushSnapshotNeedsReview,
  classifySalesEstInvPreview,
  verifiedSalesPreviewColumn,
  salesRunRequiresReview,
  shouldCreateSmartsheetSalesRecordInPipeline,
} from '../../shared/smartsheetSalesSafety.mjs';

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
  dataset: 'sales' | 'orders',
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false; // no prior sync → no conflict
  const bindingColumnIds = new Set(Object.values(bindings || {}).map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id)));
  const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';
  for (const cell of currentSmartsheetCells) {
    const colId = String(cell.column_id || cell.columnId || '');
    if (!bindingColumnIds.has(colId)) continue;
    if (sharedContactId && colId === sharedContactId) {
      // The CONTACT_LIST raw value is its email; display_value is its name.
      // A missing contact snapshot means this field was intentionally not written.
      if (!Object.prototype.hasOwnProperty.call(snapshot, colId)) continue;
      const expected = String(snapshot[colId] ?? '').trim();
      const actual = isValidContactEmail(expected)
        ? String(cell.value ?? '').trim()
        : String(cell.display_value ?? cell.value ?? '').trim();
      if (actual !== expected) return true;
      continue;
    }
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
  const rawBindings = profile?.column_bindings && typeof profile.column_bindings === 'object' ? profile.column_bindings : {};
  const bindings = dataset === 'sales' ? filterSalesColumnBindings(rawBindings) : rawBindings;
  const boundColumnCount = Object.values(bindings).filter((id: any) => /^\d+$/.test(String(id).trim())).length;
  if (boundColumnCount === 0) {
    return { dataset, direction: 'pull', skipped: true, reason: 'No column bindings configured for this dataset.' };
  }

  // Fetch all rows from the Smartsheet sheet using only bound column IDs
  const columnIds = [...new Set(Object.values(bindings).map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id)))];
  const allRows: any[] = [];
  let page = 1;
  const pageSize = 200;
  const orderPageGuard = dataset === 'orders' ? createSmartsheetOrderPageGuard({ pageSize, maxPages: 100 }) : null;
  let totalRowCount = 0;
  while (page <= 100) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      columnIds: columnIds.join(','),
      exclude: 'nonexistentCells',
    });
    const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
    if (orderPageGuard) verifyOrderCreateAuditSheetIdentity(result.body, sheetId);
    const rows = normalizeSheetRows(result.body);
    const orderPageComplete = orderPageGuard ? orderPageGuard.accept(page, result.body, rows) : false;
    if (page === 1) totalRowCount = Number(result.body?.totalRowCount || 0);
    allRows.push(...rows);
    if (orderPageGuard ? orderPageComplete : (allRows.length >= totalRowCount || rows.length === 0)) break;
    page++;
  }
  // Never apply a partial Order Request download to live Base44 Orders.
  orderPageGuard?.assertComplete();

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
    existingRecords = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.Order,
      query: { smartsheet_sheet_id: sheetId },
      sort: 'id',
      label: 'Order Form Smartsheet pull linked Orders',
    });
  }
  existingRecords = (Array.isArray(existingRecords) ? existingRecords : []).filter((r: any) => !r?.deleted);

  // Order-only date preflight: do not mutate any Order if a legacy cell has
  // an untranslatable date or a duplicate permanent Base44 row link.
  // A received text choice is valid; an impossible date is not.
  if (dataset === 'orders') {
    const audit = auditOrderDateParity(existingRecords, allRows, bindings, sheetId);
    if (audit.counts.invalid_date_values || audit.counts.duplicate_base44_links) {
      return { dataset, direction: 'pull', sheet_id: sheetId, skipped: true,
        reason: 'Order Request date translation or permanent row links require review before pull. No Orders were changed.',
        date_translation_invalid: audit.counts.invalid_date_values,
        duplicate_order_row_links: audit.counts.duplicate_base44_links,
        samples: { invalid_values: audit.samples.invalid_values, ambiguous_links: audit.samples.ambiguous_links },
      };
    }
  }

  // A prior Order POST may have succeeded without a confirmed Base44 row link.
  // Do not create duplicate Base44 Orders from orphan Smartsheet rows while
  // any uncertain create attempt for this sheet awaits manual reconciliation.
  if (dataset === 'orders') {
    const unresolved = existingRecords.filter(orderSmartsheetCreateNeedsReview);
    if (unresolved.length) return {
      dataset, direction: 'pull', sheet_id: sheetId, skipped: true,
      reason: `${unresolved.length} Order Smartsheet create attempts require review before pull. No Orders were changed.`,
      create_attempts_need_review: unresolved.length,
      review_order_ids: unresolved.slice(0, 10).map((record: any) => record.id),
    };
  }

  // Order Form only: a duplicated stable Smartsheet row link is ambiguous.
  // Fail closed instead of picking one Order arbitrarily or creating another.
  const orderRowLinkCounts: Record<string, number> = {};
  if (dataset === 'orders') {
    for (const rec of existingRecords) {
      const rowId = cleanText(rec?.smartsheet_row_id, 40);
      if (rowId && /^\d+$/.test(rowId)) orderRowLinkCounts[rowId] = (orderRowLinkCounts[rowId] || 0) + 1;
    }
  }
  const duplicateOrderRowIds = new Set(
    Object.entries(orderRowLinkCounts)
      .filter(([, count]) => count > 1)
      .map(([rowId]) => rowId),
  );

  const recordsByRowId: Record<string, any> = {};
  for (const rec of existingRecords) {
    const rowId = cleanText(rec?.smartsheet_row_id, 40);
    if (rowId && /^\d+$/.test(rowId)) {
      if (dataset === 'orders' && duplicateOrderRowIds.has(rowId)) continue;
      recordsByRowId[rowId] = rec;
    }
  }

  // Collect records to create and update
  const toCreate: any[] = [];
  const toUpdate: any[] = [];
  let unchangedSkipped = 0;

  for (const row of allRows) {
    const rowId = row.id;
    if (!rowId || !/^\d+$/.test(rowId)) continue;
    if (dataset === 'orders' && duplicateOrderRowIds.has(rowId)) continue;

    const rawFields = parseRowToFields(row, bindings, dataset);
    // Normalize enum fields to valid Base44 values
    const fieldValues: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawFields)) {
      // A verified nonempty text receipt explicitly replaces a stale date.
      if (dataset === 'orders' && key === 'date_received' && val === '' && rawFields.receipt_option) {
        fieldValues.date_received = '';
        continue;
      }
      const normalized = normalizePullValue(key, val);
      if (normalized !== undefined) fieldValues[key] = normalized;
    }

    const existing = recordsByRowId[rowId];
    if (dataset === 'orders') {
      Object.assign(fieldValues, orderStatusFromPulledDates(
        fieldValues, existing, /^\d+$/.test(String(bindings?.status ?? '').trim()),
      ));
    }
    if (existing) {
      // A no-op pull must not bump updated_date or rewrite working Sales data.
      // If the snapshot is missing/stale, retain the existing reconciliation path.
      if (dataset === 'sales' && salesPulledFieldsUnchanged(existing, fieldValues) &&
          salesPullSnapshotAligned(existing, buildSnapshot(existing, bindings, 'sales'))) {
        unchangedSkipped++;
        continue;
      }
      toUpdate.push({ id: existing.id, _existing: existing, ...fieldValues, smartsheet_last_synced_at: new Date().toISOString() });
    } else if (profile?.create_base44_from_smartsheet) {
      const newRecord: any = { ...fieldValues };
      if (dataset === 'sales') {
        if (!newRecord.title) newRecord.title = newRecord.client_name || `Smartsheet row ${rowId}`;
        if (!newRecord.client_name) newRecord.client_name = 'Unknown';
        newRecord.in_pipeline = shouldCreateSmartsheetSalesRecordInPipeline(newRecord);
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

  // Hybrid update strategy:
  // 1. bulkUpdate for all fields (fast, no rate limits) — but it silently
  //    drops date fields for some records.
  // 2. Second pass: individual update() calls for records where dates should
  //    exist but don't after the bulk update. This is a small subset (~150-260
  //    records) so individual calls stay within rate limits.
  const snapshotUpdates: any[] = [];
  const bulkBatchSize = 100;
  for (let i = 0; i < toUpdate.length; i += bulkBatchSize) {
    const batch = toUpdate.slice(i, i + bulkBatchSize);
    const payload = batch.map(({ id, _existing, ...fields }: any) => ({ id, ...fields }));
    try {
      await base44.asServiceRole.entities[entityName].bulkUpdate(payload);
      updatedCount += payload.length;
      for (const rec of batch) {
        if (rec._existing) {
          const { id, _existing, ...fields } = rec;
          const merged = { ..._existing, ...fields };
          const snapshot = buildSnapshot(merged, bindings, dataset);
          snapshotUpdates.push({ id, smartsheet_sync_snapshot: snapshot });
        }
      }
    } catch (err: any) {
      errors.push(`Bulk update batch ${Math.floor(i / bulkBatchSize) + 1}: ${err?.message || 'unknown error'}`);
    }
  }

  // Second pass: fix records where dates should exist but were dropped by bulkUpdate.
  // Identify date fields for this dataset.
  const dateFields = dataset === 'orders'
    ? ['date_ordered', 'date_received', 'date_needed']
    : ['date_initial_contact', 'date_estimate_sent', 'date_order_created', 'project_install_date',
       'permit_submitted_date', 'permit_receipt_confirmed_date', 'permit_approved_date',
       'follow_up_date', 'close_date', 'expected_close_date', 'site_survey_date'];

  const dateFixes: any[] = [];
  for (const rec of toUpdate) {
    const { id, _existing, ...fields } = rec;
    for (const df of dateFields) {
      if (fields[df] && (!_existing || _existing[df] !== fields[df])) {
        // This date should be set — queue a targeted individual update
        dateFixes.push({ id, field: df, value: fields[df] });
      }
    }
  }

  // Group date fixes by record id to minimize API calls
  const fixesByRecord: Record<string, Record<string, any>> = {};
  for (const fix of dateFixes) {
    if (!fixesByRecord[fix.id]) fixesByRecord[fix.id] = {};
    fixesByRecord[fix.id][fix.field] = fix.value;
  }

  // Apply date fixes with individual update() calls, low concurrency.
  const fixIds = Object.keys(fixesByRecord);
  const FIX_CONCURRENCY = 3;
  let fixApplied = 0;
  for (let i = 0; i < fixIds.length; i += FIX_CONCURRENCY) {
    const batch = fixIds.slice(i, i + FIX_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (rid) => {
        await base44.asServiceRole.entities[entityName].update(rid, fixesByRecord[rid]);
        return rid;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') fixApplied++;
    }
    if (i + FIX_CONCURRENCY < fixIds.length) {
      await new Promise((res) => setTimeout(res, 200));
    }
  }

  // Write snapshots in bulk so the next push sync doesn't see false conflicts.
  const snapshotBatchSize = 100;
  for (let i = 0; i < snapshotUpdates.length; i += snapshotBatchSize) {
    const batch = snapshotUpdates.slice(i, i + snapshotBatchSize);
    try {
      await base44.asServiceRole.entities[entityName].bulkUpdate(batch);
    } catch {
      // non-critical — snapshot is only for conflict detection
    }
  }

  // Preserve Base44 records whose linked Smartsheet row is missing.
  // A missing row can be caused by deletion, movement, API visibility, or a partial read;
  // flag it for review instead of mutating production data automatically.
  const smartsheetRowIds = new Set(allRows.map((r: any) => String(r.id)));
  const orphans = existingRecords.filter((r: any) => {
    const rowId = cleanText(r?.smartsheet_row_id, 40);
    return rowId && /^\d+$/.test(rowId) && !smartsheetRowIds.has(rowId) && !r.deleted;
  });
  const debugCounts = {
    existing_records: existingRecords.length,
    records_by_row_id: Object.keys(recordsByRowId).length,
    smartsheet_row_ids: smartsheetRowIds.size,
    orphan_candidates: orphans.length,
  };

  // Detect duplicate Base44 records that share a Smartsheet row ID, but never
  // delete or mutate them automatically. These are live WorkOrders and require
  // explicit human review before any cleanup decision.
  const recordsByRowIdList: Record<string, any[]> = {};
  for (const rec of existingRecords) {
    const rowId = cleanText(rec?.smartsheet_row_id, 40);
    if (rowId && /^\d+$/.test(rowId)) {
      if (!recordsByRowIdList[rowId]) recordsByRowIdList[rowId] = [];
      recordsByRowIdList[rowId].push(rec);
    }
  }
  const duplicateGroups = Object.entries(recordsByRowIdList)
    .filter(([, recs]) => recs.length > 1)
    .map(([rowId, recs]) => ({
      row_id: rowId,
      record_ids: recs.map((record: any) => record.id),
    }));
  debugCounts.duplicates_soft_deleted = 0;
  debugCounts.duplicate_groups_flagged_for_review = duplicateGroups.length;
  debugCounts.orphans_preserved_for_review = orphans.length;

  return {
    dataset,
    direction: 'pull',
    sheet_id: sheetId,
    rows_examined: allRows.length,
    records_examined: allRows.length,
    created: createdCount,
    updated: updatedCount,
    unchanged_skipped: unchangedSkipped,
    errors: errors.length,
    error_details: errors.slice(0, 10),
    orphans_soft_deleted: 0,
    orphans_flagged_for_review: orphans.length,
    orphan_record_ids: orphans.slice(0, 10).map((record: any) => record.id),
    duplicates_soft_deleted: 0,
    duplicate_groups_flagged_for_review: duplicateGroups.length,
    duplicate_groups: duplicateGroups.slice(0, 10),
    debug: debugCounts,
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
  const rawBindings = profile?.column_bindings && typeof profile.column_bindings === 'object' ? profile.column_bindings : {};
  const bindings = dataset === 'sales' ? filterSalesColumnBindings(rawBindings) : rawBindings;
  const boundColumnCount = Object.values(bindings).filter((id: any) => /^\d+$/.test(String(id).trim())).length;
  if (boundColumnCount === 0) {
    return { dataset, skipped: true, reason: 'No column bindings configured for this dataset.' };
  }

  // Load Base44 records for this dataset.
  let records: any[] = [];
  if (dataset === 'sales') {
    records = await base44.asServiceRole.entities.WorkOrder.filter({ in_pipeline: true }, '-updated_date', 500);
  } else {
    records = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.Order,
      sort: 'id',
      label: 'Order Form Smartsheet push Orders',
    });
  }
  records = (Array.isArray(records) ? records : []).filter((r: any) => !r?.deleted);

  if (dataset === 'orders') {
    const unresolved = records.filter(orderSmartsheetCreateNeedsReview);
    if (unresolved.length) return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${unresolved.length} Order Smartsheet create attempts require review before retry. No rows were written.`,
      create_attempts_need_review: unresolved.length,
      review_order_ids: unresolved.slice(0, 10).map((record: any) => record.id),
    };
  }

  const massLimit = Math.max(1, Number(globalConfig?.mass_change_limit_count) || 25);
  if (records.length > massLimit) {
    return {
      dataset,
      skipped: true,
      reason: `${records.length} records exceed the mass-change hard stop of ${massLimit}. Raise the limit or narrow the pipeline.`,
    };
  }

  // Stop before any Smartsheet write if existing Sales links have incomplete
  // snapshots. Legacy snapshots can predate the Est / Inv # mapping, and
  // treating a newly mapped field as locally authoritative could overwrite
  // working Smartsheet values. Reconcile these links through reviewed pull first.
  const snapshotReviewRecords = dataset === 'sales'
    ? records.filter((record: any) =>
        salesPushSnapshotNeedsReview(record, sheetId, buildSnapshot(record, bindings, 'sales')))
    : [];
  if (snapshotReviewRecords.length > 0) {
    return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${snapshotReviewRecords.length} linked Sales records have missing or outdated sync snapshots. Review and reconcile before Sales push. No rows were written.`,
      records_examined: records.length,
      snapshot_review_required: snapshotReviewRecords.length,
      created: 0, updated: 0, unchanged_skipped: 0, conflicts: 0, errors: 0,
      error_details: [], conflict_record_ids: [],
    };
  }

  // A linked Sales record whose mapped fields still match its last snapshot
  // needs no Smartsheet write or new Base44 sync timestamp. Preserve all
  // unmatched, changed, and unsnapshotted records for ordinary reconciliation.
  const pendingRecords = dataset === 'sales'
    ? records.filter((record: any) => !salesPushRecordUnchanged(record, sheetId, buildSnapshot(record, bindings, 'sales')))
    : records;
  const unchangedSkipped = records.length - pendingRecords.length;
  if (dataset === 'sales' && pendingRecords.length === 0) {
    return { dataset, sheet_id: sheetId, records_examined: records.length,
      created: 0, updated: 0, unchanged_skipped: unchangedSkipped,
      conflicts: 0, errors: 0, error_details: [], conflict_record_ids: [] };
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
  let requestorContactsSkippedNoEmail = 0;
  const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';

  for (const record of pendingRecords) {
    // Until the configured Date Received column type is independently verified,
    // do not send null over a text receipt choice (In Stock or a custom value).
    // Order pull can preserve that text; Order push must fail closed for it.
    if (dataset === 'orders' && record.receipt_option && !record.date_received) {
      errors.push(`${record.id}: Text received option requires verified Smartsheet column type before push. No row was written.`);
      continue;
    }
    // Preserve Smartsheet's contact when the stored Base44 email is missing or malformed.
    if (sharedContactId && (record.requestor_name || record.requestor_email) &&
        !isValidContactEmail(record.requestor_email)) requestorContactsSkippedNoEmail++;
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
          if (detectConflict(currentCells, record.smartsheet_sync_snapshot, bindings, dataset)) {
            conflicts.push(record.id);
            continue;
          }
        }
        await smartsheetWrite('PUT', `/sheets/${sheetId}/rows`, token, [{
          id: existingRowId,
          cells: cells.map((c) => ({ columnId: c.columnId, value: c.value, ...(c.displayValue ? { displayValue: c.displayValue } : {}) })),
        }]);
        updated.push(record.id);
      } else if (dataset === 'orders') {
        // Reserve the permanent Order before POST; never automatically retry an
        // uncertain create or silently create a second row for an existing link.
        await createOrderSmartsheetRowWithGuard({
          entity: base44.asServiceRole.entities.Order,
          record,
          sheetId,
          postRow: async (freshOrder: any) => {
            const freshCells = buildCells(freshOrder, bindings, 'orders');
            if (freshCells.length === 0) throw new Error('Order has no mapped Smartsheet cells.');
            const result = await smartsheetWrite('POST', `/sheets/${sheetId}/rows`, token, [{
              toTop: true,
              cells: freshCells.map((c) => ({ columnId: c.columnId, value: c.value,
                ...(c.displayValue ? { displayValue: c.displayValue } : {}) })),
            }]);
            return result.body;
          },
          makeSnapshot: (freshOrder: any) => buildSnapshot(freshOrder, bindings, 'orders'),
        });
        created.push(record.id); // helper already stored and verified link + snapshot atomically
        continue;
      } else {
        // Preserve the existing Sales creation flow; Order guards are isolated.
        const result = await smartsheetWrite('POST', `/sheets/${sheetId}/rows`, token, [{
          toTop: true,
          cells: cells.map((c) => ({ columnId: c.columnId, value: c.value, ...(c.displayValue ? { displayValue: c.displayValue } : {}) })),
        }]);
        const newRowId = String(result?.body?.result?.id || result?.body?.id || '');
        if (newRowId && /^\d+$/.test(newRowId)) {
          await base44.asServiceRole.entities.WorkOrder.update(record.id, {
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
    ...(dataset === 'sales' ? { unchanged_skipped: unchangedSkipped } : {}),
    conflicts: conflicts.length,
    errors: errors.length,
    error_details: errors.slice(0, 10),
    conflict_record_ids: conflicts.slice(0, 10),
    ...(dataset === 'orders' ? { requestor_contacts_skipped_no_valid_email: requestorContactsSkippedNoEmail } : {}),
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
    } else if (action !== 'run_sync' && action !== 'push_dataset' && action !== 'pull_dataset' && action !== 'debug_dates') {
      return Response.json({ success: false, error: 'Admin session is required for this action.' }, { status: 403 });
    }

    if (action === 'status') {
      return Response.json({
        success: true,
        configured,
        read_only: false,
        secret_name: TOKEN_SECRET_NAME,
        api_base_url: API_BASE,
        supported_actions: ['status', 'test_connection', 'list_sheets', 'sheet_columns', 'sheet_rows', 'preview_sales_est_inv_snapshot', 'audit_order_requestor_emails', 'audit_order_create_attempts', 'run_sync', 'push_dataset', 'pull_dataset'],
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

    if (action === 'preview_sales_est_inv_snapshot') {
      // Admin-session-only diagnostic. This does not run sync or write records,
      // and remains available while the global sync kill switch is OFF.
      const { config } = await loadSyncConfig(base44);
      const profile = config?.sales || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const bindings = filterSalesColumnBindings(profile?.column_bindings || {});
      const columnId = String(bindings.est_inv_at || '');
      if (!/^\d+$/.test(sheetId) || !/^\d+$/.test(columnId)) {
        return Response.json({ success: false, error: 'A verified Sales sheet and Est / Inv # binding are required.' }, { status: 400 });
      }
      // Match the CURRENT Sales push window exactly; never describe the sample
      // as complete coverage of the entire historic WorkOrder archive.
      const raw = await base44.asServiceRole.entities.WorkOrder.filter({ in_pipeline: true }, '-updated_date', 500);
      if (!Array.isArray(raw)) throw new Error('Sales snapshot preview could not verify its read window.');
      const records = raw.filter((r: any) => !r?.deleted);
      const candidates = records.filter((record: any) => {
        const rowId = String(record?.smartsheet_row_id ?? '').trim();
        const prior = record?.smartsheet_sync_snapshot;
        return record?.smartsheet_sheet_id === sheetId && /^\d+$/.test(rowId) &&
          (!prior || typeof prior !== 'object' || Array.isArray(prior) ||
            !Object.prototype.hasOwnProperty.call(prior, columnId));
      });
      const limit = Math.max(1, Math.min(25, Math.floor(Number(body?.sample_size) || 20)));
      const offset = Math.max(0, Math.min(499, Math.floor(Number(body?.sample_offset) || 0)));
      const sample = candidates.slice(offset, offset + limit);
      if (sample.length === 0) {
        return Response.json({
          success: true, read_only: true, dataset: 'sales', sheet_id: sheetId,
          field: 'est_inv_at', column_id: columnId,
          push_window_examined: records.length, candidate_count_in_push_window: candidates.length,
          sample_offset: offset, sample_size: 0,
          next_sample_offset: null, sample_is_complete_archive: false,
          summary: {}, cases: [],
        });
      }
      const requestedIds = [...new Set(sample.map((record: any) => String(record.smartsheet_row_id)))];
      const params = new URLSearchParams({
        rowIds: requestedIds.join(','), columnIds: columnId, exclude: 'nonexistentCells',
      });
      const result = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
      // An absent selected column is NOT evidence of a blank cell. Validate
      // the actual sheet/column metadata before classifying any remote value.
      const verifiedColumn = verifiedSalesPreviewColumn(result.body?.columns, columnId);
      if (!Array.isArray(result.body?.rows) || String(result.body?.id ?? '') !== sheetId || !verifiedColumn) {
        throw Object.assign(new Error('Smartsheet did not verify the configured Est / Inv # column. No comparison was accepted.'), { status: 502 });
      }
      const sheetRows = normalizeSheetRows(result.body);
      const requested = new Set(requestedIds);
      if (sheetRows.some((row: any) => !requested.has(row.id)) ||
          new Set(sheetRows.map((row: any) => row.id)).size !== sheetRows.length) {
        throw Object.assign(new Error('Smartsheet returned unexpected or duplicate rows.'), { status: 502 });
      }
      const byId = new Map(sheetRows.map((row: any) => [row.id, row]));
      const linkCounts: Record<string, number> = {};
      for (const record of records) {
        const rowId = String(record?.smartsheet_row_id ?? '').trim();
        if (record?.smartsheet_sheet_id === sheetId && /^\d+$/.test(rowId)) {
          linkCounts[rowId] = (linkCounts[rowId] || 0) + 1;
        }
      }
      const summary: Record<string, number> = {};
      const cases = sample.map((record: any) => {
        const rowId = String(record.smartsheet_row_id);
        const remote = byId.get(rowId) as any;
        const cell = remote?.cells?.find((entry: any) => entry.column_id === columnId);
        const remoteValue = cell ? (cell.display_value || cell.value) : null;
        const comparison = classifySalesEstInvPreview(record.est_inv_at, remoteValue, Boolean(remote));
        const duplicateLinkInWindow = (linkCounts[rowId] || 0) > 1;
        summary[comparison] = (summary[comparison] || 0) + 1;
        return {
          workorder_id: record.id, smartsheet_row_id: rowId,
          client_name: cleanText(record.client_name, 180),
          base44_est_inv_at: cleanText(record.est_inv_at, 160),
          smartsheet_est_inv_at: remote ? cleanText(remoteValue, 160) : null,
          comparison, duplicate_link_in_push_window: duplicateLinkInWindow,
          review_required: true,
        };
      });
      return Response.json({
        success: true, read_only: true, dataset: 'sales', sheet_id: sheetId,
        field: 'est_inv_at', column_id: columnId,
        verified_column_title: verifiedColumn.title,
        push_window_examined: records.length, push_window_limit: 500,
        candidate_count_in_push_window: candidates.length,
        sample_offset: offset, sample_size: cases.length,
        next_sample_offset: offset + cases.length < candidates.length ? offset + cases.length : null,
        sample_is_complete_archive: false, summary, cases,
      });
    }

    if (action === 'audit_order_create_attempts') {
      // Admin-session-only evidence review. No sync, marker clearing, POST or production writes.
      const { config } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const evidenceColumnId = [profile?.column_bindings?.customer_name,
        sharedOrderRequestorColumnId(profile?.column_bindings)]
        .map((value: unknown) => cleanText(value, 40))
        .find((value: string) => /^\d+$/.test(value));
      if (!/^\d+$/.test(sheetId) || !evidenceColumnId) {
        return Response.json({
          success: false,
          error: 'Order Request needs a permanent sheet ID and at least one valid column ID for safe row-ID evidence.',
        }, { status: 400 });
      }
      const allOrders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        sort: 'id',
        label: 'Order Form create-attempt read-only audit',
      });
      const hasMarkers = allOrders.some((order: any) => Boolean(order?.smartsheet_create_attempt));
      const sheetRows: any[] = [];
      let sheetVersion: number | null = null;
      if (hasMarkers) {
        const pageSize = 200;
        const guard = createSmartsheetOrderPageGuard({ pageSize, maxPages: 100 });
        for (let page = 1; page <= 100; page++) {
          const params = new URLSearchParams({
            page: String(page), pageSize: String(pageSize),
            columnIds: evidenceColumnId, exclude: 'nonexistentCells',
          });
          const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
          verifyOrderCreateAuditSheetIdentity(result.body, sheetId);
          const rows = normalizeSheetRows(result.body);
          const complete = guard.accept(page, result.body, rows);
          if (page === 1) sheetVersion = result.body.version;
          sheetRows.push(...rows);
          if (complete) break;
        }
        guard.assertComplete(); // Never label a row missing based on a partial or moving download.
      }
      const audit = auditOrderCreateAttempts(allOrders, sheetRows, sheetId);
      return Response.json({
        success: true, ...audit,
        sheet_version: sheetVersion,
        sheet_download_verified: hasMarkers,
        evidence_scope: hasMarkers ? 'complete_configured_sheet' : 'no_attempt_markers',
      });
    }

    if (action === 'audit_order_requestor_emails') {
      // Admin-only, read-only comparison. Safe while sync is disabled or in observation mode.
      // Never infer a repair from a matching name alone; permanent row IDs must agree.
      const { config } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const contactColumnId = sharedOrderRequestorColumnId(profile?.column_bindings);
      if (!/^\d+$/.test(sheetId) || !contactColumnId) {
        return Response.json({
          success: false,
          error: 'Order Form needs a permanent sheet ID and a shared Requestor contact-column binding.',
        }, { status: 400 });
      }

      const linkedOrders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { smartsheet_sheet_id: sheetId },
        sort: 'id',
        label: 'Order Form read-only contact audit',
      });
      const sheetRows: any[] = [];
      const pageSize = 200;
      const guard = createSmartsheetOrderPageGuard({ pageSize, maxPages: 100 });
      for (let page = 1; page <= 100; page++) {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          columnIds: contactColumnId,
          exclude: 'nonexistentCells',
        });
        const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
        const rows = normalizeSheetRows(result.body);
        const complete = guard.accept(page, result.body, rows);
        sheetRows.push(...rows);
        if (complete) break;
      }
      guard.assertComplete(); // Never report candidates from partial or moving-sheet reads.
      const audit = auditOrderRequestorContacts(linkedOrders, sheetRows, contactColumnId);
      return Response.json({ success: true, sheet_id: sheetId, ...audit });
    }

    if (action === 'debug_dates') {
      // Diagnostic: fetch raw Smartsheet cells for date columns and compare with Base44.
      const { config } = await loadSyncConfig(base44);
      if (!config) {
        return Response.json({ success: false, error: 'No sync config.' }, { status: 400 });
      }
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const bindings = profile?.column_bindings || {};
      const dateOrderedCol = String(bindings?.date_ordered || '').trim();
      const dateReceivedCol = String(bindings?.date_received || '').trim();
      const columnIds = [dateOrderedCol, dateReceivedCol].filter((id: string) => /^\d+$/.test(id));
      if (!columnIds.length) {
        return Response.json({ success: false, error: 'No date column bindings.' }, { status: 400 });
      }
      // Fetch all rows with only the date columns
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
      // Load Base44 records (non-deleted only)
      const rawRecords = await base44.asServiceRole.entities.Order.filter({ smartsheet_sheet_id: sheetId }, '-updated_date', 5000);
      const existingRecords = (Array.isArray(rawRecords) ? rawRecords : []).filter((r: any) => !r?.deleted);
      const recordsByRowId: Record<string, any> = {};
      for (const rec of existingRecords) {
        const rowId = cleanText(rec?.smartsheet_row_id, 40);
        if (rowId) recordsByRowId[rowId] = rec;
      }
      // Compare
      const parseDate = (v: any) => {
        const raw = String(v ?? '').trim();
        if (!raw) return null;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
      };
      const discrepancies: any[] = [];
      let ssHasOrderedB44Missing = 0;
      let ssHasReceivedB44Missing = 0;
      let matchedCount = 0;
      let unmatchedCount = 0;
      let b44HasReceivedButSsMissing = 0;
      for (const row of allRows) {
        const rec = recordsByRowId[row.id];
        if (!rec) { unmatchedCount++; continue; }
        matchedCount++;
        const orderedCell = row.cells.find((c: any) => c.column_id === dateOrderedCol);
        const receivedCell = row.cells.find((c: any) => c.column_id === dateReceivedCol);
        const ssOrdered = orderedCell?.value ?? orderedCell?.display_value ?? null;
        const ssReceived = receivedCell?.value ?? receivedCell?.display_value ?? null;
        const ssOrderedParsed = ssOrdered ? parseDate(ssOrdered) : null;
        const ssReceivedParsed = ssReceived ? parseDate(ssReceived) : null;
        if (ssOrderedParsed && !rec.date_ordered) ssHasOrderedB44Missing++;
        if (ssReceivedParsed && !rec.date_received) ssHasReceivedB44Missing++;
        if ((ssOrderedParsed && !rec.date_ordered) || (ssReceivedParsed && !rec.date_received)) {
          discrepancies.push({
            row_id: row.id,
            customer: rec.customer_name,
            b44_ordered: rec.date_ordered,
            b44_received: rec.date_received,
            ss_ordered_raw: ssOrdered,
            ss_ordered_parsed: ssOrderedParsed,
            ss_received_raw: ssReceived,
            ss_received_parsed: ssReceivedParsed,
          });
        }
      }
      // Also fetch ALL columns to verify the bindings point to the right columns
      const colResult = await smartsheetGet(`/sheets/${sheetId}/columns?includeAll=true`, token);
      const allColumns = (Array.isArray(colResult.body?.data) ? colResult.body.data : []).map((c: any) => ({
        id: String(c?.id ?? ''),
        title: cleanText(c?.title, 300),
        type: cleanText(c?.type, 80),
      })).filter((c: any) => c.id);
      // Count how many Smartsheet rows have values in the date columns
      let ssRowsWithOrdered = 0;
      let ssRowsWithReceived = 0;
      let ssRowsWithValidOrderedDate = 0;
      let ssRowsWithValidReceivedDate = 0;
      const nonDateValues: Record<string, string[]> = { ordered: {}, received: {} };
      for (const row of allRows) {
        const orderedCell = row.cells.find((c: any) => c.column_id === dateOrderedCol);
        const receivedCell = row.cells.find((c: any) => c.column_id === dateReceivedCol);
        const orderedRaw = orderedCell?.value ?? orderedCell?.display_value;
        const receivedRaw = receivedCell?.value ?? receivedCell?.display_value;
        if (orderedRaw) ssRowsWithOrdered++;
        if (receivedRaw) ssRowsWithReceived++;
        const orderedParsed = orderedRaw ? parseDate(orderedRaw) : null;
        const receivedParsed = receivedRaw ? parseDate(receivedRaw) : null;
        if (orderedParsed) ssRowsWithValidOrderedDate++;
        if (receivedParsed) ssRowsWithValidReceivedDate++;
        // Track non-date values
        if (orderedRaw && !orderedParsed) {
          const key = String(orderedRaw).slice(0, 50);
          nonDateValues.ordered[key] = (nonDateValues.ordered[key] || 0) + 1;
        }
        if (receivedRaw && !receivedParsed) {
          const key = String(receivedRaw).slice(0, 50);
          nonDateValues.received[key] = (nonDateValues.received[key] || 0) + 1;
        }
      }
      return Response.json({
        success: true,
        total_smartsheet_rows: allRows.length,
        matched_count: matchedCount,
        unmatched_count: unmatchedCount,
        b44_records_total: existingRecords.length,
        ss_rows_with_ordered: ssRowsWithOrdered,
        ss_rows_with_received: ssRowsWithReceived,
        ss_rows_with_valid_ordered_date: ssRowsWithValidOrderedDate,
        ss_rows_with_valid_received_date: ssRowsWithValidReceivedDate,
        non_date_values_ordered: nonDateValues.ordered,
        non_date_values_received: nonDateValues.received,
        ss_has_ordered_b44_missing: ssHasOrderedB44Missing,
        ss_has_received_b44_missing: ssHasReceivedB44Missing,
        discrepancy_count: discrepancies.length,
        discrepancies: discrepancies.slice(0, 20),
        bound_date_ordered_col: { id: dateOrderedCol, title: allColumns.find((c: any) => c.id === dateOrderedCol)?.title, type: allColumns.find((c: any) => c.id === dateOrderedCol)?.type },
        bound_date_received_col: { id: dateReceivedCol, title: allColumns.find((c: any) => c.id === dateReceivedCol)?.title, type: allColumns.find((c: any) => c.id === dateReceivedCol)?.type },
        all_date_columns: allColumns.filter((c: any) => c.type === 'DATE' || c.title?.toLowerCase().includes('date') || c.title?.toLowerCase().includes('ordered') || c.title?.toLowerCase().includes('received')),
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

        let activeDirection: 'pull' | 'push' | null = null;
        try {
          if (wantPull) {
            activeDirection = 'pull';
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
            results.push(dataset === 'sales' ? { ...pullResult, direction: 'pull' } : pullResult);
            completedSteps++;
          }
          if (wantPush) {
            activeDirection = 'push';
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
            results.push(dataset === 'sales' ? { ...pushResult, direction: 'push' } : pushResult);
            completedSteps++;
          }
        } catch (err) {
          results.push({ dataset, ...(dataset === 'sales' && activeDirection ? { direction: activeDirection } : {}), skipped: true, reason: (err as any)?.message || 'Sync failed.' });
          completedSteps++;
        }
      }

      const salesNeedsReview = salesRunRequiresReview(results);
      await saveSyncStatus(base44, {
        status: salesNeedsReview ? 'needs_review' : 'completed',
        needs_review: salesNeedsReview,
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
        sync_complete: !salesNeedsReview,
        needs_review: salesNeedsReview,
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