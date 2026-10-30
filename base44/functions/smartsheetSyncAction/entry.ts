import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { planFieldPush, recordFieldPullHolds, applyMergedLocalFields } from '../../shared/smartsheetFieldMerge.ts';
import { staleOrderRetryPrewriteIds } from '../../shared/smartsheetOrderRetryPrewriteSafety.mjs';
import { trackedConditionalSave, verifiedLocalFieldTime } from '../../shared/fieldAudit.ts';
import { handleConflictReview } from '../../shared/smartsheetConflictReview.ts';
import { secrets } from 'base44:runtime';
import { planSalesFieldPull, guardSalesPulledTaskTransition, planSalesRemoteTaskApplication } from '../../shared/smartsheetSalesPullPlan.ts';
import { buildSalesTaskAdoptionPatch } from '../../shared/smartsheetSalesTaskAdoption.mjs';
import { buildNonterminalSalesPullPatch } from '../../shared/smartsheetSalesStageTransition.mjs';
import { guardSalesPushTaskPlan } from '../../shared/smartsheetSalesPushTaskGuard.mjs';
import { verifiedSalesConflictResolutionTargets, approvedSalesRecordStillCurrent, approvedSalesRemoteSnapshotStillCurrent, recoverCompletedApprovedSalesTaskDecisionIds, staleSalesRemotePutPlans, staleSalesRemotePutSnapshotIds } from '../../shared/smartsheetSalesConflictResolution.mjs';
import { salesStageCellHistoryRows } from '../../shared/smartsheetSalesStageHistory.mjs';
import { verifiedSalesReadbackRows } from '../../shared/smartsheetSalesReadbackEvidence.mjs';
import { buildSalesPullReviews } from '../../shared/smartsheetSalesPullReviews.ts';
import { persistSalesReviews } from '../../shared/smartsheetSalesReviewPersistence.ts';
import { classifyRecoverableStaleSalesSync, recoveredStaleSalesSyncValue } from '../../shared/smartsheetSalesStaleRunSafety.mjs';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { smartsheetGet, smartsheetWrite, smartsheetWriteNoTimeoutRetry } from '../../shared/smartsheetLegacyTransport.ts';
import { measureSyncEntities, measuredDriveFetch } from '../../shared/smartsheetTraceIO.ts';
import { tracedSyncRequest, beginSyncTraceStorage, checkpointSyncTrace, traceSyncStatus } from '../../shared/smartsheetTraceLifecycle.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { normalizeSalesNumber } from '../../shared/smartsheetSalesNumberBackfill.mjs';
import { canonicalBase44SalesAssignee } from '../../shared/smartsheetSalesAssigneeTranslation.mjs';
import { hasMeaningfulSmartsheetSalesCustomer } from '../../shared/smartsheetSalesImportEligibility.mjs';
import { createSmartsheetOrderPageGuard } from '../../shared/smartsheetOrderPageGuard.mjs';
import { createVerifiedOrderSheetBackup } from '../../shared/smartsheetOrderPrewriteBackup.mjs';
import { orderBackupStillMatchesSheetBeforeFirstWrite } from '../../shared/smartsheetOrderBackupFirstWriteSafety.mjs';
import { summarizeOrderBackupReadiness } from '../../shared/smartsheetOrderBackupReadiness.mjs';
import { isValidContactEmail, sharedOrderRequestorColumnId, planOrderRequestorContactAppend, orderRequestorOptionsPreserved } from '../../shared/smartsheetOrderContact.mjs';
import { auditOrderRequestorContacts } from '../../shared/smartsheetOrderContactAudit.mjs';
import { createOrderSmartsheetRowWithGuard, orderSmartsheetCreateNeedsReview, recoverableOrderSmartsheetCreate } from '../../shared/smartsheetOrderCreateSafety.mjs';
import { createSalesSmartsheetRowWithGuard } from '../../shared/smartsheetSalesCreateSafety.mjs';
import { commitVerifiedSalesMetadata } from '../../shared/smartsheetSalesMetadataCAS.mjs';
import { readSalesPullCreateAttemptRisks, readSalesPullLinkedRowRisks, classifySalesPullDuplicateLinkedRowRisks, readSalesPushRowOwnershipRisks, verifySalesPushWriteOwnership } from '../../shared/smartsheetSalesPullCreateRisk.mjs';
import { summarizeSalesCreateAttempts, classifySalesCreateReview } from '../../shared/smartsheetSalesCreateReview.mjs';
import { recoverVerifiedSalesCreateLink } from '../../shared/smartsheetSalesCreateRecovery.mjs';
import { auditSalesPermanentRowOwners } from '../../shared/smartsheetSalesPermanentOwnershipAudit.mjs';
import { classifySalesRecoveryHistory, acknowledgeVerifiedSalesRecoveryHistory } from '../../shared/smartsheetSalesRecoveryHistory.mjs';
import { orderStatusFromPulledDates } from '../../shared/smartsheetOrderReceivedState.mjs';
import { auditOrderCreateAttempts, verifyOrderCreateAuditSheetIdentity } from '../../shared/smartsheetOrderCreateReview.mjs';
import { auditOrderPermanentLinks, classifyRemoteUnlinkedOrderRow, orderRemoteRowIdentitySummary } from '../../shared/smartsheetOrderLinkIntegrity.mjs';
import { auditOrderDateParity, orderDateOptionField } from '../../shared/smartsheetOrderDateTranslation.mjs';
import { changedPulledOrderDates, verifyPulledOrderDates } from '../../shared/smartsheetOrderDatePersistence.mjs';
import { orderRunRequiresReview, orderPullWritesVerified } from '../../shared/smartsheetOrderRunSafety.mjs';
import { linkedOrderCustomerPullNeedsReview } from '../../shared/smartsheetOrderLinkedCustomerReview.mjs';
import { checkOrderCustomerDecisionEvidence } from '../../shared/smartsheetOrderCustomerDecisionSafety.mjs';
import { planOrderSmartsheetCustomerUnlink } from '../../shared/smartsheetOrderCustomerDecisionCommit.mjs';
import { classifyRecoverableStaleOrderSync, recoveredStaleOrderSyncValue, orderStaleBatchEvidencePreserved } from '../../shared/smartsheetOrderStaleRunSafety.mjs';
import { findUnverifiedSyncMetadata } from '../../shared/smartsheetOrderMetadataVerification.mjs';
import { orderPulledFieldsUnchanged, orderPullSnapshotAligned, orderPushRecordUnchanged, classifyOrderPullBusinessReadback } from '../../shared/smartsheetOrderPullSafety.mjs';
import { orderPullChangeLimit } from '../../shared/smartsheetOrderPullChangeLimit.mjs';
import { orderSaveSyncBatchLimit } from '../../shared/orderSaveSyncBatchLimit.mjs';
import { orderPullPrewriteBudget, assertOrderPullContinuationBudget } from '../../shared/smartsheetOrderPullPrewriteBudget.mjs';
import { loadOrderPullReadbackRows } from '../../shared/smartsheetOrderReadbackRows.mjs';
import { recordOrderPullBatchEvidence } from '../../shared/smartsheetOrderPullBatchEvidence.mjs';
import { classifyPriorUncertainOrderPull } from '../../shared/smartsheetOrderPriorUncertainPull.mjs';
import { assertNoUnresolvedOrderPullEvidence, saveOrderPullEvidence, verifyCompletedOrderPullEvidence, readOrderPullEvidenceStore } from '../../shared/smartsheetOrderPullEvidenceStore.mjs';
import { findUnresolvedOrderEvidencePair, compareUnresolvedOrderEvidenceRow } from '../../shared/smartsheetOrderPullRowReview.mjs';
import { planUnresolvedOrderBatchReview, verifyUnresolvedOrderBatchSheetRows, summarizeUnresolvedOrderBatchPage } from '../../shared/smartsheetOrderPullBatchReview.mjs';
import { buildOrderPullReadOnlyRowReport } from '../../shared/smartsheetOrderPullReviewMapping.ts';
import { orderMissingBoundCellConflicts } from '../../shared/smartsheetOrderConflictSafety.mjs';
import { classifyOrderPermanentRowIdentity } from '../../shared/smartsheetOrderPermanentRowSafety.mjs';
import { classifyOrderDeletedLinkTombstones } from '../../shared/smartsheetOrderDeletionSafety.mjs';
import { buildOrderHistoricalImportEvidence, validateOrderImportAuditRowIds } from '../../shared/smartsheetOrderHistoricalImportAudit.mjs';
import {
  buildCells,
  buildOrderPullSnapshot,
  buildSalesPullSnapshot,
  buildSnapshot,
  parseRowToFields,
  getMappableFields,
} from '../../shared/smartsheetSyncFields.ts';
import {
  filterSalesColumnBindings,
  salesPulledFieldsUnchanged,
  salesPullSnapshotAligned,
  salesPushRecordUnchanged,
  salesPushSnapshotNeedsReview,
  salesRecordHasLocalChangesSinceSnapshot,
  salesSnapshotsEqual,
  classifySalesEstInvPreview,
  verifiedSalesPreviewColumn,
  salesRunRequiresReview,
  shouldCreateSmartsheetSalesRecordInPipeline,
  initialSmartsheetSalesStatus,
} from '../../shared/smartsheetSalesSafety.mjs';
import { cleanText, normalizeSheets, normalizeColumns, normalizeCellPayload, normalizeSheetRows, numericIdList, normalizePullValue } from '../../shared/smartsheetSyncUtils.ts';

const TOKEN_SECRET_NAME = 'SMARTSHEET_API_TOKEN';
const API_BASE = 'https://api.smartsheet.com/2.0';
const MAX_RESPONSE_BYTES = 2_000_000;
const SETTING_KEY = 'smartsheetSyncConfig';
const ORDER_REQUEST_TYPES_SETTING_KEY = 'orderRequestTypes';

function normalizeOrderRequestTypes(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of source) {
    const label = cleanText(raw, 120);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(label);
    if (normalized.length >= 100) break;
  }
  return normalized;
}

function sameOrderRequestTypeList(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeOrderRequestTypes(left)) === JSON.stringify(normalizeOrderRequestTypes(right));
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

  if (dataset === 'sales') {
    // Compare the same canonical representation used by Sales pull/push
    // snapshots. Raw displayValue can contain currency/formatting that would
    // otherwise create false conflicts against numeric or normalized values.
    const currentSnapshot = buildSalesPullSnapshot({ cells: currentSmartsheetCells }, bindings);
    for (const columnId of bindingColumnIds) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, columnId)) return true;
      const current = currentSnapshot[columnId];
      const previous = snapshot[columnId];
      const currentBlank = current == null || String(current).trim() === '';
      const previousBlank = previous == null || String(previous).trim() === '';
      if (currentBlank || previousBlank) {
        if (!(currentBlank && previousBlank)) return true;
        continue;
      }
      if (typeof current === 'number' || typeof previous === 'number') {
        const a = Number(current);
        const b = Number(previous);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          if (a !== b) return true;
          continue;
        }
      }
      if (String(current).trim() !== String(previous).trim()) return true;
    }
    return false;
  }

  const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';
  const seenBoundColumnIds = new Set<string>();
  for (const cell of currentSmartsheetCells) {
    const colId = String(cell.column_id || cell.columnId || '');
    if (!bindingColumnIds.has(colId)) continue;
    seenBoundColumnIds.add(colId);
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
  if (dataset === 'orders' && orderMissingBoundCellConflicts(snapshot, bindingColumnIds, seenBoundColumnIds)) return true;
  return false;
}

