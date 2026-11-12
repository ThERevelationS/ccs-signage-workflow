import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

const ESTIMATE_REFERENCE_ENTITIES = [
  'BuilderPriceRevision',
  'BuilderProduct',
  'EstimateAcceptance',
  'EstimateQuoteDelivery',
  'EstimateRevision',
  'WorkOrder',
];

const clean = (value: unknown) => String(value || '').trim();

const canonicalRow = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.updated_date || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.updated_date || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

const stripCreationProtectedFields = (input: any = {}) => {
  const {
    id: _id,
    created_date: _createdDate,
    updated_date: _updatedDate,
    created_by: _createdBy,
    created_by_id: _createdById,
    creation_request_key: _creationRequestKey,
    work_order_id: _workOrderId,
    line_items: _lineItems,
    total_cost: _totalCost,
    quote_total: _quoteTotal,
    quote_issue_date: _quoteIssueDate,
    quote_version: _quoteVersion,
    cancel_reason: _cancelReason,
    edit_reason: _editReason,
    pipeline_sync_pending: _pipelineSyncPending,
    pipeline_sync_error: _pipelineSyncError,
    last_product_removal_key: _lastProductRemovalKey,
    last_product_removal_line_id: _lastProductRemovalLineId,
    last_product_removal_at: _lastProductRemovalAt,
    ...rest
  } = input || {};
  return rest;
};

const sameCreateIdentity = (row: any = {}, target: any = {}) => (
  clean(row.project_name) === clean(target.project_name) &&
  clean(row.client_name) === clean(target.client_name) &&
  clean(row.customer_id) === clean(target.customer_id) &&
  clean(row.estimate_number) === clean(target.estimate_number)
);

async function estimateReference(base44: any, estimateId: string) {
  for (const entityName of ESTIMATE_REFERENCE_ENTITIES) {
    const entity = base44.asServiceRole.entities[entityName];
    if (!entity?.filter) continue;
    const rows = await entity.filter({ estimate_id: estimateId });
    if ((rows || []).length) return entityName;
  }
  return '';
}

async function canDiscardRaceDuplicate(base44: any, row: any) {
  if (!row?.id) return { ok: false, reason: 'missing Estimate id', record: null };
  const EstimateService = base44.asServiceRole.entities.AllInOneEstimate;
  let live;
  try {
    live = await EstimateService.get(row.id);
  } catch {
    return { ok: false, reason: 'the losing Draft could not be re-read safely', record: null };
  }
  if (!live?.id) return { ok: true, reason: '', record: null };
  if (clean(live.status || 'draft') !== 'draft') return { ok: false, reason: `status is ${live.status}`, record: live };
  if (clean(live.work_order_id)) return { ok: false, reason: 'work_order_id is already set', record: live };
  if ((live.line_items || []).length) return { ok: false, reason: 'Products are already attached', record: live };
  const referencedBy = await estimateReference(base44, live.id);
  if (referencedBy) return { ok: false, reason: `${referencedBy} already references it`, record: live };
  return { ok: true, reason: '', record: live };
}

// ---- Estimate copy-completion (O-012 Option A) ----
// A duplicated/split estimate is created as a Draft shell — line_items strip
// above — so the copy pipeline below rebuilds what the clone references: for
// every carried line, the module project and the Builder product (with its
// part groups and parts) are cloned into records owned by the NEW estimate,
// the carried line's ids are remapped to the clones, and line_items is CAS-
// attached. Every step dedupes on natural keys so the pipeline resumes
// cleanly across creation-key retries — a retried copy never double-clones.
const COPY_MODULE_ENTITIES: Record<string, string> = {
  foundation: 'FoundationProject',
  channel_letters: 'ChannelLetterInstallation',
  vinyl: 'VinylProject',
  cnc: 'CNCProject',
  laser: 'LaserProject',
  metal: 'MetalProject',
  brick_stone: 'BrickStoneProject',
  maintenance: 'MaintenanceProject',
  painting: 'Project',
  custom_items: 'CustomItemsProject',
  sign_hardware: 'SignHardwareProject',
  digital_print: 'DigitalPrintProject',
};

// Identity/ownership fields stripped from a cloned module project. Estimate
// linkage is re-anchored to the new estimate below; a foreign builder sync
// receipt must never transplant (its recovery state belongs to the source).
const COPY_PROJECT_STRIP = new Set([
  'id', 'created_date', 'updated_date', 'created_by', 'created_by_id',
  'creation_request_key', 'builder_sync_attempt', 'estimate_id',
  'estimate_number', 'work_order_id',
]);

