import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from '../../shared/workOrderFieldPersistence.mjs';
import { createWorkOrderWithRecovery } from '../../shared/workOrderCreatePersistence.mjs';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  parseSalesImportRows,
  validateSalesImportHeaders,
  buildExistingImportIndexes,
  normalizeIdentity,
  resolveSalesImportMatch,
  buildSalesImportPlan,
  summarizeSalesImportPlans,
  stableImportFingerprintPayload,
} from '../../shared/salesImportUtils.mjs';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const READ_CHUNK_SIZE = 100;
const CLIENT_REGEX_CHUNK_SIZE = 30;
const WORKER_COUNT = 4;
const ACTIVE_JOB_STALE_MS = 30 * 60 * 1000;

const asText = (value: unknown) => String(value ?? '').trim();
const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
const uniqueStrings = (values: unknown[]) => Array.from(new Set(values.map(asText).filter(Boolean)));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizedExactRegex = (value: unknown) => {
  const text = asText(value).replace(/\s+/g, ' ');
  if (!text) return '^$';
  return `^\\s*${escapeRegex(text).replace(/ /g, '\\s+')}\\s*$`;
};
const normalizedAlternationRegex = (values: string[]) => {
  const parts = values.map((value) => {
    const text = asText(value).replace(/\s+/g, ' ');
    return escapeRegex(text).replace(/ /g, '\\s+');
  }).filter(Boolean);
  return parts.length ? `^\\s*(?:${parts.join('|')})\\s*$` : '^$';
};