async function pullDataset(
  base44: any,
  token: string,
  dataset: 'sales' | 'orders',
  profile: any,
  globalConfig: any,
  options: {
    assertRunOwnership?: () => Promise<void> | void;
    recordIds?: string[];
    reportOrderReadProgress?: (progress: { page: number; rowsLoaded: number; totalRows: number }) => Promise<void> | void;
    reportOrderPullProgress?: (progress: { phase: string; current: number; total: number; itemLabel: string; detail: string; batchEvidence?: any }) => Promise<void> | void;
  } = {},
) {
  const orderPullStartedAtMs = dataset === 'orders' ? Date.now() : 0;
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
  const sheetPageGuard = createSmartsheetOrderPageGuard({
    pageSize,
    maxPages: 100,
    datasetLabel: dataset === 'sales' ? 'Sales Pipeline' : 'Order Form',
  });
  let totalRowCount = 0;
  while (page <= 100) {
    // A stopped or superseded Order run must not keep downloading for eventual
    // mutation. Sales continues using its existing pull behavior unchanged.
    if (dataset === 'orders' && options.assertRunOwnership) await options.assertRunOwnership();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      columnIds: columnIds.join(','),
      exclude: 'nonexistentCells',
    });
    const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
    verifyOrderCreateAuditSheetIdentity(result.body, sheetId);
    if (dataset === 'sales' && page === 1) {
      for (const field of getMappableFields('sales')) {
        const id = String(bindings[field.key] || '');
        if (!id) continue;
        const column = result.body?.columns?.find(c => String(c.id) === id);
        if (!column || (field.type === 'date' && column.type !== 'DATE') ||
            (field.type !== 'date' && ['DATE', 'CHECKBOX'].includes(column.type))) {
          throw new Error(`Sales ${field.label} column is missing or has an incompatible type. No Sales records were changed.`);
        }
      }
    }
    const rows = normalizeSheetRows(result.body);
    const pageComplete = sheetPageGuard.accept(page, result.body, rows);
    if (page === 1) totalRowCount = Number(result.body?.totalRowCount || 0);
    allRows.push(...rows);
    // Each verified page advances the existing coordinator's real row-count
    // progress. Reported rows are read, NOT committed Order updates.
    if (dataset === 'orders' && options.reportOrderReadProgress) {
      await options.reportOrderReadProgress({ page, rowsLoaded: allRows.length, totalRows: totalRowCount });
      if (options.assertRunOwnership) await options.assertRunOwnership();
    }
    if (pageComplete) break;
    page++;
  }
  // Never apply a partial or moving Smartsheet download to live Base44 records.
  sheetPageGuard.assertComplete();

  const massLimit = Math.max(1, Number(globalConfig?.mass_change_limit_count) || 25);
  // Sales retains its existing sheet-size guard. An Order-only pull must
  // examine the full sheet to establish permanent-ID matches and then cap
  // actual proposed Base44 updates (never the read-only downloaded row count).
  if (dataset === 'sales' && allRows.length > massLimit) {
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
    existingRecords = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.WorkOrder,
      query: { smartsheet_sheet_id: sheetId },
      sort: 'id',
      label: 'Sales Smartsheet pull linked WorkOrders',
    });
  } else {
    existingRecords = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.Order,
      query: { smartsheet_sheet_id: sheetId },
      sort: 'id',
      label: 'Order Form Smartsheet pull linked Orders',
    });
  }
  if (dataset === 'sales') {
    // Before filtering deleted records or targeted IDs, verify the complete
    // configured-sheet ownership set. Otherwise recordsByRowId silently picks
    // the last of multiple WorkOrders and may overwrite the wrong Sales job.
    const duplicateSalesLinks = classifySalesPullDuplicateLinkedRowRisks(existingRecords, sheetId);
    if (duplicateSalesLinks.count) return {
      dataset, direction:'pull', sheet_id:sheetId, skipped:true,
      reason: duplicateSalesLinks.count + ' permanent Sales Smartsheet row link(s) have competing WorkOrders. ' +
        'No Sales records were changed; inspect exact IDs in the administrator ownership audit.',
      duplicate_sales_row_links: duplicateSalesLinks.count,
      duplicate_sales_row_ids: duplicateSalesLinks.permanent_row_ids,
      duplicate_sales_workorder_ids: duplicateSalesLinks.workorder_ids,
      duplicate_sales_row_ids_truncated: duplicateSalesLinks.rows_truncated,
      automatic_relink_attempted:false,
    };
  }
  const deletedOrderTombstones = dataset === 'orders'
    ? classifyOrderDeletedLinkTombstones(Array.isArray(existingRecords) ? existingRecords : [], sheetId)
    : { tombstoneRowIds: new Set<string>(), shadowedDeletedRowIds: [] as string[] };
  const deletedOrderLinkedRowIds = deletedOrderTombstones.tombstoneRowIds;
  existingRecords = (Array.isArray(existingRecords) ? existingRecords : []).filter((r: any) => !r?.deleted);
  const targetedIds = new Set(options.recordIds || []);
  if (dataset === 'sales' && targetedIds.size) existingRecords = existingRecords.filter(r => targetedIds.has(r.id));
  const salesAssigneeUsers = dataset === 'sales' && /^\d+$/.test(String(bindings?.current_task_assigned_to ?? '').trim())
    ? await loadAllEntityRows({
        entity: base44.asServiceRole.entities.AuthorizedEmail,
        sort: 'full_name',
        label: 'Sales Smartsheet assignee translation users',
      })
    : [];
  // Admin-acknowledged external/historical assignee labels resolve to their
  // canonical stored form instead of flagging the pull forever. Configured per
  // dataset profile as assignee_confirmed_labels.
  const salesAssigneeConfirmedLabels = dataset === 'sales' && Array.isArray(profile?.assignee_confirmed_labels)
    ? profile.assignee_confirmed_labels
    : [];

  let orderUnlinkedRowCount = 0;
  let orderUnlinkedRowIds: string[] = [];
  // Order-only date preflight: do not mutate any Order if a legacy cell has
  // an untranslatable date or a duplicate permanent Base44 row link.
  // A received text choice is valid; an impossible date is not.
  if (dataset === 'orders') {
    const activeAuditRows = deletedOrderLinkedRowIds.size
      ? allRows.filter((row: any) => !deletedOrderLinkedRowIds.has(String(row?.id || '')))
      : allRows;
    const audit = auditOrderDateParity(existingRecords, activeAuditRows, bindings, sheetId);
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
  const salesAssigneeTranslationIssues: any[] = [];
  const salesLocalPendingPreserved: string[] = [];
  const salesLocalWinsSilent: string[] = [];
  const salesPullReviews: any[] = [];
  const salesPendingSnapshotRepairs: any[] = [];
  const salesSnapshotOnlyUpdates: any[] = [];
  const salesPullBaselineReviewRequired: string[] = [];
  const orderSnapshotOnlyUpdates: any[] = [];
  const orderToCreate: any[] = [];
  const orderCreatesHeldForReview: { row_id: string; kind: string; reason: string }[] = [];
  const ORDER_PULL_SNAPSHOT_ONLY_LIMIT = 300;
  const ORDER_PULL_CREATE_LIMIT = 50;
  const orderLocalPendingConflicts: string[] = [];
  const orderLinkedCustomerNameReviews: { order_id: string; sheet_id: string; row_id: string; work_order_id: string; local_customer_name: string; smartsheet_customer_name: string; order_updated_date: string; remote_modified_at: string }[] = [];
  let orderDeletedLinkTombstonesPreserved = 0;
  let salesMissingCustomerRowsSkipped = 0;
  let unchangedSkipped = 0;

  if (dataset === 'orders' && options.reportOrderPullProgress) {
    await options.reportOrderPullProgress({ phase: 'matching', current: 0, total: allRows.length,
      itemLabel: 'Matching permanent Smartsheet row IDs',
      detail: 'Comparing downloaded rows with linked Base44 Orders; unmatched rows are held for review',
    });
  }
  for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++) {
    // Bounded progress updates avoid hammering the coordinator for each row.
    // Report only rows already compared, never rows about to be processed.
    if (dataset === 'orders' && options.reportOrderPullProgress && rowIndex > 0 && rowIndex % 200 === 0) {
      await options.reportOrderPullProgress({ phase: 'matching', current: rowIndex, total: allRows.length,
        itemLabel: `Compared ${rowIndex} Order Request rows`,
        detail: 'Matching by permanent row ID and respecting locally pending Orders',
      });
    }
    const row = allRows[rowIndex];
    const rowId = row.id;
    if (!rowId || !/^\d+$/.test(rowId)) continue;
    if (dataset === 'orders' && deletedOrderLinkedRowIds.has(rowId)) {
      // A soft-deleted Order keeps its permanent Smartsheet identity as a
      // tombstone. Never update it from pull and never treat its remote row as
      // a candidate for a new Base44 Order, even if auto-create is enabled later.
      orderDeletedLinkTombstonesPreserved++;
      continue;
    }
    if (dataset === 'orders' && duplicateOrderRowIds.has(rowId)) continue;

    if (dataset === 'sales' && targetedIds.size && !recordsByRowId[rowId]) continue;
    const rawFields = parseRowToFields(row, bindings, dataset);
    let salesAssigneeTranslationUnresolved = false;
    let pendingSalesAssigneeIssue: any = null;
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
      if (dataset === 'sales' && key === 'current_task_assigned_to') {
        const resolution = canonicalBase44SalesAssignee(val, salesAssigneeUsers, salesAssigneeConfirmedLabels);
        if (resolution.name) {
          fieldValues[key] = resolution.name;
        } else if (String(val ?? '').trim()) {
          salesAssigneeTranslationUnresolved = true;
          // Report this label only when the row actually writes or creates a
          // record below. A steady-state historical label is preserved safely
          // and must not hold the run at Needs Review forever.
          pendingSalesAssigneeIssue = {
            row_id: rowId,
            value: cleanText(val, 120),
            state: resolution.state,
            candidates: resolution.candidates.slice(0, 5).map((candidate: any) => cleanText(candidate?.full_name, 120)).filter(Boolean),
          };
        }
        continue;
      }
      const normalized = normalizePullValue(key, val);
      if (normalized !== undefined) fieldValues[key] = normalized;
    }

    const salesParentRowId = dataset === 'sales' && /^\d+$/.test(cleanText(row?.parent_id, 40))
      ? cleanText(row.parent_id, 40) : '';
    const existing = recordsByRowId[rowId];
    let salesRemoteSnapshot: Record<string, string | number | null> | null = null;
    if (dataset === 'sales') {
      salesRemoteSnapshot = buildSalesPullSnapshot(row, bindings);
      if (salesAssigneeTranslationUnresolved) {
        const assigneeColumnId = cleanText(bindings?.current_task_assigned_to, 40);
        if (assigneeColumnId) {
          const priorSnapshot = existing?.smartsheet_sync_snapshot;
          if (priorSnapshot && typeof priorSnapshot === 'object' && !Array.isArray(priorSnapshot) &&
              Object.prototype.hasOwnProperty.call(priorSnapshot, assigneeColumnId)) {
            salesRemoteSnapshot[assigneeColumnId] = priorSnapshot[assigneeColumnId];
          } else {
            const localSnapshot = existing ? buildSnapshot(existing, bindings, 'sales') : {};
            salesRemoteSnapshot[assigneeColumnId] = localSnapshot[assigneeColumnId] ?? '';
          }
        }
      }
    }
    let salesStageTransition: { from: string; to: string } | null = null;
    let salesTaskAdoption: any = null;
    if (dataset === 'sales' && existing) {
      // Stage-changing, terminal, and locally edited tasks require a protected
      // Sales transition, not a blind Smartsheet bulkUpdate. Other fields may pull.
      const remoteCandidate = { ...fieldValues };
      const fullRemoteSnapshot = salesRemoteSnapshot;
      const plan = guardSalesPulledTaskTransition(existing, fieldValues,
        planSalesFieldPull(existing, fieldValues, salesRemoteSnapshot, bindings), bindings);
      for (const key of Object.keys(fieldValues)) delete fieldValues[key];
      Object.assign(fieldValues, plan.fields);
      salesRemoteSnapshot = plan.snapshot;
      salesStageTransition = plan.stageTransition || null;
      salesTaskAdoption = plan.taskAdoption
        ? { ...plan.taskAdoption, lostReason: remoteCandidate.lost_reason }
        : null;
      const stillHeld: string[] = [];
      const localWinsBindings: string[] = [...(plan.localWins || [])];
      if (plan.held.length) {
        // Both sides moved on these fields since the verified baseline. Newest
        // wins: a committed local app-edit newer than the remote row keeps the
        // local value silently; a remote row newer than (or unopposed by) local
        // edit evidence takes the remote value. Only missing or equal evidence
        // queues a human review.
        const remoteAt = Date.parse(String(row?.modified_at || ''));
        for (const binding of plan.held) {
          const column = String(bindings[binding] || '');
          const field = binding === 'notes_serialized' ? 'work_notes' : binding;
          // A push-blocked task is held because remote never changed — only the
          // local task/stage inconsistency needs review. Timestamp arbitration
          // must not adopt an unchanged remote baseline over a local edit.
          if (binding === 'current_task_description' && plan.pushBlockedTask) {
            stillHeld.push(binding);
            continue;
          }
          const localAt = await verifiedLocalFieldTime(base44, 'WorkOrder', existing, binding).catch(() => '');
          const localMs = Date.parse(String(localAt || ''));
          if (Number.isFinite(remoteAt) && (!Number.isFinite(localMs) || remoteAt > localMs)) {
            // Remote newer or local intent unproven: apply the remote value.
            if (binding === 'current_task_description') {
              const mode = planSalesRemoteTaskApplication(existing, remoteCandidate.current_task_description);
              if (mode.mode === 'held') {
                stillHeld.push(binding);
              } else {
                fieldValues.current_task_description = remoteCandidate.current_task_description;
                if (column) salesRemoteSnapshot[column] = fullRemoteSnapshot?.[column];
                if (mode.mode === 'transition') {
                  salesStageTransition = { from: String(existing.sales_status || 'lead').trim().toLowerCase(), to: mode.to };
                } else if (mode.mode === 'adoption') {
                  salesTaskAdoption = { ...mode, lostReason: remoteCandidate.lost_reason };
                }
              }
            } else if (Object.prototype.hasOwnProperty.call(remoteCandidate, field)) {
              fieldValues[field] = remoteCandidate[field];
              if (column) salesRemoteSnapshot[column] = fullRemoteSnapshot?.[column];
            } else {
              stillHeld.push(binding);
            }
          } else if (Number.isFinite(localMs) && Number.isFinite(remoteAt) && localMs > remoteAt) {
            // Local edit provably newer: keep it silently; the push carries it.
            localWinsBindings.push(binding);
          } else {
            stillHeld.push(binding);
          }
        }
      }
      if (stillHeld.length || localWinsBindings.length) {
        salesAssigneeTranslationUnresolved = true; // Do not advance completion while local data is un-synced.
      }
      if (localWinsBindings.length) salesLocalWinsSilent.push(existing.id);
      if (stillHeld.length) {
        salesLocalPendingPreserved.push(existing.id);
        salesPullReviews.push(...await buildSalesPullReviews(existing,
          Object.fromEntries(stillHeld.map(field => [field, bindings[field]])), row));
      }
    }
    if (dataset === 'orders' && existing?.smartsheet_pending_local_sync === true) {
      // A local Order edit that has been durably saved but not yet pushed is
      // authoritative until Save & Sync resolves it. Never let background pull
      // overwrite it; flag the permanent Order ID for review instead.
      orderLocalPendingConflicts.push(existing.id);
      await recordFieldPullHolds({base44,record:existing,dataset,bindings,remoteRow:row});
      continue;
    }
    if (dataset === 'orders' && existing) {
      const customerColumnId = cleanText(bindings?.customer_name, 40);
      const remoteName = /^\d+$/.test(customerColumnId)
        ? buildOrderPullSnapshot(row, { customer_name: customerColumnId })[customerColumnId]
        : undefined;
      if (linkedOrderCustomerPullNeedsReview({
        order: existing, remoteCustomerName: remoteName,
        customerColumnBound: /^\d+$/.test(customerColumnId),
      })) {
        // Do not update the customer, job link, other row fields OR snapshot:
        // the remote row is retained verbatim for exact-ID admin review.
        orderLinkedCustomerNameReviews.push({
          order_id: String(existing.id), sheet_id: sheetId, row_id: rowId,
          work_order_id: String(existing.work_order_id),
          local_customer_name: cleanText(existing.customer_name, 160),
          smartsheet_customer_name: cleanText(remoteName, 160),
          order_updated_date: cleanText(existing.updated_date, 90),
          remote_modified_at: cleanText(row.modified_at, 90),
        });
        continue;
      }
    }
    if (dataset === 'orders') {
      Object.assign(fieldValues, orderStatusFromPulledDates(
        fieldValues, existing, /^\d+$/.test(String(bindings?.status ?? '').trim()),
      ));
    }
    if (existing) {
      // A no-op Sales pull must not rewrite business fields. If those fields
      // already agree but the stored snapshot is stale/incomplete, reconcile only
      // the exact remote snapshot metadata and verify that write later.
      if (dataset === 'sales' && salesPulledFieldsUnchanged(existing, fieldValues) &&
          cleanText(existing?.smartsheet_parent_row_id, 40) === salesParentRowId) {
        const remoteSnapshot = salesRemoteSnapshot || buildSalesPullSnapshot(row, bindings);
        if (!salesPullSnapshotAligned(existing, remoteSnapshot)) {
          salesSnapshotOnlyUpdates.push({
            id: existing.id,
            smartsheet_sync_snapshot: remoteSnapshot,
            ...(salesAssigneeTranslationUnresolved ? {} : { smartsheet_last_synced_at: new Date().toISOString() }),
          });
        }
        unchangedSkipped++;
        continue;
      }
      if (dataset === 'orders') {
        const expectedOrderSnapshot = buildOrderPullSnapshot(row, bindings);
        if (orderPulledFieldsUnchanged(existing, fieldValues)) {
          // Fields already agree. A stale snapshot alone is not a business
          // change: snapshots written before remote DATE cells were captured
          // hold '' for every date column, so heal the baseline with a
          // metadata-only write instead of a full record update. Capped per
          // run — the next pull heals the remainder. Local-pending Orders are
          // held earlier and never reach this branch.
          if (!orderPullSnapshotAligned(existing, expectedOrderSnapshot) &&
              existing?.smartsheet_pending_local_sync !== true &&
              orderSnapshotOnlyUpdates.length < ORDER_PULL_SNAPSHOT_ONLY_LIMIT) {
            orderSnapshotOnlyUpdates.push({
              id: existing.id,
              smartsheet_sync_snapshot: expectedOrderSnapshot,
              smartsheet_last_synced_at: new Date().toISOString(),
            });
          }
          unchangedSkipped++;
          continue;
        }
      }
      toUpdate.push({ id: existing.id, _existing: existing,
        ...(dataset === 'orders'
          ? { _remoteSnapshot: buildOrderPullSnapshot(row, bindings) }
          : dataset === 'sales'
            ? {
                _remoteSnapshot: salesRemoteSnapshot || buildSalesPullSnapshot(row, bindings),
                _salesAssigneeNeedsReview: salesAssigneeTranslationUnresolved,
                _salesStageTransition: salesStageTransition,
                _salesTaskAdoption: salesTaskAdoption,
              }
            : {}),
        ...(dataset === 'sales' ? { smartsheet_parent_row_id: salesParentRowId } : {}),
        ...fieldValues });
      if (dataset === 'sales' && pendingSalesAssigneeIssue) {
        salesAssigneeTranslationIssues.push(pendingSalesAssigneeIssue);
      }
    } else if (dataset === 'sales' && profile?.create_base44_from_smartsheet) {
      const newRecord: any = { ...fieldValues };
      if (dataset === 'sales') {
        if (!hasMeaningfulSmartsheetSalesCustomer(newRecord)) {
          salesMissingCustomerRowsSkipped++;
          continue;
        }
        newRecord.smartsheet_parent_row_id = salesParentRowId;
        if (!newRecord.title) newRecord.title = newRecord.client_name;
        newRecord.in_pipeline = shouldCreateSmartsheetSalesRecordInPipeline(newRecord);
        newRecord.sales_status = initialSmartsheetSalesStatus(newRecord);
        // This is imported classification, not a verified stage movement:
        // do not manufacture sales_stage_changed_at or sales_last_activity_at.
        // A record created from this remote row already has a known sync
        // baseline. Store the actual remote cells (with any unresolved assignee
        // held at the conservative local baseline above), not a local reconstruction.
        newRecord.smartsheet_sync_snapshot = salesRemoteSnapshot || buildSalesPullSnapshot(row, bindings);
      } else {
        if (!newRecord.customer_name) newRecord.customer_name = 'Unknown';
        if (!newRecord.request_type) newRecord.request_type = 'Other';
        if (!newRecord.description) newRecord.description = `Imported from Smartsheet row ${rowId}`;
      }
      newRecord.smartsheet_row_id = rowId;
      newRecord.smartsheet_sheet_id = sheetId;
      newRecord.smartsheet_last_synced_at = new Date().toISOString();
      toCreate.push(newRecord);
      if (pendingSalesAssigneeIssue) {
        salesAssigneeTranslationIssues.push(pendingSalesAssigneeIssue);
      }
    } else if (dataset === 'orders' && profile?.create_base44_from_smartsheet === true) {
      // Only a fully populated unlinked Order row may auto-create. Sparse,
      // blank/placeholder, and duplicate-looking rows stay flagged for review.
      if (orderToCreate.length >= ORDER_PULL_CREATE_LIMIT) {
        orderCreatesHeldForReview.push({
          row_id: rowId, kind: 'create_cap_reached',
          reason: 'The per-run Order create limit was reached. This row is held for a later pull.',
        });
        continue;
      }
      const classification = classifyRemoteUnlinkedOrderRow(
        orderRemoteRowIdentitySummary(row, bindings), existingRecords);
      if (classification.kind !== 'populated_unlinked_order') {
        orderCreatesHeldForReview.push({
          row_id: rowId, kind: classification.kind, reason: classification.reason,
        });
        continue;
      }
      orderToCreate.push({
        ...fieldValues,
        smartsheet_row_id: rowId,
        smartsheet_sheet_id: sheetId,
        smartsheet_sync_snapshot: buildOrderPullSnapshot(row, bindings),
        smartsheet_last_synced_at: new Date().toISOString(),
        smartsheet_pending_local_sync: false,
        row_number: row.row_number,
        deleted: false,
      });
    }
  }
  if (dataset === 'orders' && options.reportOrderPullProgress) {
    await options.reportOrderPullProgress({ phase: 'matching', current: allRows.length, total: allRows.length,
      itemLabel: `Compared ${allRows.length} Order Request rows`,
      detail: `${toUpdate.length} linked Orders queued for update; ${unchangedSkipped} already matched`,
    });
  }
  if (dataset === 'orders') {
    // This preflight precedes every Order business-field, snapshot and date
    // write. A full download with a small change set must remain syncable;
    // an unexpectedly large change set remains blocked without partial writes.
    const changeLimit = orderPullChangeLimit({ proposedUpdates: toUpdate.length, configuredLimit: massLimit });
    if (!changeLimit.allowed) return {
      dataset, direction: 'pull', sheet_id: sheetId, skipped: true,
      reason: changeLimit.reason,
      rows_examined: allRows.length, planned_order_updates: toUpdate.length,
      mass_change_limit_count: changeLimit.limit,
      unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount,
    };
    // The download and permanent-ID comparison can consume most of the
    // function runtime. Never begin a new Order write sequence with too
    // little reserved time left for verification. No Sales behavior changes.
    const prewriteBudget = orderPullPrewriteBudget({ startedAtMs: orderPullStartedAtMs, nowMs: Date.now() });
    if (!prewriteBudget.allowed) return {
      dataset, direction: 'pull', sheet_id: sheetId, skipped: true,
      reason: prewriteBudget.reason,
      rows_examined: allRows.length, planned_order_updates: toUpdate.length,
      prewrite_elapsed_ms: prewriteBudget.elapsedMs ?? null,
      prewrite_budget_ms: prewriteBudget.budgetMs ?? null,
      unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowCount,
    };
  }

  const salesReviewPersist = await persistSalesReviews(base44, salesPullReviews, options?.assertRunOwnership);

  // Historical Smartsheet assignee labels can outlive the current authorized
  // Base44 roster. They must not freeze the entire Sales mirror. For unresolved
  // or ambiguous labels, current_task_assigned_to is deliberately omitted from
  // fieldValues above: linked records keep their existing Base44 assignee and
  // new records remain unassigned, while every other safe mapped field can
  // still pull. Report the legacy labels so admins can clean them up without
  // turning one stale picklist value into a sheet-wide outage.
  let createdCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  // An unlinked/reserved Sales POST may be absent from the normal
  // smartsheet_sheet_id WorkOrder lookup. Read creation evidence independently
  // just before ANY Sales import creation; never guess row ownership from
  // matching names or cell values. Still allow linked WorkOrders to pull.
  let salesCreateAttemptReview: any = { count: 0, workorder_ids: [], attempt_states: {}, known_permanent_row_ids: [] };
  let salesImportCreatesHeld = 0;
  let salesImportLinkedCreatesHeld = 0;
  let salesLinkedClaimReview: any = {count:0,workorder_ids:[],known_permanent_row_ids:[]};
  if (dataset === 'sales') {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    salesCreateAttemptReview = await readSalesPullCreateAttemptRisks(base44.asServiceRole.entities.WorkOrder, sheetId);
  }
  // Bulk create in batches of 100 to avoid rate limits
  for (let i = 0; i < toCreate.length; i += 100) {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    if (dataset === 'sales') {
      // Recheck between batches too: a new POST reservation may have appeared
      // while the previous batch was being written.
      if (i > 0) salesCreateAttemptReview = await readSalesPullCreateAttemptRisks(base44.asServiceRole.entities.WorkOrder, sheetId);
      if (salesCreateAttemptReview.count > 0) {
        salesImportCreatesHeld = toCreate.length - i;
        errors.push(salesCreateAttemptReview.count + ' unresolved Sales Smartsheet create attempt(s) on this sheet. ' +
          salesImportCreatesHeld + ' new Base44 WorkOrder import(s) held for manual permanent-row reconciliation; existing linked records remain eligible for pull.');
        break;
      }
    }
    const batch = toCreate.slice(i, i + 100);
    if (dataset === 'sales') {
      // The normal sheet-scoped lookup can miss legacy linked WorkOrders
      // whose permanent row ID was saved without a sheet ID. A complete,
      // fresh row-ownership scan is required before EACH import batch.
      salesLinkedClaimReview = await readSalesPullLinkedRowRisks(
        base44.asServiceRole.entities.WorkOrder, sheetId,
        batch.map((record: any) => record.smartsheet_row_id),
      );
      if (salesLinkedClaimReview.count > 0) {
        salesImportLinkedCreatesHeld = toCreate.length - i;
        errors.push(salesLinkedClaimReview.count + ' existing WorkOrder permanent-row claim(s) overlap planned Sales imports. ' +
          salesImportLinkedCreatesHeld + ' new imports held for exact-ID review; no automatic relinking or duplicate creation.');
        break;
      }
    }
    try {
      const result = await base44.asServiceRole.entities[entityName].bulkCreate(batch);
      createdCount += Array.isArray(result) ? result.length : 0;
    } catch (err) {
      errors.push(`Create batch ${Math.floor(i / 100) + 1}: ${(err as any)?.message || 'unknown error'}`);
    }
  }

  // Order auto-create runs before the business batches: the new records are
  // already verified linked below, so they cannot belong in the update or
  // evidence pipelines of this same run. An unresolved app-side create attempt
  // means a remote row could belong to an in-flight POST — hold every create.
  let orderCreateVerificationFailures = 0;
  const orderVerifiedCreatedRowIds = new Set<string>();
  if (dataset === 'orders' && orderToCreate.length) {
    assertOrderPullContinuationBudget({
      startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the Order Smartsheet-row auto-create batch',
    });
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    const orderCreateAttemptRisk = auditOrderCreateAttempts(existingRecords, allRows, sheetId);
    const unresolvedCreateAttempts = Number(orderCreateAttemptRisk?.unresolved_markers || 0) +
      Number(orderCreateAttemptRisk?.counts?.ambiguous || 0) +
      Number(orderCreateAttemptRisk?.counts?.missing_row || 0);
    if (unresolvedCreateAttempts > 0) {
      orderCreatesHeldForReview.push(...orderToCreate.map((record: any) => ({
        row_id: String(record.smartsheet_row_id), kind: 'create_attempts_unresolved',
        reason: 'Unresolved app-side Order Smartsheet create attempts exist; no remote row can be proven free of an in-flight create.',
      })));
    } else {
      // Permanent-row ownership re-check immediately before writing: no Order,
      // including a deleted one or a row created moments ago, may already
      // claim any row in this batch.
      const claimedRows = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { smartsheet_row_id: { $in: orderToCreate.map((record: any) => String(record.smartsheet_row_id)) } },
        sort: 'id',
        label: 'Order pull auto-create permanent row recheck',
      });
      const claimedRowIds = new Set(claimedRows.map((record: any) => cleanText(record?.smartsheet_row_id, 40)).filter(Boolean));
      const allowedCreates = orderToCreate.filter((record: any) => !claimedRowIds.has(String(record.smartsheet_row_id)));
      for (const record of orderToCreate.filter((record: any) => claimedRowIds.has(String(record.smartsheet_row_id)))) {
        orderCreatesHeldForReview.push({
          row_id: String(record.smartsheet_row_id), kind: 'row_id_already_claimed',
          reason: 'A fresh Base44 read shows an Order already linked to this permanent Smartsheet row.',
        });
      }
      if (allowedCreates.length) {
        try {
          const created = await base44.asServiceRole.entities.Order.bulkCreate(allowedCreates);
          createdCount += Array.isArray(created) ? created.length : 0;
          // A bulk-create ACK is not proof of the permanent links. Re-read by
          // exact row ID; each planned row must map to exactly one active
          // Order on the configured sheet.
          const createdReadback = await loadAllEntityRows({
            entity: base44.asServiceRole.entities.Order,
            query: { smartsheet_row_id: { $in: allowedCreates.map((record: any) => String(record.smartsheet_row_id)) } },
            sort: 'id',
            label: 'Order pull auto-create verification',
          });
          for (const planned of allowedCreates) {
            const matches = createdReadback.filter((record: any) =>
              String(record?.smartsheet_row_id) === String(planned.smartsheet_row_id) &&
              record?.deleted !== true &&
              cleanText(record?.smartsheet_sheet_id, 40) === sheetId);
            if (matches.length === 1) {
              orderVerifiedCreatedRowIds.add(String(planned.smartsheet_row_id));
            } else {
              orderCreateVerificationFailures++;
              errors.push(`Order auto-create for Smartsheet row ${planned.smartsheet_row_id} ` +
                `mapped to ${matches.length} verified active linked Order(s). No retry was attempted.`);
            }
          }
        } catch (err: any) {
          orderCreateVerificationFailures += allowedCreates.length;
          errors.push(`Order auto-create batch: ${err?.message || 'unknown error'}. No retry was attempted.`);
        }
      }
    }
  }

  // Hybrid update strategy:
  // 1. bulkUpdate business fields without claiming sync completion.
  // 2. Sales business fields are re-read and canonically verified; Order-only
  //    date/text repairs run before metadata advancement.
  // 3. Sales and Order snapshot/timestamp metadata is written separately and
  //    read back before the pull can be treated as verified.
  const snapshotUpdates: any[] = [...salesPendingSnapshotRepairs, ...salesSnapshotOnlyUpdates];
  const orderDateVerifications: any[] = [];
  const orderBusinessVerifications: any[] = [];
  const orderFailedDateVerificationIds = new Set<string>();
  let orderBusinessWriteFailures = 0;
  const salesBusinessVerifications: any[] = [];
  const salesStageMetadataCandidates: any[] = [];
  const salesBusinessWriteFailureIds: string[] = [];
  let orderPullBatchEvidence: any = null;
  const bulkBatchSize = 100;
  if (dataset === 'orders' && options.reportOrderPullProgress) {
    await options.reportOrderPullProgress({ phase: 'applying', current: 0, total: toUpdate.length,
      itemLabel: toUpdate.length ? 'Applying linked Order changes in Base44' : 'No linked Order changes to apply',
      detail: 'Only permanent-ID matches are eligible; acknowledgments are not yet verified',
    });
  }
  for (let i = 0; i < toUpdate.length; i += bulkBatchSize) {
    if (dataset === 'orders') assertOrderPullContinuationBudget({
      startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the next Order business-field batch',
    });
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    const batch = toUpdate.slice(i, i + bulkBatchSize);
    if (dataset === 'orders') {
      orderPullBatchEvidence = recordOrderPullBatchEvidence(orderPullBatchEvidence, {
        batchNumber: Math.floor(i / bulkBatchSize) + 1,
        totalBatches: Math.ceil(toUpdate.length / bulkBatchSize), batch, state: 'attempting',
      });
      // Persist the exact attempted permanent IDs BEFORE the API write. A
      // process interruption inside bulkUpdate must remain diagnosable.
      if (!options.reportOrderPullProgress) {
        throw new Error('Order pull batch evidence cannot be persisted. No further Order writes are allowed.');
      }
      await options.reportOrderPullProgress({
        phase: 'applying', current: i, total: toUpdate.length,
        itemLabel: `Starting Order batch ${Math.floor(i / bulkBatchSize) + 1} of ${Math.ceil(toUpdate.length / bulkBatchSize)}`,
        detail: `${batch.length} permanent-ID linked Orders are about to be submitted; none verified`,
        batchEvidence: orderPullBatchEvidence,
      });
    }
    const stageBatch = dataset === 'sales' ? batch.filter((rec: any) => rec._salesStageTransition) : [];
    const adoptionBatch = dataset === 'sales' ? batch.filter((rec: any) => !rec._salesStageTransition && rec._salesTaskAdoption) : [];
    const ordinaryBatch = dataset === 'sales' ? batch.filter((rec: any) => !rec._salesStageTransition && !rec._salesTaskAdoption) : batch;
    const payload = ordinaryBatch.map(({ id, _existing, _remoteSnapshot, _salesAssigneeNeedsReview, _salesStageTransition, _salesTaskAdoption, ...fields }: any) => {
      const { smartsheet_last_synced_at, ...withoutUnverifiedTimestamp } = fields;
      return { id, ...withoutUnverifiedTimestamp };
    });
    try {
      if (payload.length) await base44.asServiceRole.entities[entityName].bulkUpdate(payload);
      if (dataset === 'orders') updatedCount += payload.length;
      for (const rec of ordinaryBatch) {
        if (rec._existing) {
          const { id, _existing, _remoteSnapshot, _salesAssigneeNeedsReview, _salesStageTransition, _salesTaskAdoption, ...fields } = rec;
          const snapshot = _remoteSnapshot;
          if (dataset === 'orders') {
            const changes = changedPulledOrderDates(_existing, fields);
            // A bulk ACK can silently omit ordinary business fields, too.
            // Hold *all* Order snapshot advancement until an exact-ID,
            // permanent-link and field-by-field read-back has succeeded.
            orderBusinessVerifications.push({
              id, sheetId, rowId: cleanText(_existing.smartsheet_row_id, 40),
              fields: { ...fields }, snapshot,
            });
            if (Object.keys(changes).length) {
              orderDateVerifications.push({ id, previous: _existing, changes, snapshot });
            }
          } else {
            const expectedParentRowId = cleanText(fields?.smartsheet_parent_row_id, 40);
            const expectedFields = { ...fields };
            delete expectedFields.smartsheet_parent_row_id;
            delete expectedFields.smartsheet_last_synced_at;
            salesBusinessVerifications.push({
              id,
              expectedFields,
              expectedParentRowId,
              snapshot,
              salesAssigneeNeedsReview: Boolean(_salesAssigneeNeedsReview),
            });
          }
        }
      }
    } catch (err: any) {
      errors.push(`Bulk update batch ${Math.floor(i / bulkBatchSize) + 1}: ${err?.message || 'unknown error'}`);
      // An API error is NOT evidence that Base44 applied zero writes.
      if (dataset === 'orders') orderPullBatchEvidence = recordOrderPullBatchEvidence(orderPullBatchEvidence, {
        batchNumber: Math.floor(i / bulkBatchSize) + 1,
        totalBatches: Math.ceil(toUpdate.length / bulkBatchSize), batch, state: 'write_uncertain',
      });
    }
    // Only a compare-and-set WorkOrder save can move a real Sales stage. Never
    // include these rows in bulkUpdate, where task and status can diverge.
    for (const rec of stageBatch) {
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      const { id, _existing, _remoteSnapshot, _salesAssigneeNeedsReview, _salesStageTransition, ...fields } = rec;
      try {
        const stamp = new Date().toISOString();
        const patch = buildNonterminalSalesPullPatch(_existing, fields, _salesStageTransition, stamp);
        try {
          await trackedConditionalSave(base44, 'WorkOrder', _existing, patch,
            { full_name: 'Smartsheet Sales stage synchronization' }, 'smartsheet');
        } catch (error) {
          // The remote ACK may be lost after the CAS actually commits.
          // Verify exact fields once, never retry an uncertain write.
          const latest = await base44.asServiceRole.entities.WorkOrder.get(id);
          if (!latest || !Object.entries(patch).every(([field, value]) =>
            field === 'smartsheet_parent_row_id'
              ? cleanText(latest[field], 40) === cleanText(value, 40)
              : JSON.stringify(latest[field] ?? null) === JSON.stringify(value ?? null))) throw error;
        }
        // FieldAudit captures the guarded server save. Also preserve regular-
        // user-visible CellHistory, verifying every created event before the
        // Smartsheet snapshot can advance.
        const historyRows = salesStageCellHistoryRows(_existing, patch);
        const createdHistory = await base44.asServiceRole.entities.CellHistory.bulkCreate(historyRows);
        const historyIds = Array.isArray(createdHistory) ? createdHistory.map((event: any) => event?.id) : [];
        if (historyIds.length !== historyRows.length || historyIds.some((eventId: any) => !eventId)) {
          throw new Error('Sales stage history creation was not acknowledged in full.');
        }
        const historyReadback = await base44.asServiceRole.entities.CellHistory.filter({ id: { $in: historyIds } }, { limit: historyIds.length });
        const historyConfirmed = Array.isArray(historyReadback) ? historyReadback : historyReadback?.items || [];
        const historyById = new Map(historyConfirmed.map((event: any) => [String(event.id), event]));
        if (!createdHistory.every((event: any, index: number) => {
          const saved = historyById.get(String(event.id));
          const expected = historyRows[index];
          return saved && saved.entity_id === expected.entity_id && saved.field_name === expected.field_name &&
            saved.old_value === expected.old_value && saved.new_value === expected.new_value;
        })) throw new Error('Sales stage history did not pass ID-based read-back.');
        const expectedFields = { ...fields };
        delete expectedFields.smartsheet_parent_row_id;
        salesBusinessVerifications.push({
          id, expectedFields,
          expectedParentRowId: cleanText(fields.smartsheet_parent_row_id, 40),
          expectedStage: _salesStageTransition.to,
          expectedStageChangedAt: stamp,
          expectedRowId: cleanText(_existing.smartsheet_row_id, 40),
          snapshot: _remoteSnapshot,
          salesAssigneeNeedsReview: Boolean(_salesAssigneeNeedsReview),
        });
      } catch (error: any) {
        salesBusinessWriteFailureIds.push(String(id));
        errors.push(`Sales ${id} task/stage conditional save not verified; snapshot not advanced. ` +
          `Review before retrying: ${error?.message || 'unknown error'}`);
      }
    }
    // Terminal/neutral task adoptions also commit only through a compare-and-set
    // WorkOrder save: the task, real status, close fields and stage timestamp
    // must land atomically. Never include these rows in bulkUpdate.
    for (const rec of adoptionBatch) {
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      const { id, _existing, _remoteSnapshot, _salesAssigneeNeedsReview, _salesStageTransition, _salesTaskAdoption, ...fields } = rec;
      try {
        const stamp = new Date().toISOString();
        const patch = buildSalesTaskAdoptionPatch(_existing, fields, _salesTaskAdoption.remoteTask,
          _salesTaskAdoption.lostReason, stamp);
        try {
          await trackedConditionalSave(base44, 'WorkOrder', _existing, patch,
            { full_name: 'Smartsheet Sales task synchronization' }, 'smartsheet');
        } catch (error) {
          // The remote ACK may be lost after the CAS actually commits.
          // Verify exact fields once, never retry an uncertain write.
          const latest = await base44.asServiceRole.entities.WorkOrder.get(id);
          if (!latest || !Object.entries(patch).every(([field, value]) =>
            field === 'smartsheet_parent_row_id'
              ? cleanText(latest[field], 40) === cleanText(value, 40)
              : JSON.stringify(latest[field] ?? null) === JSON.stringify(value ?? null))) throw error;
        }
        if (_salesTaskAdoption.kind === 'stage') {
          // FieldAudit captures the guarded server save. Also preserve regular-
          // user-visible CellHistory, verifying every created event before the
          // Smartsheet snapshot can advance.
          const historyRows = salesStageCellHistoryRows(_existing, patch);
          const createdHistory = await base44.asServiceRole.entities.CellHistory.bulkCreate(historyRows);
          const historyIds = Array.isArray(createdHistory) ? createdHistory.map((event: any) => event?.id) : [];
          if (historyIds.length !== historyRows.length || historyIds.some((eventId: any) => !eventId)) {
            throw new Error('Sales stage history creation was not acknowledged in full.');
          }
          const historyReadback = await base44.asServiceRole.entities.CellHistory.filter({ id: { $in: historyIds } }, { limit: historyIds.length });
          const historyConfirmed = Array.isArray(historyReadback) ? historyReadback : historyReadback?.items || [];
          const historyById = new Map(historyConfirmed.map((event: any) => [String(event.id), event]));
          if (!createdHistory.every((event: any, index: number) => {
            const saved = historyById.get(String(event.id));
            const expected = historyRows[index];
            return saved && saved.entity_id === expected.entity_id && saved.field_name === expected.field_name &&
              saved.old_value === expected.old_value && saved.new_value === expected.new_value;
          })) throw new Error('Sales stage history did not pass ID-based read-back.');
        }
        const expectedFields = { ...fields };
        delete expectedFields.smartsheet_parent_row_id;
        salesBusinessVerifications.push({
          id, expectedFields,
          expectedParentRowId: cleanText(fields.smartsheet_parent_row_id, 40),
          expectedStage: _salesTaskAdoption.kind === 'stage' ? _salesTaskAdoption.to : null,
          expectedNeutralClose: _salesTaskAdoption.kind === 'neutral_close',
          expectedStageChangedAt: stamp,
          expectedRowId: cleanText(_existing.smartsheet_row_id, 40),
          snapshot: _remoteSnapshot,
          salesAssigneeNeedsReview: Boolean(_salesAssigneeNeedsReview),
        });
      } catch (error: any) {
        salesBusinessWriteFailureIds.push(String(id));
        errors.push(`Sales ${id} task adoption conditional save not verified; snapshot not advanced. ` +
          `Review before retrying: ${error?.message || 'unknown error'}`);
      }
    }
    if (dataset === 'orders' && options.reportOrderPullProgress) {
      if (orderPullBatchEvidence?.recent_batches?.at(-1)?.state === 'attempting') {
        orderPullBatchEvidence = recordOrderPullBatchEvidence(orderPullBatchEvidence, {
          batchNumber: Math.floor(i / bulkBatchSize) + 1,
          totalBatches: Math.ceil(toUpdate.length / bulkBatchSize), batch, state: 'acknowledged_unverified',
        });
      }
      await options.reportOrderPullProgress({ phase: 'applying', current: Math.min(i + batch.length, toUpdate.length), total: toUpdate.length,
        itemLabel: `Processed ${Math.min(i + batch.length, toUpdate.length)} of ${toUpdate.length} linked Order updates`,
        detail: `${errors.length} reported write issues; dates and sync metadata still require verification`,
        batchEvidence: orderPullBatchEvidence,
      });
    }
  }

  // Sales pull must verify the actual WorkOrder business fields before it can
  // count an update or advance snapshot/timestamp metadata. Base44 bulkUpdate
  // has previously acknowledged writes while silently omitting fields.
  if (dataset === 'sales' && salesBusinessVerifications.length) {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    try {
      const verifiedSalesRows = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.WorkOrder,
        query: { smartsheet_sheet_id: sheetId },
        sort: 'id',
        label: 'Sales pull business-field verification',
      });
      const verifiedSalesById = new Map(
        verifiedSalesRows
          .filter((record: any) => !record?.deleted && record?.id)
          .map((record: any) => [String(record.id), record]),
      );
      for (const item of salesBusinessVerifications) {
        const persisted = verifiedSalesById.get(String(item.id));
        const businessFieldsVerified = Boolean(
          persisted && salesPulledFieldsUnchanged(persisted, item.expectedFields),
        );
        const parentRowVerified = Boolean(
          persisted &&
          cleanText(persisted?.smartsheet_parent_row_id, 40) === item.expectedParentRowId
        );
        const stageVerified = item.expectedNeutralClose
          ? Boolean(
              persisted && persisted.in_pipeline === false &&
              persisted.sales_neutral_closed_at === item.expectedStageChangedAt &&
              cleanText(persisted.smartsheet_sheet_id, 40) === sheetId &&
              cleanText(persisted.smartsheet_row_id, 40) === item.expectedRowId
            )
          : !item.expectedStage || Boolean(
              persisted && persisted.in_pipeline === true &&
              persisted.sales_status === item.expectedStage &&
              persisted.sales_stage_changed_at === item.expectedStageChangedAt &&
              cleanText(persisted.smartsheet_sheet_id, 40) === sheetId &&
              cleanText(persisted.smartsheet_row_id, 40) === item.expectedRowId
            );
        if (!businessFieldsVerified || !parentRowVerified || !stageVerified) {
          salesBusinessWriteFailureIds.push(String(item.id));
          errors.push(
            `Sales ${item.id} business-field read-back did not match the pulled Smartsheet row. ` +
            `Snapshot/timestamp not advanced; review before treating this pull as complete.`
          );
          continue;
        }
        updatedCount++;
        const snapshotPatch = {
          id: item.id,
          smartsheet_sync_snapshot: item.snapshot,
          ...(item.salesAssigneeNeedsReview ? {} : { smartsheet_last_synced_at: new Date().toISOString() }),
        };
        if (item.expectedStage || item.expectedNeutralClose) {
          // The successful stage CAS is not license to advance the remote
          // baseline after another app edit. Guard this metadata write too.
          salesStageMetadataCandidates.push({ record: persisted, patch: snapshotPatch });
        } else {
          snapshotUpdates.push(snapshotPatch);
        }
      }
    } catch (error: any) {
      salesBusinessWriteFailureIds.push(
        ...salesBusinessVerifications.map((item: any) => String(item.id)),
      );
      errors.push(
        `Sales business-field read-back could not verify ${salesBusinessVerifications.length} records. ` +
        `Snapshot/timestamp not advanced; review before treating this pull as complete: ` +
        `${error?.message || 'unknown error'}`
      );
    }
  }

  // Sales dates are covered by the business-field read-back above. Never
  // blindly rewrite thousands of already verified dates individually: that
  // exhausts rate limits and can overwrite a newer edit after verification.

  // Order-only read-after-write: Base44 bulkUpdate may acknowledge dates or
  // text choices that it omitted. Repair only fields whose previous value
  // remains safe, verify the permanent Order, then record sync evidence.
  if (dataset === 'orders') {
    if (options.reportOrderPullProgress) {
      await options.reportOrderPullProgress({ phase: 'verifying_base44', current: 0, total: orderDateVerifications.length,
        itemLabel: 'Verifying Order dates and text options',
        detail: 'Checking Base44 writes before advancing Smartsheet sync evidence',
      });
    }
    for (let checkIndex = 0; checkIndex < orderDateVerifications.length; checkIndex++) {
      const item = orderDateVerifications[checkIndex];
      assertOrderPullContinuationBudget({
        startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the next Order date/text verification',
      });
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      try {
        await verifyPulledOrderDates(base44.asServiceRole.entities.Order, item.id, item.previous, item.changes);
        // This repairs dates only; the full business-field read-back below
        // must still succeed before advancing metadata.
      } catch (error: any) {
        errors.push(`Order ${item.id} date/text verification: ${error?.message || 'unknown error'}. Snapshot not advanced.`);
        orderFailedDateVerificationIds.add(String(item.id));
        updatedCount--;
      }
      if (options.reportOrderPullProgress && ((checkIndex + 1) % 10 === 0 || checkIndex + 1 === orderDateVerifications.length)) {
        await options.reportOrderPullProgress({ phase: 'verifying_base44', current: checkIndex + 1, total: orderDateVerifications.length,
          itemLabel: `Checked ${checkIndex + 1} of ${orderDateVerifications.length} Order date/text changes`,
          detail: 'Only verified updates will have their Smartsheet snapshot metadata advanced',
        });
      }
    }
  }

  // On a partial/acknowledged Base44 batch, do not advance Order snapshots
  // until the actual persisted business fields agree with this Smartsheet
  // read. Unverified IDs remain on their prior baseline for a future pull;
  // the run is reported as needing review, never silently "recovered".
  if (dataset === 'orders' && orderBusinessVerifications.length) {
    const eligible = orderBusinessVerifications.filter(item => !orderFailedDateVerificationIds.has(String(item.id)));
    if (eligible.length) {
      assertOrderPullContinuationBudget({
        startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the Order business-field read-back',
      });
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      try {
        const actualRows = await loadOrderPullReadbackRows({
          entity: base44.asServiceRole.entities.Order,
          ids: eligible.map(item => item.id),
          sheetId,
          readLinkedOrders: () => loadAllEntityRows({
            entity: base44.asServiceRole.entities.Order,
            query: { smartsheet_sheet_id: sheetId },
            sort: 'id',
            label: 'Order pull business-field read-back before sync metadata',
          }),
        });
        const review = classifyOrderPullBusinessReadback(eligible, actualRows);
        snapshotUpdates.push(...review.verified.map(item => ({
          id: item.id, smartsheet_sync_snapshot: item.snapshot,
          smartsheet_last_synced_at: new Date().toISOString(),
        })));
        orderBusinessWriteFailures += review.failures.length;
        updatedCount = Math.max(0, updatedCount - review.failures.length);
        if (review.failures.length) errors.push(
          `${review.failures.length} Order business-field writes could not be verified by permanent ID; ` +
          `snapshots were preserved for review (IDs: ${review.failures.slice(0, 5).map(item => item.id).join(', ')}).`,
        );
      } catch (error: any) {
        orderBusinessWriteFailures += eligible.length;
        updatedCount = Math.max(0, updatedCount - eligible.length);
        errors.push(`Order business-field read-back failed for ${eligible.length} records. ` +
          `No snapshots advanced for these records: ${error?.message || 'unknown error'}`);
      }
    }
  }

  if (dataset === 'orders' && options.reportOrderPullProgress) {
    await options.reportOrderPullProgress({ phase: 'confirming_base44', current: 0, total: snapshotUpdates.length,
      itemLabel: 'Confirming Order sync snapshots',
      detail: 'Saving and verifying metadata only after eligible business-field checks',
    });
  }

  // Reconciliation metadata is part of verified success for both datasets.
  // A bulkUpdate acknowledgement alone is not enough: Base44 has previously
  // acknowledged writes while silently omitting individual fields.
  let snapshotWriteFailures = 0;
  const verifiedMetadataExpected: any[] = [];
  // Stage-change metadata is version-guarded separately from the old bulk
  // metadata path. A newer local edit must not inherit the remote baseline.
  for (const candidate of salesStageMetadataCandidates) {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    const { id, ...metadata } = candidate.patch;
    try {
      await trackedConditionalSave(base44, 'WorkOrder', candidate.record, metadata,
        { full_name: 'Smartsheet Sales snapshot verification' }, 'smartsheet');
      verifiedMetadataExpected.push(candidate.patch);
    } catch (error: any) {
      snapshotWriteFailures++;
      errors.push(`Sales ${id} stage metadata changed before its conditional save could be verified; ` +
        `snapshot not confirmed. Review before retrying: ${error?.message || 'unknown error'}`);
    }
  }
  const snapshotBatchSize = 100;
  for (let i = 0; i < snapshotUpdates.length; i += snapshotBatchSize) {
    if (dataset === 'orders') assertOrderPullContinuationBudget({
      startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the next Order sync snapshot batch',
    });
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    const batch = snapshotUpdates.slice(i, i + snapshotBatchSize);
    try {
      await base44.asServiceRole.entities[entityName].bulkUpdate(batch);
      verifiedMetadataExpected.push(...batch);
    } catch (error: any) {
      snapshotWriteFailures += batch.length;
      if (dataset === 'orders') updatedCount = Math.max(0, updatedCount - batch.length);
      const datasetLabel = dataset === 'sales' ? 'Sales' : 'Order';
      errors.push(
        `${datasetLabel} sync metadata was not confirmed for ${batch.length} records ` +
        `(IDs: ${batch.slice(0, 5).map((row: any) => row.id).join(', ')}). ` +
        `Review before treating this pull as complete: ${error?.message || 'unknown error'}`
      );
    }
    if (dataset === 'orders' && options.reportOrderPullProgress) {
      await options.reportOrderPullProgress({ phase: 'confirming_base44', current: Math.min(i + batch.length, snapshotUpdates.length), total: snapshotUpdates.length,
        itemLabel: `Processed ${Math.min(i + batch.length, snapshotUpdates.length)} of ${snapshotUpdates.length} Order snapshot updates`,
        detail: 'Checking sync metadata write acknowledgments; read-back still required',
      });
    }
  }

  // Stale Order snapshot baselines queued during matching are metadata-only
  // heals, not business writes: they stay out of orderPullBatchEvidence, and a
  // short budget simply leaves the remainder for the next pull.
  if (dataset === 'orders' && orderSnapshotOnlyUpdates.length) {
    for (let i = 0; i < orderSnapshotOnlyUpdates.length; i += snapshotBatchSize) {
      try {
        assertOrderPullContinuationBudget({
          startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the next Order snapshot-only metadata batch',
        });
      } catch {
        break;
      }
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      const batch = orderSnapshotOnlyUpdates.slice(i, i + snapshotBatchSize);
      try {
        await base44.asServiceRole.entities.Order.bulkUpdate(batch);
        verifiedMetadataExpected.push(...batch);
      } catch (error: any) {
        snapshotWriteFailures += batch.length;
        errors.push(
          `Order sync metadata was not confirmed for ${batch.length} records ` +
          `(IDs: ${batch.slice(0, 5).map((row: any) => row.id).join(', ')}). ` +
          `Review before treating this pull as complete: ${error?.message || 'unknown error'}`
        );
      }
    }
  }

  // Re-read every metadata write by permanent Base44 ID before declaring the
  // pull healthy. This catches silently dropped Sales snapshots/timestamps too.
  if (verifiedMetadataExpected.length) {
    if (dataset === 'orders') assertOrderPullContinuationBudget({
      startedAtMs: orderPullStartedAtMs, nowMs: Date.now(), stage: 'the final Order sync metadata read-back',
    });
    try {
      const readCompleteMetadata = () => loadAllEntityRows({
        entity: dataset === 'sales'
          ? base44.asServiceRole.entities.WorkOrder
          : base44.asServiceRole.entities.Order,
        query: { smartsheet_sheet_id: sheetId },
        sort: 'id',
        label: dataset === 'sales'
          ? 'Sales Smartsheet sync metadata verification'
          : 'Order Form sync metadata verification',
      });
      const metadataRows = dataset === 'orders'
        ? await loadOrderPullReadbackRows({
          entity: base44.asServiceRole.entities.Order,
          ids: verifiedMetadataExpected.map(item => item.id),
          sheetId,
          readLinkedOrders: readCompleteMetadata,
        })
        : await readCompleteMetadata();
      const metadataFailures = findUnverifiedSyncMetadata(
        verifiedMetadataExpected,
        metadataRows.filter((record: any) => !record?.deleted),
      );
      if (metadataFailures.length) {
        snapshotWriteFailures += metadataFailures.length;
        if (dataset === 'orders') updatedCount = Math.max(0, updatedCount - metadataFailures.length);
        const datasetLabel = dataset === 'sales' ? 'Sales' : 'Order';
        errors.push(
          `${datasetLabel} sync metadata read-back failed for ${metadataFailures.length} records ` +
          `(IDs: ${metadataFailures.slice(0, 5).map((item: any) => item.id || 'unknown').join(', ')}). ` +
          `Snapshot/timestamp was not verified; review before treating this pull as complete.`
        );
      }
    } catch (error: any) {
      snapshotWriteFailures += verifiedMetadataExpected.length;
      if (dataset === 'orders') updatedCount = Math.max(0, updatedCount - verifiedMetadataExpected.length);
      const datasetLabel = dataset === 'sales' ? 'Sales' : 'Order';
      errors.push(
        `${datasetLabel} sync metadata could not be re-read for ${verifiedMetadataExpected.length} records. ` +
        `Review before treating this pull as complete: ${error?.message || 'unknown error'}`
      );
    }
  }

  // Preserve Base44 records whose exact permanent Smartsheet row ID is missing.
  // Sorting or moving a row is harmless because its permanent ID does not change.
  // If that ID is absent, preserve the Base44 link and require review instead of inferring a replacement.
  const smartsheetRowIds = new Set(allRows.map((r: any) => String(r.id)));
  const orderMissingPermanentRows = dataset === 'orders'
    ? existingRecords
        .map((record: any) => ({
          record,
          identity: classifyOrderPermanentRowIdentity(record, sheetId, smartsheetRowIds),
        }))
        .filter((item: any) => item.identity.state === 'missing_permanent_row')
    : [];
  const orphans = dataset === 'orders'
    ? orderMissingPermanentRows.map((item: any) => item.record)
    : existingRecords.filter((r: any) => {
        const rowId = cleanText(r?.smartsheet_row_id, 40);
        return rowId && /^\d+$/.test(rowId) && !smartsheetRowIds.has(rowId) && !r.deleted;
      });

  // A row deleted in Smartsheet is honored in Base44: the linked WorkOrder is
  // moved to Project Trash (recoverable, keeps its permanent row ID and
  // snapshot) instead of flagging for review forever. Guarded twice: an empty
  // sheet download can never trash records, and a mass disappearance (> 25)
  // still requires human review rather than mass-trashing the pipeline.
  const ORPHAN_SOFT_DELETE_LIMIT = 25;
  const orphanSoftDeletedIds: string[] = [];
  let orphansFlagged = orphans;
  if (dataset === 'sales' && orphans.length > 0 && allRows.length > 0 && orphans.length <= ORPHAN_SOFT_DELETE_LIMIT) {
    const stillFlagged: any[] = [];
    for (const record of orphans) {
      const expectedUpdatedAt = cleanText(record?.updated_date, 80);
      if (!expectedUpdatedAt) { stillFlagged.push(record); continue; }
      try {
        const result = await base44.asServiceRole.entities.WorkOrder.updateMany(
          { id: record.id, updated_date: expectedUpdatedAt },
          { $set: { deleted: true, deleted_at: new Date().toISOString(), deleted_by: 'smartsheet_sync' } },
        );
        if (result && result.updated === 1) orphanSoftDeletedIds.push(String(record.id));
        else stillFlagged.push(record);
      } catch {
        const latest = await base44.asServiceRole.entities.WorkOrder.get(record.id).catch(() => null);
        if (latest?.deleted === true) orphanSoftDeletedIds.push(String(record.id));
        else stillFlagged.push(record);
      }
    }
    orphansFlagged = stillFlagged;
  }
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
  debugCounts.orphans_preserved_for_review = orphansFlagged.length;

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
      unlinked_smartsheet_rows_flagged_for_review: orderUnlinkedRowIds.filter((rowId: string) => !orderVerifiedCreatedRowIds.has(String(rowId))).length,
      unlinked_row_ids: orderUnlinkedRowIds.filter((rowId: string) => !orderVerifiedCreatedRowIds.has(String(rowId))),
      orders_created_from_smartsheet: orderVerifiedCreatedRowIds.size,
      order_creates_held_for_review: orderCreatesHeldForReview.length,
      order_creates_held_reasons: orderCreatesHeldForReview.slice(0, 10).map((item: any) => `${item.row_id}: ${item.reason}`),
      create_verification_failures: orderCreateVerificationFailures,
      missing_permanent_row_links: orderMissingPermanentRows.length,
      missing_permanent_row_record_ids: orderMissingPermanentRows.slice(0, 20).map((item: any) => item.record.id),
      missing_permanent_smartsheet_row_ids: orderMissingPermanentRows.slice(0, 20).map((item: any) => item.identity.row_id),
      permanent_row_matching_strategy: 'configured_sheet_and_permanent_row_id_only',
      automatic_relink_attempted: false,
      automatic_smartsheet_to_base44_create_allowed: profile?.create_base44_from_smartsheet === true,
      deleted_order_link_tombstones_preserved: orderDeletedLinkTombstonesPreserved,
      deleted_order_links_shadowed_by_active: deletedOrderTombstones.shadowedDeletedRowIds.length,
    } : {}),
    created: createdCount,
    updated: updatedCount,
    unchanged_skipped: unchangedSkipped,
    ...(dataset === 'sales' ? {
      missing_customer_rows_skipped: salesMissingCustomerRowsSkipped,
      create_attempts_need_review: salesCreateAttemptReview.count,
      create_attempt_workorder_ids: salesCreateAttemptReview.workorder_ids,
      create_attempt_states: salesCreateAttemptReview.attempt_states,
      create_attempt_known_row_ids: salesCreateAttemptReview.known_permanent_row_ids,
      new_workorder_imports_held_for_create_review: salesImportCreatesHeld,
      existing_link_claims_need_review: salesLinkedClaimReview.count,
      existing_link_claim_workorder_ids: salesLinkedClaimReview.workorder_ids,
      existing_link_claim_row_ids: salesLinkedClaimReview.known_permanent_row_ids,
      new_workorder_imports_held_for_link_review: salesImportLinkedCreatesHeld,
      automatic_create_relink_attempted: false,
      assignee_translation_review_required: salesAssigneeTranslationIssues.length,
      assignee_translation_samples: salesAssigneeTranslationIssues.slice(0, 20),
      local_pending_preserved: salesLocalPendingPreserved.length,
      local_pending_record_ids: salesLocalPendingPreserved.slice(0, 20),
      // Held-field reviews first surfaced this run. A stable, already-reported
      // review queue does not re-flag every run; only new or changed divergence
      // evidence does. Absent persistence evidence defaults to the preserved
      // count so unknown states still flag (fail-closed).
      local_pending_newly_reported: salesReviewPersist
        ? salesReviewPersist.added
        : salesLocalPendingPreserved.length,
      local_wins_silent: salesLocalWinsSilent.length,
      local_wins_silent_record_ids: salesLocalWinsSilent.slice(0, 20),
      business_field_write_failures: salesBusinessWriteFailureIds.length,
      business_field_write_failure_ids: salesBusinessWriteFailureIds.slice(0, 20),
      snapshot_write_failures: snapshotWriteFailures,
      snapshot_review_required: salesPullBaselineReviewRequired.length,
      snapshot_review_record_ids: salesPullBaselineReviewRequired.slice(0, 20),
    } : {}),
    ...(dataset === 'orders' ? {
      business_field_write_failures: orderBusinessWriteFailures,
      snapshot_write_failures: snapshotWriteFailures,
      conflicts: orderLocalPendingConflicts.length + orderLinkedCustomerNameReviews.length,
      conflict_record_ids: [...orderLocalPendingConflicts, ...orderLinkedCustomerNameReviews.map(item => item.order_id)].slice(0, 10),
      linked_customer_name_review_count: orderLinkedCustomerNameReviews.length,
      linked_customer_name_review_items: orderLinkedCustomerNameReviews.slice(0, 10),
    } : {}),
    errors: errors.length,
    error_details: errors.slice(0, 10),
    orphans_soft_deleted: orphanSoftDeletedIds.length,
    orphans_soft_deleted_record_ids: orphanSoftDeletedIds.slice(0, 10),
    orphans_flagged_for_review: orphansFlagged.length,
    orphan_record_ids: orphansFlagged.slice(0, 10).map((record: any) => record.id),
    duplicates_soft_deleted: 0,
    duplicate_groups_flagged_for_review: duplicateGroups.length,
    duplicate_groups: duplicateGroups.slice(0, 10),
    debug: debugCounts,
  };
}

