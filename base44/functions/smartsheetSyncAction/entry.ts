import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { normalizeSalesNumber } from '../../shared/smartsheetSalesNumberBackfill.mjs';
import { createSmartsheetOrderPageGuard } from '../../shared/smartsheetOrderPageGuard.mjs';
import { createVerifiedOrderSheetBackup } from '../../shared/smartsheetOrderPrewriteBackup.mjs';
import { summarizeOrderBackupReadiness } from '../../shared/smartsheetOrderBackupReadiness.mjs';
import { isValidContactEmail, sharedOrderRequestorColumnId } from '../../shared/smartsheetOrderContact.mjs';
import { auditOrderRequestorContacts } from '../../shared/smartsheetOrderContactAudit.mjs';
import { createOrderSmartsheetRowWithGuard, orderSmartsheetCreateNeedsReview } from '../../shared/smartsheetOrderCreateSafety.mjs';
import { orderStatusFromPulledDates } from '../../shared/smartsheetOrderReceivedState.mjs';
import { auditOrderCreateAttempts, verifyOrderCreateAuditSheetIdentity } from '../../shared/smartsheetOrderCreateReview.mjs';
import { auditOrderDateParity, orderDateOptionField } from '../../shared/smartsheetOrderDateTranslation.mjs';
import { changedPulledOrderDates, verifyPulledOrderDates } from '../../shared/smartsheetOrderDatePersistence.mjs';
import { orderRunRequiresReview } from '../../shared/smartsheetOrderRunSafety.mjs';
import { findUnverifiedOrderSyncMetadata } from '../../shared/smartsheetOrderMetadataVerification.mjs';
import { orderPulledFieldsUnchanged, orderPullSnapshotAligned } from '../../shared/smartsheetOrderPullSafety.mjs';
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

  let orderUnlinkedRowCount = 0;
  let orderUnlinkedRowIds: string[] = [];
  // Order-only date preflight: do not mutate any Order if a legacy cell has
  // an untranslatable date or a duplicate permanent Base44 row link.
  // A received text choice is valid; an impossible date is not.
  if (dataset === 'orders') {
    const audit = auditOrderDateParity(existingRecords, allRows, bindings, sheetId);
    orderUnlinkedRowCount = audit.counts.unlinked_smartsheet_rows;
    orderUnlinkedRowIds = audit.samples.unlinked_rows.map((sample: any) => sample.row_id);
    if (audit.counts.invalid_date_values || audit.counts.duplicate_base44_links) {
      return { dataset, direction: 'pull', sheet_id: sheetId, skipped: true,
        reason: 'Order Request date translation or permanent row links require review before pull. No Orders were changed.',
        date_translation_invalid: audit.counts.invalid_date_values,
        duplicate_order_row_links: audit.counts.duplicate_base44_links,
        unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount,
        unlinked_row_ids: orderUnlinkedRowIds,
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
      // A verified nonempty text option explicitly replaces a stale paired date.
      if (dataset === 'orders' && ['date_needed', 'date_ordered', 'date_received'].includes(key) && val === '') {
        const optionField = orderDateOptionField(key);
        if (optionField && rawFields[optionField]) {
          fieldValues[key] = '';
          continue;
        }
      }
      // A real date must also clear an old text choice (ASAP, N/A, Stock,
      // etc.). Generic normalization drops empty strings, so handle this
      // paired clear explicitly before normalizing the remaining fields.
      if (dataset === 'orders' && val === '') {
        const dateField = ['date_needed', 'date_ordered', 'date_received']
          .find(candidate => orderDateOptionField(candidate) === key);
        if (dateField && rawFields[dateField]) {
          fieldValues[key] = '';
          continue;
        }
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
      if (dataset === 'orders') {
        const expectedOrderSnapshot = buildSnapshot({ ...existing, ...fieldValues }, bindings, 'orders');
        if (orderPulledFieldsUnchanged(existing, fieldValues) &&
            orderPullSnapshotAligned(existing, expectedOrderSnapshot)) {
          unchangedSkipped++;
          continue;
        }
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
  // 1. bulkUpdate for all fields (fast, no rate limits) — but it can silently
  //    drop Order dates or their companion text choices.
  // 2. Order-only verified read-back repairs changed date and text-option
  //    fields before advancing the sync snapshot. Existing Sales behavior
  //    remains unchanged.
  const snapshotUpdates: any[] = [];
  const orderDateVerifications: any[] = [];
  const bulkBatchSize = 100;
  for (let i = 0; i < toUpdate.length; i += bulkBatchSize) {
    const batch = toUpdate.slice(i, i + bulkBatchSize);
    const payload = batch.map(({ id, _existing, ...fields }: any) => {
      const { smartsheet_last_synced_at, ...withoutUnverifiedTimestamp } = fields;
      return { id, ...(dataset === 'orders' ? withoutUnverifiedTimestamp : fields) };
    });
    try {
      await base44.asServiceRole.entities[entityName].bulkUpdate(payload);
      updatedCount += payload.length;
      for (const rec of batch) {
        if (rec._existing) {
          const { id, _existing, ...fields } = rec;
          const merged = { ..._existing, ...fields };
          const snapshot = buildSnapshot(merged, bindings, dataset);
          if (dataset === 'orders') {
            const changes = changedPulledOrderDates(_existing, fields);
            if (Object.keys(changes).length) {
              orderDateVerifications.push({ id, previous: _existing, changes, snapshot });
            } else snapshotUpdates.push({ id, smartsheet_sync_snapshot: snapshot,
              smartsheet_last_synced_at: new Date().toISOString() });
          } else snapshotUpdates.push({ id, smartsheet_sync_snapshot: snapshot });
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
    if (dataset === 'orders') continue; // Verified read-back replaces blind Order date fixes.
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

  // Order-only read-after-write: Base44 bulkUpdate may acknowledge dates or
  // text choices that it omitted. Repair only fields whose previous value
  // remains safe, verify the permanent Order, then record sync evidence.
  if (dataset === 'orders') {
    for (const item of orderDateVerifications) {
      try {
        await verifyPulledOrderDates(base44.asServiceRole.entities.Order, item.id, item.previous, item.changes);
        snapshotUpdates.push({ id: item.id, smartsheet_sync_snapshot: item.snapshot,
          smartsheet_last_synced_at: new Date().toISOString() });
      } catch (error: any) {
        errors.push(`Order ${item.id} date/text verification: ${error?.message || 'unknown error'}. Snapshot not advanced.`);
        updatedCount--;
      }
    }
  }

  // Order sync metadata is part of verified success, not a best-effort log.
  // Failed batches may have applied fields or some metadata: report them for
  // review rather than falsely declaring every Order fully synchronized.
  let snapshotWriteFailures = 0;
  const verifiedMetadataExpected: any[] = [];
  const snapshotBatchSize = 100;
  for (let i = 0; i < snapshotUpdates.length; i += snapshotBatchSize) {
    const batch = snapshotUpdates.slice(i, i + snapshotBatchSize);
    try {
      await base44.asServiceRole.entities[entityName].bulkUpdate(batch);
      if (dataset === 'orders') verifiedMetadataExpected.push(...batch);
    } catch (error: any) {
      if (dataset === 'orders') {
        snapshotWriteFailures += batch.length;
        updatedCount = Math.max(0, updatedCount - batch.length);
        errors.push(`Order sync metadata was not confirmed for ${batch.length} records (IDs: ${batch.slice(0, 5).map((row: any) => row.id).join(', ')}). Review before treating this pull as complete: ${error?.message || 'unknown error'}`);
      }
      // Preserve the existing Sales metadata behavior (separate project).
    }
  }

  // Order-only read-after-write for reconciliation metadata. Base44 bulkUpdate
  // has previously acknowledged writes while silently omitting individual
  // fields, so the snapshot/timestamp must be re-read before success is final.
  if (dataset === 'orders' && verifiedMetadataExpected.length) {
    try {
      const metadataRows = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { smartsheet_sheet_id: sheetId },
        sort: 'id',
        label: 'Order Form sync metadata verification',
      });
      const metadataFailures = findUnverifiedOrderSyncMetadata(
        verifiedMetadataExpected,
        metadataRows.filter((record: any) => !record?.deleted),
      );
      if (metadataFailures.length) {
        snapshotWriteFailures += metadataFailures.length;
        updatedCount = Math.max(0, updatedCount - metadataFailures.length);
        errors.push(
          `Order sync metadata read-back failed for ${metadataFailures.length} records ` +
          `(IDs: ${metadataFailures.slice(0, 5).map((item: any) => item.id || 'unknown').join(', ')}). ` +
          `Snapshot/timestamp was not verified; review before treating this pull as complete.`
        );
      }
    } catch (error: any) {
      snapshotWriteFailures += verifiedMetadataExpected.length;
      updatedCount = Math.max(0, updatedCount - verifiedMetadataExpected.length);
      errors.push(
        `Order sync metadata could not be re-read for ${verifiedMetadataExpected.length} records. ` +
        `Review before treating this pull as complete: ${error?.message || 'unknown error'}`
      );
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
    records_examined: dataset === 'orders' ? existingRecords.length : allRows.length,
    ...(dataset === 'orders' ? {
      // A bulk-create ACK does not prove the exact permanent links were saved.
      // Keep originally unlinked rows visible for admin review; never delete
      // or recreate them merely to make the row counts agree.
      unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount,
      unlinked_row_ids: orderUnlinkedRowIds,
    } : {}),
    created: createdCount,
    updated: updatedCount,
    unchanged_skipped: unchangedSkipped,
    ...(dataset === 'orders' ? { snapshot_write_failures: snapshotWriteFailures } : {}),
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

  // Order-only: a successful BackupLog without any saved sheet bytes is not
  // a backup. Read every Smartsheet page, persist a private Google Drive JSON
  // snapshot and read the exact file back before writing ANY Order row.
  // The legacy Sales backup path remains unchanged (outside Order scope).
  if (dataset === 'orders' && globalConfig?.backup_before_write) {
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('googledrive');
      const driveToken = cleanText(connection?.accessToken, 8000);
      if (!driveToken) throw new Error('Google Drive backup is not connected. No Order rows were written.');
      const driveFetch = async (url: string, init: any) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = await fetch(url, { ...init, signal: controller.signal,
            headers: { Authorization: `Bearer ${driveToken}`, ...(init?.headers || {}) } });
          if (!response.ok) throw new Error(`Google Drive backup verification returned HTTP ${response.status}.`);
          return response;
        } finally { clearTimeout(timeout); }
      };
      await createVerifiedOrderSheetBackup({
        sheetId,
        readPage: async (page: number, pageSize: number) =>
          (await smartsheetGet(`/sheets/${sheetId}?page=${page}&pageSize=${pageSize}`, token)).body,
        verifySource: async () =>
          (await smartsheetGet(`/sheets/${sheetId}?page=1&pageSize=1`, token)).body,
        upload: async ({ filename, content }: any) => {
          const boundary = `ccsOrderBackup${crypto.randomUUID().replace(/-/g, '')}`;
          const metadata = { name: filename, mimeType: 'application/json',
            description: 'CCS Order Request pre-sync row/column backup (attachments excluded)' };
          const multipart = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            JSON.stringify(metadata),
            `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            content, `\r\n--${boundary}--\r\n`,
          ]);
          const response = await driveFetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size',
            { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
          return await response.json();
        },
        readBack: async (id: string) =>
          await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
            { method: 'GET' })).text(),
        log: async (backup: any) => {
          const savedLog = await base44.asServiceRole.entities.BackupLog.create({
            backup_type: 'scheduled',
            data_types: [`smartsheet_orders_sheet_${sheetId}`],
            results: [{ type: 'smartsheet_orders',
              filename: `${backup.filename} [Google Drive ID: ${backup.drive_file_id}]`, success: true }],
            success_count: 1, error_count: 0, triggered_by: 'smartsheet_order_prewrite',
          });
          if (!savedLog?.id) throw new Error('Order backup file was verified but its BackupLog record was not confirmed.');
        }
      });
    } catch (err) {
      return { dataset, direction: 'push', sheet_id: sheetId, skipped: true,
        reason: `Recoverable Order backup could not be verified; no Smartsheet rows were written: ${(err as any)?.message || 'unknown error'}`,
        records_examined: records.length, created: 0, updated: 0, conflicts: 0,
        errors: 0, error_details: [], conflict_record_ids: [] };
    }
  } else if (dataset === 'sales' && globalConfig?.backup_before_write) {
    // Preserve existing Sales Pipeline behavior; audited in its own project.
    try {
      const backupResult = await smartsheetGet(`/sheets/${sheetId}?pageSize=200`, token);
      const backupRows = normalizeSheetRows(backupResult.body);
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'scheduled',
        data_types: [`smartsheet_${dataset}_sheet_${sheetId}`],
        results: [{ type: `smartsheet_${dataset}`,
          filename: `sheet_${sheetId}_pre_sync_${new Date().toISOString()}`, success: true }],
        success_count: 1, error_count: 0, triggered_by: 'smartsheet_sync',
      });
      void backupRows;
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
    if (dataset === 'orders' && (
      (record.date_needed_option && !record.date_needed) ||
      (record.date_ordered_option && !record.date_ordered) ||
      (record.receipt_option && !record.date_received)
    )) {
      errors.push(`${record.id}: Text date option requires verified Smartsheet column type before push. No row was written.`);
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

    // A missing session is not proof of a trusted scheduled workflow. Only
    // the exact scheduled run_sync action with its workflow-only capability
    // may run without an authenticated admin session. Dataset actions never do.
    const hasSessionToken = Boolean(String(body?.session_token || '').trim());
    const scheduledRun = !hasSessionToken && action === 'run_sync' &&
      await hasWorkflowInvocationCapability(body, 'smartsheetSyncAction');
    let adminActor: any = null;
    if (hasSessionToken) {
      const actor = await authenticateSignShopSession(base44, body?.session_token);
      if (actor?.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      }
      adminActor = actor;
    } else if (!scheduledRun) {
      return Response.json({ success: false, error: 'Admin session or verified scheduled workflow is required.' }, { status: 403 });
    }

    if (action === 'status') {
      return Response.json({
        success: true,
        configured,
        read_only: false,
        secret_name: TOKEN_SECRET_NAME,
        api_base_url: API_BASE,
        supported_actions: ['status', 'test_connection', 'list_sheets', 'sheet_columns', 'sheet_rows', 'preview_sales_est_inv_snapshot', 'apply_sales_est_inv_backfill', 'audit_order_requestor_emails', 'audit_order_create_attempts', 'audit_order_dates', 'audit_order_backup_readiness', 'run_sync', 'push_dataset', 'pull_dataset'],
        write_actions_available: true,
      });
    }

    if (action === 'audit_order_backup_readiness') {
      // Order Form administrator-only diagnostic. Google Drive calls below
      // are GET metadata/list operations; no backup upload or sync is run.
      const { config } = await loadSyncConfig(base44);
      const sheetId = cleanText(config?.orders?.smartsheet_sheet_id, 40);
      let driveApiRead = false;
      let driveListRead = false;
      let backupFiles: any[] = [];
      try {
        const connection = await base44.asServiceRole.connectors.getConnection('googledrive');
        const driveToken = cleanText(connection?.accessToken, 8000);
        if (driveToken) {
          const driveRead = async (url: string) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15_000);
            try {
              const response = await fetch(url, {
                method: 'GET',
                headers: { Authorization: `Bearer ${driveToken}`, Accept: 'application/json' },
                signal: controller.signal,
              });
              if (!response.ok) throw new Error('Google Drive read-only API check failed.');
              return await response.json();
            } finally {
              clearTimeout(timeout);
            }
          };
          const about = await driveRead('https://www.googleapis.com/drive/v3/about?fields=kind');
          driveApiRead = about?.kind === 'drive#about';
          if (driveApiRead && /^\d+$/.test(sheetId)) {
            const prefix = `CCS_OrderRequest_${sheetId}_pre_sync_`;
            const params = new URLSearchParams({
              q: `trashed = false and name contains '${prefix}'`,
              fields: 'nextPageToken,files(id,name,mimeType,size)',
              pageSize: '20', orderBy: 'createdTime desc',
            });
            const listing = await driveRead(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
            driveListRead = Array.isArray(listing?.files);
            backupFiles = driveListRead ? listing.files : [];
          }
        }
      } catch {
        // Connectivity or permission failures are reported as NOT READY.
        // Do not expose OAuth credentials, raw provider payloads or account data.
      }
      const readiness = summarizeOrderBackupReadiness({
        backupEnabled: config?.backup_before_write === true,
        sheetId, smartsheetConfigured: configured, driveApiRead, driveListRead,
        files: backupFiles, checkedAt: new Date().toISOString(),
      });
      return Response.json({
        success: true, ...readiness,
        order_push_enabled: config?.orders?.push_enabled === true,
        order_mirror_enabled: config?.orders?.mirror_enabled === true,
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
          (!String(record?.est_inv_at ?? '').trim() || !prior || typeof prior !== 'object' ||
            Array.isArray(prior) || !Object.prototype.hasOwnProperty.call(prior, columnId));
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
          summary: {}, potential_five_digit_backfill_in_sample: 0, cases: [],
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
        // A numeric TEXT_NUMBER cell can lack displayValue. Use the verified
        // five-digit display when available, otherwise the fixed Sales parser.
        const parsed = remote ? parseRowToFields(remote, { est_inv_at: columnId }, 'sales') : {};
        const remoteValue = cell && normalizeSalesNumber(cell.display_value)
          ? normalizeSalesNumber(cell.display_value) : (parsed.est_inv_at ?? null);
        const comparison = classifySalesEstInvPreview(record.est_inv_at, remoteValue, Boolean(remote));
        const duplicateLinkInWindow = (linkCounts[rowId] || 0) > 1;
        const fiveDigitNumber = normalizeSalesNumber(remoteValue);
        const potentialNumberToFill = comparison === 'smartsheet_only' && !!fiveDigitNumber &&
          !duplicateLinkInWindow ? fiveDigitNumber : null;
        summary[comparison] = (summary[comparison] || 0) + 1;
        return {
          workorder_id: record.id, smartsheet_row_id: rowId,
          client_name: cleanText(record.client_name, 180),
          base44_est_inv_at: cleanText(record.est_inv_at, 160),
          smartsheet_est_inv_at: remote ? cleanText(remoteValue, 160) : null,
          comparison, duplicate_link_in_push_window: duplicateLinkInWindow,
          potential_number_to_fill: potentialNumberToFill,
          full_link_verification_required: !!potentialNumberToFill,
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
        sample_is_complete_archive: false, summary,
        potential_five_digit_backfill_in_sample: cases.filter((entry: any) => !!entry.potential_number_to_fill).length,
        cases,
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

    if (action === 'audit_order_dates') {
      // Admin-only and read-only. Check the actual column types, parse each
      // permanent row ID with strict calendar rules and report discrepancies.
      // This action never enables sync or writes any production data.
      const { config } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const bindings = profile?.column_bindings || {};
      const dateFields = ['date_needed', 'date_ordered', 'date_received'];
      const requested = dateFields.map(field => ({ field, column_id: cleanText(bindings[field], 40) }));
      if (!/^\d+$/.test(sheetId) || requested.some(column => !/^\d+$/.test(column.column_id)) ||
          new Set(requested.map(column => column.column_id)).size !== requested.length) {
        return Response.json({ success: false,
          error: 'A permanent Order Request sheet ID and three distinct date-column IDs are required.' }, { status: 400 });
      }
      const metadata = await smartsheetGet(`/sheets/${sheetId}/columns?includeAll=true`, token);
      const columns = normalizeColumns(metadata.body);
      const dateColumns = requested.map(binding => ({
        ...binding,
        ...((column: any) => column
          ? { title: column.title, type: column.type } : { title: '', type: '' })(
          columns.find((column: any) => column.id === binding.column_id)),
      }));
      if (dateColumns.some(column => !column.title || !column.type)) {
        throw Object.assign(new Error('Smartsheet did not confirm every configured Order date-column ID.'), { status: 502 });
      }
      const sheetRows: any[] = [];
      const guard = createSmartsheetOrderPageGuard({ pageSize: 200, maxPages: 100 });
      let sheetVersion: number | null = null;
      for (let page = 1; page <= 100; page++) {
        const params = new URLSearchParams({
          page: String(page), pageSize: '200',
          columnIds: requested.map(column => column.column_id).join(','),
          exclude: 'nonexistentCells',
        });
        const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
        verifyOrderCreateAuditSheetIdentity(result.body, sheetId);
        const rows = normalizeSheetRows(result.body);
        const complete = guard.accept(page, result.body, rows);
        if (page === 1) sheetVersion = result.body.version;
        sheetRows.push(...rows);
        if (complete) break;
      }
      guard.assertComplete();
      const orders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { smartsheet_sheet_id: sheetId }, sort: 'id',
        label: 'Order Form read-only date parity review',
      });
      const audit = auditOrderDateParity(orders, sheetRows, bindings, sheetId);
      return Response.json({ success: true, ...audit, sheet_id: sheetId,
        sheet_version: sheetVersion, sheet_download_verified: true,
        date_columns: dateColumns,
        sync_global_enabled: config?.global_enabled === true,
        sync_observation_mode: config?.observation_mode !== false,
      });
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
          results.push({ dataset, ...(activeDirection ? { direction: activeDirection } : {}), skipped: true, reason: (err as any)?.message || 'Sync failed.' });
          completedSteps++;
        }
      }

      // Both datasets must report blocked stages and partial writes honestly.
      // Sales review rules remain unchanged; Order review is strictly isolated.
      const runNeedsReview = salesRunRequiresReview(results) || orderRunRequiresReview(results);
      await saveSyncStatus(base44, {
        status: runNeedsReview ? 'needs_review' : 'completed',
        needs_review: runNeedsReview,
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
        sync_complete: !runNeedsReview,
        needs_review: runNeedsReview,
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