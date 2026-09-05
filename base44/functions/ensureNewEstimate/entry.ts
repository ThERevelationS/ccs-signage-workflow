import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

const stripBuiltIns = (input: any = {}) => {
  const {
    id: _id,
    created_date: _createdDate,
    updated_date: _updatedDate,
    created_by: _createdBy,
    created_by_id: _createdById,
    creation_request_key: _creationRequestKey,
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
  if (!row?.id) return { ok: false, reason: 'missing Estimate id' };
  if (clean(row.status || 'draft') !== 'draft') return { ok: false, reason: `status is ${row.status}` };
  if (clean(row.work_order_id)) return { ok: false, reason: 'work_order_id is already set' };
  if ((row.line_items || []).length) return { ok: false, reason: 'Products are already attached' };
  const referencedBy = await estimateReference(base44, row.id);
  if (referencedBy) return { ok: false, reason: `${referencedBy} already references it` };
  return { ok: true, reason: '' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const creationKey = clean(body?.creation_key);
    const estimateInput = body?.estimate && typeof body.estimate === 'object' ? body.estimate : {};
    const estimate = stripBuiltIns(estimateInput);
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

    const readKeyedRows = async () => EstimateService.filter({ creation_request_key: creationKey });
    const validateKeyedRows = (rows: any[] = []) => {
      const mismatches = (rows || []).filter((row: any) => !sameCreateIdentity(row, estimate));
      if (mismatches.length) {
        throw Object.assign(new Error('This Estimate creation receipt is already associated with different client/project/estimate-number data. No Estimate was changed.'), { statusCode: 409 });
      }
      return canonicalRow(rows || []);
    };

    let existingRows = await readKeyedRows();
    const existing = validateKeyedRows(existingRows || []);
    if (existing?.id) return Response.json({ estimate: existing, reused: true });

    let created;
    try {
      created = await EstimateUser.create({
        ...estimate,
        creation_request_key: creationKey,
      });
    } catch (createError) {
      // A datastore response can be lost after persistence. Re-read by the
      // creation receipt before surfacing the error so the caller can still
      // receive the already-created Estimate on the same attempt when possible.
      existingRows = await readKeyedRows().catch(() => []);
      const recovered = validateKeyedRows(existingRows || []);
      if (recovered?.id) return Response.json({ estimate: recovered, reused: true, recovered_after_create_error: true });
      throw createError;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterCreateRows = await readKeyedRows();
    const canonical = validateKeyedRows(afterCreateRows || []) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const discard = await canDiscardRaceDuplicate(base44, created);
      if (!discard.ok) {
        return Response.json({
          error: `A simultaneous duplicate Estimate was detected, but the losing Draft could not be safely removed because ${discard.reason}. No Estimate was deleted.`,
        }, { status: 409 });
      }
      await EstimateService.delete(created.id);
      return Response.json({ estimate: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ estimate: canonical, reused: false });
  } catch (error) {
    console.error('ensureNewEstimate error:', error);
    const status = Number(error?.statusCode || 500);
    return Response.json({ error: error?.message || 'Estimate could not be created safely.' }, { status });
  }
});