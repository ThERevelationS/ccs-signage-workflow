import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REVISION_TYPES = new Set(['manual_revision', 'status_transition', 'cancel', 'conversion']);

const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const REVISION_PAGE_SIZE = 500;
const REVISION_VERIFY_LIMIT = 50000;

async function loadRevisionRows(RevisionService: any, query: Record<string, unknown>) {
  const rows: any[] = [];
  let skip = 0;
  while (skip < REVISION_VERIFY_LIMIT) {
    const page = await RevisionService.filter(query, 'revision_number', REVISION_PAGE_SIZE, skip);
    if (!Array.isArray(page)) {
      throw new Error('Estimate revision history could not be verified completely.');
    }
    rows.push(...page);
    if (page.length < REVISION_PAGE_SIZE) return rows;
    skip += REVISION_PAGE_SIZE;
  }
  throw new Error(`Estimate revision history exceeds the ${REVISION_VERIFY_LIMIT.toLocaleString()}-record verification safety limit.`);
}

const revisionOrder = (a: any, b: any) => {
  const aTime = Date.parse(a?.created_date || a?.completed_at || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.completed_at || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
};

const canonicalRevision = (rows: any[] = []) => rows
  .filter((row) => row?.revision_status === 'completed')
  .slice()
  .sort(revisionOrder)[0] || null;

async function settleCreatedRevisionNumber(RevisionService: any, estimateId: string, created: any) {
  let current = created;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await loadRevisionRows(RevisionService, { estimate_id: estimateId });
    const serverCurrent = rows.find((row) => String(row?.id || '') === String(current?.id || ''));
    if (!serverCurrent) throw new Error('The newly created lifecycle revision disappeared before its sequence number could be verified.');
    current = { ...current, ...serverCurrent };
    const currentNumber = num(current.revision_number);
    const collisions = rows.filter((row) => row?.id !== current.id && num(row?.revision_number) === currentNumber);
    if (!collisions.length) return current;

    const winner = [current, ...collisions].slice().sort(revisionOrder)[0];
    if (winner?.id === current.id) {
      if (attempt < 4) continue;
      throw new Error('A later concurrent lifecycle revision still shares this revision number. The earlier canonical row was not renumbered; reload the Estimate revision history before retrying.');
    }

    const nextNumber = Math.max(0, ...rows.map((row) => num(row?.revision_number))) + 1;
    const version = String(current?.updated_date || '').trim();
    if (!version) {
      throw new Error('Lifecycle revision version metadata is incomplete; concurrent-safe renumbering was blocked.');
    }

    let result;
    try {
      result = await RevisionService.updateMany(
        { id: current.id, estimate_id: estimateId, updated_date: version },
        { $set: { revision_number: nextNumber } },
      );
    } catch (error) {
      const afterError = await RevisionService.get(current.id).catch(() => null);
      if (afterError?.id && num(afterError.revision_number) === nextNumber) {
        current = afterError;
        continue;
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') {
      throw new Error('Lifecycle revision conditional renumber result could not be verified.');
    }
    if (result.updated !== 1) continue;

    const updated = await RevisionService.get(current.id).catch(() => null);
    if (!updated?.id) throw new Error('Lifecycle revision was renumbered but could not be re-read.');
    current = updated;
  }

  const finalRows = await loadRevisionRows(RevisionService, { estimate_id: estimateId });
  const finalCurrent = finalRows.find((row) => String(row?.id || '') === String(current?.id || '')) || current;
  const collision = finalRows.some((row) => row?.id !== finalCurrent.id && num(row?.revision_number) === num(finalCurrent.revision_number));
  if (collision) throw new Error('Concurrent lifecycle revisions could not settle on unique revision numbers. No duplicate number was accepted silently.');
  return finalCurrent;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const idempotencyKey = String(body?.idempotency_key || '').trim();
    const revision = body?.revision && typeof body.revision === 'object' ? body.revision : {};
    const estimateId = String(revision?.estimate_id || '').trim();
    const reason = String(revision?.reason || '').trim();
    const revisionType = String(revision?.revision_type || 'status_transition').trim();

    if (!idempotencyKey || !estimateId || !reason) {
      return Response.json({ error: 'Estimate, lifecycle reason, and idempotency key are required.' }, { status: 400 });
    }
    if (!REVISION_TYPES.has(revisionType)) {
      return Response.json({ error: 'Invalid estimate lifecycle revision type.' }, { status: 400 });
    }

    const RevisionUser = base44.entities.EstimateRevision;
    const RevisionService = base44.asServiceRole.entities.EstimateRevision;

    let matches = await loadRevisionRows(RevisionService, {
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
    });
    if (!(matches || []).length) {
      matches = await loadRevisionRows(RevisionService, {
        estimate_id: estimateId,
        notes: idempotencyKey,
      });
    }
    const existing = canonicalRevision(matches || []);
    if (existing) return Response.json({ revision: existing, reused: true });

    // A new immutable lifecycle row must belong to a real current Estimate.
    // Idempotent retries above can still recover historical rows later.
    const estimate = await base44.entities.AllInOneEstimate.get(estimateId).catch(() => null);
    if (!estimate?.id) {
      return Response.json({ error: 'Estimate could not be verified before recording lifecycle history.' }, { status: 404 });
    }
    if (revisionType === 'conversion') {
      const workOrderId = String(revision?.work_order_id || '').trim();
      if (!workOrderId || String(estimate.work_order_id || '') !== workOrderId) {
        return Response.json({ error: 'Conversion lifecycle history does not match the linked Work Order.' }, { status: 409 });
      }
    }

    const allRows = await loadRevisionRows(RevisionService, { estimate_id: estimateId });
    const revisionNumber = Math.max(0, ...(allRows || []).map((row) => num(row?.revision_number))) + 1;
    const timestamp = new Date().toISOString();

    const created = await RevisionUser.create({
      ...revision,
      estimate_id: estimateId,
      revision_number: revisionNumber,
      revision_type: revisionType,
      revision_status: 'completed',
      reason,
      idempotency_key: idempotencyKey,
      notes: idempotencyKey,
      started_at: revision?.started_at || timestamp,
      completed_at: revision?.completed_at || timestamp,
    });

    // Base44 does not expose a database unique constraint for this entity. Re-read
    // after create so simultaneous staff submissions converge on the earliest
    // completed row for this exact lifecycle key. Only this request's losing row
    // is removed; unrelated history and open manual revisions are never touched.
    await new Promise((resolve) => setTimeout(resolve, 50));
    let afterCreate = await loadRevisionRows(RevisionService, {
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
    });
    if (!(afterCreate || []).length) {
      afterCreate = await loadRevisionRows(RevisionService, {
        estimate_id: estimateId,
        notes: idempotencyKey,
      });
    }
    const canonical = canonicalRevision(afterCreate || []) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const createdVersion = String(created.updated_date || '').trim();
      if (!createdVersion) {
        throw new Error('A duplicate lifecycle revision was detected, but the losing row has no version metadata. No uncertain revision was deleted.');
      }
      const deleted = await RevisionService.deleteMany({
        id: created.id,
        estimate_id: estimateId,
        idempotency_key: idempotencyKey,
        revision_status: 'completed',
        updated_date: createdVersion,
      });
      if (!deleted || deleted.deleted !== 1) {
        throw new Error('A duplicate lifecycle revision changed before cleanup. No uncertain revision was deleted; reload the Estimate revision history before retrying.');
      }
      return Response.json({ revision: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    const settled = await settleCreatedRevisionNumber(RevisionService, estimateId, canonical || created);
    return Response.json({ revision: settled, reused: false });
  } catch (error) {
    console.error('ensureEstimateLifecycleRevision error:', error);
    return Response.json({ error: 'Estimate lifecycle revision could not be recorded safely.' }, { status: 500 });
  }
});