async function loadSyncConfig(base44: any) {
  const results = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: SETTING_KEY });
  const rows = Array.isArray(results) ? results : (results ? [results] : []);
  const record = rows[0] || null;
  return { record, config: record?.setting_value || null, duplicateCount: rows.length };
}

function stableNormalize(value: any): any {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = stableNormalize(value[key]);
    return out;
  }, {});
}

function sameStableValue(left: any, right: any) {
  return JSON.stringify(stableNormalize(left)) === JSON.stringify(stableNormalize(right));
}

function assertRolloutBaselinesPreserved(currentConfig: any, nextConfig: any) {
  for (const dataset of ['sales', 'orders']) {
    const currentProfile = currentConfig?.[dataset] || {};
    const nextProfile = nextConfig?.[dataset] || {};
    const baseline = currentProfile?.rollout_baseline;
    if (!baseline?.captured_at) continue;
    if (!sameStableValue(baseline, nextProfile?.rollout_baseline)) {
      throw Object.assign(new Error(`${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} rollout baseline is immutable and was not changed.`), { status: 409 });
    }
    const currentId = cleanText(currentProfile?.smartsheet_sheet_id, 80);
    const nextId = cleanText(nextProfile?.smartsheet_sheet_id, 80);
    const baselineId = cleanText(baseline?.sheet_id, 80);
    if (nextId !== currentId || (baselineId && nextId !== baselineId)) {
      throw Object.assign(new Error(`${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} Smartsheet target is locked by its rollout baseline.`), { status: 409 });
    }
    const currentName = cleanText(currentProfile?.smartsheet_sheet_name, 500);
    const nextName = cleanText(nextProfile?.smartsheet_sheet_name, 500);
    if (nextName !== currentName) {
      throw Object.assign(new Error(`${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} Smartsheet target name is locked by its rollout baseline.`), { status: 409 });
    }
  }
}

function safeConfigRecord(record: any) {
  if (!record?.id) return null;
  return {
    id: cleanText(record.id, 200),
    setting_key: cleanText(record.setting_key, 200),
    setting_value: record.setting_value && typeof record.setting_value === 'object' ? record.setting_value : {},
    updated_date: cleanText(record.updated_date, 120),
  };
}

async function saveSyncConfigIfUnchanged(base44: any, body: any) {
  const { record, duplicateCount } = await loadSyncConfig(base44);
  if (duplicateCount > 1) {
    throw Object.assign(new Error(`Smartsheet sync configuration has ${duplicateCount} records. No settings were changed; resolve the duplicate records first.`), { status: 409 });
  }
  if (!record?.id) {
    throw Object.assign(new Error('Smartsheet sync configuration is missing. Reload before saving.'), { status: 404 });
  }
  const expectedUpdatedAt = cleanText(body?.expected_updated_date, 120);
  const expectedValue = body?.expected_setting_value;
  const nextValue = body?.setting_value;
  if (!expectedUpdatedAt || !expectedValue || typeof expectedValue !== 'object' || Array.isArray(expectedValue) ||
      !nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
    throw Object.assign(new Error('Smartsheet sync settings save is missing its loaded concurrency baseline.'), { status: 400 });
  }
  if (cleanText(record.updated_date, 120) !== expectedUpdatedAt || !sameStableValue(record.setting_value, expectedValue)) {
    throw Object.assign(new Error('Smartsheet sync settings changed in another session. Reload before saving.'), { status: 409 });
  }
  assertRolloutBaselinesPreserved(record.setting_value, nextValue);
  const serialized = JSON.stringify(nextValue);
  if (serialized.length > 500_000) {
    throw Object.assign(new Error('Smartsheet sync settings are unexpectedly large and were not saved.'), { status: 400 });
  }
  const result = await base44.asServiceRole.entities.GlobalSettings.updateMany(
    { id: record.id, updated_date: record.updated_date, setting_key: SETTING_KEY },
    { $set: { setting_value: nextValue } },
  );
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('Smartsheet sync settings changed while saving. Reload before retrying.'), { status: 409 });
  }
  const saved = await base44.asServiceRole.entities.GlobalSettings.get(record.id).catch(() => null);
  if (!saved?.id || !sameStableValue(saved.setting_value, nextValue)) {
    throw new Error('Smartsheet sync settings were updated but could not be verified. Reload before retrying.');
  }
  return safeConfigRecord(saved);
}

// Each dataset owns one coordinator record so a Sales review/failure never
// marks Order sync unhealthy and vice versa. The legacy shared record stays a
// read mirror for older readers; it is never authoritative for claims.
const LEGACY_SYNC_STATUS_KEY = 'smartsheetSyncStatus';
const SYNC_STATUS_KEYS: Record<string, string> = {
  orders: 'smartsheetOrderSyncStatus',
  sales: 'smartsheetSalesSyncStatus',
};
function syncStatusKeyForDataset(dataset: any) {
  return SYNC_STATUS_KEYS[String(dataset || '')] || LEGACY_SYNC_STATUS_KEY;
}

async function loadSingleSyncStatusRecord(base44: any, key: string = LEGACY_SYNC_STATUS_KEY) {
  const existing = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: key });
  const matches = Array.isArray(existing) ? existing.filter((record: any) => record?.id) : (existing?.id ? [existing] : []);
  if (matches.length !== 1) {
    throw Object.assign(new Error(`Smartsheet sync status "${key}" has ${matches.length} records. Exactly one coordinator record is required before starting a sync.`), { status: 409 });
  }
  return matches[0];
}

// Dataset coordinators are created lazily on first claim; a duplicate row
// still fails closed rather than becoming a second authoritative owner.
async function ensureSyncStatusRecord(base44: any, key: string) {
  const load = async () => {
    const existing = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: key });
    return Array.isArray(existing) ? existing.filter((record: any) => record?.id) : (existing?.id ? [existing] : []);
  };
  let matches = await load();
  if (matches.length > 1) {
    throw Object.assign(new Error(`Smartsheet sync status "${key}" has ${matches.length} records. Exactly one coordinator record is required.`), { status: 409 });
  }
  if (matches.length === 1) return matches[0];
  await base44.asServiceRole.entities.GlobalSettings.create({ setting_key: key, setting_value: {} });
  matches = await load();
  if (matches.length !== 1) {
    throw Object.assign(new Error(`Smartsheet sync status "${key}" could not be initialized to exactly one record.`), { status: 409 });
  }
  return matches[0];
}

// A best-effort mirror keeps the legacy shared record truthful for readers
// that predate per-dataset coordinators. The dataset record is authoritative;
// a mirror miss never blocks or falsifies a verified run.
async function mirrorSyncStatusToLegacy(base44: any, status: any, dataset: string) {
  try {
    const record = await loadSingleSyncStatusRecord(base44, LEGACY_SYNC_STATUS_KEY);
    const value = { ...status, mirrored_dataset: dataset, updated_at: new Date().toISOString() };
    await base44.asServiceRole.entities.GlobalSettings.updateMany(
      { id: record.id, setting_key: LEGACY_SYNC_STATUS_KEY, updated_date: record.updated_date },
      { $set: { setting_value: value } },
    );
  } catch {}
}

async function claimSyncRun(base44: any, status: any, dataset?: string) {
  const key = syncStatusKeyForDataset(dataset);
  const record = key === LEGACY_SYNC_STATUS_KEY
    ? await loadSingleSyncStatusRecord(base44, key)
    : await ensureSyncStatusRecord(base44, key);
  const current = record?.setting_value || {};

  // Cross-dataset serialization: the other pipeline shares the same Smartsheet
  // API and Base44 read budget, so an actively-running run on the other
  // dataset still blocks a claim here. A stale/abandoned record does NOT
  // block — its own dataset's recovery path owns that cleanup.
  const otherKey = dataset === 'orders' ? SYNC_STATUS_KEYS.sales
    : dataset === 'sales' ? SYNC_STATUS_KEYS.orders : null;
  if (otherKey) {
    const other = await ensureSyncStatusRecord(base44, otherKey);
    const otherValue = other?.setting_value || {};
    const otherActivity = Date.parse(String(otherValue?.updated_at || otherValue?.started_at || ''));
    const otherAbandoned = Number.isFinite(otherActivity) && Date.now() - otherActivity > 2 * 60_000;
    if (otherValue?.status === 'running' && !otherAbandoned) {
      throw Object.assign(new Error('Another Smartsheet sync is already running.'), { status: 409 });
    }
  }

  const currentIsOrderRun = dataset === 'orders' && current?.status === 'running';
  // Order Save & Sync is never auto-reclaimed merely because a transport wait
  // is quiet. A 429 Retry-After/backoff is still active work, and another user
  // must not start competing writes. After the Order stale threshold, require
  // the explicit stale-run recovery path before a new coordinator claim.
  if (currentIsOrderRun) {
    const classification = classifyRecoverableStaleOrderSync(current, Date.now());
    const detail = classification?.recoverable
      ? 'The existing Order sync is stale and must be closed for review before another sync can start.'
      : 'Another Order Save & Sync is already running.';
    throw Object.assign(new Error(detail), { status: 409 });
  }

  // A manual link recovery must never take over another running sync just
  // because it stopped reporting progress for two minutes. That older sync
  // may still be writing the same permanent Smartsheet row identity.
  if (dataset === 'sales' && status?.action === 'recover_verified_sales_create' && current?.status === 'running') {
    throw Object.assign(new Error('Another Smartsheet sync still owns the Sales coordinator. Review or explicitly recover its stale run before attempting a Sales permanent-row link.'), {status:409});
  }

  // Manually verified Sales permanent-row recovery shares the Sales
  // coordinator with Sales pull, push and Save & Sync. Never automatically
  // supersede an old recovery after the 2-minute generic timeout: it may have
  // committed a WorkOrder link before the reply failed. Explicit stale Sales
  // run recovery is required before another claim.
  if (dataset === 'sales' && current?.status === 'running' && current?.action === 'recover_verified_sales_create') {
    throw Object.assign(new Error('A Sales permanent-row recovery still owns the Sales coordinator. If stalled, review the original WorkOrder and explicitly recover the stale Sales run before any retry.'), {status:409});
  }

  // A new Order pull must not erase prior permanent-ID evidence after an
  // interrupted or review-required pull. This is read-only preflight: no
  // coordinator reset, Base44 Order write, or Smartsheet retry occurs.
  if (dataset === 'orders') {
    let priorOrderPull = classifyPriorUncertainOrderPull(current, {
      orderPullRequested: status?.order_pull_requested === true,
    });
    if (priorOrderPull.blocked) {
      // Consult independent evidence storage before refusing: a verified run
      // may still carry needs_review status plus batch evidence on the Order
      // coordinator record.
      const evidenceRecord = await readOrderPullEvidenceStore(base44.asServiceRole.entities.GlobalSettings);
      priorOrderPull = classifyPriorUncertainOrderPull(current, {
        orderPullRequested: status?.order_pull_requested === true,
        verifiedEvidence: evidenceRecord?.setting_value,
      });
    }
    if (priorOrderPull.blocked) {
      throw Object.assign(new Error(priorOrderPull.reason), { status: 409 });
    }
    if (status?.order_pull_requested === true) {
      // The Order coordinator can hold review state long after a run. Keep
      // Order uncertainty authoritative in a separate verified settings record.
      await assertNoUnresolvedOrderPullEvidence(base44.asServiceRole.entities.GlobalSettings);
    }
  }

  // Preserve the existing coordinator behavior for non-Order consumers.
  const lastActivity = Date.parse(String(current?.updated_at || current?.started_at || ''));
  const abandoned = Number.isFinite(lastActivity) && Date.now() - lastActivity > 2 * 60_000;
  if (current?.status === 'running' && abandoned) {
    await checkAndSendSyncAlert(base44, current, []).catch(() => {});
  }
  if (current?.status === 'running' && !abandoned) {
    throw Object.assign(new Error('Another Smartsheet sync is already running.'), { status: 409 });
  }
  const value = { ...status, updated_at: new Date().toISOString() };
  const result = await base44.asServiceRole.entities.GlobalSettings.updateMany(
    { id: record.id, setting_key: key, updated_date: record.updated_date },
    { $set: { setting_value: value } },
  );
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('Another Smartsheet sync claimed the coordinator first. Reload before retrying.'), { status: 409 });
  }
  const verified = await base44.asServiceRole.entities.GlobalSettings.get(record.id).catch(() => null);
  if (verified?.setting_value?.status !== 'running' ||
      verified?.setting_value?.started_at !== status?.started_at ||
      verified?.setting_value?.action !== status?.action) {
    throw Object.assign(new Error('Smartsheet sync coordinator claim could not be verified. No sync work was started.'), { status: 409 });
  }
  if (dataset === 'orders' || dataset === 'sales') {
    await mirrorSyncStatusToLegacy(base44, value, dataset);
  }
  return verified;
}

const ALERT_SETTING_KEY = 'smartsheetSyncAlertConfig';

async function loadSyncAlertConfigRecord(base44: any) {
  try {
    const results = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: ALERT_SETTING_KEY });
    const rows = Array.isArray(results) ? results : (results ? [results] : []);
    return rows[0] || null;
  } catch { return null; }
}

async function loadSyncAlertConfig(base44: any) {
  const record = await loadSyncAlertConfigRecord(base44);
  return record?.setting_value || { enabled: false, recipient_email: 'brettheinlein1@gmail.com' };
}

// A persistent alert condition (e.g., one record permanently flagged for
// review) must not re-email on every scheduled run. Identical alert
// signatures are suppressed until the cooldown elapses; a changed signature
// emails immediately. cooldown_minutes may be tuned in the alert config.
const SYNC_ALERT_DEFAULT_COOLDOWN_MINUTES = 360;

async function checkAndSendSyncAlert(base44: any, syncStatus: any, runResults: any[]) {
  const record = await loadSyncAlertConfigRecord(base44);
  const config = record?.setting_value || { enabled: false, recipient_email: 'brettheinlein1@gmail.com' };
  if (!config?.enabled) return;
  const recipient = cleanText(config?.recipient_email, 200) || 'brettheinlein1@gmail.com';
  const status = syncStatus?.status || '';
  const lastActivity = Date.parse(String(syncStatus?.updated_at || syncStatus?.started_at || ''));
  const isStale = status === 'running' && Number.isFinite(lastActivity) && Date.now() - lastActivity > 2 * 60_000;
  const isFailed = status === 'failed' || status === 'needs_review';
  const hasErrors = (runResults || []).some((r: any) => Number(r?.errors) > 0);
  let openConflicts = 0;
  try { openConflicts = Number(await base44.asServiceRole.entities.SyncConflict.count({ status: 'open' })) || 0; } catch {}
  let openConflictLabels: string[] = [];
  if (openConflicts > 0) {
    try {
      const rows = await base44.asServiceRole.entities.SyncConflict.filter({ status: 'open' }, { sort: '-created_date', limit: 10 });
      const items = Array.isArray(rows) ? rows : rows?.items || [];
      openConflictLabels = [...new Set(items.map((r: any) => cleanText(r?.record_label, 120)).filter(Boolean))].slice(0, 10);
    } catch {}
  }
  if (!isStale && !isFailed && !hasErrors && openConflicts === 0) return;
  const alertType = isStale ? 'Stuck/Stale Run'
    : status === 'failed' ? 'Failed Run'
    : status === 'needs_review' ? 'Run Needs Review'
    : hasErrors ? 'Run with Errors' : 'Open Conflicts';
  const stage = syncStatus?.current_step_label || syncStatus?.progress_item_label || 'Unknown';
  const datasetLabel = syncStatus?.progress_dataset || '';
  const direction = syncStatus?.progress_direction || '';
  const errorDetails = (runResults || []).flatMap((r: any) => r?.error_details || []).slice(0, 10);
  const reviewUrl = `https://clay-flow-signage-suite-387da97c.base44.app/AdminSettings?tab=${openConflicts > 0 ? 'sync_conflicts' : 'smartsheet'}`;
  const totalErrors = (runResults || []).reduce((sum: number, r: any) => sum + (Number(r?.errors) || 0), 0);
  const reviewSummary = (runResults || []).flatMap((r: any) => {
    const label = `${r?.dataset || '?'} ${r?.direction || ''}`.trim();
    return Object.entries(r || {})
      .filter(([k, v]) => Number(v) > 0 && k !== 'unchanged_skipped' && k !== 'rows_examined' && k !== 'records_examined' && /review|orphan|conflict|held|unlinked|missing|flagged|skipped|failure/.test(k))
      .map(([k, v]) => `  ${label}: ${k} = ${v}`);
  }).slice(0, 15);
  const signature = [alertType, status, totalErrors, openConflicts, datasetLabel, direction, reviewSummary.join(';'), openConflictLabels.join(',')].join('|');
  const cooldownMs = Math.max(15, Number(config?.cooldown_minutes) || SYNC_ALERT_DEFAULT_COOLDOWN_MINUTES) * 60_000;
  const lastSentAt = Date.parse(String(config?.last_alert_at || ''));
  if (signature === cleanText(config?.last_alert_signature, 400) &&
      Number.isFinite(lastSentAt) && Date.now() - lastSentAt < cooldownMs) return;
  const body = [
    `Smartsheet Sync Alert: ${alertType}`, '',
    `Sync: ${datasetLabel || 'Unknown'}${direction ? ' \u2192 ' + direction : ''}`,
    `Stage reached: ${stage}`, `Progress: ${syncStatus?.progress_current || 0} / ${syncStatus?.progress_total || 0}`,
    `Errors: ${totalErrors}`, `Open conflicts: ${openConflicts}`,
    ...(openConflictLabels.length ? ['', 'Pending value decisions (choose app or Smartsheet per field):',
      ...openConflictLabels.map((label: string) => `  ${label}`)] : []),
    ...(reviewSummary.length ? ['', 'Items needing review:', ...reviewSummary] : []),
    ...(errorDetails.length ? ['', 'Error details:', ...errorDetails] : []),
    '', `Review and resolve: ${reviewUrl}`,
  ].join('\n');
  try {
    await base44.integrations.Core.SendEmail({ to: recipient, subject: `Smartsheet Sync Alert \u2014 ${alertType}`, body });
  } catch { return; }
  // Persist only after a successful send: a lost email must not suppress
  // future alerts, and the updated_date guard leaves concurrent admin edits intact.
  if (record?.id) {
    try {
      await base44.asServiceRole.entities.GlobalSettings.updateMany(
        { id: record.id, setting_key: ALERT_SETTING_KEY, updated_date: record.updated_date },
        { $set: { setting_value: { ...config, last_alert_signature: signature, last_alert_at: new Date().toISOString() } } },
      );
    } catch {}
  }
}

async function syncRunOwned(base44: any, startedAt: string, dataset?: string) {
  const record = await loadSingleSyncStatusRecord(base44, syncStatusKeyForDataset(dataset));
  return record?.setting_value?.status === 'running' &&
    cleanText(record?.setting_value?.started_at, 80) === cleanText(startedAt, 80);
}

async function assertSyncRunOwnership(base44: any, startedAt: string, dataset?: string) {
  if (!(await syncRunOwned(base44, startedAt, dataset))) {
    throw Object.assign(new Error('This Smartsheet sync no longer owns the active run coordinator. No further sync writes are allowed.'), { status: 409 });
  }
}

// Status updates are run-identity and dataset scoped. A timed-out/recovered
// older process cannot overwrite the status of a newer run that claimed the
// coordinator, and one dataset's run cannot write the other's status.
async function saveSyncStatusForRun(base44: any, status: any, startedAt: string, dataset?: string) {
  traceSyncStatus(status);
  await checkpointSyncTrace();
  const key = syncStatusKeyForDataset(dataset);
  try {
    const record = await loadSingleSyncStatusRecord(base44, key);
    if (record?.setting_value?.status !== 'running' ||
        cleanText(record?.setting_value?.started_at, 80) !== cleanText(startedAt, 80)) return false;
    const value = { ...status, started_at: startedAt, updated_at: new Date().toISOString() };
    const result = await base44.asServiceRole.entities.GlobalSettings.updateMany(
      { id: record.id, setting_key: key, updated_date: record.updated_date },
      { $set: { setting_value: value } },
    );
    if (result?.updated === 1 &&
        (dataset === 'orders' || dataset === 'sales') && status?.status !== 'running') {
      await mirrorSyncStatusToLegacy(base44, value, dataset);
    }
    return Boolean(result && result.updated === 1);
  } catch {
    return false;
  }
}

// Read both durable claim surfaces before a Sales POST result becomes a
// permanent WorkOrder link. Incomplete paged reads fail closed.
async function readSalesCreateRowClaims(base44: any, sheetId: string, rowId: string) {
  const entity = base44.asServiceRole.entities.WorkOrder;
  const [linked, allAttempts] = await Promise.all([
    // A legacy linked row with a missing sheet ID is still a competing claim.
    loadAllEntityRows({entity,query:{smartsheet_row_id:rowId},
      sort:'id',label:'Sales create permanent-row linked owner verification'}),
    loadAllEntityRows({entity,query:{smartsheet_create_attempt:{$exists:true}},
      sort:'id',label:'Sales create permanent-row durable attempt verification'}),
  ]);
  const attempts = allAttempts.filter((candidate: any) =>
    (!/^\d+$/.test(String(candidate?.smartsheet_create_attempt?.sheet_id ?? '')) ||
      String(candidate.smartsheet_create_attempt.sheet_id) === sheetId) &&
    String(candidate?.smartsheet_create_attempt?.row_id ?? '') === rowId);
  return {linked,attempts};
}

