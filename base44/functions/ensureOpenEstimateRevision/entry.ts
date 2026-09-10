import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

const canonicalOpenRevision = (rows: any[] = []) => rows
  .filter((row) => row?.revision_status === 'open')
  .slice()
  .sort((a, b) => {
    const aNum = num(a?.revision_number, Number.MAX_SAFE_INTEGER);
    const bNum = num(b?.revision_number, Number.MAX_SAFE_INTEGER);
    if (aNum !== bNum) return aNum - bNum;
    const aTime = Date.parse(a?.created_date || a?.started_at || '') || 0;
    const bTime = Date.parse(b?.created_date || b?.started_at || '') || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;

const revisionOrder = (a: any, b: any) => {
  const aTime = Date.parse(a?.created_date || a?.started_at || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.started_at || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
};

async function settleCreatedRevisionNumber(RevisionService: any, estimateId: string, created: any) {
  let current = created;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await loadRevisionRows(RevisionService, { estimate_id: estimateId });
    const live = rows.find((row) => String(row?.id || '') === String(current?.id || ''));
    if (!live) throw new Error('The newly created open Estimate revision disappeared before its sequence number could be verified.');
    current = { ...current, ...live };

    const currentNumber = num(current.revision_number);
    const collisions = rows.filter((row) => row?.id !== current.id && num(row?.revision_number) === currentNumber);
    if (!collisions.length) return current;

    const winner = [current, ...collisions].slice().sort(revisionOrder)[0];
    if (winner?.id === current.id && attempt < 4) continue;

    const nextNumber = Math.max(0, ...rows.map((row) => num(row?.revision_number))) + 1;
    const version = String(current?.updated_date || '').trim();
    if (!version) throw new Error('Open Estimate revision version metadata is incomplete; concurrent-safe renumbering was blocked.');

    let result;
    try {
      result = await RevisionService.updateMany(
        { id: current.id, estimate_id: estimateId, revision_status: 'open', updated_date: version },
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
      throw new Error('Open Estimate revision conditional renumber result could not be verified.');
    }
    if (result.updated !== 1) continue;
    const updated = await RevisionService.get(current.id).catch(() => null);
    if (!updated?.id) throw new Error('Open Estimate revision was renumbered but could not be re-read.');
    current = updated;
  }

  const finalRows = await loadRevisionRows(RevisionService, { estimate_id: estimateId });
  const finalCurrent = finalRows.find((row) => String(row?.id || '') === String(current?.id || '')) || current;
  const collision = finalRows.some((row) => row?.id !== finalCurrent.id && num(row?.revision_number) === num(finalCurrent.revision_number));
  if (collision) throw new Error('Concurrent Estimate revisions could not settle on unique revision numbers. No duplicate number was accepted silently.');
  return finalCurrent;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const estimateId = String(body?.estimate_id || '').trim();
    const expectedUpdatedDate = String(body?.expected_estimate_updated_date || '').trim();
    const reason = String(body?.reason || '').trim();
    const revision = body?.revision && typeof body.revision === 'object' ? body.revision : {};

    if (!estimateId || !reason) {
      return Response.json({ error: 'Estimate and revision reason are required.' }, { status: 400 });
    }

    const EstimateUser = base44.entities.AllInOneEstimate;
    const RevisionUser = base44.entities.EstimateRevision;
    const RevisionService = base44.asServiceRole.entities.EstimateRevision;

    const estimate = await EstimateUser.get(estimateId).catch(() => null);
    if (!estimate?.id) return Response.json({ error: 'Estimate could not be verified before starting a revision.' }, { status: 404 });
    if (expectedUpdatedDate && estimate.updated_date && expectedUpdatedDate !== estimate.updated_date) {
      return Response.json({ error: 'This estimate changed in another session. Reload before starting a revision.' }, { status: 409 });
    }
    if (estimate.pipeline_sync_pending) {
      return Response.json({ error: 'Sales Pipeline synchronization is still pending. Retry that synchronization before starting another estimate revision.' }, { status: 409 });
    }
    const pendingLine = (estimate.line_items || []).find((line: any) => {
      const pending = line?.price_acceptance_pending;
      return pending && typeof pending === 'object' && String(pending.key || '').trim();
    });
    if (pendingLine) {
      return Response.json({ error: 'A Builder mutation recovery is still pending. Resume that Product operation before starting an Estimate Revision.' }, { status: 409 });
    }

    // One Estimate may have at most one active manual revision. Returning the
    // canonical existing row makes retries naturally idempotent even when the
    // browser lost the create response.
    let openRows = await loadRevisionRows(RevisionService, { estimate_id: estimateId, revision_status: 'open' });
    const existing = canonicalOpenRevision(openRows || []);
    if (existing) return Response.json({ revision: existing, reused: true });

    const allRows = await loadRevisionRows(RevisionService, { estimate_id: estimateId });
    const revisionNumber = Math.max(0, ...(allRows || []).map((row) => num(row?.revision_number))) + 1;
    const timestamp = new Date().toISOString();
    const idempotencyKey = `open_revision:${estimateId}:${expectedUpdatedDate || estimate.updated_date || revisionNumber}`;

    const created = await RevisionUser.create({
      ...revision,
      estimate_id: estimateId,
      revision_number: revisionNumber,
      revision_type: 'manual_revision',
      revision_status: 'open',
      reason,
      idempotency_key: idempotencyKey,
      started_at: revision?.started_at || timestamp,
      completed_at: '',
    });

    // Base44 has no unique constraint for "one open revision per Estimate".
    // Re-read after create so simultaneous staff sessions converge on the
    // earliest canonical open row. Each losing request deletes only the row it
    // created; unrelated lifecycle history is never modified.
    await new Promise((resolve) => setTimeout(resolve, 50));
    openRows = await loadRevisionRows(RevisionService, { estimate_id: estimateId, revision_status: 'open' });
    const canonical = canonicalOpenRevision(openRows || []) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const createdVersion = String(created.updated_date || '').trim();
      if (!createdVersion) {
        throw new Error('A duplicate open Estimate revision was detected, but the losing row has no version metadata. No uncertain revision was deleted.');
      }
      const deleted = await RevisionService.deleteMany({
        id: created.id,
        estimate_id: estimateId,
        idempotency_key: idempotencyKey,
        revision_status: 'open',
        updated_date: createdVersion,
      });
      if (!deleted || deleted.deleted !== 1) {
        throw new Error('A duplicate open Estimate revision changed before cleanup. No uncertain revision was deleted; reload the Estimate revision history before retrying.');
      }
      return Response.json({ revision: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    const settled = await settleCreatedRevisionNumber(RevisionService, estimateId, canonical || created);
    return Response.json({ revision: settled, reused: false });
  } catch (error) {
    console.error('ensureOpenEstimateRevision error:', error);
    return Response.json({ error: error?.message || 'Estimate revision could not be started.' }, { status: 500 });
  }
});