// Production/lifecycle fields dropped from a cloned BuilderProduct — the copy
// is a draft estimate's product, not a live job, and dropped keys take the
// entity's own defaults (type-safe: no guessed empty values). Design/pricing
// fields (builder_snapshot*, frozen_cost, price_state, part counts) carry
// verbatim.
const COPY_PRODUCT_DROP = new Set([
  'id', 'created_date', 'updated_date', 'created_by', 'created_by_id',
  'creation_request_key', 'estimate_id', 'estimate_line_id', 'source_project_id',
  'fulfillment_state', 'operational_status', 'operational_substatus',
  'operational_status_changed_at', 'queue_priority',
  'proof_status', 'proof_version', 'proof_file_url', 'proof_file_name',
  'proof_approved_version', 'design_due_date', 'product_due_date',
  'hard_due_date', 'assigned_to', 'designer', 'responsibility',
  'customer_facing_status',
]);

// Mirrors estimateLineSelectionKey in estimateCreationService.js — the key a
// split's line selection is expressed in.
const copyLineKey = (line: any, index: number) =>
  clean(line?.line_id) || clean(line?.builder_product_id) || clean(line?.project_id) || `i${index}`;

const copyNum = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function completeEstimateCopy(base44: any, { record, sourceId, isSplit, inputLines }: any) {
  const svc = base44.asServiceRole.entities;
  const newEstId = clean(record?.id);
  if (!newEstId) return record;
  const source = await svc.AllInOneEstimate.get(sourceId).catch(() => null);
  if (!source?.id) {
    throw Object.assign(new Error('The estimate this copy was made from could not be loaded; the copy was left as a draft shell — retry to resume it.'), { statusCode: 409 });
  }
  const sourceLines = Array.isArray(source.line_items) ? source.line_items : [];
  let carried = sourceLines;
  if (isSplit) {
    const srcKeys = sourceLines.map(copyLineKey);
    const picked = new Set((Array.isArray(inputLines) ? inputLines : []).map(copyLineKey));
    if (!picked.size || [...picked].some((k) => srcKeys.filter((x) => x === k).length !== 1)) {
      throw Object.assign(new Error('The selected products changed or have ambiguous identifiers. Reload and select them again.'), { statusCode: 409 });
    }
    carried = sourceLines.filter((_: any, i: number) => picked.has(srcKeys[i]));
  }
  // Same transplant guard as the client: a durable Builder recovery marker is
  // unresumable on a foreign estimate — the pending op belongs to the source.
  for (const line of carried) {
    if (line?.price_acceptance_pending?.key) {
      throw Object.assign(new Error('This estimate has an unfinished Builder operation. Resolve or discard it before copying.'), { statusCode: 409 });
    }
  }

  const newNumber = clean(record.estimate_number);
  const warnings: string[] = [];
  const newLines: any[] = [];

  const cloneProject = async (entityName: string, srcId: string) => {
    const service = svc[entityName];
    if (!service) return { id: '', missing: `module entity ${entityName}` };
    const key = `copy-proj:${newEstId}:${srcId}`;
    const found = await service.filter({ creation_request_key: key }).catch(() => []);
    if (found?.[0]?.id) {
      // Self-heal: a clone from a failed/older attempt that never got ownership
      // must be claimed before the copy can rely on it.
      const prior = found[0];
      if (clean(prior.estimate_id) !== newEstId && service.updateMany) {
        await service.updateMany(
          { id: clean(prior.id), updated_date: clean(prior.updated_date) },
          { $set: { estimate_id: newEstId } },
        ).catch(() => null);
      }
      return { id: clean(prior.id) };
    }
    const src = await service.get(srcId).catch(() => null);
    if (!src?.id) return { id: '', missing: `source project ${srcId}` };
    const data: any = {};
    for (const [k, v] of Object.entries(src)) {
      if (!COPY_PROJECT_STRIP.has(k) && !k.startsWith('_')) data[k] = v;
    }
    // Ownership re-anchors unconditionally — a module entity lacking these
    // fields drops them harmlessly; the source may itself carry an unset or
    // sanitized estimate_id (staffEntityWrite strips identity fields), so the
    // presence check cannot decide whether the clone needs ownership.
    data.estimate_id = newEstId;
    if ('estimate_number' in src || newNumber) data.estimate_number = newNumber;
    data.creation_request_key = key;
    const created = await service.create(data);
    return { id: clean(created?.id) };
  };

  const cloneProduct = async (srcProductId: string, line: any, projectMap: Map<string, string>) => {
    const service = svc.BuilderProduct;
    const src = await service.get(srcProductId).catch(() => null);
    if (!src?.id) return { id: '', missing: `builder product ${srcProductId}` };
    // Dedupe: an earlier attempt's clone for this exact line — same owning
    // estimate + same line + same design snapshot.
    const candidates = await service.filter({ estimate_id: newEstId, estimate_line_id: clean(line?.line_id) }).catch(() => []);
    const match = (candidates || []).find((c: any) =>
      clean(c?.builder_snapshot_hash) === clean(src?.builder_snapshot_hash) || clean(src?.builder_snapshot_hash) === ''
    );
    let productId = clean(match?.id);
    if (!productId) {
      const data: any = {};
      for (const [k, v] of Object.entries(src)) {
        if (!COPY_PRODUCT_DROP.has(k) && !k.startsWith('_')) data[k] = v;
      }
      data.estimate_id = newEstId;
      data.estimate_line_id = clean(line?.line_id);
      const mappedProject = projectMap.get(clean(src?.source_project_id));
      data.source_project_id = mappedProject || clean(src?.source_project_id);
      const created = await service.create(data);
      productId = clean(created?.id);
      if (!productId) throw Object.assign(new Error(`Builder product ${srcProductId} could not be cloned — retry the copy to resume it.`), { statusCode: 409 });
    }
    // Part groups + parts — natural-key dedupe per record.
    const groupMap = new Map<string, string>();
    const groups = await svc.BuilderPartGroup.filter({ builder_product_id: srcProductId }).catch(() => []);
    for (const g of Array.isArray(groups) ? groups : []) {
      const gKey = clean(g?.group_key);
      const existing = gKey
        ? await svc.BuilderPartGroup.filter({ builder_product_id: productId, group_key: gKey }).catch(() => [])
        : [];
      let groupId = clean(existing?.[0]?.id);
      if (!groupId) {
        const { id: _gi, created_date: _gc, updated_date: _gu, created_by: _gb, created_by_id: _gbi, ...gf } = g || {};
        const created = await svc.BuilderPartGroup.create({ ...gf, builder_product_id: productId });
        groupId = clean(created?.id);
      }
      if (clean(g?.id)) groupMap.set(clean(g.id), groupId);
    }
    const parts = await svc.BuilderPart.filter({ builder_product_id: srcProductId }).catch(() => []);
    for (const p of Array.isArray(parts) ? parts : []) {
      const pKey = clean(p?.part_key);
      const existing = pKey
        ? await svc.BuilderPart.filter({ builder_product_id: productId, part_key: pKey }).catch(() => [])
        : [];
      if (existing?.[0]?.id) continue;
      const { id: _pi, created_date: _pc, updated_date: _pu, created_by: _pb, created_by_id: _pbi, ...pf } = p || {};
      const mappedGroup = groupMap.get(clean(p?.part_group_id));
      await svc.BuilderPart.create({ ...pf, builder_product_id: productId, part_group_id: mappedGroup || clean(p?.part_group_id) });
    }
    return { id: productId };
  };

  const projectMap = new Map<string, string>();
  for (const line of carried) {
    const next: any = { ...line };
    const srcProjectId = clean(line?.project_id);
    if (srcProjectId) {
      const entityName = COPY_MODULE_ENTITIES[clean(line?.module_key)] || '';
      const cloned = entityName ? await cloneProject(entityName, srcProjectId) : { id: '', missing: 'module entity' };
      if (cloned.id) projectMap.set(srcProjectId, cloned.id);
      else warnings.push(`project ${srcProjectId} could not be cloned${cloned.missing ? ` (${cloned.missing})` : ''}`);
    }
    newLines.push(next);
  }
  // Products clone after projects so source_project_id remaps to the clones.
  for (let i = 0; i < newLines.length; i += 1) {
    const srcProductId = clean(newLines[i]?.builder_product_id);
    if (!srcProductId) continue;
    const cloned = await cloneProduct(srcProductId, newLines[i], projectMap);
    if (cloned.id) {
      newLines[i].builder_product_id = cloned.id;
    } else {
      warnings.push(`builder product ${srcProductId} could not be cloned${cloned.missing ? ` (${cloned.missing})` : ''}`);
    }
  }
  for (const line of newLines) {
    const mapped = projectMap.get(clean(line?.project_id));
    if (mapped) line.project_id = mapped;
  }

  const totalCost = newLines.reduce((sum, l) => sum + copyNum(l?.total_cost), 0);
  const fields: any = { line_items: newLines, total_cost: totalCost };
  if (!isSplit && copyNum(source?.quote_total) > 0) {
    fields.quote_total = copyNum(source.quote_total);
  } else {
    fields.pricing_stale = true;
    fields.pricing_stale_reason = 'Estimate copied — recompute pricing before sending.';
  }
  const attach = await svc.AllInOneEstimate.updateMany(
    { id: newEstId, updated_date: clean(record.updated_date) },
    { $set: fields },
  );
  if (attach?.updated !== 1) {
    // Same-value retries may report 0; verify content before declaring a CAS miss.
    const live = await svc.AllInOneEstimate.get(newEstId).catch(() => null);
    const liveLines = Array.isArray(live?.line_items) ? live.line_items : [];
    const sameLines = liveLines.length === newLines.length
      && liveLines.every((l: any, i: number) => clean(l?.builder_product_id) === clean(newLines[i]?.builder_product_id) && clean(l?.project_id) === clean(newLines[i]?.project_id));
    if (!sameLines) {
      throw Object.assign(new Error('The copied estimate changed before its products could be attached. Retry the copy to resume it.'), { statusCode: 409 });
    }
  }
  const final = await svc.AllInOneEstimate.get(newEstId).catch(() => null);
  if (!final?.id) {
    throw Object.assign(new Error('The copied estimate could not be re-read after its products were attached.'), { statusCode: 409 });
  }
  if (warnings.length) final.copy_warnings = warnings.join('; ');
  return final;
}