function selectImportWorksheet(workbook: any) {
  const candidates: any[] = [];
  for (const sheetName of workbook?.SheetNames || []) {
    const sheet = workbook?.Sheets?.[sheetName];
    const ref = String(sheet?.['!ref'] || '').trim();
    if (!sheet || !ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const lastHeaderRow = Math.min(range.e.r, range.s.r + 9);
    for (let row = range.s.r; row <= lastHeaderRow; row += 1) {
      const headers: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        headers.push(asText(cell?.v ?? cell?.w));
      }
      const validation = validateSalesImportHeaders(headers);
      if (validation.errors.length === 0) {
        candidates.push({ sheetName, sheet, headerRow: row, warnings: validation.warnings });
        break;
      }
    }
  }

  if (candidates.length === 0) {
    const sheetNames = (workbook?.SheetNames || []).join(', ') || 'none';
    throw Object.assign(new Error(`No worksheet with a recognized Customer header was found in the first 10 rows. Worksheets: ${sheetNames}.`), { status: 400 });
  }

  return {
    ...candidates[0],
    multipleCandidates: candidates.length > 1,
    candidateNames: candidates.map((candidate) => candidate.sheetName),
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function parseRequest(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  let sessionToken = '';
  let mode = 'apply';
  let importJobId = '';
  let force = false;
  let adoptLegacy = false;
  let fileName = 'sales-pipeline.xlsx';
  let fileSizeBytes = 0;
  let bytes: Uint8Array | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    sessionToken = asText(form.get('session_token'));
    mode = asText(form.get('mode')) || 'apply';
    importJobId = asText(form.get('import_job_id'));
    force = asText(form.get('force')).toLowerCase() === 'true';
    adoptLegacy = asText(form.get('adopt_legacy')).toLowerCase() === 'true';
    const file = form.get('file');
    if (!(file instanceof File)) throw Object.assign(new Error('No spreadsheet file provided'), { status: 400 });
    fileName = file.name || fileName;
    fileSizeBytes = file.size || 0;
    if (fileSizeBytes > MAX_FILE_BYTES) throw Object.assign(new Error('Spreadsheet is larger than the 15 MB import safety limit.'), { status: 413 });
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const body = await req.json().catch(() => ({}));
    sessionToken = asText(body?.session_token);
    mode = asText(body?.mode) || 'apply';
    importJobId = asText(body?.import_job_id);
    force = body?.force === true;
    adoptLegacy = body?.adopt_legacy === true;
    fileName = asText(body?.file_name) || fileName;
    if (!body?.fileData) throw Object.assign(new Error('No spreadsheet file provided'), { status: 400 });
    const binary = atob(body.fileData);
    fileSizeBytes = binary.length;
    if (fileSizeBytes > MAX_FILE_BYTES) throw Object.assign(new Error('Spreadsheet is larger than the 15 MB import safety limit.'), { status: 413 });
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  }

  if (!['preview', 'apply'].includes(mode)) throw Object.assign(new Error('Import mode must be preview or apply.'), { status: 400 });
  return { sessionToken, mode, importJobId, force, adoptLegacy, fileName, fileSizeBytes, bytes: bytes! };
}

async function loadRelevantWorkOrders(entity: any, validRows: any[]) {
  const found = new Map<string, any>();
  const addRows = (rows: any[]) => rows.forEach((row) => {
    if (row?.id) found.set(String(row.id), row);
  });

  const sourceIds = uniqueStrings(validRows.map((row) => row.sourceId));
  const estInvValues = uniqueStrings(validRows.map((row) => row.estInvAt));
  const weakClientNames = uniqueStrings(validRows
    .filter((row) => !row.sourceId && !row.estInvAt)
    .map((row) => row.clientName));

  for (const ids of chunk(sourceIds, READ_CHUNK_SIZE)) {
    addRows(await loadAllEntityRows({
      entity,
      query: { sales_import_source_id: { $in: ids }, is_rider: { $ne: true }, deleted: { $ne: true } },
      sort: 'created_date',
      label: 'Sales import source identities',
    }));
  }

  for (const ids of chunk(estInvValues, READ_CHUNK_SIZE)) {
    const [estimateRows, invoiceRows] = await Promise.all([
      loadAllEntityRows({
        entity,
        query: { est_inv_at: { $in: ids }, is_rider: { $ne: true }, deleted: { $ne: true } },
        sort: 'created_date',
        label: 'Sales import estimate identities',
      }),
      loadAllEntityRows({
        entity,
        query: { corbridge_invoice_number: { $in: ids }, is_rider: { $ne: true }, deleted: { $ne: true } },
        sort: 'created_date',
        label: 'Sales import invoice identities',
      }),
    ]);
    addRows(estimateRows);
    addRows(invoiceRows);
  }

  let loadedIndexes = buildExistingImportIndexes(Array.from(found.values()));
  const unresolvedSourceIds = sourceIds.filter((id) => !(loadedIndexes.sourceIds.get(normalizeIdentity(id)) || []).length);
  for (const ids of chunk(unresolvedSourceIds, CLIENT_REGEX_CHUNK_SIZE)) {
    const pattern = normalizedAlternationRegex(ids);
    addRows(await loadAllEntityRows({
      entity,
      query: { sales_import_source_id: { $regex: pattern, $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
      sort: 'created_date',
      label: 'Sales import normalized source identities',
    }));
  }

  loadedIndexes = buildExistingImportIndexes(Array.from(found.values()));
  const unresolvedEstInv = estInvValues.filter((id) => !(loadedIndexes.estInv.get(normalizeIdentity(id)) || []).length);
  for (const ids of chunk(unresolvedEstInv, CLIENT_REGEX_CHUNK_SIZE)) {
    const pattern = normalizedAlternationRegex(ids);
    const [estimateRows, invoiceRows] = await Promise.all([
      loadAllEntityRows({
        entity,
        query: { est_inv_at: { $regex: pattern, $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
        sort: 'created_date',
        label: 'Sales import normalized estimate identities',
      }),
      loadAllEntityRows({
        entity,
        query: { corbridge_invoice_number: { $regex: pattern, $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
        sort: 'created_date',
        label: 'Sales import normalized invoice identities',
      }),
    ]);
    addRows(estimateRows);
    addRows(invoiceRows);
  }

  for (const names of chunk(weakClientNames, CLIENT_REGEX_CHUNK_SIZE)) {
    const pattern = normalizedAlternationRegex(names);
    addRows(await loadAllEntityRows({
      entity,
      query: { client_name: { $regex: pattern, $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
      sort: 'created_date',
      label: 'Sales import customer identities',
    }));
  }

  return Array.from(found.values());
}

async function readIdentityMatches(entity: any, importRow: any) {
  if (importRow.sourceId) {
    return loadAllEntityRows({
      entity,
      query: { sales_import_source_id: { $regex: normalizedExactRegex(importRow.sourceId), $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
      sort: 'created_date',
      label: `Sales import source identity ${importRow.sourceId}`,
    });
  }

  if (importRow.estInvAt) {
    const [estimateRows, invoiceRows] = await Promise.all([
      loadAllEntityRows({
        entity,
        query: { est_inv_at: { $regex: normalizedExactRegex(importRow.estInvAt), $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
        sort: 'created_date',
        label: `Sales import estimate identity ${importRow.estInvAt}`,
      }),
      loadAllEntityRows({
        entity,
        query: { corbridge_invoice_number: { $regex: normalizedExactRegex(importRow.estInvAt), $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
        sort: 'created_date',
        label: `Sales import invoice identity ${importRow.estInvAt}`,
      }),
    ]);
    return [...estimateRows, ...invoiceRows];
  }

  const clientRows = await loadAllEntityRows({
    entity,
    query: { client_name: { $regex: normalizedExactRegex(importRow.clientName), $options: 'i' }, is_rider: { $ne: true }, deleted: { $ne: true } },
    sort: 'created_date',
    label: `Sales import customer identity ${importRow.clientName}`,
  });
  const titleKey = String(importRow.identity?.titleKey || '');
  return clientRows.filter((row) => String(row?.title || row?.client_name || '').trim().toLowerCase().replace(/\s+/g, ' ') === titleKey);
}

async function getOwnedImportJob(ImportJob: any, importJobId: string, actorEmail: string) {
  if (!importJobId) return null;
  const job = await ImportJob.get(importJobId);
  if (!job?.id || asText(job.user_email).toLowerCase() !== actorEmail) {
    throw Object.assign(new Error('Import job does not belong to the current user.'), { status: 403 });
  }
  return job;
}

async function ensureNoOtherActiveImport(ImportJob: any, currentJobId: string) {
  const active = await ImportJob.filter({
    import_type: 'sales_pipeline',
    status: { $in: ['running', 'paused'] },
  }, '-started_at', 20);
  const now = Date.now();
  for (const job of active || []) {
    if (!job?.id || String(job.id) === String(currentJobId)) continue;
    const started = Date.parse(String(job.started_at || ''));
    if (Number.isFinite(started) && now - started > ACTIVE_JOB_STALE_MS) {
      await ImportJob.update(job.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        phase: 'failed',
        error_message: 'Import job expired after 30 minutes without completion.',
      }).catch(() => null);
      continue;
    }
    throw Object.assign(new Error('Another Sales Pipeline import is already running. Finish or stop it before starting another.'), { status: 409 });
  }
}

async function createOrPrepareImportJob(ImportJob: any, existingJob: any, actorEmail: string, data: any) {
  if (existingJob?.id) {
    return ImportJob.update(existingJob.id, {
      status: 'running',
      total_items: data.totalItems,
      processed_items: 0,
      current_item: 'Validating spreadsheet...',
      phase: 'validating',
      started_at: existingJob.started_at || new Date().toISOString(),
      completed_at: '',
      error_message: '',
      file_name: data.fileName,
      file_hash: data.fileHash,
      file_size_bytes: data.fileSizeBytes,
      created_items: 0,
      updated_items: 0,
      unchanged_items: data.unchangedItems || 0,
      skipped_items: data.skippedItems || 0,
      conflict_items: data.conflictItems || 0,
      ambiguous_items: data.ambiguousItems || 0,
      invalid_items: data.invalidItems || 0,
      duration_ms: 0,
      result_message: '',
    });
  }
  return ImportJob.create({
    user_email: actorEmail,
    import_type: 'sales_pipeline',
    status: 'running',
    total_items: data.totalItems,
    processed_items: 0,
    current_item: 'Validating spreadsheet...',
    phase: 'validating',
    started_at: new Date().toISOString(),
    file_name: data.fileName,
    file_hash: data.fileHash,
    file_size_bytes: data.fileSizeBytes,
    created_items: 0,
    updated_items: 0,
    unchanged_items: data.unchangedItems || 0,
    skipped_items: data.skippedItems || 0,
    conflict_items: data.conflictItems || 0,
    ambiguous_items: data.ambiguousItems || 0,
    invalid_items: data.invalidItems || 0,
  });
}

async function completedDuplicateJob(ImportJob: any, fileHash: string, currentJobId: string) {
  if (!fileHash) return null;
  const matches = await ImportJob.filter({
    import_type: 'sales_pipeline',
    status: 'completed',
    file_hash: fileHash,
  }, '-completed_at', 10);
  return (matches || []).find((job: any) =>
    String(job?.id || '') !== String(currentJobId || '')
    && Number(job?.conflict_items || 0) === 0
    && Number(job?.ambiguous_items || 0) === 0
    && Number(job?.invalid_items || 0) === 0
    && Number(job?.skipped_items || 0) === 0
  ) || null;
}

function issueRows(parsedInvalidRows: any[], plans: any[]) {
  const invalid = parsedInvalidRows.map((row) => ({
    row: row.rowNumber,
    customer: row.clientName || '',
    type: 'invalid',
    message: (row.errors || []).join('; '),
  }));
  const planned = plans
    .filter((plan) => ['invalid', 'conflict', 'ambiguous', 'adoption'].includes(plan.kind))
    .map((plan) => ({
      row: plan.rowNumber,
      customer: plan.clientName || '',
      est_inv_at: plan.estInvAt || '',
      type: plan.kind,
      message: plan.reason || plan.kind,
      fields: plan.fields || [],
      match_ids: plan.matchIds || [],
    }));
  return [...invalid, ...planned];
}

async function runWithBackoff<T>(work: () => Promise<T>, attempts = 3) {
  let lastError: any = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.response?.status || 0);
      const retryable = status === 429 || status === 503 || /rate|timeout|temporar/i.test(String(error?.message || ''));
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const startedAt = Date.now();
  let actor: any = null;
  let importJob: any = null;

  try {
    const request = await parseRequest(req);

    try {
      actor = await authenticateSignShopSession(base44, request.sessionToken);
    } catch (error) {
      const status = Number(error?.status || 401);
      const safeStatus = [401, 409, 503].includes(status) ? status : 401;
      return Response.json({ error: safeStatus === 503 ? 'Session authentication is unavailable' : 'Unauthorized' }, { status: safeStatus });
    }

    const canImport = actor?.role === 'admin' || actor?.can_import_export === true;
    if (!canImport) return Response.json({ error: 'Sales Pipeline import permission is required.' }, { status: 403 });

    const actorEmail = asText(actor?.email).toLowerCase();
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const ImportJob = base44.asServiceRole.entities.ImportJob;

    if (request.mode === 'apply') {
      importJob = await getOwnedImportJob(ImportJob, request.importJobId, actorEmail);
      await ensureNoOtherActiveImport(ImportJob, importJob?.id || '');
    }

    const parseStarted = Date.now();
    const workbook = XLSX.read(request.bytes, { type: 'array', cellDates: true });
    const selectedSheet = selectImportWorksheet(workbook);
    const rawRows = XLSX.utils.sheet_to_json(selectedSheet.sheet, { defval: '', range: selectedSheet.headerRow, blankrows: false });
    const todayStamp = format(new Date(), 'yyyy-MM-dd');
    const parsed = parseSalesImportRows(rawRows, { todayStamp, rowNumberBase: selectedSheet.headerRow + 2 });
    const headerValidation = validateSalesImportHeaders(parsed.headers);
    if (headerValidation.errors.length) {
      throw Object.assign(new Error(headerValidation.errors.join(" ")), { status: 400 });
    }
    const parseMs = Date.now() - parseStarted;

    if (rawRows.length === 0) {
      const durationMs = Date.now() - startedAt;
      if (importJob?.id) {
        await ImportJob.update(importJob.id, {
          status: 'completed',
          phase: 'completed',
          total_items: 0,
          processed_items: 0,
          current_item: 'Spreadsheet contains no data rows.',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          result_message: 'Spreadsheet contains no data rows.',
        });
      }
      return Response.json({
        mode: request.mode,
        summary: { total: 0, create: 0, update: 0, unchanged: 0, conflict: 0, ambiguous: 0, invalid: 0 },
        issues: [],
        import_job_id: importJob?.id || '',
        timings: { parse_ms: parseMs, match_ms: 0, apply_ms: 0, total_ms: durationMs },
      });
    }

    const matchStarted = Date.now();
    const relevantOrders = await loadRelevantWorkOrders(WorkOrder, parsed.validRows);
    const indexes = buildExistingImportIndexes(relevantOrders);
    const nowIso = new Date().toISOString();
    const plans = parsed.validRows.map((row) => buildSalesImportPlan(row, resolveSalesImportMatch(row, indexes), { nowIso, allowLegacyAdoption: request.mode === 'apply' && request.adoptLegacy }));
    const summary = summarizeSalesImportPlans(plans, parsed.invalidRows);
    const issues = issueRows(parsed.invalidRows, plans);
    const fingerprint = await sha256Hex(stableImportFingerprintPayload(parsed.validRows, parsed.invalidRows));
    const matchMs = Date.now() - matchStarted;

    const previewPayload = {
      mode: request.mode,
      file_name: request.fileName,
      file_hash: fingerprint,
      sheet_name: selectedSheet.sheetName,
      header_row: selectedSheet.headerRow + 1,
      summary,
      issues,
      warnings: [
        ...(selectedSheet.multipleCandidates ? [{ row: "", customer: "", message: `Multiple worksheets looked importable (${selectedSheet.candidateNames.join(', ')}). Using ${selectedSheet.sheetName}.` }] : []),
        ...headerValidation.warnings.map((message: string) => ({ row: "", customer: "", message })),
        ...parsed.validRows.flatMap((row) => (row.warnings || []).map((message: string) => ({ row: row.rowNumber, customer: row.clientName, message }))),
      ].slice(0, 100),
      sample_changes: plans.filter((plan) => ['create', 'update'].includes(plan.kind)).slice(0, 50).map((plan) => ({
        row: plan.rowNumber,
        customer: plan.clientName,
        action: plan.kind,
        fields: Object.keys(plan.nextFields || {}).filter((field) => !field.startsWith('sales_import_')),
      })),
      timings: { parse_ms: parseMs, match_ms: matchMs, apply_ms: 0, total_ms: Date.now() - startedAt },
    };

    if (request.mode === 'preview') return Response.json(previewPayload);

    const skippedItems = summary.conflict + summary.ambiguous + summary.invalid + summary.adoption;
    importJob = await createOrPrepareImportJob(ImportJob, importJob, actorEmail, {
      totalItems: summary.total,
      fileName: request.fileName,
      fileHash: fingerprint,
      fileSizeBytes: request.fileSizeBytes,
      unchangedItems: summary.unchanged,
      skippedItems,
      conflictItems: summary.conflict,
      ambiguousItems: summary.ambiguous,
      invalidItems: summary.invalid,
    });

    if (!request.force) {
      const duplicate = await completedDuplicateJob(ImportJob, fingerprint, importJob.id);
      if (duplicate) {
        const durationMs = Date.now() - startedAt;
        const message = `Exact spreadsheet already imported successfully. No WorkOrders were rewritten.`;
        await ImportJob.update(importJob.id, {
          status: 'completed',
          phase: 'completed',
          processed_items: summary.total,
          unchanged_items: summary.total,
          skipped_items: 0,
          conflict_items: 0,
          ambiguous_items: 0,
          invalid_items: 0,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          parse_ms: parseMs,
          match_ms: matchMs,
          apply_ms: 0,
          result_message: message,
          current_item: message,
        });
        return Response.json({
          ...previewPayload,
          mode: 'apply',
          duplicate_file: true,
          duplicate_of_import_job_id: duplicate.id,
          created: 0,
          updated: 0,
          unchanged: summary.total,
          failed: 0,
          conflicts: 0,
          ambiguous: 0,
          invalid: 0,
          skipped: 0,
          import_job_id: importJob.id,
          timings: { parse_ms: parseMs, match_ms: matchMs, apply_ms: 0, total_ms: durationMs },
        });
      }
    }

    await ImportJob.update(importJob.id, {
      phase: 'applying',
      current_item: `Applying ${summary.create + summary.update} changed row(s)...`,
    });

    const actionable = plans.filter((plan) => ['create', 'update'].includes(plan.kind));
    const rowByNumber = new Map(parsed.validRows.map((row) => [row.rowNumber, row]));
    const results = { created: 0, updated: 0, failed: 0, conflicts: summary.conflict, ambiguous: summary.ambiguous, invalid: summary.invalid };
    const returnChangedRecords = actionable.length <= 100;
    const changedRecords: any[] = [];
    const runtimeIssues = [...issues];
    let cursor = 0;
    let processedActionable = 0;
    let cancelled = false;
    let lastControlCheckAt = 0;
    let cachedControlStatus = 'running';
    let controlReadPromise: Promise<string> | null = null;
    const progressEvery = Math.max(5, Math.ceil(Math.max(1, actionable.length) / 40));
    const applyStarted = Date.now();

    const readControlStatus = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastControlCheckAt < 750) return cachedControlStatus;
      if (!controlReadPromise) {
        controlReadPromise = ImportJob.get(importJob.id)
          .then((job: any) => {
            cachedControlStatus = String(job?.status || 'running');
            lastControlCheckAt = Date.now();
            return cachedControlStatus;
          })
          .finally(() => {
            controlReadPromise = null;
          });
      }
      return controlReadPromise;
    };

    const waitForImportPermission = async () => {
      let status = await readControlStatus();
      while (status === 'paused') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        status = await readControlStatus(true);
      }
      if (status === 'cancelled') {
        cancelled = true;
        return false;
      }
      return true;
    };

    const processPlan = async (plan: any) => {
      if (!(await waitForImportPermission())) return;
      const importRow = rowByNumber.get(plan.rowNumber);
      try {
        if (plan.kind === 'update') {
          const saved = await runWithBackoff(() => replaceWorkOrderFieldsIfUnchanged({
            entity: WorkOrder,
            workOrderId: plan.recordId,
            expectedFields: expectedWorkOrderFields(plan.current, plan.nextFields),
            nextFields: plan.nextFields,
            label: `Sales Pipeline import row ${plan.rowNumber} ${plan.estInvAt || plan.clientName}`,
          }));
          if (returnChangedRecords && saved?.id) changedRecords.push(saved);
          results.updated += 1;
          return;
        }

        const createResult = await runWithBackoff(() => createWorkOrderWithRecovery({
          entity: WorkOrder,
          data: plan.nextFields,
          readMatches: () => readIdentityMatches(WorkOrder, importRow),
          label: `Sales Pipeline import row ${plan.rowNumber} ${plan.estInvAt || plan.clientName}`,
          settleMs: 25,
        }));

        if (createResult.status === 'created') {
          if (returnChangedRecords && createResult.record?.id) changedRecords.push(createResult.record);
          results.created += 1;
        } else {
          const saved = await runWithBackoff(() => replaceWorkOrderFieldsIfUnchanged({
            entity: WorkOrder,
            workOrderId: createResult.record.id,
            expectedFields: expectedWorkOrderFields(createResult.record, plan.nextFields),
            nextFields: plan.nextFields,
            label: `Sales Pipeline recovered import row ${plan.rowNumber}`,
          }));
          if (returnChangedRecords && saved?.id) changedRecords.push(saved);
          results.updated += 1;
        }
      } catch (error) {
        const code = String(error?.code || '');
        const conflict = code === 'WORK_ORDER_FIELD_CONFLICT' || code === 'WORK_ORDER_CREATE_AMBIGUOUS';
        if (conflict) results.conflicts += 1;
        else results.failed += 1;
        runtimeIssues.push({
          row: plan.rowNumber,
          customer: plan.clientName || '',
          est_inv_at: plan.estInvAt || '',
          type: conflict ? 'conflict' : 'failed',
          message: String(error?.message || 'Row could not be imported.'),
        });
      } finally {
        processedActionable += 1;
        const processed = summary.unchanged + skippedItems + processedActionable;
        if (processedActionable % progressEvery === 0 || processedActionable === actionable.length) {
          await ImportJob.update(importJob.id, {
            processed_items: Math.min(summary.total, processed),
            current_item: `Processed ${Math.min(summary.total, processed)} of ${summary.total}`,
            created_items: results.created,
            updated_items: results.updated,
            unchanged_items: summary.unchanged,
            skipped_items: results.conflicts + results.ambiguous + results.invalid + results.failed + summary.adoption,
            conflict_items: results.conflicts,
            ambiguous_items: results.ambiguous,
            invalid_items: results.invalid,
          }).catch(() => null);
        }
      }
    };

    const workers = Array.from({ length: Math.min(WORKER_COUNT, Math.max(1, actionable.length)) }, async () => {
      while (true) {
        if (cancelled) return;
        const index = cursor;
        cursor += 1;
        if (index >= actionable.length) return;
        await processPlan(actionable[index]);
      }
    });
    await Promise.all(workers);

    const applyMs = Date.now() - applyStarted;
    if (cancelled) {
      const durationMs = Date.now() - startedAt;
      const processed = summary.unchanged + skippedItems + processedActionable;
      const message = `Import cancelled after ${Math.min(summary.total, processed)} of ${summary.total} rows. Completed writes were preserved; unprocessed rows were not touched.`;
      await ImportJob.update(importJob.id, {
        status: 'cancelled',
        phase: 'cancelled',
        processed_items: Math.min(summary.total, processed),
        current_item: message,
        created_items: results.created,
        updated_items: results.updated,
        unchanged_items: summary.unchanged,
        skipped_items: results.conflicts + results.ambiguous + results.invalid + results.failed + summary.adoption,
        conflict_items: results.conflicts,
        ambiguous_items: results.ambiguous,
        invalid_items: results.invalid,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        parse_ms: parseMs,
        match_ms: matchMs,
        apply_ms: applyMs,
        result_message: message,
      });
      return Response.json({
        ...previewPayload,
        mode: 'apply',
        cancelled: true,
        import_job_id: importJob.id,
        created: results.created,
        updated: results.updated,
        unchanged: summary.unchanged,
        failed: results.failed,
        conflicts: results.conflicts,
        ambiguous: results.ambiguous,
        invalid: results.invalid,
        skipped: results.conflicts + results.ambiguous + results.invalid + results.failed + summary.adoption,
        issues: runtimeIssues,
        timings: { parse_ms: parseMs, match_ms: matchMs, apply_ms: applyMs, total_ms: durationMs },
      });
    }
    const durationMs = Date.now() - startedAt;
    const skipped = results.conflicts + results.ambiguous + results.invalid + results.failed + summary.adoption;
    const resultMessage = `${results.created} created, ${results.updated} updated, ${summary.unchanged} unchanged${skipped ? `, ${skipped} need review` : ''}.`;

    await ImportJob.update(importJob.id, {
      status: results.failed > 0 && results.created + results.updated === 0 ? 'failed' : 'completed',
      phase: 'completed',
      processed_items: summary.total,
      current_item: resultMessage,
      created_items: results.created,
      updated_items: results.updated,
      unchanged_items: summary.unchanged,
      skipped_items: skipped,
      conflict_items: results.conflicts,
      ambiguous_items: results.ambiguous,
      invalid_items: results.invalid,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      parse_ms: parseMs,
      match_ms: matchMs,
      apply_ms: applyMs,
      result_message: resultMessage,
      error_message: results.failed ? `${results.failed} row(s) failed during apply.` : '',
    });

    return Response.json({
      ...previewPayload,
      mode: 'apply',
      import_job_id: importJob.id,
      created: results.created,
      updated: results.updated,
      unchanged: summary.unchanged,
      failed: results.failed,
      conflicts: results.conflicts,
      ambiguous: results.ambiguous,
      invalid: results.invalid,
      adoption: summary.adoption,
      skipped,
      issues: runtimeIssues,
      changed_records: returnChangedRecords ? changedRecords : [],
      changed_records_complete: returnChangedRecords,
      timings: { parse_ms: parseMs, match_ms: matchMs, apply_ms: applyMs, total_ms: durationMs },
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 413].includes(status) ? status : 500;
    const safeMessage = safeStatus === 500 ? 'Sales Pipeline import could not be completed safely' : String(error?.message || 'Import failed');

    if (importJob?.id) {
      await base44.asServiceRole.entities.ImportJob.update(importJob.id, {
        status: 'failed',
        phase: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error_message: safeMessage,
        current_item: safeMessage,
      }).catch(() => null);
    }

    console.error('importSalesPipeline error:', error?.message || error);
    return Response.json({ error: safeMessage }, { status: safeStatus });
  }
});