async function pushDataset(
  base44: any,
  token: string,
  dataset: 'sales' | 'orders',
  profile: any,
  globalConfig: any,
  options: {
    recordIds?: string[];
    allowExplicitOrderCreate?: boolean;
    requireOrderPendingMarker?: boolean;
    onlyPendingOrderRecords?: boolean;
    orderPushTimeBudgetMs?: number;
    reportOrderProgress?: (progress: any) => Promise<void> | void;
    assertRunOwnership?: () => Promise<void> | void;
    respectSalesCreateSetting?: boolean;
    runStartedAt?: string;
  } = {},
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

  let lastSalesProgressAt = 0, lastSalesProgressPhase = '';
  const reportSalesProgress = async (progress: any) => {
    if (dataset !== 'sales' || !options.runStartedAt) return;
    const now = Date.now();
    if (progress.phase === lastSalesProgressPhase && now-lastSalesProgressAt < 10_000) return;
    lastSalesProgressAt = now; lastSalesProgressPhase = progress.phase;
    const active = await loadSingleSyncStatusRecord(base44, SYNC_STATUS_KEYS.sales);
    await saveSyncStatusForRun(base44, {...active.setting_value,
      progress_dataset:'sales', progress_direction:'push', progress_phase:progress.phase || 'checking',
      progress_current:Number(progress.current)||0, progress_total:Number(progress.total)||0,
      progress_item_label:cleanText(progress.item_label,220), progress_detail:cleanText(progress.detail,260),
      progress_updated_at:new Date().toISOString()}, options.runStartedAt, 'sales');
  };
  await reportSalesProgress({phase:'preflight',item_label:'Loading saved Sales changes'});

  // Save & Sync supplies exact permanent record IDs so a button press never
  // expands into a full-dataset push.
  const requestedRecordIds = Array.isArray(options?.recordIds)
    ? [...new Set(options.recordIds.map((id) => cleanText(id, 80)).filter(Boolean))]
    : [];
  let records: any[] = [];
  if (dataset === 'orders' && options?.onlyPendingOrderRecords && requestedRecordIds.length === 0 &&
      typeof options?.reportOrderProgress === 'function') {
    try {
      await options.reportOrderProgress({
        phase: 'preflight', current: 0, total: 0,
        item_label: 'Loading locally changed Order records',
        detail: 'Querying only Orders durably marked for Smartsheet Save & Sync',
      });
    } catch { /* progress UI must never corrupt sync work */ }
  }
  if (dataset === 'sales') {
    records = requestedRecordIds.length
      ? await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          query: { id: { $in: requestedRecordIds } },
          sort: 'id',
          label: 'Sales Pipeline targeted Save & Sync WorkOrders',
        })
      : await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          query: { in_pipeline: true },
          sort: 'id',
          label: 'Sales Pipeline full Smartsheet push WorkOrders',
        });
  } else {
    const orderQuery = requestedRecordIds.length
      ? { id: { $in: requestedRecordIds } }
      : options?.onlyPendingOrderRecords
        ? { smartsheet_pending_local_sync: true }
        : undefined;
    records = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.Order,
      ...(orderQuery ? { query: orderQuery } : {}),
      sort: 'id',
      label: requestedRecordIds.length
        ? 'Order Form targeted Save & Sync Orders'
        : options?.onlyPendingOrderRecords
          ? 'Order Form pending local Smartsheet push Orders'
          : 'Order Form Smartsheet push Orders',
    });
  }
  records = (Array.isArray(records) ? records : []).filter((r: any) => !r?.deleted);
  if (requestedRecordIds.length) {
    const foundIds = new Set(records.map((record: any) => String(record?.id || '')));
    const missingIds = requestedRecordIds.filter((id) => !foundIds.has(id));
    if (missingIds.length) return {
      dataset, direction: 'push', skipped: true,
      reason: `${missingIds.length} saved ${dataset === 'sales' ? 'Sales WorkOrder' : 'Order'} record${missingIds.length === 1 ? '' : 's'} could not be re-read by permanent ID. No Smartsheet rows were written.`,
      missing_record_ids: missingIds.slice(0, 10), records_examined: records.length,
    };
  }

  if (dataset === 'orders' && options?.requireOrderPendingMarker) {
    const notPending = records.filter((record: any) => record?.smartsheet_pending_local_sync !== true);
    if (notPending.length) return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${notPending.length} requested Order${notPending.length === 1 ? '' : 's'} are not durably marked as waiting for Save & Sync. No Smartsheet rows were written.`,
      records_examined: records.length,
      not_pending_record_ids: notPending.slice(0, 10).map((record: any) => record.id),
    };
  }

  if (dataset === 'orders') {
    const unresolved = records.filter(orderSmartsheetCreateNeedsReview);
    const safelyRecoverable = options?.allowExplicitOrderCreate === true
      ? unresolved.filter((record: any) => Boolean(recoverableOrderSmartsheetCreate(record, sheetId)))
      : [];
    const recoverableIds = new Set(safelyRecoverable.map((record: any) => String(record.id)));
    const blocked = unresolved.filter((record: any) => !recoverableIds.has(String(record.id)));
    if (blocked.length) return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${blocked.length} Order Smartsheet create attempts require review before retry. No rows were written.`,
      create_attempts_need_review: blocked.length,
      recoverable_create_attempts: safelyRecoverable.length,
      review_order_ids: blocked.slice(0, 10).map((record: any) => record.id),
    };
  }

  const massLimit = dataset === 'orders' && options?.requireOrderPendingMarker
    ? orderSaveSyncBatchLimit(globalConfig?.mass_change_limit_count)
    : Math.max(1, Number(globalConfig?.mass_change_limit_count) || 25);
  if (requestedRecordIds.length > massLimit) {
    return { dataset, direction: 'push', skipped: true,
      reason: `${requestedRecordIds.length} saved ${dataset === 'sales' ? 'Sales WorkOrders' : 'Orders'} exceed the ${massLimit}-record Save & Sync safety limit. Sync a smaller batch.`,
      records_examined: records.length };
  }
  if (records.length > massLimit) {
    return {
      dataset,
      direction: 'push',
      skipped: true,
      reason: `${records.length} records exceed the mass-change hard stop of ${massLimit}. Raise the limit or narrow the pipeline.`,
    };
  }

  // Direct WorkOrder edits can introduce a competing permanent-row claim
  // outside the selected Sales push population. Check exact row ownership
  // across all claimants before any remote PUT/POST or snapshot advancement.
  // A failed/incomplete paged read throws closed; no uniqueness is assumed.
  if (dataset === 'sales') {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    const ownership = await readSalesPushRowOwnershipRisks(
      base44.asServiceRole.entities.WorkOrder, sheetId, records);
    if (ownership.count) return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${ownership.count} permanent Sales Smartsheet row link(s) have competing or unverified WorkOrder owners. ` +
        'No Sales records or Smartsheet rows were changed; review the administrator ownership audit.',
      duplicate_sales_push_row_links: ownership.count,
      duplicate_sales_push_row_ids: ownership.permanent_row_ids,
      duplicate_sales_push_workorder_ids: ownership.workorder_ids,
      duplicate_sales_push_row_ids_truncated: ownership.rows_truncated,
      automatic_relink_attempted: false,
    };
  }

  // Stop before any Smartsheet write if existing Sales links have incomplete
  // snapshots. Legacy snapshots can predate the Est / Inv # mapping, and
  // treating a newly mapped field as locally authoritative could overwrite
  // working Smartsheet values. Reconcile these links through reviewed pull first.
  let snapshotReviewRecords = dataset === 'sales'
    ? records.filter((record: any) =>
        salesPushSnapshotNeedsReview(record, sheetId, buildSnapshot(record, bindings, 'sales')))
    : [];
  const { findMissingSalesLinks } = await import('../../shared/smartsheetSalesMissingRows.ts');
  const missingSalesRows = await findMissingSalesLinks(snapshotReviewRecords, sheetId, bindings,
    async (path: string) => (await smartsheetGet(path, token)).body, verifiedSalesPreviewColumn);
  records = records.filter((record: any) => !missingSalesRows.has(String(record.id)));
  snapshotReviewRecords = snapshotReviewRecords.filter((record: any) => !missingSalesRows.has(String(record.id)));
  const preservedSalesReview = missingSalesRows.size ? {
    missing_remote_rows_preserved: missingSalesRows.size,
    missing_remote_record_ids: [...missingSalesRows].slice(0, 20),
    review_message: `${missingSalesRows.size} Sales records point to rows no longer present in Smartsheet. Local records were preserved; other verified records can sync.`,
  } : {};
  // Incomplete baselines are reviewed per field, never a reason to block unrelated rows.

  // A linked Sales record whose mapped fields still match its last snapshot
  // needs no Smartsheet write or new Base44 sync timestamp. Preserve all
  // unmatched, changed, and unsnapshotted records for ordinary reconciliation.
  const pendingRecords = dataset === 'sales'
    ? records.filter((record: any) => !salesPushRecordUnchanged(record, sheetId, buildSnapshot(record, bindings, 'sales')))
    : dataset === 'orders'
      ? records.filter((record: any) => !orderPushRecordUnchanged(record, sheetId, buildSnapshot(record, bindings, 'orders')))
      : records;
  const unchangedSkipped = records.length - pendingRecords.length;
  if (dataset === 'sales' && pendingRecords.length === 0) {
    return { dataset, direction: 'push', sheet_id: sheetId, records_examined: records.length, ...preservedSalesReview,
      created: 0, updated: 0, unchanged_skipped: unchangedSkipped,
      conflicts: 0, errors: 0, error_details: [], conflict_record_ids: [] };
  }
  if (dataset === 'orders' && pendingRecords.length === 0) {
    return { dataset, direction: 'push', sheet_id: sheetId, records_examined: records.length,
      created: 0, updated: 0, unchanged_skipped: unchangedSkipped,
      conflicts: 0, errors: 0, error_details: [], conflict_record_ids: [] };
  }

  const reportOrderProgress = async (progress: any) => {
    if (dataset !== 'orders' || typeof options?.reportOrderProgress !== 'function') return;
    try { await options.reportOrderProgress(progress); } catch { /* progress UI must never corrupt sync work */ }
  };
  if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
  const orderProgressItemLabel = (record: any) => {
    const row = Number.isFinite(Number(record?.row_number)) ? `#${Number(record.row_number)}` : '';
    const customer = cleanText(record?.customer_name, 72) || 'Unnamed customer';
    const description = cleanText(record?.description, 88);
    return [row, customer, description].filter(Boolean).join(' · ');
  };

  if (dataset === 'orders') {
    const unlinked = pendingRecords.filter((record: any) =>
      !/^\d+$/.test(cleanText(record?.smartsheet_row_id, 40)) || cleanText(record?.smartsheet_sheet_id, 40) !== sheetId);
    const createAllowed = profile?.create_smartsheet_from_base44 === true || options?.allowExplicitOrderCreate === true;
    if (unlinked.length && !createAllowed) return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${unlinked.length} Order${unlinked.length === 1 ? '' : 's'} do not have a verified Smartsheet row link and automatic Order row creation is OFF. No Smartsheet rows were written.`,
      records_examined: records.length,
      unlinked_record_ids: unlinked.slice(0, 10).map((record: any) => record.id),
    };
    if (unlinked.length && options?.allowExplicitOrderCreate === true) {
      const noMappedCells = unlinked.filter((record: any) =>
        !recoverableOrderSmartsheetCreate(record, sheetId) && buildCells(record, bindings, 'orders').length === 0);
      if (noMappedCells.length) return {
        dataset, direction: 'push', sheet_id: sheetId, skipped: true,
        reason: `${noMappedCells.length} new Order${noMappedCells.length === 1 ? '' : 's'} have no mapped Smartsheet values. No Smartsheet rows were written.`,
        records_examined: records.length,
        invalid_create_record_ids: noMappedCells.slice(0, 10).map((record: any) => record.id),
      };
    }
  }
  if (dataset === 'sales' && options?.respectSalesCreateSetting && profile?.create_smartsheet_from_base44 !== true) {
    const unlinked = pendingRecords.filter((record: any) =>
      !/^\d+$/.test(cleanText(record?.smartsheet_row_id, 40)) || cleanText(record?.smartsheet_sheet_id, 40) !== sheetId);
    if (unlinked.length) return {
      dataset, direction: 'push', sheet_id: sheetId, skipped: true,
      reason: `${unlinked.length} saved Sales WorkOrder${unlinked.length === 1 ? '' : 's'} do not have a verified Smartsheet row link and automatic Sales row creation is OFF. No Smartsheet rows were written.`,
      records_examined: records.length,
      unlinked_record_ids: unlinked.slice(0, 10).map((record: any) => record.id),
    };
  }

  if (dataset === 'orders') {
    await reportOrderProgress({
      phase: 'backup', current: 0, total: pendingRecords.length, fraction: 0.02,
      item_label: 'Preparing verified Order Request backup',
      detail: `${pendingRecords.length.toLocaleString()} changed Order${pendingRecords.length === 1 ? '' : 's'} queued`,
    });
  }

  await reportSalesProgress({phase:'backup',total:pendingRecords.length,item_label:'Verifying backup before Sales writes'});

  // A successful BackupLog without saved sheet bytes is not a backup. For both
  // Order Request and Sales Pipeline, read every Smartsheet page, persist a
  // private Google Drive JSON snapshot, and read the exact file back before
  // writing ANY row.
  let verifiedOrderBackup: any = null;
  let firstOrderWriteAttempted = false;
  let firstOrderWriteConfirmed = false;
  if ((dataset === 'orders' || dataset === 'sales') && globalConfig?.backup_before_write) {
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('googledrive');
      const driveToken = cleanText(connection?.accessToken, 8000);
      if (!driveToken) throw new Error(`Google Drive backup is not connected. No ${dataset === 'sales' ? 'Sales' : 'Order'} rows were written.`);
      const driveFetch = async (url: string, init: any) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = await measuredDriveFetch(url, { ...init, signal: controller.signal,
            headers: { Authorization: `Bearer ${driveToken}`, ...(init?.headers || {}) } });
          if (!response.ok) throw new Error(`Google Drive backup verification returned HTTP ${response.status}.`);
          return response;
        } finally { clearTimeout(timeout); }
      };
      const verifiedBackup = await createVerifiedOrderSheetBackup({
        dataset,
        sheetId,
        readPage: async (page: number, pageSize: number) => {
          if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
          await reportSalesProgress({phase:'backup',total:pendingRecords.length,item_label:`Reading backup page ${page}`});
          return (await smartsheetGet(`/sheets/${sheetId}?page=${page}&pageSize=${pageSize}`, token)).body;
        },
        verifySource: async () =>
          (await smartsheetGet(`/sheets/${sheetId}?page=1&pageSize=1`, token)).body,
        upload: async ({ filename, content }: any) => {
          const boundary = `ccs${dataset === 'sales' ? 'Sales' : 'Order'}Backup${crypto.randomUUID().replace(/-/g, '')}`;
          const metadata = { name: filename, mimeType: 'application/json',
            description: `CCS ${dataset === 'sales' ? 'Sales Pipeline' : 'Order Request'} pre-sync row/column backup (attachments excluded)` };
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
            data_types: [`smartsheet_${dataset === 'sales' ? 'sales' : 'orders'}_sheet_${sheetId}`],
            results: [{ type: `smartsheet_${dataset === 'sales' ? 'sales' : 'orders'}`,
              filename: `${backup.filename} [Google Drive ID: ${backup.drive_file_id}]`, success: true }],
            success_count: 1, error_count: 0,
            triggered_by: dataset === 'sales' ? 'smartsheet_sales_prewrite' : 'smartsheet_order_prewrite',
          });
          if (!savedLog?.id) throw new Error(`${dataset === 'sales' ? 'Sales' : 'Order'} backup file was verified but its BackupLog record was not confirmed.`);
          const verifiedLog = await base44.asServiceRole.entities.BackupLog.get(savedLog.id);
          const expectedType = `smartsheet_${dataset === 'sales' ? 'sales' : 'orders'}`;
          const expectedDataType = `${expectedType}_sheet_${sheetId}`;
          const expectedTrigger = dataset === 'sales' ? 'smartsheet_sales_prewrite' : 'smartsheet_order_prewrite';
          const expectedFilename = `${backup.filename} [Google Drive ID: ${backup.drive_file_id}]`;
          const verifiedResult = Array.isArray(verifiedLog?.results) ? verifiedLog.results[0] : null;
          if (verifiedLog?.id !== savedLog.id ||
              verifiedLog?.triggered_by !== expectedTrigger ||
              !Array.isArray(verifiedLog?.data_types) || verifiedLog.data_types.length !== 1 || verifiedLog.data_types[0] !== expectedDataType ||
              !Array.isArray(verifiedLog?.results) || verifiedLog.results.length !== 1 ||
              verifiedLog?.success_count !== 1 || verifiedLog?.error_count !== 0 ||
              verifiedResult?.type !== expectedType || verifiedResult?.success !== true ||
              verifiedResult?.filename !== expectedFilename) {
            throw new Error(`${dataset === 'sales' ? 'Sales' : 'Order'} backup file was verified but its persisted BackupLog could not be read back exactly.`);
          }
        }
      });
      if (dataset === 'orders') verifiedOrderBackup = verifiedBackup;
    } catch (err) {
      return { dataset, direction: 'push', sheet_id: sheetId, skipped: true,
        reason: `Recoverable ${dataset === 'sales' ? 'Sales' : 'Order'} backup could not be verified; no Smartsheet rows were written: ${(err as any)?.message || 'unknown error'}`,
        records_examined: records.length, created: 0, updated: 0, conflicts: 0,
        errors: 0, error_details: [], conflict_record_ids: [] };
    }
  }

  // A backup is a point-in-time recovery artifact, not permission to write
  // later against a different sheet version. Recheck before the FIRST Order
  // Smartsheet mutation (POST or PUT). After a confirmed first write the
  // sheet version changes legitimately, so the standard per-row safeguards
  // govern subsequent operations instead of comparing against the old backup.
  const verifyOrderBackupBeforeFirstWrite = async ({ definitive429Retry = false } = {}) => {
    if (dataset !== 'orders' || globalConfig?.backup_before_write !== true ||
        firstOrderWriteConfirmed) return;
    try {
      if (!verifiedOrderBackup || (firstOrderWriteAttempted && !definitive429Retry)) {
        throw new Error('Backup unavailable or prior Order write acknowledgement uncertain');
      }
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      const current = (await smartsheetGet(`/sheets/${sheetId}?page=1&pageSize=1`, token)).body;
      if (!orderBackupStillMatchesSheetBeforeFirstWrite(verifiedOrderBackup, current, sheetId)) {
        throw new Error('Smartsheet sheet revision changed after backup');
      }
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    } catch {
      throw Object.assign(new Error(
        'Order backup no longer authorizes the first Smartsheet write. No further Order write was authorized; reload and run Save & Sync with a fresh verified backup.'
      ), { orderBackupFirstWriteBlocked: true });
    }
  };

  const created: string[] = [];
  const updated: string[] = [];
  const conflicts: string[] = [];
  const errors: string[] = [];
  const salesFailedRecordIds = new Set<string>();
  const orderFailedRecordIds = new Set<string>();
  // Exact permanent IDs for Order rows whose FINAL remote read-back could not
  // confirm the planned values. Diagnostic only; never authorize a retry/PUT.
  const orderVerificationReviews = new Map<string, { order_id: string; row_id: string; state: string }>();
  const orderMissingPermanentRows = new Map<string, string>();
  let requestorContactsSkippedNoEmail = 0;
  const sharedContactId = dataset === 'orders' ? sharedOrderRequestorColumnId(bindings) : '';
  const salesReviews = dataset === 'sales' ? await loadAllEntityRows({entity:base44.asServiceRole.entities.SyncConflict,query:{dataset:'sales',sheet_id:sheetId,status:{$in:['open','approved']}},sort:'id',label:'Sales review evidence'}) : [];
  const queuedSalesReviews: any[] = [];
  // Pre-fetch the entire sheet in a single paginated GET to eliminate per-row
  // requests during field reconciliation. Both Sales and Orders share this cache.
  const sheetRowsMap = new Map();
  {
    const preFetchColumnIds = [...new Set(Object.values(bindings).map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id)))];
    const preFetchPageSize = 500;
    // Smartsheet's GET /sheets/{id} returns totalRowCount, not totalPages; the
    // guard pages until every declared row is seen so rows past the first page
    // are never misreported as deleted permanent rows.
    const preFetchGuard = createSmartsheetOrderPageGuard({ pageSize: preFetchPageSize, maxPages: 100, datasetLabel: dataset === 'sales' ? 'Sales' : 'Order Form' });
    for (let preFetchPage = 1; preFetchPage <= 100; preFetchPage++) {
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      await reportSalesProgress({phase:'reading',total:pendingRecords.length,item_label:'Reading Smartsheet sheet'});
      await reportOrderProgress({phase:'reading',current:0,total:pendingRecords.length,fraction:0.08,item_label:'Reading Smartsheet sheet',detail:'Downloading current Order Request values by permanent IDs'});
      const preFetchParams = new URLSearchParams({ page: String(preFetchPage), pageSize: String(preFetchPageSize), columnIds: preFetchColumnIds.join(','), exclude: 'nonexistentCells' });
      const sheetResponse = await smartsheetGet(`/sheets/${sheetId}?${preFetchParams.toString()}`, token);
      if (preFetchPage === 1 && (String(sheetResponse.body?.id) !== sheetId || !Object.values(bindings).every(id => sheetResponse.body?.columns?.some(c => String(c.id) === String(id)))))
        throw new Error('Smartsheet sheet or column identity could not be verified. No rows were written.');
      const preFetchRows = normalizeSheetRows(sheetResponse.body);
      const preFetchComplete = preFetchGuard.accept(preFetchPage, sheetResponse.body, preFetchRows);
      for (const row of preFetchRows) sheetRowsMap.set(row.id, { row, raw: { columns: sheetResponse.body.columns, rows: sheetResponse.body.rows.filter((r: any) => String(r.id) === row.id) } });
      if (preFetchComplete) break;
    }
    preFetchGuard.assertComplete();
  }
  const sheetRowIds = new Set<string>([...sheetRowsMap.keys()].map((value: any) => String(value)));
  const orderPushStartedAt = Date.now();
  const orderPushTimeBudgetMs = dataset === 'orders'
    ? Math.max(0, Number(options?.orderPushTimeBudgetMs) || 0) : 0;
  let orderProcessedCount = 0;
  let orderTimeBudgetReached = false;

  // Batch collections: plan all records first, then write/update in bulk to
  // eliminate per-record Smartsheet GETs and Base44 reads that caused timeouts.
  const deferredSmartsheetWrites: any[] = [];
  const deferredBase44Updates: any[] = [];
  const deferredConflictRecordIds: string[] = [];
  const deferredSalesConflictDecisions = new Map<string, string[]>();
  const approvedSalesPlanSnapshots = new Map<string, any>();
  const approvedSalesRemotePlans = new Map<string, {rowId: string; snapshot: Record<string, any>}>();
  const salesRemotePutPlans = new Map<string, {rowId: string; snapshot: Record<string, any>}>();
  const deferredOrderConflictDecisions = new Map<string, string[]>();
  const deferredSalesVerification = new Map<string, {
    rowId: string;
    expectedSnapshot: Record<string, any>;
    originalUpdatedDate: string;
    requiresRemoteWrite: boolean;
  }>();
  const deferredOrderVerification = new Map<string, {
    rowId: string;
    plannedRemoteSnapshot: Record<string, any>;
    expectedSnapshot: Record<string, any>;
    originalUpdatedDate: string;
    requiresRemoteWrite: boolean;
    previous: any;
    dateChanges: Record<string, string>;
  }>();

  for (let recordIndex = 0; recordIndex < pendingRecords.length; recordIndex++) {
    const salesPushTimeBudgetMs = Math.max(60_000, Number(options?.salesPushTimeBudgetMs) || 240_000);
    if (dataset === 'sales' && Date.now()-orderPushStartedAt >= salesPushTimeBudgetMs) {
      orderTimeBudgetReached = true;
      break;
    }
    if (dataset === 'sales' && recordIndex % 5 === 0) await reportSalesProgress({phase:'checking',current:recordIndex,total:pendingRecords.length,item_label:pendingRecords[recordIndex]?.client_name,detail:'Checking saved field differences; held values do not block other fields'});
    if (dataset === 'orders' && orderPushTimeBudgetMs > 0 &&
        Date.now() - orderPushStartedAt >= orderPushTimeBudgetMs) {
      orderTimeBudgetReached = true;
      break;
    }
    // Cached Sales rows that are only compared/held make no writes. Check
    // ownership immediately before mutations below, not for every read-only row.
    if (dataset !== 'sales' && typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    let record = pendingRecords[recordIndex];
    let fieldPlan: any = null;
    orderProcessedCount = recordIndex + 1;
    if (dataset === 'orders') {
      const rowId = cleanText(record?.smartsheet_row_id, 40);
      await reportOrderProgress({
        phase: /^\d+$/.test(rowId) ? 'checking' : 'create',
        current: orderProcessedCount,
        total: pendingRecords.length,
        fraction: 0.1 + (0.35 * (orderProcessedCount / Math.max(1, pendingRecords.length))),
        item_label: orderProgressItemLabel(record),
        detail: /^\d+$/.test(rowId) ? `Checking Smartsheet row ${rowId} field by field` : 'Creating and permanently linking a new Smartsheet row',
        record_id: record.id,
        smartsheet_row_id: /^\d+$/.test(rowId) ? rowId : '',
      });
    }
    // Until the configured Date Received column type is independently verified,
    // do not send null over a text receipt choice (In Stock or a custom value).
    // Order pull can preserve that text; Order push must fail closed for it.
    if (dataset === 'orders' && (
      (record.date_needed_option && !record.date_needed) ||
      (record.date_ordered_option && !record.date_ordered) ||
      (record.receipt_option && !record.date_received)
    )) {
      errors.push(`${record.id}: Text date option requires verified Smartsheet column type before push. No row was written.`);
      orderFailedRecordIds.add(String(record.id));
      await reportOrderProgress({
        phase: 'needs_review', current: orderProcessedCount, total: pendingRecords.length,
        fraction: 0.1 + (0.35 * (orderProcessedCount / Math.max(1, pendingRecords.length))),
        item_label: orderProgressItemLabel(record),
        detail: 'Text date/receipt choice needs verified Smartsheet column-type review before this Order can be written',
        record_id: record.id, smartsheet_row_id: cleanText(record?.smartsheet_row_id, 40),
      });
      continue;
    }
    // Preserve Smartsheet's contact when the stored Base44 email is missing or malformed.
    if (sharedContactId && (record.requestor_name || record.requestor_email) &&
        !isValidContactEmail(record.requestor_email)) requestorContactsSkippedNoEmail++;
    let cells = buildCells(record, bindings, dataset);
    if (cells.length === 0) {
      if (dataset === 'orders') {
        errors.push(`${record.id}: No mapped Order values were available to verify or push. The Order remains queued.`);
        orderFailedRecordIds.add(String(record.id));
        await reportOrderProgress({
          phase: 'needs_review', current: orderProcessedCount, total: pendingRecords.length,
          fraction: 0.1 + (0.35 * (orderProcessedCount / Math.max(1, pendingRecords.length))),
          item_label: orderProgressItemLabel(record),
          detail: 'No mapped Order values are available to verify or push; this Order stays queued for review',
          record_id: record.id, smartsheet_row_id: cleanText(record?.smartsheet_row_id, 40),
        });
      }
      continue;
    }
    const existingRowId = cleanText(record?.smartsheet_row_id, 40);
    const existingSheetId = cleanText(record?.smartsheet_sheet_id, 40);

    try {
      let salesSuccessfulWrite: 'created' | 'updated' | null = null;
      if (existingRowId && /^\d+$/.test(existingRowId) && existingSheetId === sheetId) {
        // Order identity is permanent sheet + row ID only. Smartsheet sorting or
        // row movement is harmless because row position is ignored. If the row
        // was deleted and recreated, the replacement has a different permanent
        // ID and must never be inferred from customer/description/value matches.
        if (dataset === 'orders') {
          const identity = classifyOrderPermanentRowIdentity(record, sheetId, sheetRowIds);
          if (identity.state !== 'linked') {
            orderMissingPermanentRows.set(String(record.id), existingRowId);
            await reportOrderProgress({
              phase: 'needs_review', current: orderProcessedCount, total: pendingRecords.length,
              fraction: 0.1 + (0.35 * (orderProcessedCount / Math.max(1, pendingRecords.length))),
              item_label: orderProgressItemLabel(record),
              detail: `Permanent Smartsheet row ${existingRowId} is missing. Base44 kept the original link and local data; no automatic relink or replacement-row create was attempted.`,
              record_id: record.id, smartsheet_row_id: existingRowId,
            });
            throw new Error(`Permanent Smartsheet row ${existingRowId} is missing. Base44 preserved the stored permanent link and local data. Review permanent IDs; no relink by customer, description, row position, or similar replacement row was attempted.`);
          }
        }
        // Reconcile each field, not an entire row by its last-sync timestamp.
        const cached = sheetRowsMap.get(existingRowId);
        const rowResult = cached ? {body:cached.raw} : await smartsheetGet(`/sheets/${sheetId}?rowIds=${existingRowId}&columnIds=${[...new Set(Object.values(bindings))].join(',')}`,token);
        const currentRows = cached ? [cached.row] : normalizeSheetRows(rowResult.body);
        if(currentRows.length !== 1 || currentRows[0].id !== existingRowId)throw new Error('The permanent Smartsheet row is missing. Local data was preserved.');
        fieldPlan = await planFieldPush({base44,record,dataset,bindings,remoteRow:currentRows[0],rawSheet:rowResult.body,get:async path=>smartsheetGet(path,token),cells,...(dataset==='sales'?{salesReviews,queueSalesReview:review=>queuedSalesReviews.push(review)}:{})});
        if (dataset === 'sales') {
          fieldPlan = guardSalesPushTaskPlan(record, fieldPlan, bindings);
          if (fieldPlan.taskStageHeld) {
            const taskReviews = await buildSalesPullReviews(record,
              { current_task_description: bindings.current_task_description }, currentRows[0]);
            queuedSalesReviews.push(...taskReviews.map((review: any) => ({
              ...review,
              reason: 'Task Description conflicts with the saved Sales Status. No automatic stage or terminal outcome was created; review this task and classification before syncing.',
            })));
          }
        }
        // A prior Keep App task approval may already have been written remotely
        // even if the Base44 snapshot CAS failed. On retry, both task values
        // agree so the normal diff planner reports no decision. Recover only
        // an exact approved nonterminal task outcome; never issue that PUT again.
        const recoveredTaskDecisionIds = dataset === 'sales' && !fieldPlan.taskStageHeld && !fieldPlan.unresolved.length
          ? recoverCompletedApprovedSalesTaskDecisionIds(record, buildSalesPullSnapshot(currentRows[0], bindings), salesReviews, bindings)
          : [];
        if (recoveredTaskDecisionIds.length) {
          fieldPlan = { ...fieldPlan, decisions: [...new Set([...(fieldPlan.decisions || []), ...recoveredTaskDecisionIds])] };
        }
        if(fieldPlan.unresolved.length) {
          conflicts.push(record.id);
          if (dataset === 'orders') {
            await reportOrderProgress({
              phase: 'needs_review', current: orderProcessedCount, total: pendingRecords.length,
              fraction: 0.1 + (0.35 * (orderProcessedCount / Math.max(1, pendingRecords.length))),
              item_label: orderProgressItemLabel(record),
              detail: `${fieldPlan.unresolved.length} field${fieldPlan.unresolved.length === 1 ? '' : 's'} need conflict review; verified fields remain isolated`,
              record_id: record.id, smartsheet_row_id: existingRowId,
            });
          }
          if(dataset!=='sales' || (!fieldPlan.outgoing.length && !Object.keys(fieldPlan.incoming).length))continue;
        }
        // Same as pull: when the sheet has no Status column, an incoming
        // Date Ordered change (e.g. "keep Smartsheet" clearing the date) must
        // reconcile the derived Base44 status without demoting a received or
        // cancelled Order.
        if (dataset === 'orders' && Object.hasOwn(fieldPlan.incoming, 'date_ordered') &&
            !/^\d+$/.test(String(bindings?.status ?? '').trim())) {
          fieldPlan.incoming = orderStatusFromPulledDates(fieldPlan.incoming, record, false);
        }
        // Collect for batch write/update — no per-record GETs or verify reads.
        // This eliminates the per-record Smartsheet GET + Base44 GET + Base44
        // verify read that caused serverless function timeouts on large datasets.
        if (fieldPlan.outgoing.length) {
          deferredSmartsheetWrites.push({ id: existingRowId, cells: fieldPlan.outgoing });
          if (dataset === 'sales') salesRemotePutPlans.set(String(record.id), {
            rowId: existingRowId, snapshot: buildSalesPullSnapshot(currentRows[0], bindings),
          });
        }
        const batchSnapshot = {...fieldPlan.remote, ...Object.fromEntries(fieldPlan.outgoing.map(c => [String(c.columnId), c.value]))};
        const deferredUpdate = {
          id: record.id,
          ...fieldPlan.incoming,
          smartsheet_sync_snapshot: batchSnapshot,
          // A held Sales task is not fully synchronized. Preserve its last
          // verified full-sync time even when unrelated fields reconcile.
          ...(dataset === 'sales' && fieldPlan.taskStageHeld
            ? {} : { smartsheet_last_synced_at: new Date().toISOString() }),
          ...(dataset === 'orders' ? { smartsheet_pending_local_sync: fieldPlan.unresolved.length > 0 } : {}),
        };
        deferredBase44Updates.push(deferredUpdate);
        if (dataset === 'sales') {
          // Verify only safely reconciled remote columns. The held task must
          // retain its prior Base44 baseline but may differ on Smartsheet.
          const verifiedRemoteColumns = fieldPlan.taskStageHeld
            ? Object.fromEntries(Object.entries(batchSnapshot).filter(([columnId]) =>
                columnId !== String(bindings.current_task_description)))
            : batchSnapshot;
          deferredSalesVerification.set(String(record.id), {
            rowId: existingRowId,
            expectedSnapshot: verifiedRemoteColumns,
            originalUpdatedDate: String(record.updated_date || ''),
            // Recovery is read-only remotely, but requires fresh remote
            // post-plan read-back before any snapshot or review resolves.
            requiresRemoteWrite: fieldPlan.outgoing.length > 0 || recoveredTaskDecisionIds.length > 0,
          });
        }
        if (dataset === 'orders') {
          deferredOrderVerification.set(String(record.id), {
            rowId: existingRowId,
            plannedRemoteSnapshot: fieldPlan.remote,
            expectedSnapshot: batchSnapshot,
            originalUpdatedDate: String(record.updated_date || ''),
            requiresRemoteWrite: fieldPlan.outgoing.length > 0,
            previous: record,
            dateChanges: changedPulledOrderDates(record, fieldPlan.incoming),
          });
        }
        if (fieldPlan.decisions?.length && !fieldPlan.taskStageHeld) {
          if (dataset === 'orders') deferredOrderConflictDecisions.set(String(record.id), [...fieldPlan.decisions]);
          else {
            deferredSalesConflictDecisions.set(String(record.id), [...fieldPlan.decisions]);
            approvedSalesPlanSnapshots.set(String(record.id), record);
            approvedSalesRemotePlans.set(String(record.id), {
              rowId: existingRowId, snapshot: buildSalesPullSnapshot(currentRows[0], bindings),
            });
          }
        }
        // Never auto-resolve the task review simply because another Sales
        // field was pushed successfully in this same WorkOrder.
        if (dataset !== 'orders' && !fieldPlan.unresolved.length) deferredConflictRecordIds.push(record.id);
        continue;
      } else if (dataset === 'orders') {
        // Check before reserving a new create, then again directly before
        // POST: the reservation's Base44 round trips may take time.
        await verifyOrderBackupBeforeFirstWrite();
        // Reserve the permanent Order before POST; never automatically retry an
        // uncertain create or silently create a second row for an existing link.
        const createResult = await createOrderSmartsheetRowWithGuard({
          entity: base44.asServiceRole.entities.Order,
          record,
          sheetId,
          postRow: async (freshOrder: any) => {
            const freshCells = buildCells(freshOrder, bindings, 'orders');
            if (freshCells.length === 0) throw new Error('Order has no mapped Smartsheet cells.');
            // This guard runs before transport. Only this specific failure is
            // proof that no POST was sent; a blocked check after a definitive
            // 429 remains in the transport path and must not release a claim.
            try {
              await verifyOrderBackupBeforeFirstWrite();
            } catch (error: any) {
              if (error?.orderBackupFirstWriteBlocked === true) {
                throw Object.assign(error, { orderCreatePrePostGuardBlocked: true });
              }
              throw error;
            }
            firstOrderWriteAttempted = true;
            const result = await smartsheetWriteNoTimeoutRetry('POST', `/sheets/${sheetId}/rows`, token, [{
              toTop: true,
              cells: freshCells.map((c) => ({ columnId: c.columnId, value: c.value,
                ...(c.displayValue ? { displayValue: c.displayValue } : {}) })),
            }], {
              onRateLimitWait: async ({ attempt, waitSeconds }: any) => reportOrderProgress({
                phase: 'waiting_rate_limit', current: orderProcessedCount, total: pendingRecords.length,
                fraction: 0.46,
                item_label: orderProgressItemLabel(freshOrder),
                detail: `Smartsheet rate limit: waiting ${waitSeconds}s before create retry ${attempt}/3`,
                record_id: freshOrder.id,
              }),
              onRateLimitRetry: async ({ attempt }: any) => reportOrderProgress({
                phase: 'retrying', current: orderProcessedCount, total: pendingRecords.length,
                fraction: 0.48,
                item_label: orderProgressItemLabel(freshOrder),
                detail: `Rechecking backup before new-row retry (${attempt}/3)`,
                record_id: freshOrder.id,
              }),
              beforeRateLimitRetry: async () => verifyOrderBackupBeforeFirstWrite({ definitive429Retry: true }),
            });
            firstOrderWriteConfirmed = true;
            return result.body;
          },
          makeSnapshot: (freshOrder: any) => buildSnapshot(freshOrder, bindings, 'orders'),
          verifyCreatedRow: async ({ rowId, expectedSnapshot, record: verifyRecord, recovered }: any) => {
            await reportOrderProgress({
              phase: 'verifying', current: orderProcessedCount, total: pendingRecords.length,
              fraction: 0.58,
              item_label: orderProgressItemLabel(verifyRecord),
              detail: recovered
                ? `Recovering previously created Smartsheet row ${rowId} without sending another POST`
                : `Verifying newly created Smartsheet row ${rowId} before saving its permanent Base44 link`,
              record_id: verifyRecord.id, smartsheet_row_id: rowId,
            });
            const columnIds = [...new Set(Object.values(bindings)
              .map((value: any) => cleanText(value, 40)).filter((value: string) => /^\d+$/.test(value)))];
            const params = new URLSearchParams({
              rowIds: String(rowId),
              columnIds: columnIds.join(','),
              exclude: 'nonexistentCells',
            });
            const result = await smartsheetGet(`/sheets/${sheetId}?${params.toString()}`, token);
            if (String(result.body?.id ?? '') !== sheetId) return false;
            const rows = normalizeSheetRows(result.body);
            if (rows.length !== 1 || String(rows[0]?.id ?? '') !== String(rowId)) return false;
            return !detectConflict(rows[0].cells, expectedSnapshot, bindings, 'orders');
          },
        });
        if (createResult?.newerLocalEditsRemain) {
          orderFailedRecordIds.add(String(record.id));
          errors.push(`${record.id}: Smartsheet row ${createResult.rowId} is permanently linked, but newer local Order edits remain queued for Retry Sync.`);
        } else {
          created.push(record.id);
        }
        continue;
      } else {
        // Persist a write-ahead WorkOrder reservation before one no-retry POST.
        // A returned permanent row ID can be recovered after a failed Base44
        // link, but an unknown remote outcome is held for manual reconciliation.
        const result = await createSalesSmartsheetRowWithGuard({
          entity: base44.asServiceRole.entities.WorkOrder,
          record, sheetId,
          assertOwner: options?.assertRunOwnership,
          readCompetingClaims: async (rowId: string) => readSalesCreateRowClaims(base44, sheetId, rowId),
          makeSnapshot: (current: any) => buildSnapshot(current, bindings, 'sales'),
          postRow: async (current: any) => {
            const currentCells = buildCells(current, bindings, 'sales');
            if (!currentCells.length) throw new Error('Sales record has no mapped Smartsheet values.');
            const sent = await smartsheetWriteNoTimeoutRetry('POST', `/sheets/${sheetId}/rows`, token, [{
              toTop: true,
              cells: currentCells.map((c: any) => ({columnId:c.columnId,value:c.value,
                ...(c.displayValue ? {displayValue:c.displayValue} : {})})),
            }]);
            return sent.body;
          },
          verifyCreatedRow: async ({rowId,expectedSnapshot}: any) => {
            const columns = [...new Set(Object.values(bindings)
              .map((value: any) => String(value).trim()).filter((value: string) => /^\d+$/.test(value)))];
            const query = new URLSearchParams({
              rowIds: String(rowId),columnIds: columns.join(','),exclude:'nonexistentCells',
            });
            const remote = await smartsheetGet('/sheets/' + sheetId + '?' + query.toString(), token);
            if (String(remote.body?.id ?? '') !== sheetId) return false;
            const rows = normalizeSheetRows(remote.body);
            return rows.length === 1 && String(rows[0]?.id ?? '') === String(rowId) &&
              salesSnapshotsEqual(expectedSnapshot,buildSalesPullSnapshot(rows[0],bindings),
                cleanText(bindings?.current_task_assigned_to,40));
          },
        });
        created.push(record.id);
        if (result.newerLocalEditsRemain) {
          errors.push(record.id + ': Sales row ' + result.rowId + ' linked, but newer local edits remain queued for the next verified sync.');
        }
        continue;
      }
      // Store only verified field baselines; held values keep their old evidence.
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      const snapshot = fieldPlan?.verifiedSnapshot || buildSnapshot(record, bindings, dataset);
      if (dataset === 'orders') {
        const unresolvedOrderFields = Array.isArray(fieldPlan?.unresolved) && fieldPlan.unresolved.length > 0;
        const finalized = await base44.asServiceRole.entities.Order.updateMany(
          { id: record.id, updated_date: record.updated_date, smartsheet_pending_local_sync: true },
          { $set: {
            smartsheet_sync_snapshot: snapshot,
            smartsheet_last_synced_at: new Date().toISOString(),
            // A partial field reconciliation is not a completed Save & Sync.
            // Keep the durable queue marker until every held field is resolved.
            smartsheet_pending_local_sync: unresolvedOrderFields,
          } },
        );
        if (!finalized || finalized.updated !== 1) {
          throw new Error('Order changed while Smartsheet sync was running. The newer revision remains queued for Save & Sync.');
        }
      } else {
        const syncedAt = new Date().toISOString();
        const expectedMetadata = {
          id: record.id,
          smartsheet_sync_snapshot: snapshot,
          smartsheet_last_synced_at: syncedAt,
        };
        const metadataCommit=await base44.asServiceRole.entities.WorkOrder.updateMany({id:record.id,updated_date:record.updated_date},{$set:{smartsheet_sync_snapshot:snapshot,smartsheet_last_synced_at:syncedAt}});
        if(metadataCommit?.updated!==1)throw new Error('Sales changed during sync; the newer revision remains pending.');
        const verifiedMetadataRows = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          query: { id: record.id },
          sort: 'id',
          label: 'Sales push sync metadata verification',
        });
        const metadataFailures = findUnverifiedSyncMetadata([expectedMetadata], verifiedMetadataRows);
        if (metadataFailures.length) {
          throw new Error(
            'Sales Base44 sync metadata could not be verified after the Smartsheet write. Review this record before treating it as synchronized.'
          );
        }
        // Count Sales success only after both the Smartsheet write/read-back
        // and Base44 reconciliation metadata have been verified.
        if (salesSuccessfulWrite === 'created') created.push(record.id);
        else if (salesSuccessfulWrite === 'updated') updated.push(record.id);
      }
      if(fieldPlan?.decisions?.length)await base44.asServiceRole.entities.SyncConflict.updateMany({id:{$in:fieldPlan.decisions},status:'approved'},{$set:{status:'resolved',resolved_at:new Date().toISOString()}});
      await base44.asServiceRole.entities.SyncConflict.updateMany({dataset,entity_id:record.id,status:'open',local_version:pendingRecords[recordIndex].updated_date,...(fieldPlan?.unresolved?.length?{field_name:{$nin:fieldPlan.unresolved}}:{})},{$set:{status:'resolved',resolved_at:new Date().toISOString(),resolved_by:'Verified field reconciliation'}});
    } catch (err) {
      errors.push(`${record.id}: ${(err as any)?.message || 'unknown error'}`);
      if (dataset === 'orders') orderFailedRecordIds.add(String(record.id));
    }
  }

  // Recheck every approved Sales decision against a fresh batched read before
  // writing Smartsheet. A concurrent WorkOrder change invalidates this RUN's
  // planned approval; the existing review remains available for the next run.
  // This is not an atomic transaction across systems: the final Base44 save
  // also requires an exact WorkOrder-version compare-and-set.
  if (dataset === 'sales' && approvedSalesPlanSnapshots.size) {
    const approvalIds = [...approvedSalesPlanSnapshots.keys()];
    try {
      if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
      const recent = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.WorkOrder,
        query: { id: { $in: approvalIds } }, sort: 'id',
        label: 'Approved Sales review version preflight',
      });
      const latestById = new Map(recent.map((row: any) => [String(row.id), row]));
      for (const [id, planned] of approvedSalesPlanSnapshots) {
        if (!approvedSalesRecordStillCurrent(planned, latestById.get(id))) {
          salesFailedRecordIds.add(id);
          errors.push(id + ': This Sales WorkOrder changed after the approved review was planned. No approved remote write or Base44 reconciliation was attempted for this record; reload before retrying.');
        }
      }
    } catch (error: any) {
      // A failed preflight is never evidence of unchanged approved values.
      for (const id of approvalIds) {
        salesFailedRecordIds.add(id);
        errors.push(id + ': Approved Sales review version could not be checked. The review remains pending for a later safe retry.');
      }
    }
  }
  // Verify the remote values actually approved, rather than trusting the
  // earlier paginated sheet cache. Only approved rows incur these bounded
  // fresh reads; unrelated Sales/Order writes keep their existing flow.
  if (dataset === 'sales' && approvedSalesRemotePlans.size) {
    const targets = [...approvedSalesRemotePlans.entries()]
      .filter(([id]) => !salesFailedRecordIds.has(id));
    const columnIds = [...new Set(Object.values(bindings)
      .map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id)))];
    const assigneeColumnId = cleanText(bindings?.current_task_assigned_to, 40);
    for (let start = 0; start < targets.length; start += 100) {
      const batch = targets.slice(start, start + 100);
      try {
        if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
        const params = new URLSearchParams({
          rowIds: batch.map(([, plan]) => plan.rowId).join(','),
          columnIds: columnIds.join(','), exclude: 'nonexistentCells',
        });
        const result = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
        if (String(result.body?.id ?? '') !== sheetId) throw new Error('Unexpected Smartsheet sheet identity.');
        const fresh = new Map(normalizeSheetRows(result.body)
          .map((row: any) => [String(row.id), row]));
        for (const [id, planned] of batch) {
          const row: any = fresh.get(planned.rowId);
          const remote = row ? buildSalesPullSnapshot(row, bindings) : null;
          if (!approvedSalesRemoteSnapshotStillCurrent(planned.snapshot, remote, assigneeColumnId)) {
            salesFailedRecordIds.add(id);
            errors.push(id + ': Smartsheet changed after this Sales conflict was approved/planned. No approved write was sent for this row; review its latest values before retrying.');
          }
        }
      } catch (error: any) {
        for (const [id] of batch) {
          salesFailedRecordIds.add(id);
          errors.push(id + ': Fresh Smartsheet values for this approved Sales review could not be verified. The row was not written; review and retry.');
        }
      }
    }
  }
  // Ordinary Sales PUTs need the same fresh local revision preflight as
  // approved decisions. A long-running plan must not overwrite a newer
  // employee edit in Smartsheet simply because its final Base44 CAS fails.
  // Reads are bounded and read-only; incomplete reads hold only that batch.
  const salesPrewriteUnverifiedRows = new Set<string>();
  if (dataset === 'sales' && deferredSmartsheetWrites.length) {
    const outgoingRowIds = new Set(deferredSmartsheetWrites.map((row: any) => String(row.id)));
    const plans = [...deferredSalesVerification.entries()]
      .filter(([, verification]) => outgoingRowIds.has(String(verification.rowId)));
    const trackedRows = new Set(plans.map(([, verification]) => String(verification.rowId)));
    for (const rowId of outgoingRowIds) {
      if (!trackedRows.has(rowId)) {
        salesPrewriteUnverifiedRows.add(rowId);
        errors.push('Sales Smartsheet row ' + rowId +
          ': No versioned WorkOrder prewrite plan was found. No remote PUT was sent.');
      }
    }
    const plannedById = new Map(pendingRecords.map((row: any) => [String(row.id), row]));
    for (let start = 0; start < plans.length; start += 100) {
      const batch = plans.slice(start, start + 100);
      const ids = batch.map(([id]) => id);
      try {
        if (typeof options?.assertRunOwnership !== 'function') {
          throw new Error('Sales sync run ownership is unavailable');
        }
        await options.assertRunOwnership();
        const fresh = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          query: { id: { $in: ids } }, sort: 'id',
          label: 'Sales remote PUT local revision preflight',
        });
        const latestById = new Map(fresh.map((row: any) => [String(row.id), row]));
        for (const id of staleSalesRemotePutPlans(batch, plannedById, latestById, sheetId)) {
          salesFailedRecordIds.add(id);
          errors.push(id + ': Sales WorkOrder changed or its permanent row identity could not be verified immediately before Smartsheet PUT. Remote write held; reload before retrying.');
        }
      } catch {
        for (const id of ids) {
          salesFailedRecordIds.add(id);
          errors.push(id + ': Fresh Sales WorkOrder prewrite revision check was unavailable. Remote write held; retry after verifying the record.');
        }
      }
    }
  }
  // Ordinary Sales PUTs must also use freshly read Smartsheet values.
  // A remote edit after the initial planning read is not authorization to
  // overwrite that person's work. Approved decisions retain their separate
  // remote review guard above. Missing or inconsistent evidence fails closed.
  if (dataset === 'sales' && salesRemotePutPlans.size) {
    const targets = [...salesRemotePutPlans.entries()]
      .filter(([id]) => !approvedSalesPlanSnapshots.has(id) && !salesFailedRecordIds.has(id));
    const columnIds = [...new Set(Object.values(bindings)
      .map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id)))];
    const assigneeColumnId = cleanText(bindings?.current_task_assigned_to, 40);
    for (let start = 0; start < targets.length; start += 100) {
      const batch = targets.slice(start, start + 100);
      const ids = batch.map(([id]) => id);
      try {
        if (typeof options?.assertRunOwnership !== 'function' || !columnIds.length) {
          throw new Error('Sales prewrite remote verification is unavailable');
        }
        await options.assertRunOwnership();
        const rowIds = batch.map(([, plan]) => plan.rowId);
        const params = new URLSearchParams({
          rowIds: rowIds.join(','), columnIds: columnIds.join(','),
          exclude: 'nonexistentCells',
        });
        const result = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
        if (String(result.body?.id ?? '') !== sheetId || !Array.isArray(result.body?.rows) ||
            !columnIds.every((id: string) => result.body?.columns?.some((col: any) => String(col.id) === id))) {
          throw new Error('Smartsheet did not confirm the exact Sales sheet, columns and requested rows');
        }
        const remoteRows = normalizeSheetRows(result.body);
        const requested = new Set(rowIds);
        if (remoteRows.some((row: any) => !requested.has(String(row.id))) ||
            new Set(remoteRows.map((row: any) => String(row.id))).size !== remoteRows.length) {
          throw new Error('Smartsheet returned unexpected or duplicate Sales row identities');
        }
        const freshByRowId = new Map(remoteRows.map((row: any) =>
          [String(row.id), buildSalesPullSnapshot(row, bindings)]));
        for (const id of staleSalesRemotePutSnapshotIds(batch, freshByRowId, assigneeColumnId)) {
          salesFailedRecordIds.add(id);
          errors.push(id + ': Smartsheet Sales row changed after sync planning or cannot be verified. No ordinary remote PUT was sent for this row; review current values before retrying.');
        }
      } catch {
        for (const id of ids) {
          salesFailedRecordIds.add(id);
          errors.push(id + ': Fresh Smartsheet prewrite values could not be verified. Ordinary remote PUT held for safe retry.');
        }
      }
    }
  }
  // Order Retry Sync: an outgoing cell planned from the earlier sheet cache
  // must not overwrite a newer Smartsheet edit or a newer local Order revision.
  // Hold only affected Orders; preserve their durable pending markers. This is
  // a fresh pre-PUT check, not an atomic cross-system compare-and-swap.
  const heldOrderPrewriteRowIds = new Set<string>();
  if (dataset === 'orders' && deferredSmartsheetWrites.length) {
    const outgoingIds = new Set(deferredSmartsheetWrites.map((row: any) => String(row.id)));
    const plans = [...deferredOrderVerification.entries()]
      .filter(([, verification]) => outgoingIds.has(String(verification.rowId)));
    const plannedById = new Map(pendingRecords.map((record: any) => [String(record.id), record]));
    try {
      if (typeof options?.assertRunOwnership !== 'function' ||
          plans.length !== outgoingIds.size ||
          outgoingIds.size !== deferredSmartsheetWrites.length) {
        throw new Error('Order permanent-row prewrite ownership cannot be verified');
      }
      await options.assertRunOwnership();
      const currentOrders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { id: { $in: plans.map(([id]) => id) } }, sort: 'id',
        label: 'Order Retry Sync exact local prewrite revision',
      });
      const latestById = new Map(currentOrders.map((record: any) =>
        [String(record.id), record]));
      const columnIds = [...new Set(Object.values(bindings)
        .map((value: any) => String(value).trim()).filter((id: string) => /^\d+$/.test(id)))];
      if (!columnIds.length) throw new Error('Order mapped columns unavailable');
      const params = new URLSearchParams({
        rowIds: [...outgoingIds].join(','), columnIds: columnIds.join(','),
        exclude: 'nonexistentCells',
      });
      await options.assertRunOwnership();
      const remote = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
      if (String(remote.body?.id ?? '') !== sheetId ||
          !Array.isArray(remote.body?.rows) ||
          !columnIds.every((id: string) =>
            remote.body?.columns?.some((col: any) => String(col.id) === id))) {
        throw new Error('Fresh Order sheet/column evidence was incomplete');
      }
      const rows = normalizeSheetRows(remote.body);
      const requested = new Set(outgoingIds);
      if (rows.length !== requested.size ||
          new Set(rows.map((row: any) => String(row.id))).size !== requested.size ||
          rows.some((row: any) => !requested.has(String(row.id)))) {
        throw new Error('Fresh Order row identities were incomplete or duplicate');
      }
      const remoteByRowId = new Map(rows.map((row: any) =>
        [String(row.id), buildOrderPullSnapshot(row, bindings)]));
      for (const id of staleOrderRetryPrewriteIds(
        plans, plannedById, latestById, remoteByRowId, sheetId)) {
        orderFailedRecordIds.add(id);
        const rowId = deferredOrderVerification.get(id)?.rowId || '';
        heldOrderPrewriteRowIds.add(String(rowId));
        errors.push(id + ': Order or Smartsheet row ' + rowId +
          ' changed since Retry Sync planning. Remote PUT held; review current values and reload before retrying.');
        await reportOrderProgress({
          phase: 'needs_review', current: orderProcessedCount, total: pendingRecords.length,
          fraction: 0.5, item_label: 'Order ' + id,
          detail: 'Fresh Order or Smartsheet change held the stale PUT; review the current row',
          record_id: id, smartsheet_row_id: rowId,
        });
      }
    } catch {
      // Missing verification plans are not evidence a row can be written.
      // Hold the ENTIRE outgoing set if sheet/identity/ownership reads failed.
      for (const rowId of outgoingIds) heldOrderPrewriteRowIds.add(String(rowId));
      for (const [id, verification] of plans) {
        orderFailedRecordIds.add(id);
        errors.push(id + ': Fresh Order/Smartsheet prewrite evidence unavailable for row ' +
          verification.rowId + '. No remote PUT sent; verify and retry.');
      }
    }
  }
  const heldApprovedSalesRowIds = new Set([...salesPrewriteUnverifiedRows,
    ...[...salesFailedRecordIds].map((id) =>
      deferredSalesVerification.get(id)?.rowId ||
      approvedSalesPlanSnapshots.get(id)?.smartsheet_row_id)
      .filter((id) => id != null).map(String)]);
  const eligibleSmartsheetWrites = dataset === 'sales'
    ? deferredSmartsheetWrites.filter((row: any) => !heldApprovedSalesRowIds.has(String(row.id)))
    : dataset === 'orders'
      ? deferredSmartsheetWrites.filter((row: any) =>
          !heldOrderPrewriteRowIds.has(String(row.id)) &&
          ![...deferredOrderVerification.entries()].some(([id, verification]) =>
            String(verification.rowId) === String(row.id) && orderFailedRecordIds.has(id)))
      : deferredSmartsheetWrites;

  // Smartsheet has no documented conditional PUT/If-Match. A definitive 429
  // can safely retry only if its previously approved local and remote state
  // remains unchanged AFTER Retry-After. Uncertainty holds the whole PUT.
  const revalidateSalesRateLimitedPut = async () => {
    try {
      if (dataset !== 'sales' || typeof options?.assertRunOwnership !== 'function') {
        throw new Error('Sales run coordinator unavailable');
      }
      await options.assertRunOwnership();
      const rowIds = eligibleSmartsheetWrites.map((row: any) => String(row.id ?? ''));
      const uniqueRows = new Set(rowIds);
      if (!rowIds.length || uniqueRows.size !== rowIds.length ||
          rowIds.some((id) => !/^[0-9]+$/.test(id))) {
        throw new Error('Missing or duplicate Sales permanent row IDs');
      }
      const claims = new Map<string, [string, any][]>();
      for (const [id, verification] of deferredSalesVerification) {
        const rowId = String(verification.rowId ?? '');
        if (!uniqueRows.has(rowId)) continue;
        const prior = claims.get(rowId) || [];
        prior.push([id, verification]);
        claims.set(rowId, prior);
      }
      const plans: [string, any][] = [];
      for (const rowId of rowIds) {
        const matching = claims.get(rowId) || [];
        if (matching.length !== 1 || salesRemotePutPlans.get(matching[0][0])?.rowId !== rowId) {
          throw new Error('Sales PUT ownership cannot be uniquely verified');
        }
        plans.push(matching[0]);
      }
      const plannedById = new Map(pendingRecords.map((record: any) => [String(record.id), record]));
      const columnIds = [...new Set(Object.values(bindings)
        .map((value: any) => String(value).trim()).filter((id: string) => /^[0-9]+$/.test(id)))];
      if (!columnIds.length) throw new Error('Sales column bindings unavailable');
      const assigneeColumnId = cleanText(bindings?.current_task_assigned_to, 40);
      for (let start = 0; start < plans.length; start += 100) {
        const batch = plans.slice(start, start + 100);
        const batchRowIds = batch.map(([, verification]) => String(verification.rowId));
        await options.assertRunOwnership();
        const current = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          query: {id: {$in: batch.map(([id]) => id)}}, sort: 'id',
          label: 'Sales rate-limited PUT fresh WorkOrder verification',
        });
        const latest = new Map(current.map((record: any) => [String(record.id), record]));
        if (staleSalesRemotePutPlans(batch, plannedById, latest, sheetId).length) {
          throw new Error('Sales WorkOrder changed during rate limit wait');
        }
        const params = new URLSearchParams({
          rowIds: batchRowIds.join(','), columnIds: columnIds.join(','),
          exclude: 'nonexistentCells',
        });
        const remote = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
        if (String(remote.body?.id ?? '') !== sheetId || !Array.isArray(remote.body?.rows) ||
            !columnIds.every((id: string) =>
              remote.body?.columns?.some((column: any) => String(column.id) === id))) {
          throw new Error('Smartsheet sheet/column evidence incomplete');
        }
        const freshRows = normalizeSheetRows(remote.body);
        const batchIds = new Set(batchRowIds);
        if (freshRows.some((row: any) => !batchIds.has(String(row.id))) ||
            new Set(freshRows.map((row: any) => String(row.id))).size !== freshRows.length) {
          throw new Error('Smartsheet returned conflicting row identities');
        }
        const freshByRowId = new Map(freshRows.map((row: any) =>
          [String(row.id), buildSalesPullSnapshot(row, bindings)]));
        const remotePlans = batch.map(([id]) => [id, salesRemotePutPlans.get(id)]);
        if (staleSalesRemotePutSnapshotIds(remotePlans, freshByRowId, assigneeColumnId).length) {
          throw new Error('Smartsheet values changed during rate limit wait');
        }
      }
      // The initial ownership preflight may also expire during Retry-After.
      // Re-read every exact outgoing row's claims after the wait, not just the
      // planned WorkOrders' own versions and Smartsheet cell values.
      await verifySalesPushWriteOwnership(
        base44.asServiceRole.entities.WorkOrder, sheetId, pendingRecords, eligibleSmartsheetWrites);
      await options.assertRunOwnership();
    } catch {
      // A held definitive 429 batch cannot count as synchronized even if a
      // different editor independently entered the same desired values.
      throw Object.assign(new Error(
        'Sales rate-limit retry stopped: fresh local and Smartsheet row evidence could not be verified. Review before retrying.'
      ), {salesRateLimitRecheckBlocked: true});
    }
  };

  // Phase 2: Batch Smartsheet write. Neither Sales nor Order rows are
  // considered complete from the write acknowledgement alone; affected
  // permanent rows are freshly read back before Base44 sync metadata advances.
  // Smartsheet definitively rejected the preceding PUT with HTTP 429.
  // Before replaying the *same* payload after Retry-After, independently
  // verify its exact Base44 revisions, permanent rows, and unmoved remote
  // values again. The transport propagates this guard's failure, unlike
  // progress callbacks. No retry is authorized by matching row labels.
  const revalidateOrderRateLimitedPut = async () => {
    try {
      if (dataset !== 'orders' || typeof options?.assertRunOwnership !== 'function') {
        throw new Error('Order sync ownership verification unavailable');
      }
      await options.assertRunOwnership();
      const rowIds = eligibleSmartsheetWrites.map((row: any) => String(row.id ?? ''));
      const requested = new Set(rowIds);
      if (!rowIds.length || requested.size !== rowIds.length ||
          rowIds.some((id: string) => !/^\d+$/.test(id))) {
        throw new Error('Order retry rows are missing or duplicated');
      }
      const plans = [...deferredOrderVerification.entries()].filter(([, verification]) =>
        requested.has(String(verification.rowId)));
      if (plans.length !== requested.size ||
          new Set(plans.map(([, verification]) => String(verification.rowId))).size !== requested.size) {
        throw new Error('Order retry permanent-row plans cannot be uniquely verified');
      }
      const orderIds = plans.map(([id]) => id);
      const freshLocal = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { id: { $in: orderIds } }, sort: 'id',
        label: 'Order rate limit retry fresh Base44 revisions',
      });
      if (freshLocal.length !== plans.length ||
          new Set(freshLocal.map((record: any) => String(record.id))).size !== plans.length ||
          freshLocal.some((record: any) => !orderIds.includes(String(record.id)))) {
        throw new Error('Order retry Base44 records were missing, duplicated, or unrelated');
      }
      const latestById = new Map(freshLocal.map((record: any) => [String(record.id), record]));
      const plannedById = new Map(pendingRecords.map((record: any) => [String(record.id), record]));
      const columnIds = [...new Set(Object.values(bindings)
        .map((value: any) => String(value).trim()).filter((id: string) => /^\d+$/.test(id)))];
      if (!columnIds.length) throw new Error('Order retry mapped columns unavailable');
      const params = new URLSearchParams({
        rowIds: rowIds.join(','), columnIds: columnIds.join(','),
        exclude: 'nonexistentCells',
      });
      await options.assertRunOwnership();
      const remote = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
      if (String(remote.body?.id ?? '') !== sheetId ||
          !Array.isArray(remote.body?.rows) ||
          !columnIds.every((id: string) =>
            remote.body?.columns?.some((column: any) => String(column.id) === id))) {
        throw new Error('Order retry Smartsheet sheet/column evidence incomplete');
      }
      const currentRows = normalizeSheetRows(remote.body);
      if (currentRows.length !== requested.size ||
          new Set(currentRows.map((row: any) => String(row.id))).size !== requested.size ||
          currentRows.some((row: any) => !requested.has(String(row.id)))) {
        throw new Error('Order retry Smartsheet rows missing, duplicate, or unexpected');
      }
      const freshByRowId = new Map(currentRows.map((row: any) =>
        [String(row.id), buildOrderPullSnapshot(row, bindings)]));
      if (staleOrderRetryPrewriteIds(plans, plannedById, latestById, freshByRowId, sheetId).length) {
        throw new Error('Order or Smartsheet values changed during the rate-limit wait');
      }
      await options.assertRunOwnership();
    } catch {
      throw Object.assign(new Error(
        'Order Smartsheet rate-limit retry held: fresh Base44/Smartsheet identities or values could not be verified. Reload Orders and review current Smartsheet rows before retrying.'
      ), { orderRateLimitRecheckBlocked: true });
    }
  };

  let salesBatchWriteError = '';
  let orderBatchWriteError = '';
  if (eligibleSmartsheetWrites.length) {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    try {
      if (dataset === 'orders') {
        await reportOrderProgress({
          phase: 'writing', current: orderProcessedCount, total: pendingRecords.length, fraction: 0.52,
          item_label: `Writing ${deferredSmartsheetWrites.length} changed Order${deferredSmartsheetWrites.length === 1 ? '' : 's'}`,
          detail: 'Submitting the verified permanent-row updates to Smartsheet',
        });
      }
      // A newer off-pipeline or deleted WorkOrder can claim a permanent row
      // while backup, approvals, and remote preflights are running. Re-read
      // exact outgoing row ownership immediately before the FIRST PUT too.
      // An unverified claim holds the entire batch; read-back alone cannot
      // prove that a cancelled PUT was authorized or completed.
      if (dataset === 'sales') {
        try {
          await verifySalesPushWriteOwnership(
            base44.asServiceRole.entities.WorkOrder, sheetId, pendingRecords, eligibleSmartsheetWrites);
          if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
        } catch {
          throw Object.assign(new Error(
            'Sales Smartsheet PUT cancelled: permanent row ownership could not be freshly verified. Review before retrying.'
          ), {salesOwnershipRecheckBlocked: true});
        }
      }
      // A timed-out Sales PUT may already have committed remotely. Never
      // resend an uncertain mutation: rely on the existing fresh Smartsheet
      // read-back and verified Base44 CAS before any review is resolved.
      // Orders already use the same no-timeout-retry transport.
      await verifyOrderBackupBeforeFirstWrite();
      if (dataset === 'orders') firstOrderWriteAttempted = true;
      await smartsheetWriteNoTimeoutRetry(
        'PUT', '/sheets/' + sheetId + '/rows', token, eligibleSmartsheetWrites,
        ...(dataset === 'orders' ? [{
          onRateLimitWait: async ({ attempt, waitSeconds }: any) => reportOrderProgress({
            phase: 'waiting_rate_limit', current: orderProcessedCount, total: pendingRecords.length, fraction: 0.54,
            item_label: 'Waiting for Smartsheet',
            detail: `Rate limited: waiting ${waitSeconds}s before write retry ${attempt}/3`,
          }),
          onRateLimitRetry: async ({ attempt }: any) => reportOrderProgress({
            phase: 'retrying', current: orderProcessedCount, total: pendingRecords.length, fraction: 0.56,
            item_label: 'Rechecking Order data before retry',
            detail: `Revalidating permanent Base44 and Smartsheet rows after rate limit (${attempt}/3)`,
          }),
          beforeRateLimitRetry: async () => {
            await verifyOrderBackupBeforeFirstWrite({ definitive429Retry: true });
            await revalidateOrderRateLimitedPut();
          },
        }] : [{beforeRateLimitRetry: revalidateSalesRateLimitedPut}]));
      if (dataset === 'orders') firstOrderWriteConfirmed = true;
    } catch (err: any) {
      if (dataset === 'orders') {
        orderBatchWriteError = err?.message || 'unknown error';
        if (err?.orderRateLimitRecheckBlocked || err?.orderBackupFirstWriteBlocked || err?.upstreamStatus === 429) {
          // Definitive 429 responses did not authorize a PUT. A failed fresh
          // retry guard must not clear pending markers merely because an
          // independent read-back happens to contain the intended values.
          const heldRows = new Set(eligibleSmartsheetWrites.map((row: any) => String(row.id)));
          for (const [recordId, verification] of deferredOrderVerification) {
            if (!heldRows.has(String(verification.rowId))) continue;
            orderFailedRecordIds.add(recordId);
            orderVerificationReviews.set(recordId, {
              order_id: recordId, row_id: verification.rowId, state: 'verification_unavailable',
            });
            errors.push(recordId + ': Order PUT held after Smartsheet rate limiting. Fresh Base44 and Smartsheet values must be reviewed before retrying.');
          }
        }
      } else {
        salesBatchWriteError = err?.message || 'unknown error';
        if (err?.salesRateLimitRecheckBlocked || err?.salesOwnershipRecheckBlocked) {
          // A cancelled prewrite or definitive 429 has not authorized a PUT.
          // Do not infer success from an independently matching remote row:
          // exclude every held record from metadata advancement and reviews.
          const blockedRows = new Set(eligibleSmartsheetWrites.map((row: any) => String(row.id)));
          for (const [recordId, verification] of deferredSalesVerification) {
            if (blockedRows.has(String(verification.rowId))) salesFailedRecordIds.add(recordId);
          }
          errors.push('Sales remote PUT held before an authorized write or rate-limit retry: ' +
            salesBatchWriteError + '. Matching remote values do not clear the ownership/retry hold.');
        }
      }
    }
  }

  const salesRemoteVerifiedIds = new Set<string>();
  if (dataset === 'sales' && deferredSalesVerification.size) {
    for (const [recordId, verification] of deferredSalesVerification) {
      if (!verification.requiresRemoteWrite) salesRemoteVerifiedIds.add(recordId);
    }
    const remoteChecks = [...deferredSalesVerification.entries()]
      .filter(([, verification]) => verification.requiresRemoteWrite);
    const assigneeColumnId = cleanText(bindings?.current_task_assigned_to, 40);
    const verificationBatchSize = 100;
    for (let start = 0; start < remoteChecks.length; start += verificationBatchSize) {
      const batch = remoteChecks.slice(start, start + verificationBatchSize);
      try {
        if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
        const rowIds = batch.map(([, verification]) => verification.rowId);
        const columnIds = [...new Set(Object.values(bindings)
          .map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id)))];
        const params = new URLSearchParams({
          rowIds: rowIds.join(','),
          columnIds: columnIds.join(','),
          exclude: 'nonexistentCells',
        });
        const verificationResult = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
        // Require exact sheet, mapped columns and unique requested rows.
        // A partial/duplicate response is not evidence that Sales committed.
        const freshRows = verifiedSalesReadbackRows(
          verificationResult.body, sheetId, rowIds, columnIds);
        for (const [recordId, verification] of batch) {
          const freshRow: any = freshRows.get(verification.rowId);
          const actualSnapshot = freshRow ? buildSalesPullSnapshot(freshRow, bindings) : null;
          if (freshRow && salesSnapshotsEqual(verification.expectedSnapshot, actualSnapshot, assigneeColumnId)) {
            salesRemoteVerifiedIds.add(recordId);
          } else {
            salesFailedRecordIds.add(recordId);
            errors.push(recordId + ': Sales Smartsheet update could not be verified by read-back. Base44 sync metadata was not advanced.');
          }
        }
      } catch (err: any) {
        const detail = err?.message || 'remote verification failed';
        for (const [recordId] of batch) {
          salesFailedRecordIds.add(recordId);
          errors.push(recordId + ': Sales Smartsheet write outcome could not be verified (' + detail + '). Base44 sync metadata was not advanced.');
        }
      }
    }
    if (salesBatchWriteError && remoteChecks.some(([recordId]) => !salesRemoteVerifiedIds.has(recordId))) {
      errors.push('Batch Sales Smartsheet write reported: ' + salesBatchWriteError +
        '. Only rows independently read back as correct can advance Base44 sync metadata.');
    }
  }

  const orderRemoteVerifiedIds = new Set<string>();
  if (dataset === 'orders' && deferredOrderVerification.size) {
    // An unchanged Smartsheet row still requires a NEW exact-ID read-back:
    // the planning snapshot may be stale if an editor changed the row while
    // Save & Sync was running. Never clear a durable local pending marker on
    // the strength of the earlier planning GET alone.
    const remoteChecks = [...deferredOrderVerification.entries()];
    if (remoteChecks.length) {
      try {
        if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
        const rowIds = remoteChecks.map(([, verification]) => verification.rowId);
        const columnIds = [...new Set(Object.values(bindings)
          .map((id: any) => String(id).trim()).filter((id: string) => /^\d+$/.test(id)))];
        const params = new URLSearchParams({
          rowIds: rowIds.join(','),
          columnIds: columnIds.join(','),
          exclude: 'nonexistentCells',
        });
        await reportOrderProgress({
          phase: 'verifying', current: orderProcessedCount, total: pendingRecords.length, fraction: 0.6,
          item_label: `Verifying ${remoteChecks.length} Order${remoteChecks.length === 1 ? '' : 's'}`,
          detail: 'Fresh permanent-row read-back, including Orders requiring no Smartsheet write',
        });
        const verificationResult = await smartsheetGet('/sheets/' + sheetId + '?' + params.toString(), token);
        if (String(verificationResult.body?.id ?? '') !== sheetId) {
          throw new Error('Smartsheet returned a different sheet during Order write verification.');
        }
        const returnedRows = normalizeSheetRows(verificationResult.body);
        const requestedRowIds = new Set(rowIds);
        const freshRows = new Map(returnedRows.map((row: any) => [String(row.id), row]));
        if (requestedRowIds.size !== remoteChecks.length ||
            returnedRows.length !== requestedRowIds.size ||
            freshRows.size !== requestedRowIds.size ||
            returnedRows.some((row: any) => !requestedRowIds.has(String(row.id)))) {
          throw new Error('Smartsheet returned incomplete, duplicate, or unrelated Order rows during verification.');
        }
        for (let verifyIndex = 0; verifyIndex < remoteChecks.length; verifyIndex++) {
          const [recordId, verification] = remoteChecks[verifyIndex];
          const sourceRecord = pendingRecords.find((candidate: any) => String(candidate.id) === String(recordId));
          await reportOrderProgress({
            phase: 'verifying', current: orderProcessedCount, total: pendingRecords.length,
            fraction: 0.6 + (0.28 * ((verifyIndex + 1) / Math.max(1, remoteChecks.length))),
            item_label: sourceRecord ? orderProgressItemLabel(sourceRecord) : `Order ${verifyIndex + 1} of ${remoteChecks.length}`,
            detail: `Verifying Smartsheet row ${verification.rowId} · ${verifyIndex + 1}/${remoteChecks.length}`,
            record_id: recordId, smartsheet_row_id: verification.rowId,
          });
          const freshRow: any = freshRows.get(verification.rowId);
          if (freshRow && !detectConflict(freshRow.cells, verification.expectedSnapshot, bindings, 'orders')) {
            orderRemoteVerifiedIds.add(recordId);
          } else {
            orderFailedRecordIds.add(recordId);
            orderVerificationReviews.set(recordId, {
              order_id: recordId, row_id: verification.rowId, state: 'row_mismatch',
            });
            errors.push(recordId + ': Smartsheet row ' + verification.rowId +
              ' did not read back with the expected values. The Order remains queued.');
          }
        }
      } catch (err: any) {
        const detail = err?.message || 'remote verification failed';
        for (const [recordId, verification] of remoteChecks) {
          orderFailedRecordIds.add(recordId);
          orderVerificationReviews.set(recordId, {
            order_id: recordId, row_id: verification.rowId, state: 'verification_unavailable',
          });
          errors.push(recordId + ': Smartsheet row values could not be freshly verified (' +
            detail + '). The Order remains queued.');
        }
      }
      if (orderBatchWriteError && remoteChecks.some(([recordId]) => !orderRemoteVerifiedIds.has(recordId))) {
        errors.push('Batch Smartsheet write reported: ' + orderBatchWriteError +
          '. Only rows independently read back as correct can complete.');
      }
    }
  }

  // Phase 3: Persist Base44 reconciliation only after the corresponding remote
  // outcome is verified. Orders use per-record version CAS so a newer browser
  // edit cannot be overwritten by an older in-flight Save & Sync.
  if (deferredBase44Updates.length) {
    if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
    if (dataset === 'orders') {
      const commitAcks: string[] = [];
      const expectedById = new Map<string, any>();
      for (const update of deferredBase44Updates) {
        const recordId = String(update.id || '');
        const verification = deferredOrderVerification.get(recordId);
        if (!verification || !orderRemoteVerifiedIds.has(recordId) || orderFailedRecordIds.has(recordId)) continue;
        const { id: _id, ...fields } = update;
        try {
          await reportOrderProgress({
            phase: 'confirming', current: orderProcessedCount, total: pendingRecords.length,
            fraction: 0.9 + (0.06 * ((commitAcks.length + 1) / Math.max(1, deferredBase44Updates.length))),
            item_label: `Confirming Order ${commitAcks.length + 1}`,
            detail: 'Saving verified sync metadata in Base44 with version protection',
            record_id: recordId, smartsheet_row_id: verification.rowId,
          });
          const committed = await base44.asServiceRole.entities.Order.updateMany(
            { id: recordId, updated_date: verification.originalUpdatedDate, smartsheet_pending_local_sync: true },
            { $set: fields },
          );
          if (!committed || committed.updated !== 1) {
            throw new Error('Order changed while sync was running; its newer revision remains queued.');
          }
          commitAcks.push(recordId);
          expectedById.set(recordId, update);
        } catch (err: any) {
          orderFailedRecordIds.add(recordId);
          errors.push(recordId + ': ' + (err?.message || 'Base44 reconciliation commit failed'));
        }
      }

      if (commitAcks.length) {
        let verifiedRecords: any[] = [];
        try {
          verifiedRecords = await loadAllEntityRows({
            entity: base44.asServiceRole.entities.Order,
            query: { id: { $in: commitAcks } },
            sort: 'id',
            label: 'Order Save & Sync partial-result verification',
          });
        } catch (err: any) {
          errors.push('Order Base44 read-back failed after sync: ' + (err?.message || 'unknown error'));
        }
        const recordById = new Map(verifiedRecords.map((record: any) => [String(record.id), record]));
        for (const recordId of commitAcks) {
          const expected = expectedById.get(recordId);
          const record: any = recordById.get(recordId);
          const metadataFailed = !record ||
            findUnverifiedSyncMetadata([expected], record ? [record] : []).length > 0 ||
            record?.smartsheet_pending_local_sync !== false;
          // Base44 bulk writes can silently drop date fields; re-read and
          // repair Smartsheet-winning date/text changes exactly like pull does
          // before this record may count as synced.
          let dateVerificationError: any = null;
          const verification = deferredOrderVerification.get(recordId);
          if (!metadataFailed && verification && Object.keys(verification.dateChanges || {}).length) {
            try {
              await verifyPulledOrderDates(
                base44.asServiceRole.entities.Order, recordId,
                verification.previous, verification.dateChanges);
            } catch (dateErr: any) {
              dateVerificationError = dateErr;
            }
          }
          if (!metadataFailed && !dateVerificationError) {
            updated.push(recordId);
            continue;
          }
          orderFailedRecordIds.add(recordId);
          errors.push(dateVerificationError
            ? `${recordId}: Order date/text verification: ${dateVerificationError?.message || 'unknown error'}. The Order was re-queued.`
            : recordId + ': Base44 could not verify the completed Order sync metadata. The Order was re-queued.');
          try {
            await base44.asServiceRole.entities.Order.updateMany(
              { id: recordId },
              { $set: { smartsheet_pending_local_sync: true } },
            );
          } catch {
            // The client performs an authoritative reload after partial results;
            // never claim this row succeeded when durable re-queue is uncertain.
          }
        }
      }
    } else {
      const verifiedSalesUpdates = deferredBase44Updates.filter((update: any) =>
        salesRemoteVerifiedIds.has(String(update.id)) && !salesFailedRecordIds.has(String(update.id))
      );
      if (verifiedSalesUpdates.length) {
        try {
          // Ordinary Sales metadata also needs the exact planning revision:
          // a successful Smartsheet read-back must not overwrite newer local
          // WorkOrder edits. Keep approved decisions on their existing CAS path.
          const approvedUpdates = verifiedSalesUpdates.filter((update: any) => approvedSalesPlanSnapshots.has(String(update.id)));
          const ordinaryUpdates = verifiedSalesUpdates.filter((update: any) => !approvedSalesPlanSnapshots.has(String(update.id)));
          for (const update of ordinaryUpdates) {
            const id = String(update.id);
            const verification = deferredSalesVerification.get(id);
            const { id: _ordinaryId, ...fields } = update;
            try {
              await commitVerifiedSalesMetadata({
                entity: base44.asServiceRole.entities.WorkOrder,
                recordId: id,
                plannedVersion: verification?.originalUpdatedDate,
                sheetId, rowId: verification?.rowId,
                fields, assertRunOwnership: options?.assertRunOwnership,
              });
            } catch (error: any) {
              salesFailedRecordIds.add(id);
              errors.push(id + ': Ordinary Sales metadata failed the final WorkOrder revision/row guard. Newer local edits remain pending; reload before retrying.');
            }
          }
          for (const update of approvedUpdates) {
            const id = String(update.id);
            const planned = approvedSalesPlanSnapshots.get(id);
            const { id: _approvedId, ...fields } = update;
            try {
              if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();
              const committed = await base44.asServiceRole.entities.WorkOrder.updateMany(
                { id, updated_date: planned.updated_date }, { $set: fields },
              );
              if (committed?.updated !== 1) throw new Error('The approved Sales record changed during synchronization.');
            } catch (error: any) {
              salesFailedRecordIds.add(id);
              errors.push(id + ': Approved Sales review did not pass the final WorkOrder revision guard. Reload before retrying; the review remains pending.');
            }
          }
          const verifiedRecords = await loadAllEntityRows({
            entity: base44.asServiceRole.entities.WorkOrder,
            query: { id: { $in: verifiedSalesUpdates.map((update: any) => update.id) } },
            sort: 'id',
            label: 'Sales push sync metadata verification',
          });
          const metadataFailures = findUnverifiedSyncMetadata(verifiedSalesUpdates, verifiedRecords);
          const failedMetadataIds = new Set(metadataFailures.map((failure: any) => String(failure.id)));
          for (const update of verifiedSalesUpdates) {
            const recordId = String(update.id);
            if (failedMetadataIds.has(recordId) || salesFailedRecordIds.has(recordId)) {
              salesFailedRecordIds.add(recordId);
              errors.push(recordId + ': Sales Base44 sync metadata could not be verified after the Smartsheet write.');
            } else {
              updated.push(recordId);
            }
          }
        } catch (err: any) {
          errors.push('Batch Base44 update (' + verifiedSalesUpdates.length + ' records): ' + (err?.message || 'unknown error'));
        }
      }
    }
  }

  // Phase 5: Resolve conflict decisions only for records whose full Order
  // reconciliation was verified. Failed/uncertain rows keep their review state.
  if (dataset === 'orders') {
    const successfulOrderUpdates = new Set(updated.map(String));
    const successfulDecisionIds = [...deferredOrderConflictDecisions.entries()]
      .filter(([recordId]) => successfulOrderUpdates.has(recordId))
      .flatMap(([, decisionIds]) => decisionIds);
    if (successfulDecisionIds.length) {
      try { await base44.asServiceRole.entities.SyncConflict.updateMany({id:{$in:successfulDecisionIds},status:'approved'},{$set:{status:'resolved',resolved_at:new Date().toISOString()}}); } catch {}
    }
    if (successfulOrderUpdates.size) {
      try { await base44.asServiceRole.entities.SyncConflict.updateMany({dataset:'orders',entity_id:{$in:[...successfulOrderUpdates]},status:'open'},{$set:{status:'resolved',resolved_at:new Date().toISOString(),resolved_by:'Verified field reconciliation'}}); } catch {}
    }
  } else {
    // An approved Sales review is only a requested decision, never proof that
    // either remote task/field or local snapshot reconciliation succeeded.
    // Retain approved AND open reviews for every failed/unverified WorkOrder.
    const verifiedTargets = verifiedSalesConflictResolutionTargets({
      verifiedWorkOrderIds: updated,
      approvedDecisionsByWorkOrder: deferredSalesConflictDecisions,
      openReviewWorkOrderIds: deferredConflictRecordIds,
    });
    if (verifiedTargets.approvedDecisionIds.length) {
      try { await base44.asServiceRole.entities.SyncConflict.updateMany({id:{$in:verifiedTargets.approvedDecisionIds},status:'approved'},{$set:{status:'resolved',resolved_at:new Date().toISOString()}}); } catch {}
    }
    if (verifiedTargets.openReviewWorkOrderIds.length) {
      try { await base44.asServiceRole.entities.SyncConflict.updateMany({dataset,entity_id:{$in:verifiedTargets.openReviewWorkOrderIds},status:'open'},{$set:{status:'resolved',resolved_at:new Date().toISOString(),resolved_by:'Verified Sales field reconciliation'}}); } catch {}
    }
  }

  if (dataset === 'sales') {
    await persistSalesReviews(base44,queuedSalesReviews,options?.assertRunOwnership,salesReviews);
    await reportSalesProgress({phase:orderTimeBudgetReached?'paused':'finishing',current:orderProcessedCount,total:pendingRecords.length,item_label:'Sales checks finished',detail:`${conflicts.length} records have held value differences; ${errors.length} write errors`});
  }
  if (dataset === 'orders') {
    await reportOrderProgress({
      phase: orderTimeBudgetReached ? 'paused' : (conflicts.length || orderFailedRecordIds.size ? 'needs_review' : 'finishing'),
      current: orderProcessedCount,
      total: pendingRecords.length,
      fraction: orderTimeBudgetReached ? 0.97 : 0.99,
      item_label: orderTimeBudgetReached ? 'Safe time limit reached'
        : (conflicts.length || orderFailedRecordIds.size ? 'Order sync needs review' : 'Finalizing Order sync'),
      detail: orderTimeBudgetReached
        ? `${Math.max(0, pendingRecords.length - orderProcessedCount).toLocaleString()} Order${pendingRecords.length - orderProcessedCount === 1 ? '' : 's'} remain safely queued for the next sync`
        : (conflicts.length || orderFailedRecordIds.size
          ? `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} · ${orderFailedRecordIds.size} Order${orderFailedRecordIds.size === 1 ? '' : 's'} with errors remain isolated for review/retry`
          : `${orderProcessedCount.toLocaleString()} Order${orderProcessedCount === 1 ? '' : 's'} processed and verified`),
    });
  }

  const successfulOrderRecordIds = dataset === 'orders'
    ? [...new Set([...created, ...updated].map(String))]
    : [];
  const successfulOrderSet = new Set(successfulOrderRecordIds);
  const unresolvedOrderRecordIds = dataset === 'orders'
    ? pendingRecords.map((record: any) => String(record.id || '')).filter((id: string) => id && !successfulOrderSet.has(id))
    : [];

  return {
    dataset,
    direction: 'push',
    sheet_id: sheetId,
    records_examined: records.length,
    created: created.length, ...preservedSalesReview,
    updated: updated.length,
    ...((dataset === 'sales' || dataset === 'orders') ? { unchanged_skipped: unchangedSkipped } : {}),
    conflicts: conflicts.length,
    errors: dataset === 'orders' ? orderFailedRecordIds.size : errors.length,
    error_details: errors.slice(0, 10),
    conflict_record_ids: conflicts.slice(0, 10),
    ...(dataset === 'sales' ? {processed_records:orderProcessedCount,remaining_records:Math.max(0,pendingRecords.length-orderProcessedCount),...(orderTimeBudgetReached?{skipped:true,partial:true,time_budget_reached:true,reason:'Sales push paused safely at its time limit. Remaining changes stay queued.'}:{})} : {}),
    ...(dataset === 'orders' ? {
      requestor_contacts_skipped_no_valid_email: requestorContactsSkippedNoEmail,
      processed_records: orderProcessedCount,
      remaining_records: Math.max(0, pendingRecords.length - orderProcessedCount),
      successful_record_ids: successfulOrderRecordIds.slice(0, 100),
      unresolved_record_ids: unresolvedOrderRecordIds.slice(0, 100),
      remote_verification_review_count: orderVerificationReviews.size,
      remote_verification_review_items: [...orderVerificationReviews.values()].slice(0, 10),
      missing_permanent_row_links: orderMissingPermanentRows.size,
      missing_permanent_row_record_ids: [...orderMissingPermanentRows.keys()].slice(0, 100),
      missing_permanent_smartsheet_row_ids: [...orderMissingPermanentRows.values()].slice(0, 100),
      permanent_row_matching_strategy: 'configured_sheet_and_permanent_row_id_only',
      automatic_relink_attempted: false,
      ...(orderTimeBudgetReached ? {
        skipped: true,
        partial: true,
        time_budget_reached: true,
        reason: `Order push paused safely after ${orderProcessedCount} of ${pendingRecords.length} changed Orders to avoid a platform timeout. Remaining Orders stay queued for the next sync.`,
      } : {}),
    } : {}),
  };
}

async function smartsheetSyncHandler(req: Request): Promise<Response> {
  let base44Instance: any = null;
  let claimedRunStartedAt = '';
  let claimedDataset: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 80).toLowerCase() || 'status';
    const backgroundSync = ['run_sync', 'run_sales_sync', 'run_order_sync', 'push_dataset', 'pull_dataset'].includes(action);
    const base44 = withEntityRateLimitRetry(measureSyncEntities(createClientFromRequest(req)), { paceMs: backgroundSync ? 1000 : 0, maxRetries: 1 });
    base44Instance = base44;
    const claimInvocationRun = async (status: any, dataset?: string) => {
      const claimed = await claimSyncRun(base44, status, dataset);
      claimedRunStartedAt = cleanText(status?.started_at, 80);
      claimedDataset = cleanText(dataset, 20) || null;
      return claimed;
    };
    const token = String(secrets.get(TOKEN_SECRET_NAME) || '').trim();
    const configured = Boolean(token);

    // A missing session is not proof of a trusted scheduled workflow. Only
    // the exact scheduled run_sync action with its workflow-only capability
    // may run without an authenticated admin session. Dataset actions never do.
    const hasSessionToken = Boolean(String(body?.session_token || '').trim());
    const scheduledRun = !hasSessionToken && ['run_sync', 'run_sales_sync', 'run_order_sync'].includes(action) &&
      await hasWorkflowInvocationCapability(body, 'smartsheetSyncAction');
    let adminActor: any = null;
    if (hasSessionToken) {
      const actor = await authenticateSignShopSession(base44, body?.session_token);
      // Save & Sync is intentionally available to any currently authorized
      // user, but it can only push exact saved record IDs for its dataset.
      const allowedOrderManualPull = action === 'pull_dataset' && body?.dataset === 'orders' && Boolean(actor?.id);
      if (actor?.role !== 'admin' && !['push_saved_orders', 'push_saved_sales'].includes(action) && !allowedOrderManualPull) {
        return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      }
      adminActor = actor;
    } else if (!scheduledRun) {
      const platformActor = await base44.auth.me().catch(() => null);
      if (platformActor?.role !== 'admin') return Response.json({ success: false, error: 'Admin session or verified scheduled workflow is required.' }, { status: 403 });
      adminActor = platformActor;
    }

    await beginSyncTraceStorage(base44);
    if (['conflict_list','conflict_count','resolve_conflict'].includes(action)) {
      return Response.json(await handleConflictReview({base44,body,actor:adminActor,token,loadConfig:()=>loadSyncConfig(base44),get:path=>smartsheetGet(path,token),claim:(state,dataset)=>claimInvocationRun(state,dataset),finish:(state,start,dataset)=>saveSyncStatusForRun(base44,state,start,dataset),push:(dataset,profile,config,options)=>pushDataset(base44,token,dataset,profile,config,options),assertOwner:(start,dataset)=>assertSyncRunOwnership(base44,start,dataset)}));
    }
    if (action === 'status') {
      const [orderStatusRecord, salesStatusRecord] = await Promise.all([
        ensureSyncStatusRecord(base44, SYNC_STATUS_KEYS.orders).catch(() => null),
        ensureSyncStatusRecord(base44, SYNC_STATUS_KEYS.sales).catch(() => null),
      ]);
      return Response.json({
        success: true,
        // Read-only deployment fingerprint. An absent marker means the active
        // backend has not yet picked up the Order run-scoped cleanup contract.
        order_sync_backend_contract: 'order-run-scoped-cleanup-v1',
        dataset_coordinators: 'per-dataset-v1',
        status_orders: orderStatusRecord?.setting_value || null,
        status_sales: salesStatusRecord?.setting_value || null,
        configured,
        read_only: false,
        secret_name: TOKEN_SECRET_NAME,
        api_base_url: API_BASE,
        supported_actions: ['status', 'config_get', 'config_save', 'order_request_types_save', 'order_requestor_contact_sync', 'sync_alert_get', 'sync_alert_save', 'sync_alert_test', 'test_connection', 'list_sheets', 'sheet_columns', 'sheet_rows', 'preview_sales_est_inv_snapshot', 'apply_sales_est_inv_backfill', 'audit_order_requestor_emails', 'audit_order_create_attempts', 'audit_order_link_integrity', 'audit_order_import_sync_evidence', 'audit_order_dates', 'audit_order_backup_readiness', 'review_unresolved_order_pull_row', 'review_unresolved_order_pull_batch', 'resolve_unresolved_order_pull_evidence', 'relink_order_smartsheet_row', 'delete_order_record', 'preview_order_customer_decision', 'commit_order_customer_decision', 'audit_sales_create_attempts', 'audit_sales_permanent_ownership', 'review_sales_create_candidate', 'recover_verified_sales_create', 'audit_sales_recovery_history', 'acknowledge_sales_recovery_history', 'run_sync', 'run_sales_sync', 'run_order_sync', 'push_dataset', 'pull_dataset', 'push_saved_orders', 'push_saved_sales', 'recover_stale_order_run', 'recover_stale_sales_run'],
        write_actions_available: true,
      });
    }

    if (action === 'preview_order_customer_decision') {
      // Order Form-only admin read-only preflight. The selected decision is
      // informational: no CAS, PUT, snapshot, approval token or write occurs.
      if (adminActor?.role !== 'admin' || !hasSessionToken) {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      const review = body?.review;
      const decision = cleanText(body?.decision, 48);
      const preliminary = checkOrderCustomerDecisionEvidence({ review, decision });
      if (preliminary !== 'order_changed' && preliminary !== 'invalid_review') {
        // Unknown validation outcome: preserve and fail closed.
        return Response.json({ success: false, error: 'Order customer decision request is invalid.' }, { status: 400 });
      }
      if (preliminary === 'invalid_review') {
        return Response.json({ success: false, state: preliminary,
          error: 'The captured review lacks valid permanent IDs or source revisions. Run Sync to obtain fresh review evidence.' }, { status: 409 });
      }
      const { config, duplicateCount } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(review.sheet_id, 40);
      const rowId = cleanText(review.row_id, 40);
      const orderId = cleanText(review.order_id, 80);
      const customerColumn = cleanText(profile?.column_bindings?.customer_name, 40);
      if (!configured || duplicateCount !== 1 || !config?.global_enabled ||
          !profile?.mirror_enabled || cleanText(profile.smartsheet_sheet_id, 40) !== sheetId ||
          !/^\d+$/.test(customerColumn)) {
        return Response.json({ success: false, state: 'configuration_changed',
          error: 'The saved Order Smartsheet mapping or configuration is unavailable. No decision was applied.' }, { status: 409 });
      }
      const [order, job, claims] = await Promise.all([
        base44.asServiceRole.entities.Order.get(orderId),
        base44.asServiceRole.entities.WorkOrder.get(cleanText(review.work_order_id, 100)),
        loadAllEntityRows({ entity: base44.asServiceRole.entities.Order,
          query: { smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId },
          sort: 'id', label: 'Order customer decision permanent row claim review' }),
      ]);
      const remoteResponse = await smartsheetGet(`/sheets/${sheetId}/rows/${rowId}`, token);
      const remoteRow = normalizeSheetRows({ rows: [remoteResponse.body] })[0] || null;
      const remoteName = remoteRow
        ? buildOrderPullSnapshot(remoteRow, { customer_name: customerColumn })[customerColumn]
        : undefined;
      // Repeat local reads after remote network wait. This preview still
      // cannot authorize a future write; commit must repeat ALL checks.
      const [freshOrder, freshJob, freshClaims] = await Promise.all([
        base44.asServiceRole.entities.Order.get(orderId),
        base44.asServiceRole.entities.WorkOrder.get(cleanText(review.work_order_id, 100)),
        loadAllEntityRows({ entity: base44.asServiceRole.entities.Order,
          query: { smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId },
          sort: 'id', label: 'Order customer decision final permanent row ownership' }),
      ]);
      const duplicateClaims = claims.length !== 1 || String(claims[0]?.id) !== orderId ||
        freshClaims.length !== 1 || String(freshClaims[0]?.id) !== orderId;
      const state = checkOrderCustomerDecisionEvidence({
        review, decision, order: freshOrder, job: freshJob,
        remoteRow, remoteCustomerName: remoteName, duplicateClaims,
      });
      if (state !== 'verified_read_only' ||
          String(order?.updated_date || '') !== String(freshOrder?.updated_date || '') ||
          String(job?.updated_date || '') !== String(freshJob?.updated_date || '')) {
        return Response.json({ success: false, state: state === 'verified_read_only' ? 'source_changed_during_read' : state,
          error: 'The Order, linked job, or Smartsheet row cannot be verified against this captured review. Run Sync and review again; nothing was changed.' }, { status: 409 });
      }
      return Response.json({ success: true, read_only: true, writes_attempted: false,
        state, decision, order_id: orderId, sheet_id: sheetId, row_id: rowId,
        order_updated_date: String(freshOrder.updated_date),
        remote_modified_at: String(remoteRow.modified_at),
        result: decision === 'keep_linked_job'
          ? 'A later approved action would need to verify and correct the Smartsheet customer. This preview made no changes.'
          : 'A later approved action would need to atomically adopt the Smartsheet customer and clear the Base44 job association. This preview made no changes.',
      });
    }

    if (action === 'commit_order_customer_decision') {
      // First explicit resolution path only. No Smartsheet PUT or automatic
      // relinking. Never retry this action after an uncertain acknowledgement.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'Order Form administrator session required.' }, { status: 403 });
      }
      const review = body?.review;
      const decision = cleanText(body?.decision, 48);
      const preflight = planOrderSmartsheetCustomerUnlink({
        review, decision, confirmed: body?.confirmed === true,
      });
      if (preflight.reason === 'explicit_admin_confirmation_required' ||
          preflight.reason === 'invalid_review') {
        return Response.json({ success: false,
          error: 'A verified, explicit Order customer unlink decision is required.' }, { status: 400 });
      }
      const sheetId = cleanText(review?.sheet_id, 40);
      const rowId = cleanText(review?.row_id, 40);
      const orderId = cleanText(review?.order_id, 80);
      const workOrderId = cleanText(review?.work_order_id, 100);
      const { config, duplicateCount } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const customerColumn = cleanText(profile?.column_bindings?.customer_name, 40);
      if (!configured || duplicateCount !== 1 || !config?.global_enabled ||
          !profile?.mirror_enabled || cleanText(profile?.smartsheet_sheet_id, 40) !== sheetId ||
          !/^\d+$/.test(customerColumn)) {
        return Response.json({ success: false, state: 'configuration_changed',
          error: 'The current Order Smartsheet configuration was not verified. No changes made.' }, { status: 409 });
      }
      const entity = base44.asServiceRole.entities.Order;
      const readOwners = () => loadAllEntityRows({
        entity, query: { smartsheet_sheet_id: sheetId, smartsheet_row_id: rowId },
        sort: 'id', label: 'Order conflict resolution permanent row ownership',
      });
      const [firstOrder, firstJob, firstClaims] = await Promise.all([
        entity.get(orderId),
        base44.asServiceRole.entities.WorkOrder.get(workOrderId),
        readOwners(),
      ]);
      const firstRemote = await smartsheetGet(`/sheets/${sheetId}/rows/${rowId}`, token);
      const firstRow = normalizeSheetRows({ rows: [firstRemote.body] })[0] || null;
      const nameOf = row => row ? buildOrderPullSnapshot(row, { customer_name: customerColumn })[customerColumn] : undefined;
      const firstPlan = planOrderSmartsheetCustomerUnlink({
        review, decision, confirmed: true, order: firstOrder, job: firstJob,
        remoteRow: firstRow, remoteCustomerName: nameOf(firstRow),
        duplicateClaims: firstClaims.length !== 1 || String(firstClaims[0]?.id) !== orderId,
      });
      if (!firstPlan.ok) return Response.json({ success: false, state: firstPlan.reason,
        error: 'The Order conflict evidence is stale or ambiguous. Run Sync and review before retrying.' }, { status: 409 });

      // Re-read both stores directly before the single CAS write. The remote
      // revision is not a distributed lock: preserve pending evidence for a
      // later conflict-aware Sync rather than assume cross-system atomicity.
      const secondRemote = await smartsheetGet(`/sheets/${sheetId}/rows/${rowId}`, token);
      const secondRow = normalizeSheetRows({ rows: [secondRemote.body] })[0] || null;
      const [latestOrder, latestJob, latestClaims] = await Promise.all([
        entity.get(orderId),
        base44.asServiceRole.entities.WorkOrder.get(workOrderId),
        readOwners(),
      ]);
      const plan = planOrderSmartsheetCustomerUnlink({
        review, decision, confirmed: true, order: latestOrder, job: latestJob,
        remoteRow: secondRow, remoteCustomerName: nameOf(secondRow),
        duplicateClaims: latestClaims.length !== 1 || String(latestClaims[0]?.id) !== orderId,
      });
      if (!plan.ok || String(firstOrder?.updated_date) !== String(latestOrder?.updated_date) ||
          String(firstJob?.updated_date) !== String(latestJob?.updated_date) ||
          String(firstRow?.modified_at) !== String(secondRow?.modified_at)) {
        return Response.json({ success: false, state: plan.ok ? 'source_changed_during_verification' : plan.reason,
          error: 'Order or Smartsheet evidence changed before the protected save. Nothing was intentionally changed.' }, { status: 409 });
      }
      // The only business mutation: adopt the confirmed Smartsheet customer,
      // remove the previous permanent job association, and durably queue the
      // Order for reconciled metadata confirmation. No remote write here.
      let saved;
      try {
        // Reuse the existing audited full-version Order CAS save. Its only
        // business write is one updateMany for all three fields together.
        saved = await trackedConditionalSave(base44, 'Order', latestOrder,
          plan.patch, adminActor, 'admin');
      } catch {
        return Response.json({ success: false, state: 'save_acknowledgement_uncertain',
          error: 'The Order save or its audit acknowledgement was not verified. Reload the Order to determine whether it was saved; do not submit again blindly.' }, { status: 409 });
      }
      if (!saved || String(saved.customer_name ?? '') !== plan.patch.customer_name ||
          String(saved.work_order_id ?? '') !== '' ||
          saved.smartsheet_pending_local_sync !== true ||
          String(saved.smartsheet_sheet_id ?? '') !== sheetId ||
          String(saved.smartsheet_row_id ?? '') !== rowId) {
        return Response.json({ success: false, state: 'save_readback_uncertain',
          error: 'The Order update may have succeeded but its saved fields could not be verified. Reload; do not blindly resubmit.' }, { status: 409 });
      }
      return Response.json({ success: true, verified: true, writes_attempted: true,
        smartsheet_writes_attempted: false, state: 'saved_pending_sync',
        order_id: orderId, sheet_id: sheetId, row_id: rowId,
        customer_name: plan.patch.customer_name, work_order_id: '',
        pending_sync: true,
      });
    }

    if (action === 'audit_sales_permanent_ownership') {
      // Read-only, admin-session-only complete linked/marker scan. A failed
      // or capped page read fails closed; this is NOT a unique-index guarantee.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({success:false,error:'An authenticated Sales administrator is required.'},{status:403});
      }
      const {config,duplicateCount} = await loadSyncConfig(base44);
      const sheetId = cleanText(config?.sales?.smartsheet_sheet_id,40);
      if (duplicateCount !== 1 || !/^\d+$/.test(sheetId)) {
        return Response.json({success:false,error:'The configured Sales sheet identity could not be verified.'},{status:409});
      }
      const entity = base44.asServiceRole.entities.WorkOrder;
      const [links,attempts] = await Promise.all([
        loadAllEntityRows({entity,query:{smartsheet_row_id:{$exists:true}},sort:'id',
          label:'Sales permanent row ownership linked records'}),
        loadAllEntityRows({entity,query:{smartsheet_create_attempt:{$exists:true}},sort:'id',
          label:'Sales permanent row ownership durable attempt records'}),
      ]);
      return Response.json({success:true,dataset:'sales',
        ...auditSalesPermanentRowOwners(links,attempts,sheetId)});
    }

    if (action === 'audit_sales_create_attempts' || action === 'review_sales_create_candidate') {
      // Never expose unverified Sales creation evidence to a regular user or a
      // scheduled/background invocation. Neither action claims the coordinator,
      // writes WorkOrders or edits a Smartsheet row.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({success:false,error:'An authenticated Sales administrator is required.'},{status:403});
      }
      const {config,duplicateCount} = await loadSyncConfig(base44);
      const profile = config?.sales || {};
      const sheetId = cleanText(profile.smartsheet_sheet_id,40);
      const bindings = filterSalesColumnBindings(profile.column_bindings || {});
      const columnIds = [...new Set(Object.values(bindings)
        .map((value:any)=>String(value).trim()).filter((value:string)=>/^\d+$/.test(value)))];
      if (duplicateCount !== 1 || !/^\d+$/.test(sheetId) || !columnIds.length) {
        return Response.json({success:false,error:'The Sales Smartsheet configuration cannot be verified.'},{status:409});
      }
      const attempts = await loadAllEntityRows({
        entity:base44.asServiceRole.entities.WorkOrder,
        query:{smartsheet_create_attempt:{$exists:true}},
        sort:'id',label:'Admin read-only Sales create attempts',
      });
      if (action === 'audit_sales_create_attempts') {
        return Response.json({success:true,read_only:true,writes_attempted:false,
          dataset:'sales',sheet_id:sheetId,...summarizeSalesCreateAttempts(attempts,sheetId)});
      }
      const workorderId = cleanText(body?.workorder_id,100);
      const rowId = cleanText(body?.smartsheet_row_id,40);
      if (!workorderId || !/^\d+$/.test(rowId)) return Response.json({
        success:false,error:'A WorkOrder ID and explicit numeric permanent Smartsheet row ID are required.'},{status:400});
      const record = await base44.asServiceRole.entities.WorkOrder.get(workorderId);
      if (!record || !record.smartsheet_create_attempt) return Response.json({
        success:false,error:'No saved Sales create attempt was found for that WorkOrder.'},{status:409});
      // Use the same complete claim surfaces as automatic creation. Legacy
      // WorkOrders missing a sheet ID must still block a conflicting row link.
      const {linked:rowsAlreadyLinked, attempts:otherAttempts} =
        await readSalesCreateRowClaims(base44, sheetId, rowId);
      const params = new URLSearchParams({
        rowIds:rowId,columnIds:columnIds.join(','),exclude:'nonexistentCells',
      });
      const remote = await smartsheetGet('/sheets/'+sheetId+'?'+params.toString(),token);
      if (String(remote.body?.id ?? '')!==sheetId ||
          !Array.isArray(remote.body?.rows) ||
          !columnIds.every((id:string)=>remote.body?.columns?.some((col:any)=>String(col.id)===id))) {
        throw new Error('Smartsheet sheet, row, or column metadata could not be verified; no conclusion was accepted.');
      }
      const rows = normalizeSheetRows(remote.body);
      if (rows.some((row:any)=>String(row.id)!==rowId) || rows.length>1) {
        throw new Error('Smartsheet returned unexpected or duplicate permanent row IDs.');
      }
      const candidate = classifySalesCreateReview({
        record,sheetId,rowId,bindings,otherLinkedRecords:rowsAlreadyLinked,
        otherAttempts,remoteVerified:rows.length===1,
        remoteSnapshot:rows.length===1 ? buildSalesPullSnapshot(rows[0],bindings) : null,
      });
      return Response.json({success:true,dataset:'sales',...candidate});
    }

    if (action === 'recover_verified_sales_create') {
      // Exact, previously acknowledged permanent row only. This is an admin
      // recovery of ONE WorkOrder, not a Smartsheet POST, import or mass repair.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({success:false,error:'An authenticated Sales administrator is required.'},{status:403});
      }
      const workorderId = cleanText(body?.workorder_id,100);
      const rowId = cleanText(body?.smartsheet_row_id,40);
      const expectedVersion = cleanText(body?.expected_updated_date,100);
      const expectedAttemptId = cleanText(body?.expected_attempt_id,130);
      if (!workorderId || !/^\d+$/.test(rowId) || !expectedVersion || !expectedAttemptId ||
          body?.confirm_exact_recorded_row !== true) {
        return Response.json({success:false,error:'Exact WorkOrder, previously recorded permanent row, reviewed version, attempt ID and explicit confirmation are required.'},{status:400});
      }
      const {config,duplicateCount} = await loadSyncConfig(base44);
      const profile = config?.sales || {};
      const sheetId = cleanText(profile.smartsheet_sheet_id,40);
      const bindings = filterSalesColumnBindings(profile.column_bindings || {});
      const columnIds = [...new Set(Object.values(bindings)
        .map((v:any)=>String(v).trim()).filter((v:string)=>/^\d+$/.test(v)))];
      if (duplicateCount !== 1 || !/^\d+$/.test(sheetId) || !columnIds.length) {
        return Response.json({success:false,error:'The Sales sheet or its mapped columns could not be verified.'},{status:409});
      }
      const entity = base44.asServiceRole.entities.WorkOrder;
      // Share automatic creation's legacy-aware, fully paged ownership read.
      // Narrow sheet+row queries miss old links whose sheet ID was never saved.
      const readCompetingClaims = async () => readSalesCreateRowClaims(base44, sheetId, rowId);
      const readRemoteSnapshot = async () => {
        const params = new URLSearchParams({
          rowIds:rowId,columnIds:columnIds.join(','),exclude:'nonexistentCells',
        });
        const remote = await smartsheetGet('/sheets/'+sheetId+'?'+params.toString(),token);
        if (String(remote.body?.id ?? '')!==sheetId ||
            !Array.isArray(remote.body?.rows) ||
            !columnIds.every((id:string)=>remote.body?.columns?.some((col:any)=>String(col.id)===id))) {
          throw new Error('Smartsheet did not confirm the exact configured sheet and mapped columns.');
        }
        const rows = normalizeSheetRows(remote.body);
        if (rows.length !== 1 || String(rows[0]?.id)!==rowId) {
          throw new Error('Smartsheet did not return exactly the confirmed permanent row ID.');
        }
        const latest = await entity.get(workorderId);
        return {verified:true,snapshot:buildSalesPullSnapshot(rows[0],bindings),
          localSnapshot:latest ? buildSnapshot(latest,bindings,'sales') : null};
      };
      const recoveryRunStartedAt = new Date().toISOString();
      // Acquire the existing singleton run CAS before any recovery writes.
      // Another manual recovery, Save & Sync, or scheduled pull/push cannot
      // simultaneously own it. No separate locks or permanent entities.
      try {
        await claimInvocationRun({
          status:'running',started_at:recoveryRunStartedAt,
          action:'recover_verified_sales_create',
          progress_dataset:'sales',progress_direction:'recovery',
          current_step_label:'Sales Pipeline permanent-row recovery',
          total_steps:1,completed_steps:0,results:[],
        },'sales');
        const result = await recoverVerifiedSalesCreateLink({
          entity,historyEntity:base44.asServiceRole.entities.CellHistory,
          workorderId,sheetId,rowId,expectedVersion,expectedAttemptId,
          bindings,readCompetingClaims,readRemoteSnapshot,actor:adminActor,
          assertRunOwnership:()=>assertSyncRunOwnership(base44,recoveryRunStartedAt,'sales'),
        });
        const completed = await saveSyncStatusForRun(base44,{
          status:'completed',needs_review:false,action,
          total_steps:1,completed_steps:1,current_step_label:'',
          completed_at:new Date().toISOString(),
          results:[{dataset:'sales',direction:'recovery',workorder_id:workorderId,
            row_id:rowId,recovered:true,history_verified:true}],
        },recoveryRunStartedAt,'sales');
        if (!completed) throw new Error('Sales row was recovered, but the run coordinator completion could not be verified. Review its status and WorkOrder before any further action.');
        return Response.json({success:true,dataset:'sales',...result});
      } catch (error:any) {
        if (claimedRunStartedAt === recoveryRunStartedAt) {
          await saveSyncStatusForRun(base44,{
            status:'needs_review',needs_review:true,action,
            total_steps:1,completed_steps:1,current_step_label:'',
            completed_at:new Date().toISOString(),
            results:[{dataset:'sales',direction:'recovery',workorder_id:workorderId,
              row_id:rowId,skipped:true,outcome_unverified:true,errors:1,
              reason:'Permanent-row recovery requires inspection of the original WorkOrder and coordinator before retry.'}],
          },recoveryRunStartedAt,'sales');
        }
        return Response.json({success:false,needs_review:true,
          error:error?.message || 'The Sales recovery could not be verified. Review before trying again.'},{status:409});
      }
    }

    if (action === 'audit_sales_recovery_history' || action === 'acknowledge_sales_recovery_history') {
      // An uncertain CellHistory write is never blindly repeated. These
      // admin-only actions inspect exact existing history and optionally
      // acknowledge the one verified event on the WorkOrder with a CAS.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({success:false,error:'An authenticated Sales administrator is required.'},{status:403});
      }
      const workorderId = cleanText(body?.workorder_id,100);
      if (!workorderId) return Response.json({
        success:false,error:'The exact recovered WorkOrder ID is required.'},{status:400});
      const entity = base44.asServiceRole.entities.WorkOrder;
      const historyEntity = base44.asServiceRole.entities.CellHistory;
      const readEvents = async (id:string) => loadAllEntityRows({
        entity:historyEntity,
        query:{entity_type:'WorkOrder',entity_id:id,field_name:'smartsheet_row_id'},
        sort:'id',label:'Sales verified link recovery CellHistory events',
      });
      try {
        if (action === 'audit_sales_recovery_history') {
          const record = await entity.get(workorderId);
          const evidence = classifySalesRecoveryHistory(record,await readEvents(workorderId));
          return Response.json({success:true,dataset:'sales',read_only:true,writes_attempted:false,...evidence});
        }
        if (body?.confirm_existing_event !== true ||
            !cleanText(body?.expected_updated_date,100) ||
            !cleanText(body?.expected_attempt_id,130) ||
            !cleanText(body?.expected_history_event_id,100)) {
          return Response.json({success:false,error:'Explicit confirmation and the exact reviewed WorkOrder version, attempt and history event IDs are required.'},{status:400});
        }
        const result = await acknowledgeVerifiedSalesRecoveryHistory({
          entity,historyEntity,workorderId,actor:adminActor,readEvents,
          expectedVersion:cleanText(body.expected_updated_date,100),
          expectedAttemptId:cleanText(body.expected_attempt_id,130),
          expectedEventId:cleanText(body.expected_history_event_id,100),
        });
        return Response.json({success:true,dataset:'sales',...result});
      } catch(error:any) {
        return Response.json({success:false,needs_review:true,
          error:error?.message || 'Sales recovery history was not fully verified. Reload the review.'},{status:409});
      }
    }

    if (action === 'recover_stale_sales_run') {
      const record=await loadSingleSyncStatusRecord(base44,SYNC_STATUS_KEYS.sales), current=record.setting_value;
      const expected=cleanText(body.expected_started_at,80);
      if(!expected || expected!==current?.started_at || !classifyRecoverableStaleSalesSync(current).recoverable) return Response.json({success:false,error:'Sales is still reporting recent progress or the run changed. Reload before retrying.'},{status:409});
      const at=new Date().toISOString(), next={...recoveredStaleSalesSyncValue(current,at),updated_at:at};
      const saved=await base44.asServiceRole.entities.GlobalSettings.updateMany({id:record.id,updated_date:record.updated_date},{$set:{setting_value:next}});
      if(saved?.updated!==1) return Response.json({success:false,error:'Progress changed during recovery; no run was closed.'},{status:409});
      const verified=await base44.asServiceRole.entities.GlobalSettings.get(record.id);
      if(verified.setting_value?.stale_recovered_at!==at)throw new Error('Sales recovery could not be verified.');
      return Response.json({success:true,recovered:true,status:verified.setting_value});
    }

    if (action === 'review_unresolved_order_pull_batch') {
      // Admin-only. Each call compares at most 20 permanent-ID pairs from ONE
      // recorded batch. No writes, coordinator claims or reconciliation.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      const runStartedAt = cleanText(body?.run_started_at, 80);
      const evidenceRecord = await readOrderPullEvidenceStore(base44.asServiceRole.entities.GlobalSettings);
      const evidence = evidenceRecord?.setting_value;
      const sheetId = cleanText(evidence?.smartsheet_sheet_id, 40);
      let plan: any;
      try {
        plan = planUnresolvedOrderBatchReview(evidence, {
          runStartedAt, sheetId, batchNumber: body?.batch_number,
          offset: body?.offset ?? 0,
        });
      } catch (error: any) {
        return Response.json({ success: false, error: error?.message || 'Unresolved Order batch evidence changed.' }, { status: 409 });
      }
      const { config, duplicateCount } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const bindings = profile.column_bindings || {};
      const columnIds = numericIdList(Object.values(bindings), 100);
      if (duplicateCount !== 1 || cleanText(profile.smartsheet_sheet_id, 40) !== sheetId || !columnIds.length) {
        return Response.json({ success: false,
          error: 'The Order sheet configuration no longer matches this unresolved batch.' }, { status: 409 });
      }
      const ids = plan.pairs.map((pair: any) => pair.orderId);
      const rowIds = plan.pairs.map((pair: any) => pair.rowId);
      const [orders, remoteResponse] = await Promise.all([
        loadAllEntityRows({
          entity: base44.asServiceRole.entities.Order,
          query: { id: { $in: ids } }, sort: 'id',
          pageSize: 50, maxRows: 100,
          label: 'Order Form read-only batch review permanent-ID Orders',
        }),
        smartsheetGet(`/sheets/${sheetId}?${new URLSearchParams({
          rowIds: rowIds.join(','), columnIds: columnIds.join(','),
          exclude: 'nonexistentCells',
        }).toString()}`, token),
      ]);
      verifyOrderCreateAuditSheetIdentity(remoteResponse.body, sheetId);
      // Reject the entire page if Smartsheet's rowIds-filtered sheet response
      // omitted any requested ID; an API omission is not evidence of deletion.
      verifyUnresolvedOrderBatchSheetRows(remoteResponse.body, rowIds);
      const rows = normalizeSheetRows(remoteResponse.body);
      if (rows.length !== rowIds.length) {
        throw new Error('Smartsheet Order batch normalization was incomplete; no comparison was confirmed.');
      }
      const requestedOrders = new Set(ids);
      if (orders.length !== ids.length || new Set(orders.map((order: any) => String(order.id))).size !== orders.length ||
          orders.some((order: any) => !requestedOrders.has(String(order.id)))) {
        throw new Error('Base44 Order batch response was incomplete or contained unexpected permanent IDs; no comparison was confirmed.');
      }
      const byOrderId = new Map(orders.map((order: any) => [String(order.id), order]));
      const byRowId = new Map(rows.map((row: any) => [String(row.id), row]));
      const reports = plan.pairs.map((pair: any) =>
        buildOrderPullReadOnlyRowReport({
          base44Order: byOrderId.get(pair.orderId) || null,
          remoteRow: byRowId.get(pair.rowId) || null,
          orderId: pair.orderId, rowId: pair.rowId, sheetId, bindings,
        }),
      );
      const current = await readOrderPullEvidenceStore(base44.asServiceRole.entities.GlobalSettings);
      if (!sameStableValue(current?.setting_value, evidence) || current?.id !== evidenceRecord.id) {
        return Response.json({ success: false,
          error: 'The unresolved Order batch changed during review. Discard partial results and refresh.' }, { status: 409 });
      }
      return Response.json({
        success: true, read_only: true, writes_attempted: false, evidence_unresolved: true,
        run_started_at: runStartedAt, sheet_id: sheetId,
        ...summarizeUnresolvedOrderBatchPage(plan, reports),
      });
    }

    if (action === 'review_unresolved_order_pull_row') {
      // Order Form admin read-only diagnostics. No sync coordinator claim,
      // snapshot advancement, marker clearing, relinking, or retry is allowed.
      if (adminActor?.role !== 'admin' || !hasSessionToken) {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      const requestedRun = cleanText(body?.run_started_at, 80);
      const orderId = cleanText(body?.order_id, 100);
      const rowId = cleanText(body?.smartsheet_row_id, 40);
      const evidenceRecord = await readOrderPullEvidenceStore(base44.asServiceRole.entities.GlobalSettings);
      const evidence = evidenceRecord?.setting_value;
      const sheetId = cleanText(evidence?.smartsheet_sheet_id, 40);
      const match = findUnresolvedOrderEvidencePair(evidence, {
        runStartedAt: requestedRun, orderId, rowId, sheetId,
      });
      if (!match) {
        return Response.json({ success: false,
          error: 'This exact permanent Order/Smartsheet row pair is not part of the active unresolved evidence. Refresh the review; nothing changed.' }, { status: 409 });
      }
      const { config, duplicateCount } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const bindings = profile.column_bindings || {};
      const columnIds = numericIdList(Object.values(bindings), 100);
      if (duplicateCount !== 1 || cleanText(profile.smartsheet_sheet_id, 40) !== sheetId ||
          !columnIds.length) {
        return Response.json({ success: false,
          error: 'Order sheet configuration no longer matches the unresolved evidence. No comparison was claimed.' }, { status: 409 });
      }

      // Exact immutable IDs, not customer names or visual sheet positions.
      const base44Order = await base44.asServiceRole.entities.Order.get(orderId);
      // Failed reads are not proof that a production Order is missing; return
      // an error rather than silently treating an API outage as absent data.
      const remoteResponse = await smartsheetGet(`/sheets/${sheetId}/rows/${rowId}`, token);
      const remoteRow = normalizeSheetRows({ rows: [remoteResponse.body] })[0] || null;
      let report: any;
      if (base44Order?.id && String(base44Order.id) === orderId &&
          !base44Order.deleted && remoteRow?.id === rowId &&
          String(base44Order.smartsheet_sheet_id ?? '') === sheetId &&
          String(base44Order.smartsheet_row_id ?? '') === rowId) {
        const dateAudit = auditOrderDateParity([base44Order], [remoteRow], bindings, sheetId);
        if (dateAudit.counts.invalid_date_values > 0) {
          report = { base44_order_id: orderId, smartsheet_row_id: rowId,
            state: 'invalid_remote_dates', fields: [],
            message: 'Smartsheet date translation is invalid. Review source cells; no write or snapshot change was attempted.' };
        } else {
          const rawFields = parseRowToFields(remoteRow, bindings, 'orders');
          const expectedFields: Record<string, any> = {};
          for (const [key, val] of Object.entries(rawFields)) {
            if (val === '' && ['date_needed', 'date_ordered', 'date_received'].includes(key) &&
                rawFields[orderDateOptionField(key)]) {
              expectedFields[key] = '';
              continue;
            }
            if (val === '' && ['date_needed_option', 'date_ordered_option', 'receipt_option'].includes(key) &&
                ['date_needed', 'date_ordered', 'date_received'].some(dateKey =>
                  orderDateOptionField(dateKey) === key && rawFields[dateKey])) {
              expectedFields[key] = '';
              continue;
            }
            const normalized = normalizePullValue(key, val);
            if (normalized !== undefined) expectedFields[key] = normalized;
          }
          Object.assign(expectedFields, orderStatusFromPulledDates(
            expectedFields, base44Order, columnIds.includes(cleanText(bindings?.status, 40)),
          ));
          report = compareUnresolvedOrderEvidenceRow({
            base44Order, remoteRow, orderId, sheetId, rowId, expectedFields,
            expectedSnapshot: buildOrderPullSnapshot(remoteRow, bindings),
          });
        }
      } else {
        report = compareUnresolvedOrderEvidenceRow({
          base44Order, remoteRow, orderId, sheetId, rowId,
        });
      }

      // A long-running read must not return stale data as an authoritative
      // reconciliation after a different run or evidence mutation.
      const current = await readOrderPullEvidenceStore(base44.asServiceRole.entities.GlobalSettings);
      if (!sameStableValue(current?.setting_value, evidence) ||
          current?.id !== evidenceRecord.id) {
        return Response.json({ success: false,
          error: 'Order evidence changed while reviewing. Reload before comparing again.' }, { status: 409 });
      }
      return Response.json({
        success: true, read_only: true, writes_attempted: false, evidence_unresolved: true,
        run_started_at: requestedRun, sheet_id: sheetId,
        batch_number: match.batchNumber, batch_write_state: match.batchState, report,
      });
    }

    if (action === 'resolve_unresolved_order_pull_evidence') {
      // Admin-only explicit resolution for the independent Order pull evidence.
      // Requires the exact recorded run identity plus confirm_reviewed, verifies
      // every recorded permanent Base44 Order still exists and still links to its
      // recorded Smartsheet row, then marks the evidence verified_complete through
      // the same concurrency-guarded completion a finished pull uses. It never
      // retries, replays, or relinks any write.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      const runStartedAt = cleanText(body?.run_started_at, 80);
      const sheetId = cleanText(body?.sheet_id, 40);
      if (!runStartedAt || body?.confirm_reviewed !== true) {
        return Response.json({ success: false,
          error: 'Resolution requires the exact run_started_at and confirm_reviewed:true after an administrator reviews the recorded pairs.' }, { status: 409 });
      }
      const evidenceRecord = await readOrderPullEvidenceStore(base44.asServiceRole.entities.GlobalSettings);
      const evidence = evidenceRecord?.setting_value;
      if (evidence?.state !== 'unresolved' || evidence?.run_started_at !== runStartedAt ||
          String(evidence?.smartsheet_sheet_id ?? '') !== String(sheetId)) {
        return Response.json({ success: false,
          error: 'The unresolved Order pull evidence does not match that run. Reload the review panel; nothing was changed.' }, { status: 409 });
      }
      // Evidence that omitted older attempted batches cannot be fully verified;
      // their permanent-ID pairs are not retained, so they need manual review.
      if (Number(evidence?.batch_evidence?.older_batches_omitted) > 0) {
        return Response.json({ success: false,
          error: 'This run attempted more batches than the evidence retains. The omitted permanent-ID pairs require manual reconciliation; the evidence stays unresolved.' }, { status: 409 });
      }
      // Reuse the batch review planner to enumerate every recorded permanent-ID
      // pair; it rejects malformed or duplicate identities.
      const pairs: { orderId: string; rowId: string }[] = [];
      try {
        for (const batch of evidence?.batch_evidence?.recent_batches || []) {
          let offset: number | null = 0;
          while (offset !== null) {
            const plan = planUnresolvedOrderBatchReview(evidence, {
              runStartedAt, sheetId, batchNumber: batch?.batch_number, offset,
            });
            pairs.push(...plan.pairs);
            offset = plan.nextOffset;
          }
        }
      } catch (error: any) {
        return Response.json({ success: false,
          error: error?.message || 'The unresolved Order batch evidence could not be enumerated.' }, { status: 409 });
      }
      if (!pairs.length) {
        return Response.json({ success: false,
          error: 'The unresolved Order evidence retained no permanent-ID pairs to verify.' }, { status: 409 });
      }
      // Every recorded Order must still exist and still link to its recorded
      // permanent row; a moved or deleted link requires manual reconciliation.
      const requestedIds = new Set(pairs.map((pair: any) => pair.orderId));
      const orders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        query: { id: { $in: pairs.map((pair: any) => pair.orderId) } }, sort: 'id',
        pageSize: 50, maxRows: 600,
        label: 'Order Form evidence resolution permanent-ID Orders',
      });
      const byOrderId = new Map(orders.map((order: any) => [String(order.id), order]));
      const linkFailures = pairs
        .filter((pair: any) => {
          const order = byOrderId.get(pair.orderId);
          return !order || order.deleted ||
            String(order.smartsheet_row_id ?? '') !== pair.rowId ||
            String(order.smartsheet_sheet_id ?? '') !== String(sheetId);
        })
        .map((pair: any) => ({ base44_order_id: pair.orderId, smartsheet_row_id: pair.rowId }));
      if (orders.length !== requestedIds.size || linkFailures.length) {
        return Response.json({ success: false,
          error: 'One or more recorded Orders are missing, deleted, or no longer linked to their recorded Smartsheet row. Resolve those permanent links manually; the evidence stays unresolved.',
          pairs_checked: pairs.length, link_failures: linkFailures }, { status: 409 });
      }
      // The completion helper re-reads the store, enforces same-run identity,
      // writes through a conditional updateMany, and verifies the read-back.
      const resolved = await verifyCompletedOrderPullEvidence(
        base44.asServiceRole.entities.GlobalSettings, { startedAt: runStartedAt });
      return Response.json({
        success: true, evidence_state: resolved.state, verified_at: resolved.verified_at,
        pairs_checked: pairs.length, run_started_at: runStartedAt, sheet_id: sheetId,
      });
    }

    if (action === 'relink_order_smartsheet_row') {
      // Admin-only permanent-ID relink for an Order whose stored Smartsheet row
      // was deleted and recreated. Requires the exact current (dead) row ID and
      // the exact replacement row ID; the replacement must exist in the
      // configured sheet and belong to no other active Order. One conditional
      // Base44 write changes only smartsheet_row_id; field values, snapshots,
      // and pending-sync markers stay for the normal pull/push paths to
      // reconcile. Never matches by customer, description, or row position.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      if (!configured) {
        return Response.json({ success: false, error: 'Smartsheet API token is not configured.' }, { status: 503 });
      }
      const orderId = cleanText(body?.order_id, 100);
      const currentRowId = cleanText(body?.expected_current_row_id, 40);
      const newRowId = cleanText(body?.new_smartsheet_row_id, 40);
      if (!orderId || !/^\d+$/.test(currentRowId) || !/^\d+$/.test(newRowId) ||
          currentRowId === newRowId || body?.confirm_relink !== true) {
        return Response.json({ success: false,
          error: 'Relink requires order_id, expected_current_row_id, a different numeric new_smartsheet_row_id, and confirm_relink:true.' }, { status: 400 });
      }
      const { config, duplicateCount } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(profile.smartsheet_sheet_id, 40);
      if (duplicateCount !== 1 || !/^\d+$/.test(sheetId)) {
        return Response.json({ success: false,
          error: 'The Order sheet configuration is missing or ambiguous. No link was changed.' }, { status: 409 });
      }
      const order = await base44.asServiceRole.entities.Order.get(orderId).catch(() => null);
      if (!order?.id || order.deleted || String(order.smartsheet_sheet_id ?? '') !== sheetId) {
        return Response.json({ success: false,
          error: 'The Order does not exist or is not linked to the configured sheet. No link was changed.' }, { status: 409 });
      }
      if (String(order.smartsheet_row_id ?? '') !== currentRowId) {
        return Response.json({ success: false,
          error: 'The stored Smartsheet row link no longer matches. Reload the Order before relinking.',
          stored_smartsheet_row_id: order.smartsheet_row_id ?? null }, { status: 409 });
      }
      const remoteResponse = await smartsheetGet(`/sheets/${sheetId}/rows/${newRowId}`, token).catch(() => null);
      const remoteRow = remoteResponse?.body;
      if (String(remoteRow?.id ?? '') !== newRowId ||
          String(remoteRow?.sheetId ?? remoteRow?.sheet_id ?? '') !== sheetId) {
        return Response.json({ success: false,
          error: 'Smartsheet did not confirm that exact permanent row in the configured Order sheet. No link was changed.' }, { status: 409 });
      }
      const linkedOrders = await base44.asServiceRole.entities.Order.filter({ smartsheet_row_id: newRowId });
      const conflicting = (Array.isArray(linkedOrders) ? linkedOrders : linkedOrders ? [linkedOrders] : [])
        .filter((record: any) => record?.id && String(record.id) !== orderId && record.deleted !== true);
      if (conflicting.length) {
        return Response.json({ success: false,
          error: 'Another active Order already links to that Smartsheet row. Review the duplicate permanent link before changing anything.',
          conflicting_order_ids: conflicting.slice(0, 5).map((record: any) => String(record.id)) }, { status: 409 });
      }
      const updateResult = await base44.asServiceRole.entities.Order.updateMany(
        { id: orderId, smartsheet_row_id: currentRowId, updated_date: order.updated_date },
        { $set: { smartsheet_row_id: newRowId } },
      );
      if (!updateResult || updateResult.updated !== 1) {
        return Response.json({ success: false,
          error: 'The Order changed while the link was being updated. Reload before retrying.' }, { status: 409 });
      }
      const verified = await base44.asServiceRole.entities.Order.get(orderId).catch(() => null);
      if (String(verified?.smartsheet_row_id ?? '') !== newRowId) {
        return Response.json({ success: false,
          error: 'The permanent link update could not be verified. Review the Order before syncing.' }, { status: 500 });
      }
      return Response.json({
        success: true, order_id: orderId,
        previous_smartsheet_row_id: currentRowId, smartsheet_row_id: newRowId,
        smartsheet_sheet_id: sheetId, fields_changed: false,
        relinked_by: cleanText(adminActor?.email, 320),
        message: 'Permanent Smartsheet row link updated. Order fields, snapshot, and pending-sync marker are unchanged; the next pull or Save & Sync reconciles values by the new permanent row ID.',
      });
    }

    if (action === 'delete_order_record') {
      // Admin-only permanent delete for an Order already in Order Trash.
      // Refuses any record still carrying Smartsheet relationship evidence so
      // the permanent-ID tombstone that prevents orphan/recreated Orders is
      // never erased by this path. Conditional delete + read-back verify.
      if (!hasSessionToken || adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      const orderId = cleanText(body?.order_id, 100);
      if (!orderId || body?.confirm_delete !== true) {
        return Response.json({ success: false,
          error: 'Permanent delete requires order_id and confirm_delete:true.' }, { status: 400 });
      }
      const order = await base44.asServiceRole.entities.Order.get(orderId).catch(() => null);
      if (!order?.id) {
        return Response.json({ success: false, error: 'No Order with that ID exists.' }, { status: 404 });
      }
      if (order.deleted !== true) {
        return Response.json({ success: false,
          error: 'Only an Order already in Order Trash can be permanently deleted. Move it to Order Trash first.' }, { status: 409 });
      }
      const snapshot = order.smartsheet_sync_snapshot;
      const hasSnapshot = typeof snapshot === 'string' ? snapshot.trim().length > 0 && snapshot.trim() !== '{}'
        : Boolean(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && Object.keys(snapshot).length > 0);
      if (cleanText(order.smartsheet_row_id, 40) || cleanText(order.smartsheet_sheet_id, 40) ||
          cleanText(order.smartsheet_last_synced_at, 60) || order.smartsheet_create_attempt || hasSnapshot) {
        return Response.json({ success: false,
          error: 'This Order preserves a Smartsheet relationship or create history. Its permanent-ID tombstone prevents orphan/recreated Orders; clear the relationship through the documented recovery flow before permanent deletion.' }, { status: 409 });
      }
      const deleteResult = await base44.asServiceRole.entities.Order.deleteMany(
        { id: orderId, updated_date: order.updated_date, deleted: true },
      );
      if (!deleteResult || Number(deleteResult.deleted) !== 1) {
        return Response.json({ success: false,
          error: 'The Order changed while the delete was attempted or the delete could not be applied. Reload Order Trash before retrying.' }, { status: 409 });
      }
      const verify = await base44.asServiceRole.entities.Order.get(orderId).then(() => true).catch(() => false);
      if (verify) {
        return Response.json({ success: false,
          error: 'The permanent delete could not be verified. Review Order Trash before retrying.' }, { status: 500 });
      }
      return Response.json({
        success: true, order_id: orderId, permanently_deleted: true,
        deleted_by: cleanText(adminActor?.email, 320),
        message: 'Order permanently deleted. It had no Smartsheet relationship, so no permanent-ID tombstone was lost.',
      });
    }

    if (action === 'recover_stale_order_run') {
      const records = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: SYNC_STATUS_KEYS.orders });
      const matches = Array.isArray(records) ? records.filter((record: any) => record?.id) : (records?.id ? [records] : []);
      if (matches.length !== 1) {
        return Response.json({ success: false,
          error: `Order Smartsheet sync status has ${matches.length} records. Recovery requires exactly one Order status record.` }, { status: 409 });
      }
      const record = matches[0];
      const current = record?.setting_value || {};
      const expectedStartedAt = cleanText(body?.expected_started_at, 80);
      if (!expectedStartedAt || expectedStartedAt !== cleanText(current?.started_at, 80)) {
        return Response.json({ success: false,
          error: 'The sync run changed before recovery. Reload the status before retrying.' }, { status: 409 });
      }
      const classification = classifyRecoverableStaleOrderSync(current, Date.now());
      if (!classification.recoverable) {
        const reason = classification.reason === 'heartbeat_fresh'
          ? 'This Order sync is still reporting recent progress and cannot be closed as stalled.'
          : 'The current sync status is not a recoverable stalled Order run.';
        return Response.json({ success: false, error: reason, stale_state: classification.reason }, { status: 409 });
      }

      const recoveredAt = new Date().toISOString();
      const nextValue = {
        ...recoveredStaleOrderSyncValue(current, recoveredAt),
        updated_at: recoveredAt,
        stale_recovered_by: cleanText(adminActor?.email, 320),
      };
      const updateResult = await base44.asServiceRole.entities.GlobalSettings.updateMany(
        { id: record.id, setting_key: SYNC_STATUS_KEYS.orders, updated_date: record.updated_date },
        { $set: { setting_value: nextValue } },
      );
      if (!updateResult || updateResult.updated !== 1) {
        return Response.json({ success: false,
          error: 'The sync status changed while recovery was being applied. Reload before retrying.' }, { status: 409 });
      }
      const verified = await base44.asServiceRole.entities.GlobalSettings.get(record.id).catch(() => null);
      if (verified?.setting_value?.status !== 'needs_review' ||
          verified?.setting_value?.stale_recovered_at !== recoveredAt ||
          verified?.setting_value?.started_at !== expectedStartedAt ||
          !orderStaleBatchEvidencePreserved(current, verified?.setting_value)) {
        return Response.json({ success: false,
          error: 'The stalled-run recovery write could not be verified. Reload before starting another sync.' }, { status: 500 });
      }
      return Response.json({
        success: true,
        recovered: true,
        status: verified.setting_value,
        writes_retried: false,
        message: 'The stalled Order sync was closed as Needs review without retrying writes. Check permanent Order and Smartsheet row IDs and verify any uncertain batches before starting another sync.',
      });
    }

    if (action === 'config_get') {
      const { record, duplicateCount } = await loadSyncConfig(base44);
      if (duplicateCount > 1) {
        return Response.json({ success: false, error: `Smartsheet sync configuration has ${duplicateCount} records. Resolve the duplicate settings before editing.` }, { status: 409 });
      }
      return Response.json({ success: true, record: safeConfigRecord(record) });
    }

    // Admin-acknowledged external/historical assignee labels for the Sales
    // pull translation. Saved server-side with the loaded record as its own
    // concurrency baseline so a browser round-trip can never corrupt it.
    if (action === 'assignee_labels_save') {
      if (adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      }
      const { record, duplicateCount } = await loadSyncConfig(base44);
      if (!record?.id || duplicateCount > 1) {
        return Response.json({ success: false, error: 'The Smartsheet sync configuration could not be verified. Reload before saving.' }, { status: 409 });
      }
      const labels = (Array.isArray(body?.labels) ? body.labels : [])
        .map((l: any) => cleanText(l, 80)).filter(Boolean)
        .filter((l: string, i: number, all: string[]) => all.indexOf(l) === i)
        .slice(0, 60);
      const next = {
        ...(record.setting_value || {}),
        sales: { ...(record.setting_value?.sales || {}), assignee_confirmed_labels: labels },
      };
      const result = await base44.asServiceRole.entities.GlobalSettings.updateMany(
        { id: record.id, updated_date: record.updated_date, setting_key: SETTING_KEY },
        { $set: { setting_value: next } },
      );
      if (!result || result.updated !== 1) {
        return Response.json({ success: false, error: 'Smartsheet sync settings changed while saving. Reload before retrying.' }, { status: 409 });
      }
      const saved = await base44.asServiceRole.entities.GlobalSettings.get(record.id).catch(() => null);
      if (!saved?.id || !sameStableValue(saved.setting_value, next)) {
        return Response.json({ success: false, error: 'The assignee label list was saved but could not be verified. Reload before retrying.' }, { status: 500 });
      }
      return Response.json({ success: true, assignee_confirmed_labels: saved.setting_value?.sales?.assignee_confirmed_labels || [] });
    }

    if (action === 'config_save') {
      try {
        const savedRecord = await saveSyncConfigIfUnchanged(base44, body);
        return Response.json({ success: true, record: savedRecord });
      } catch (error: any) {
        return Response.json({ success: false, error: cleanText(error?.message || 'Smartsheet sync settings could not be saved.', 1000) }, { status: Number(error?.status) || 500 });
      }
    }

    if (action === 'order_requestor_contact_sync') {
      // Order Form Requestor dropdown only. This does not provision Smartsheet
      // accounts, touch rows, or change Sales name/assignee translations.
      if (adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      }
      if (!configured) {
        return Response.json({ success: false, error: 'Smartsheet API token is not configured.' }, { status: 503 });
      }
      const requestedEmail = cleanText(body?.user_email, 320).toLowerCase();
      if (!isValidContactEmail(requestedEmail)) {
        return Response.json({ success: false, error: 'A valid saved app user email is required.' }, { status: 400 });
      }
      // Look up the authoritative saved user rather than trusting a name
      // supplied from the browser.
      const userResult = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: requestedEmail });
      const users = Array.isArray(userResult) ? userResult : (userResult ? [userResult] : []);
      if (users.length !== 1 || !users[0]?.id || users[0]?.is_active === false) {
        return Response.json({ success: false,
          error: 'The active app user could not be identified uniquely. No Smartsheet contact was changed.' }, { status: 409 });
      }

      const { config, duplicateCount } = await loadSyncConfig(base44);
      if (!config || duplicateCount > 1) {
        return Response.json({ success: false,
          error: duplicateCount > 1 ? 'Duplicate Smartsheet sync configurations require review.' : 'Smartsheet sync configuration is missing.' },
          { status: duplicateCount > 1 ? 409 : 400 });
      }
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 80);
      const contactColumnId = sharedOrderRequestorColumnId(profile?.column_bindings);
      if (!/^\d+$/.test(sheetId) || !contactColumnId) {
        return Response.json({ success: false,
          error: 'The Order Requestor name/email bindings must share one permanent Smartsheet CONTACT_LIST column ID.' }, { status: 409 });
      }
      const columnPath = `/sheets/${sheetId}/columns/${contactColumnId}`;
      const before = (await smartsheetGet(columnPath, token)).body || {};
      if (String(before?.id || '') !== contactColumnId || before?.type !== 'CONTACT_LIST') {
        return Response.json({ success: false,
          error: 'Smartsheet did not confirm the permanent Order Requestor CONTACT_LIST column. Nothing was changed.' }, { status: 409 });
      }
      if (!Array.isArray(before.contactOptions)) {
        return Response.json({ success: false, needs_review: true,
          error: 'Smartsheet did not return the existing Requestor contacts. To protect historical contact options, no update was attempted.' },
          { status: 409 });
      }
      const originalOptions = before.contactOptions;
      const plan = planOrderRequestorContactAppend(originalOptions, users[0]);
      if (plan.changed) {
        try {
          await smartsheetWriteNoTimeoutRetry('PUT', columnPath, token, {
            type: 'CONTACT_LIST', contactOptions: plan.options,
          });
        } catch (error: any) {
          // Timeout may mean Smartsheet applied the update. Do not resend a
          // possibly successful column write; always verify by permanent ID.
          if (!error?.timedOut) throw error;
        }
      }
      const after = (await smartsheetGet(columnPath, token)).body || {};
      const verifiedOptions = after?.contactOptions;
      if (String(after?.id || '') !== contactColumnId || after?.type !== 'CONTACT_LIST' ||
          !orderRequestorOptionsPreserved(plan.options, verifiedOptions)) {
        return Response.json({ success: false, needs_review: true,
          error: 'The Requestor dropdown contact update could not be verified. Review Smartsheet before retrying; no Order rows were changed.' },
          { status: 502 });
      }
      return Response.json({
        success: true, added: plan.changed, already_present: !plan.changed,
        user_email: requestedEmail, sheet_id: sheetId, requestor_column_id: contactColumnId,
      });
    }

    if (action === 'order_request_types_save') {
      if (adminActor?.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      }
      if (!configured) {
        return Response.json({ success: false, error: 'Smartsheet API token is not configured.' }, { status: 503 });
      }

      const requestTypes = normalizeOrderRequestTypes(body?.request_types);
      if (!requestTypes.length) {
        return Response.json({ success: false, error: 'At least one Order item type is required.' }, { status: 400 });
      }

      const { config, duplicateCount } = await loadSyncConfig(base44);
      if (!config || duplicateCount > 1) {
        return Response.json({ success: false,
          error: duplicateCount > 1
            ? `Smartsheet sync configuration has ${duplicateCount} records. Resolve the duplicate settings before changing Order item types.`
            : 'Smartsheet sync configuration is missing.' }, { status: duplicateCount > 1 ? 409 : 400 });
      }
      const orderProfile = config?.orders || {};
      const sheetId = cleanText(orderProfile?.smartsheet_sheet_id, 80);
      const columnId = cleanText(orderProfile?.column_bindings?.request_type, 80);
      if (!/^\d+$/.test(sheetId) || !/^\d+$/.test(columnId)) {
        return Response.json({ success: false,
          error: 'Order Request Type must be bound to permanent Smartsheet sheet and column IDs before item types can be saved.' }, { status: 400 });
      }

      const settingRowsResult = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: ORDER_REQUEST_TYPES_SETTING_KEY });
      const settingRows = Array.isArray(settingRowsResult) ? settingRowsResult : (settingRowsResult ? [settingRowsResult] : []);
      if (settingRows.length > 1) {
        return Response.json({ success: false,
          error: `Order item types have ${settingRows.length} shared settings records. No value was changed; review the duplicate settings first.` }, { status: 409 });
      }
      const currentSetting = settingRows[0] || null;
      const expectedSettingId = cleanText(body?.expected_setting_id, 80);
      const expectedUpdatedAt = cleanText(body?.expected_setting_updated_date, 80);
      if (currentSetting?.id) {
        if (expectedSettingId !== String(currentSetting.id) || expectedUpdatedAt !== cleanText(currentSetting.updated_date, 80)) {
          return Response.json({ success: false,
            error: 'Order item types changed in another session. Reload the Order Form before saving your list.' }, { status: 409 });
        }
      } else if (expectedSettingId || expectedUpdatedAt) {
        return Response.json({ success: false,
          error: 'The shared Order item-type setting changed before this save. Reload before retrying.' }, { status: 409 });
      }

      const columnPath = `/sheets/${sheetId}/columns/${columnId}`;
      const beforeColumn = (await smartsheetGet(columnPath, token)).body || {};
      if (String(beforeColumn?.id || '') !== columnId) {
        return Response.json({ success: false,
          error: 'Smartsheet returned a different Request Type column ID. No item-type setting was changed.' }, { status: 409 });
      }
      if (String(beforeColumn?.type || '') !== 'PICKLIST') {
        return Response.json({ success: false,
          error: `Smartsheet Request Type column ${columnId} is ${cleanText(beforeColumn?.type, 40) || 'unknown'}, not PICKLIST. No item-type setting was changed.` }, { status: 409 });
      }

      // Preserve historical Smartsheet options even if an admin removes them
      // from the current Order Form menu. This prevents old Orders from becoming
      // invalid picklist values while still allowing the active menu to evolve.
      const existingOptions = normalizeOrderRequestTypes(beforeColumn?.options);
      const smartsheetOptions = normalizeOrderRequestTypes([...requestTypes, ...existingOptions]);
      if (!sameOrderRequestTypeList(existingOptions, smartsheetOptions)) {
        try {
          await smartsheetWriteNoTimeoutRetry('PUT', columnPath, token, {
            type: 'PICKLIST',
            options: smartsheetOptions,
          });
        } catch (error: any) {
          // A timed-out column write is ambiguous. Never resend it blindly;
          // read back the permanent column and accept only a verified outcome.
          if (!error?.timedOut) throw error;
        }
      }

      const verifiedColumn = (await smartsheetGet(columnPath, token)).body || {};
      const verifiedOptions = normalizeOrderRequestTypes(verifiedColumn?.options);
      if (String(verifiedColumn?.id || '') !== columnId || String(verifiedColumn?.type || '') !== 'PICKLIST' ||
          !sameOrderRequestTypeList(verifiedOptions, smartsheetOptions)) {
        return Response.json({ success: false, needs_review: true,
          error: 'Smartsheet Request Type options could not be verified after the update. The shared Base44 item-type list was not changed.' }, { status: 502 });
      }

      let savedSetting: any = null;
      const settingValue = { items: requestTypes };
      if (currentSetting?.id) {
        const saved = await base44.asServiceRole.entities.GlobalSettings.updateMany(
          { id: currentSetting.id, setting_key: ORDER_REQUEST_TYPES_SETTING_KEY, updated_date: currentSetting.updated_date },
          { $set: { setting_value: settingValue } },
        );
        if (saved?.updated !== 1) {
          return Response.json({ success: false,
            error: 'Order item types changed in another session after Smartsheet was updated. Reload before retrying; no Orders were changed.' }, { status: 409 });
        }
        savedSetting = await base44.asServiceRole.entities.GlobalSettings.get(currentSetting.id);
      } else {
        await base44.asServiceRole.entities.GlobalSettings.create({
          setting_key: ORDER_REQUEST_TYPES_SETTING_KEY,
          setting_value: settingValue,
        });
        const afterCreateResult = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: ORDER_REQUEST_TYPES_SETTING_KEY });
        const afterCreate = Array.isArray(afterCreateResult) ? afterCreateResult : (afterCreateResult ? [afterCreateResult] : []);
        if (afterCreate.length !== 1) {
          return Response.json({ success: false,
            error: `Order item-type setting creation could not be verified safely (${afterCreate.length} matching records). No duplicate setting was deleted automatically.` }, { status: 409 });
        }
        savedSetting = afterCreate[0];
      }

      if (!sameOrderRequestTypeList(savedSetting?.setting_value?.items, requestTypes)) {
        return Response.json({ success: false,
          error: 'The shared Order item-type list could not be verified after saving. Reload before retrying.' }, { status: 500 });
      }

      return Response.json({
        success: true,
        request_types: requestTypes,
        smartsheet_options: verifiedOptions,
        retained_historical_smartsheet_options: verifiedOptions.filter((option: string) =>
          !requestTypes.some((active: string) => active.toLowerCase() === option.toLowerCase())),
        setting: {
          id: savedSetting.id,
          updated_date: savedSetting.updated_date,
          setting_value: savedSetting.setting_value,
        },
        sheet_id: sheetId,
        request_type_column_id: columnId,
      });
    }

    if (action === 'sync_alert_get') {
      const config = await loadSyncAlertConfig(base44);
      return Response.json({ success: true, config });
    }

    if (action === 'sync_alert_save') {
      if (adminActor?.role !== 'admin') return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      const enabled = Boolean(body?.enabled);
      const recipient_email = cleanText(body?.recipient_email, 200) || 'brettheinlein1@gmail.com';
      const results = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: ALERT_SETTING_KEY });
      const rows = Array.isArray(results) ? results : (results ? [results] : []);
      // Preserve dedup state and any admin-tuned cooldown across settings saves.
      const value = { ...(rows[0]?.setting_value || {}), enabled, recipient_email };
      if (rows.length > 0) await base44.asServiceRole.entities.GlobalSettings.update(rows[0].id, { setting_value: value });
      else await base44.asServiceRole.entities.GlobalSettings.create({ setting_key: ALERT_SETTING_KEY, setting_value: value });
      return Response.json({ success: true, config: value });
    }

    if (action === 'sync_alert_test') {
      if (adminActor?.role !== 'admin') return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
      const config = await loadSyncAlertConfig(base44);
      const recipient = cleanText(config?.recipient_email, 200) || 'brettheinlein1@gmail.com';
      try {
        await base44.integrations.Core.SendEmail({ to: recipient, subject: 'Smartsheet Sync Alert \u2014 Test', body: 'This is a test alert from the Smartsheet Sync error email automation. If you received this, alerts are working correctly.' });
        return Response.json({ success: true, sent: true, recipient });
      } catch (err: any) {
        return Response.json({ success: false, error: `Could not send test email: ${err?.message || 'unknown error'}`, recipient }, { status: 500 });
      }
    }

    if (action === 'push_saved_orders') {
      if (!configured) {
        return Response.json({ success: false, error: 'Smartsheet API token is not configured.' }, { status: 503 });
      }
      const { config } = await loadSyncConfig(base44);
      if (!config) return Response.json({ success: false, error: 'Smartsheet sync configuration is missing.' }, { status: 400 });
      if (!config.global_enabled) return Response.json({ success: false, error: 'Global sync kill switch is OFF.' }, { status: 400 });
      if (config.observation_mode) return Response.json({ success: false, error: 'Observation mode is ON; saved Orders were not pushed.' }, { status: 400 });
      const profile = config?.orders || {};
      if (!profile?.mirror_enabled) return Response.json({ success: false, error: 'Order Form Smartsheet mirror is OFF.' }, { status: 400 });

      const rawIds = Array.isArray(body?.order_ids) ? body.order_ids : [];
      const cleanedIds = rawIds.map((id: unknown) => cleanText(id, 80));
      if (cleanedIds.length === 0 || cleanedIds.some((id: string) => !/^[A-Za-z0-9_-]{6,80}$/.test(id))) {
        return Response.json({ success: false, error: 'Save & Sync requires valid permanent Order IDs.' }, { status: 400 });
      }
      const orderIds = [...new Set(cleanedIds)];
      const massLimit = orderSaveSyncBatchLimit(config?.mass_change_limit_count);
      if (orderIds.length > massLimit) {
        return Response.json({ success: false, code: 'ORDER_SYNC_BATCH_LIMIT',
          order_batch_limit: massLimit, smartsheet_writes_attempted: false,
          error: `${orderIds.length} saved Orders exceed the ${massLimit}-record Save & Sync safety limit. Remaining Orders stay queued.` }, { status: 400 });
      }

      const startedAt = new Date().toISOString();
      const requestedBy = cleanText(adminActor?.email, 320);
      await claimInvocationRun({
        status: 'running', started_at: startedAt, action,
        total_steps: 1, completed_steps: 0, current_step_label: 'Order Form → Smartsheet',
        requested_order_ids: orderIds, requested_by: requestedBy, results: [],
      }, 'orders');

      const pushResult = await pushDataset(base44, token, 'orders', profile, config, {
        recordIds: orderIds,
        requireOrderPendingMarker: true,
        orderPushTimeBudgetMs: 4 * 60 * 1000,
        reportOrderProgress: async (progress: any) => saveSyncStatusForRun(base44, {
          status: 'running', action,
          total_steps: 1, completed_steps: 0, current_step_label: 'Order Form → Smartsheet',
          requested_order_ids: orderIds, requested_by: requestedBy, results: [],
          progress_dataset: 'orders', progress_direction: 'push',
          progress_phase: progress?.phase || '',
          progress_current: Number(progress?.current) || 0,
          progress_total: Number(progress?.total) || 0,
          progress_fraction: Number.isFinite(Number(progress?.fraction)) ? Number(progress.fraction) : null,
          progress_item_label: cleanText(progress?.item_label, 220),
          progress_detail: cleanText(progress?.detail, 260),
          progress_record_id: cleanText(progress?.record_id, 100),
          progress_smartsheet_row_id: cleanText(progress?.smartsheet_row_id, 40),
          progress_updated_at: new Date().toISOString(),
        }, startedAt, 'orders'),
        assertRunOwnership: async () => assertSyncRunOwnership(base44, startedAt, 'orders'),
        // Explicit Save & Sync may create a row for a brand-new Order without
        // enabling automatic/background Order creation for any other path.
        allowExplicitOrderCreate: true,
      });
      const result = { ...pushResult, dataset: 'orders', direction: 'push' };
      const needsReview = orderRunRequiresReview([result]);
      await saveSyncStatusForRun(base44, {
        status: needsReview ? 'needs_review' : 'completed', needs_review: needsReview,
        completed_at: new Date().toISOString(), action, total_steps: 1, completed_steps: 1,
        current_step_label: '', requested_order_ids: orderIds,
        requested_by: requestedBy, results: [result],
      }, startedAt, 'orders');
      return Response.json({ success: true, configured: true, write_actions_available: true,
        sync_complete: !needsReview, needs_review: needsReview, results: [result] });
    }

    if (action === 'push_saved_sales') {
      if (!configured) {
        return Response.json({ success: false, error: 'Smartsheet API token is not configured.' }, { status: 503 });
      }
      const { config } = await loadSyncConfig(base44);
      if (!config) return Response.json({ success: false, error: 'Smartsheet sync configuration is missing.' }, { status: 400 });
      if (!config.global_enabled) return Response.json({ success: false, error: 'Global sync kill switch is OFF.' }, { status: 400 });
      if (config.observation_mode) return Response.json({ success: false, error: 'Observation mode is ON; saved Sales changes were not pushed.' }, { status: 400 });
      const profile = config?.sales || {};
      if (!profile?.mirror_enabled) return Response.json({ success: false, error: 'Sales Pipeline Smartsheet mirror is OFF.' }, { status: 400 });

      const rawIds = Array.isArray(body?.work_order_ids) ? body.work_order_ids : [];
      const cleanedIds = rawIds.map((id: unknown) => cleanText(id, 80));
      if (cleanedIds.length === 0 || cleanedIds.some((id: string) => !/^[A-Za-z0-9_-]{6,80}$/.test(id))) {
        return Response.json({ success: false, error: 'Save & Sync requires valid permanent WorkOrder IDs.' }, { status: 400 });
      }
      const workOrderIds = [...new Set(cleanedIds)];
      const configuredLimit = Math.max(1, Number(config?.mass_change_limit_count) || 25);
      const saveSyncLimit = Math.min(configuredLimit, 100);
      if (workOrderIds.length > saveSyncLimit) {
        return Response.json({ success: false,
          error: `${workOrderIds.length} saved Sales WorkOrders exceed the ${saveSyncLimit}-record Save & Sync safety limit.` }, { status: 400 });
      }

      const startedAt = new Date().toISOString();
      await claimInvocationRun({
        status: 'running', started_at: startedAt, action,
        total_steps: 1, completed_steps: 0, current_step_label: 'Sales Pipeline → Smartsheet',
        requested_work_order_ids: workOrderIds, requested_by: cleanText(adminActor?.email, 320), results: [],
      }, 'sales');

      const pushResult = await pushDataset(base44, token, 'sales', profile, config, {
        recordIds: workOrderIds,
        respectSalesCreateSetting: true,
        runStartedAt: startedAt,
        assertRunOwnership: async () => assertSyncRunOwnership(base44, startedAt, 'sales'),
      });
      const result = { ...pushResult, dataset: 'sales', direction: 'push' };
      const needsReview = salesRunRequiresReview([result]);
      await saveSyncStatusForRun(base44, {
        status: needsReview ? 'needs_review' : 'completed', needs_review: needsReview,
        completed_at: new Date().toISOString(), total_steps: 1, completed_steps: 1,
        current_step_label: '', requested_work_order_ids: workOrderIds,
        requested_by: cleanText(adminActor?.email, 320), results: [result],
      }, startedAt, 'sales');
      return Response.json({
        success: true, configured: true, write_actions_available: true,
        sync_complete: !needsReview, needs_review: needsReview, results: [result],
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
      // Match the CURRENT full Sales push population exactly; never describe
      // the sample as complete coverage of the entire historic WorkOrder archive.
      const raw = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.WorkOrder,
        query: { in_pipeline: true },
        sort: 'id',
        label: 'Sales snapshot preview full push population',
      });
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
      const offset = Math.max(0, Math.min(9999, Math.floor(Number(body?.sample_offset) || 0)));
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

    if (action === 'audit_order_import_sync_evidence') {
      // Bounded admin-only reconciliation. This performs exact-row Smartsheet
      // GETs and Base44 reads only; it never queues, repairs, links, or writes.
      if (adminActor?.role !== 'admin' || !hasSessionToken) {
        return Response.json({ success: false, error: 'An authenticated Order Form administrator is required.' }, { status: 403 });
      }
      if (!configured) {
        return Response.json({ success: false, error: 'Smartsheet is not configured for a read-only Order audit.' }, { status: 503 });
      }
      let rowIds: string[];
      try {
        rowIds = validateOrderImportAuditRowIds(body?.row_ids);
      } catch (error: any) {
        return Response.json({ success: false, error: error?.message || 'Invalid Order audit row IDs.' }, { status: 400 });
      }

      const { config, duplicateCount } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const bindings = profile?.column_bindings || {};
      const columnIds = numericIdList(Object.values(bindings), 100);
      if (duplicateCount !== 1 || !/^\d+$/.test(sheetId) || !columnIds.length) {
        return Response.json({ success: false, error: 'The configured Order sheet or mapped columns could not be verified.' }, { status: 409 });
      }

      const allOrders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        sort: 'id',
        label: 'Order historical import marker read-only audit',
      });
      const remoteRows: any[] = [];
      for (const rowId of rowIds) {
        // The row ID comes from a bounded, validated request and is always
        // paired with the current configured sheet ID, never a visual index.
        const response = await smartsheetGet(`/sheets/${sheetId}/rows/${rowId}`, token);
        const remoteRow = normalizeSheetRows({ rows: [response.body] })[0] || null;
        if (!remoteRow || String(remoteRow.id) !== rowId) {
          return Response.json({ success: false,
            error: `Smartsheet did not verify the requested permanent row ID ${rowId}. No classification was returned.` }, { status: 502 });
        }
        remoteRows.push({ ...remoteRow, remote_snapshot: buildOrderPullSnapshot(remoteRow, bindings) });
      }

      const readSignature = (rows: any[]) => rows.map(order => ({
        id: String(order?.id || ''),
        updated_date: String(order?.updated_date || ''),
        deleted: order?.deleted === true,
        sheet_id: String(order?.smartsheet_sheet_id || ''),
        row_id: String(order?.smartsheet_row_id || ''),
        pending: Object.prototype.hasOwnProperty.call(order || {}, 'smartsheet_pending_local_sync')
          ? order.smartsheet_pending_local_sync : '__absent__',
        last_synced_at: String(order?.smartsheet_last_synced_at || ''),
        stored_snapshot: order?.smartsheet_sync_snapshot ?? null,
        local_snapshot: buildSnapshot(order, bindings, 'orders'),
      }));
      const freshOrders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        sort: 'id',
        label: 'Order historical import marker final read-only verification',
      });
      if (!sameStableValue(readSignature(allOrders), readSignature(freshOrders))) {
        return Response.json({ success: false,
          error: 'Order records changed while the remote rows were being read. Discard this result and retry the bounded audit.' }, { status: 409 });
      }
      const localSnapshots = Object.fromEntries(freshOrders.map(order => [
        String(order?.id || ''), buildSnapshot(order, bindings, 'orders'),
      ]));
      const audit = buildOrderHistoricalImportEvidence({
        orders: freshOrders,
        rowIds,
        remoteRows,
        configuredSheetId: sheetId,
        bindings,
        localSnapshots,
      });
      return Response.json({
        success: true, ...audit,
        identity_strategy: 'configured_sheet_and_explicit_permanent_row_ids',
        local_readback_verified: true,
      });
    }

    if (action === 'audit_order_link_integrity') {
      // Admin-only, read-only permanent-ID reconciliation. Matching is based
      // solely on configured sheet ID + permanent row ID; names and row order
      // are display evidence only and are never used to create or repair links.
      const { config } = await loadSyncConfig(base44);
      const profile = config?.orders || {};
      const sheetId = cleanText(profile?.smartsheet_sheet_id, 40);
      const bindings = profile?.column_bindings || {};
      const identityFields = ['customer_name', 'request_type', 'description', 'quantity'];
      const identityColumnIds = [...new Set(identityFields
        .map(field => cleanText(bindings?.[field], 40))
        .filter(value => /^\d+$/.test(value)))];
      if (!/^\d+$/.test(sheetId) || identityColumnIds.length === 0) {
        return Response.json({ success: false,
          error: 'Order Request needs a permanent sheet ID and at least one valid identity-column binding.' }, { status: 400 });
      }

      const allOrders = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.Order,
        sort: 'id',
        label: 'Order Form permanent-link read-only audit',
      });
      const sheetRows: any[] = [];
      const pageSize = 200;
      const guard = createSmartsheetOrderPageGuard({ pageSize, maxPages: 100 });
      let sheetVersion: number | null = null;
      for (let page = 1; page <= 100; page++) {
        const params = new URLSearchParams({
          page: String(page), pageSize: String(pageSize),
          columnIds: identityColumnIds.join(','), exclude: 'nonexistentCells',
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

      const audit = auditOrderPermanentLinks(allOrders, sheetRows, sheetId, bindings);
      return Response.json({
        success: true,
        ...audit,
        sheet_version: sheetVersion,
        sheet_download_verified: true,
        matching_strategy: 'permanent_sheet_and_row_ids_only',
        identity_columns_downloaded: identityColumnIds,
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
      const dateFieldAudits = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.FieldAudit,
        query: {
          entity_type: 'Order',
          status: 'committed',
          field_name: { $in: dateFields },
        },
        sort: 'modified_at',
        label: 'Order Form read-only date edit evidence',
      });
      const audit = auditOrderDateParity(orders, sheetRows, bindings, sheetId, dateFieldAudits);
      return Response.json({ success: true, ...audit, sheet_id: sheetId,
        sheet_version: sheetVersion, sheet_download_verified: true,
        date_columns: dateColumns,
        date_field_audit_events: dateFieldAudits.length,
        sync_global_enabled: config?.global_enabled === true,
        sync_observation_mode: config?.observation_mode !== false,
      });
    }

    if (action === 'debug_dates') {
      const { smartsheetDateDiagnostic } = await import('../../shared/smartsheetDateDiagnostic.ts');
      const { config } = await loadSyncConfig(base44);
      return await smartsheetDateDiagnostic({ base44, config, token, smartsheetGet, normalizeSheetRows, cleanText });
    }

    if (['run_sync', 'run_sales_sync', 'run_order_sync', 'push_dataset', 'pull_dataset'].includes(action)) {
      const { config } = await loadSyncConfig(base44);
      if (!config) {
        return Response.json({ success: false, error: 'No Smartsheet sync configuration saved yet. Configure and save settings first.' }, { status: 400 });
      }
      if (!config.global_enabled) {
        return Response.json({ success: false, error: 'Global sync kill switch is OFF. Enable it in settings before running sync.' }, { status: 400 });
      }
      if (config.observation_mode) {
        return Response.json({ success: false, error: 'Observation mode is ON. Turn it off in settings to allow sync execution.' }, { status: 400 });
      }

      const isRunAction = ['run_sync', 'run_sales_sync', 'run_order_sync'].includes(action);
      const isSingleDataset = action === 'push_dataset' || action === 'pull_dataset';
      const datasetsToRun: ('sales' | 'orders')[] =
        isSingleDataset
          ? [body?.dataset === 'orders' ? 'orders' : 'sales']
          : action === 'run_sales_sync'
            ? ['sales']
            : action === 'run_order_sync'
              ? ['orders']
              : body?.dataset === 'orders'
                ? ['orders']
                : body?.dataset === 'sales'
                  ? ['sales']
                  : ['sales', 'orders'];

      // Each dataset claims, runs and finishes its own coordinator record. A
      // Sales review or failure can never leave the Order status unhealthy
      // (and vice versa), and a crashed combined run only leaves the in-flight
      // dataset marked running.
      const results: any[] = [];
      let runNeedsReview = false;
      for (const dataset of datasetsToRun) {
        const profile = config?.[dataset] || {};
        if (!profile.mirror_enabled) {
          results.push({ dataset, skipped: true, reason: 'Mirror not enabled for this dataset.' });
          continue;
        }

        const wantPull = action === 'pull_dataset' || (isRunAction && profile.pull_enabled);
        const wantPush = action === 'push_dataset' || (isRunAction && profile.push_enabled);

        if (!wantPull && !wantPush) {
          results.push({ dataset, skipped: true, reason: 'Neither push nor pull enabled for this dataset.' });
          continue;
        }

        const steps: { dataset: string; direction: string; label: string }[] = [];
        if (wantPull) steps.push({ dataset, direction: 'pull', label: `${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} ← Smartsheet` });
        if (wantPush) steps.push({ dataset, direction: 'push', label: `${dataset === 'sales' ? 'Sales Pipeline' : 'Order Form'} → Smartsheet` });

        const runStartedAt = new Date().toISOString();
        const datasetResults: any[] = [];
        let lastOrderPullBatchEvidence: any = null;
        let completedSteps = 0;
        let datasetNeedsReview = false;
        try {
          await claimInvocationRun({
            status: 'running',
            started_at: runStartedAt,
            action,
            total_steps: steps.length,
            completed_steps: 0,
            current_step_label: steps[0]?.label || '',
            order_pull_requested: dataset === 'orders' && wantPull,
            results: [],
          }, dataset);
        } catch (claimError: any) {
          // A stale coordinator blocks a new claim with 409. For a verified
          // scheduled invocation that must not strike the scheduler's
          // auto-disable counter, so report a skipped run with HTTP 200.
          // Manual and admin calls keep the original 409.
          if (scheduledRun && Number(claimError?.status) === 409) {
            const reason = String(claimError?.message || claimError);
            console.warn('[smartsheetSyncAction] scheduled run skipped:', reason);
            return Response.json({ success: false, skipped: true, reason });
          }
          throw claimError;
        }
        let activeDirection: 'pull' | 'push' | null = null;
        try {
          if (wantPull) {
            activeDirection = 'pull';
            const stepLabel = steps.find(s => s.dataset === dataset && s.direction === 'pull')?.label || '';
            const readingStatusSaved = await saveSyncStatusForRun(base44, {
              status: 'running',
              action,
              total_steps: steps.length,
              completed_steps: completedSteps,
              current_step_label: stepLabel,
              results: datasetResults,
              ...(dataset === 'orders' ? {
                progress_dataset: 'orders', progress_direction: 'pull', progress_phase: 'reading',
                progress_current: 0, progress_total: 0,
                progress_item_label: 'Reading and validating Order Request rows',
                progress_detail: 'Downloading the configured Smartsheet by permanent row and column IDs',
                progress_updated_at: new Date().toISOString(),
              } : {}),
            }, runStartedAt, dataset);
            if (dataset === 'orders' && !readingStatusSaved) {
              throw new Error('Order pull progress ownership could not be verified before reading. No Orders were changed.');
            }
            const pullResult = await pullDataset(base44, token, dataset, profile, config, {
              assertRunOwnership: async () => assertSyncRunOwnership(base44, runStartedAt, dataset),
              ...(dataset === 'orders' ? {
                reportOrderReadProgress: async ({ page, rowsLoaded, totalRows }) => {
                  const saved = await saveSyncStatusForRun(base44, {
                    status: 'running', action,
                    total_steps: steps.length, completed_steps: completedSteps,
                    current_step_label: stepLabel, results: datasetResults,
                    progress_dataset: 'orders', progress_direction: 'pull', progress_phase: 'reading',
                    progress_current: rowsLoaded, progress_total: Math.max(totalRows, rowsLoaded),
                    progress_item_label: `Read Smartsheet page ${page}: ${rowsLoaded} rows`,
                    progress_detail: 'Reading Order Request rows by permanent Smartsheet row and column IDs; no Orders changed yet',
                    progress_updated_at: new Date().toISOString(),
                  }, runStartedAt, dataset);
                  if (!saved) throw new Error('Order pull lost progress checkpoint ownership. No further pull writes are allowed.');
                },
                reportOrderPullProgress: async ({ phase, current, total, itemLabel, detail, batchEvidence }) => {
                  if (batchEvidence) {
                    // Persist independently of the Order pull coordinator
                    // before the actual Order bulkUpdate. Fail closed on lost ACK.
                    await saveOrderPullEvidence(base44.asServiceRole.entities.GlobalSettings, {
                      startedAt: runStartedAt,
                      sheetId: cleanText(profile?.smartsheet_sheet_id, 40), batchEvidence,
                    });
                    lastOrderPullBatchEvidence = batchEvidence;
                  }
                  const saved = await saveSyncStatusForRun(base44, {
                    status: 'running', action,
                    total_steps: steps.length, completed_steps: completedSteps,
                    current_step_label: stepLabel, results: datasetResults,
                    progress_dataset: 'orders', progress_direction: 'pull', progress_phase: phase,
                    progress_current: current, progress_total: total,
                    progress_item_label: cleanText(itemLabel, 220),
                    progress_detail: cleanText(detail, 260),
                    ...(lastOrderPullBatchEvidence ? { order_pull_batch_evidence: lastOrderPullBatchEvidence } : {}),
                    progress_updated_at: new Date().toISOString(),
                  }, runStartedAt, dataset);
                  if (!saved) throw new Error('Order pull lost its progress checkpoint before completion. Further writes are blocked.');
                },
              } : {}),
              ...(action === 'pull_dataset' && dataset === 'sales' ? { recordIds: body.work_order_ids || [] } : {}),
            });
            if (dataset === 'orders' && lastOrderPullBatchEvidence && orderPullWritesVerified(pullResult)) {
              // Only the fully verified Order pull can release the separate
              // uncertain evidence gate. Keep the record for later auditing.
              await verifyCompletedOrderPullEvidence(base44.asServiceRole.entities.GlobalSettings, {
                startedAt: runStartedAt,
              });
            }
            datasetResults.push(dataset === 'sales' ? { ...pullResult, direction: 'pull' } : pullResult);
            completedSteps++;
          }
          if (wantPush) {
            activeDirection = 'push';
            const stepLabel = steps.find(s => s.dataset === dataset && s.direction === 'push')?.label || '';
            await saveSyncStatusForRun(base44, {
              status: 'running',
              action,
              total_steps: steps.length,
              completed_steps: completedSteps,
              current_step_label: stepLabel,
              results: datasetResults,
            }, runStartedAt, dataset);
            const pushResult = await pushDataset(base44, token, dataset, profile, config,
              dataset === 'orders' ? {
                // A normal combined sync must never reinterpret every preserved
                // Base44 value as a local edit after pull. Only durable local
                // Order edits are eligible for the background push step.
                onlyPendingOrderRecords: isRunAction,
                orderPushTimeBudgetMs: 4 * 60 * 1000,
                reportOrderProgress: async (progress: any) => saveSyncStatusForRun(base44, {
                  status: 'running', action,
                  total_steps: steps.length, completed_steps: completedSteps,
                  current_step_label: stepLabel, results: datasetResults,
                  progress_dataset: 'orders', progress_direction: 'push',
                  progress_phase: progress?.phase || '',
                  progress_current: Number(progress?.current) || 0,
                  progress_total: Number(progress?.total) || 0,
                  progress_fraction: Number.isFinite(Number(progress?.fraction)) ? Number(progress.fraction) : null,
                  progress_item_label: cleanText(progress?.item_label, 220),
                  progress_detail: cleanText(progress?.detail, 260),
                  progress_record_id: cleanText(progress?.record_id, 100),
                  progress_smartsheet_row_id: cleanText(progress?.smartsheet_row_id, 40),
                  progress_updated_at: new Date().toISOString(),
                }, runStartedAt, dataset),
                assertRunOwnership: async () => assertSyncRunOwnership(base44, runStartedAt, dataset),
              } : {
                assertRunOwnership: async () => assertSyncRunOwnership(base44, runStartedAt, dataset),
                runStartedAt,
              });

            datasetResults.push(dataset === 'sales' ? { ...pushResult, direction: 'push' } : pushResult);
            completedSteps++;
          }
        } catch (err) {
          datasetResults.push({ dataset, ...(activeDirection ? { direction: activeDirection } : {}), skipped: true, reason: (err as any)?.message || 'Sync failed.' });
          completedSteps++;
        }

        // Each dataset's record reports only its own stages. A Sales review or
        // failure can never leave the Order status unhealthy, and vice versa.
        datasetNeedsReview = dataset === 'sales'
          ? salesRunRequiresReview(datasetResults)
          : orderRunRequiresReview(datasetResults);
        await saveSyncStatusForRun(base44, {
          status: datasetNeedsReview ? 'needs_review' : 'completed',
          needs_review: datasetNeedsReview,
          completed_at: new Date().toISOString(),
          total_steps: steps.length,
          completed_steps: steps.length,
          current_step_label: '',
          results: datasetResults,
          ...(lastOrderPullBatchEvidence ? { order_pull_batch_evidence: lastOrderPullBatchEvidence } : {}),
        }, runStartedAt, dataset);

        results.push(...datasetResults);
        runNeedsReview = runNeedsReview || datasetNeedsReview;
      }

      // Check for alert conditions and send email if enabled
      const finalStatusRecord = await loadSingleSyncStatusRecord(base44, LEGACY_SYNC_STATUS_KEY).catch(() => null);
      if (finalStatusRecord?.setting_value) await checkAndSendSyncAlert(base44, finalStatusRecord.setting_value, results);

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
    const safeStatus = [400, 401, 403, 409, 429, 502, 503].includes(status) ? status : 500;
    console.error('smartsheetSyncAction error:', (error as any)?.message || error);
    return Response.json({
      success: false,
      error: safeStatus === 500 ? 'Smartsheet request could not be completed safely.' : (error as any)?.message,
    }, { status: safeStatus });
  } finally {
    // If a sync run is still "running" after the handler exits (crash, timeout,
    // or unhandled error), mark it as "failed" so the lock is released and
    // future runs aren't blocked. Also send an alert if enabled.
    if (base44Instance && claimedRunStartedAt) {
      try {
        const key = syncStatusKeyForDataset(claimedDataset);
        const record = await base44Instance.asServiceRole.entities.GlobalSettings.filter({ setting_key: key });
        const matches = Array.isArray(record) ? record.filter((r: any) => r?.id) : (record?.id ? [record] : []);
        if (matches.length === 1 &&
            matches[0]?.setting_value?.status === 'running' &&
            cleanText(matches[0]?.setting_value?.started_at, 80) === claimedRunStartedAt) {
          const failedAt = new Date().toISOString();
          const failedStatus = { ...matches[0].setting_value, status: 'failed', failed_at: failedAt, error: 'Sync run did not complete; marked as failed by cleanup.' };
          await base44Instance.asServiceRole.entities.GlobalSettings.updateMany(
            { id: matches[0].id, setting_key: key, updated_date: matches[0].updated_date },
            { $set: { setting_value: failedStatus } },
          );
          if (claimedDataset === 'orders' || claimedDataset === 'sales') {
            await mirrorSyncStatusToLegacy(base44Instance, failedStatus, claimedDataset);
          }
          await checkAndSendSyncAlert(base44Instance, failedStatus, []);
        }
      } catch { /* cleanup must never mask the original error */ }
    }
  }
}

export default async function(req: Request): Promise<Response> {
  return await tracedSyncRequest(req, 'smartsheetSyncAction', smartsheetSyncHandler);
}