// Runs the copy pipeline when the row carries a copy lineage marker. Deduped
// internally — safe on every reuse/retry path.
async function finalizeCopiedEstimate(record: any, base44: any, inputLines: any) {
  const sourceId = clean(record?.duplicated_from_estimate_id) || clean(record?.split_from_estimate_id);
  if (!sourceId) return record;
  return completeEstimateCopy(base44, {
    record,
    sourceId,
    isSplit: !!clean(record?.split_from_estimate_id),
    inputLines,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    await authenticateSignShopSession(base44, body?.session_token);
    const creationKey = clean(body?.creation_key);
    const estimateInput = body?.estimate && typeof body.estimate === 'object' ? body.estimate : {};
    // New Estimate creation establishes only a clean Draft shell. Relationships,
    // Products, totals, issued-quote identity, lifecycle recovery markers, and
    // removal receipts are created later by their dedicated guarded workflows.
    const estimate = stripCreationProtectedFields(estimateInput);
    estimate.project_name = clean(estimate.project_name);
    estimate.client_name = clean(estimate.client_name);
    estimate.customer_id = clean(estimate.customer_id) || null;
    estimate.estimate_number = clean(estimate.estimate_number);
    estimate.status = clean(estimate.status || 'draft') || 'draft';

    if (!creationKey || creationKey.length > 256) {
      return Response.json({ error: 'A valid Estimate creation key is required.' }, { status: 400 });
    }
    if (!estimate.project_name) {
      return Response.json({ error: 'Estimate description is required.' }, { status: 400 });
    }
    if (estimate.status !== 'draft') {
      return Response.json({ error: 'New Estimate creation can only create Draft estimates.' }, { status: 400 });
    }

    const EstimateUser = base44.entities.AllInOneEstimate;
    const EstimateService = base44.asServiceRole.entities.AllInOneEstimate;

    // estimate_number uniqueness: a supplied number must not collide with a
    // live estimate unless the caller explicitly opts in (same-number clone).
    if (estimate.estimate_number && body?.allow_estimate_number_reuse !== true) {
      const clashes = await EstimateService.filter({ estimate_number: estimate.estimate_number }).catch(() => []);
      const live = (Array.isArray(clashes) ? clashes : []).filter(
        (row: any) => row?.deleted !== true && clean(row?.estimate_number) === estimate.estimate_number
      );
      if (live.length) {
        return Response.json({ error: `Estimate number ${estimate.estimate_number} is already used by another estimate.` }, { status: 409 });
      }
    }

    const readKeyedRows = async () => {
      const rows = await EstimateService.filter({ creation_request_key: creationKey });
      if (!Array.isArray(rows)) {
        throw Object.assign(new Error('Estimate creation receipt lookup did not return a verifiable record list.'), { statusCode: 409 });
      }
      return rows;
    };
    const validateKeyedRows = (rows: any[] = [], { allowMultiple = false } = {}) => {
      const mismatches = rows.filter((row: any) => !sameCreateIdentity(row, estimate));
      if (mismatches.length) {
        throw Object.assign(new Error('This Estimate creation receipt is already associated with different client/project/estimate-number data. No Estimate was changed.'), { statusCode: 409 });
      }
      if (!allowMultiple && rows.length > 1) {
        throw Object.assign(new Error('Multiple Estimates already share this creation receipt. No uncertain Estimate was deleted; review the duplicate Drafts before retrying.'), { statusCode: 409 });
      }
      return canonicalRow(rows);
    };

    let existingRows = await readKeyedRows();
    const existing = validateKeyedRows(existingRows);
    if (existing?.id) return Response.json({ estimate: await finalizeCopiedEstimate(existing, base44, estimateInput.line_items), reused: true });

    let created;
    try {
      created = await EstimateService.create({
        ...estimate,
        creation_request_key: creationKey,
      });
    } catch (createError) {
      // A datastore response can be lost after persistence. Re-read by the
      // creation receipt before surfacing the error so the caller can still
      // receive the already-created Estimate on the same attempt when possible.
      try {
        existingRows = await readKeyedRows();
      } catch (verificationError) {
        throw Object.assign(new Error(
          `Estimate create response was unavailable and its recovery lookup also failed. Do not retry blindly; reload Estimates first. ${verificationError?.message || ''}`.trim()
        ), { statusCode: 409 });
      }
      const recovered = validateKeyedRows(existingRows);
      if (recovered?.id) return Response.json({ estimate: await finalizeCopiedEstimate(recovered, base44, estimateInput.line_items), reused: true, recovered_after_create_error: true });
      throw createError;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    let afterCreateRows;
    try {
      afterCreateRows = await readKeyedRows();
    } catch (verificationError) {
      throw Object.assign(new Error(
        `Estimate was created, but its concurrent verification read failed. Do not retry blindly; reload Estimates first. ${verificationError?.message || ''}`.trim()
      ), { statusCode: 409 });
    }
    const canonical = validateKeyedRows(afterCreateRows, { allowMultiple: true }) || created;

    if (afterCreateRows.length > 1 && canonical?.id === created?.id) {
      return Response.json({
        error: 'A concurrent Estimate was created with the same creation receipt after this request became canonical. The canonical Draft was preserved and no uncertain concurrent row was deleted; review the duplicate Drafts before continuing.',
      }, { status: 409 });
    }

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const discard = await canDiscardRaceDuplicate(base44, created);
      if (!discard.ok) {
        return Response.json({
          error: `A simultaneous duplicate Estimate was detected, but the losing Draft could not be safely removed because ${discard.reason}. No Estimate was deleted.`,
        }, { status: 409 });
      }
      const losing = discard.record;
      if (!losing?.id) {
        return Response.json({ estimate: await finalizeCopiedEstimate(canonical, base44, estimateInput.line_items), reused: true, concurrent_duplicate_discarded: true, duplicate_already_absent: true });
      }
      const losingVersion = String(losing.updated_date || '').trim();
      if (!losingVersion) {
        return Response.json({ error: 'A simultaneous duplicate Estimate was detected, but the losing Draft has no version metadata. No uncertain Estimate was deleted.' }, { status: 409 });
      }
      let deleted;
      try {
        deleted = await EstimateService.deleteMany({
          id: losing.id,
          creation_request_key: creationKey,
          updated_date: losingVersion,
        });
      } catch (deleteError) {
        let verifyFailed = false;
        const afterError = await EstimateService.filter({ id: losing.id }).catch(() => {
          verifyFailed = true;
          return null;
        });
        if (!verifyFailed && Array.isArray(afterError) && afterError.length === 0) {
          return Response.json({ estimate: await finalizeCopiedEstimate(canonical, base44, estimateInput.line_items), reused: true, concurrent_duplicate_discarded: true, recovered_after_delete_error: true });
        }
        throw deleteError;
      }
      if (!deleted || deleted.deleted !== 1) {
        let verifyFailed = false;
        const afterDelete = await EstimateService.filter({ id: losing.id }).catch(() => {
          verifyFailed = true;
          return null;
        });
        if (!verifyFailed && Array.isArray(afterDelete) && afterDelete.length === 0) {
          return Response.json({ estimate: await finalizeCopiedEstimate(canonical, base44, estimateInput.line_items), reused: true, concurrent_duplicate_discarded: true });
        }
        return Response.json({ error: 'The losing duplicate Estimate changed before cleanup. No uncertain Estimate was deleted; reload before retrying.' }, { status: 409 });
      }
      return Response.json({ estimate: await finalizeCopiedEstimate(canonical, base44, estimateInput.line_items), reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ estimate: await finalizeCopiedEstimate(canonical, base44, estimateInput.line_items), reused: false });
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 429, 503].includes(status) ? status : 500;
    console.error('ensureNewEstimate error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Estimate could not be created safely.' : error.message,
    }, { status: safeStatus });
  }
});