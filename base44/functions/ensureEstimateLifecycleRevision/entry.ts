import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REVISION_TYPES = new Set(['manual_revision', 'status_transition', 'cancel', 'conversion']);

const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const canonicalRevision = (rows: any[] = []) => rows
  .filter((row) => row?.revision_status === 'completed')
  .slice()
  .sort((a, b) => {
    const aTime = Date.parse(a?.created_date || a?.completed_at || '') || 0;
    const bTime = Date.parse(b?.created_date || b?.completed_at || '') || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;

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

    let matches = await RevisionService.filter({
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
    });
    if (!(matches || []).length) {
      matches = await RevisionService.filter({
        estimate_id: estimateId,
        notes: idempotencyKey,
      });
    }
    const existing = canonicalRevision(matches || []);
    if (existing) return Response.json({ revision: existing, reused: true });

    const allRows = await RevisionService.filter({ estimate_id: estimateId });
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
    let afterCreate = await RevisionService.filter({
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
    });
    if (!(afterCreate || []).length) {
      afterCreate = await RevisionService.filter({
        estimate_id: estimateId,
        notes: idempotencyKey,
      });
    }
    const canonical = canonicalRevision(afterCreate || []) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      await RevisionService.delete(created.id).catch(() => null);
      return Response.json({ revision: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ revision: canonical, reused: false });
  } catch (error) {
    console.error('ensureEstimateLifecycleRevision error:', error);
    return Response.json({ error: error?.message || 'Estimate lifecycle revision could not be recorded.' }, { status: 500 });
  }
});
