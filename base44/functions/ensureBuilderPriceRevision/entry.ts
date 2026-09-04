import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const canonicalRevision = (rows: any[] = []) => rows
  .slice()
  .sort((a, b) => {
    const aTime = Date.parse(a?.created_date || '') || 0;
    const bTime = Date.parse(b?.created_date || '') || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;

const sameMoney = (a: unknown, b: unknown) => Math.abs(num(a) - num(b)) <= 0.005;
const ALLOWED_REASONS = new Set(['update_price', 'initial_freeze', 'manual_adjustment']);

function assertSameOperation(existing: any, revision: any) {
  if (!existing) return;
  if (
    String(existing?.estimate_id || '') !== String(revision?.estimate_id || '') ||
    String(existing?.builder_product_id || '') !== String(revision?.builder_product_id || '') ||
    existing?.reason !== revision?.reason ||
    !sameMoney(existing?.previous_total_cost, revision?.previous_total_cost) ||
    !sameMoney(existing?.new_total_cost, revision?.new_total_cost) ||
    !sameMoney(existing?.previous_customer_price, revision?.previous_customer_price) ||
    !sameMoney(existing?.new_customer_price, revision?.new_customer_price)
  ) {
    throw new Error('The Builder price idempotency key is already associated with different pricing data.');
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const idempotencyKey = String(body?.idempotency_key || '').trim();
    const revision = body?.revision && typeof body.revision === 'object' ? body.revision : {};
    const builderProductId = String(revision?.builder_product_id || '').trim();
    const estimateId = String(revision?.estimate_id || '').trim();

    if (!idempotencyKey || !builderProductId || !estimateId) {
      return Response.json({ error: 'Builder Product, estimate, and idempotency key are required.' }, { status: 400 });
    }
    if (!ALLOWED_REASONS.has(String(revision?.reason || ''))) {
      return Response.json({ error: 'This function only records supported Builder pricing revisions.' }, { status: 400 });
    }

    const RevisionUser = base44.entities.BuilderPriceRevision;
    const RevisionService = base44.asServiceRole.entities.BuilderPriceRevision;

    let matches = await RevisionService.filter({
      builder_product_id: builderProductId,
      idempotency_key: idempotencyKey,
    });
    const existing = canonicalRevision(matches || []);
    if (existing) {
      assertSameOperation(existing, revision);
      return Response.json({ revision: existing, reused: true });
    }

    const allRows = await RevisionService.filter({ builder_product_id: builderProductId });
    const revisionNumber = Math.max(0, ...(allRows || []).map((row) => num(row?.revision_number))) + 1;
    const created = await RevisionUser.create({
      ...revision,
      builder_product_id: builderProductId,
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
      revision_number: revisionNumber,
      reason: revision.reason,
    });

    // Base44 does not expose a unique database constraint here. Re-read after
    // create so simultaneous Builder price-acceptance retries converge on one immutable row.
    await new Promise((resolve) => setTimeout(resolve, 50));
    matches = await RevisionService.filter({
      builder_product_id: builderProductId,
      idempotency_key: idempotencyKey,
    });
    const canonical = canonicalRevision(matches || []) || created;
    assertSameOperation(canonical, revision);

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      await RevisionService.delete(created.id).catch(() => null);
      return Response.json({ revision: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ revision: canonical, reused: false });
  } catch (error) {
    console.error('ensureBuilderPriceRevision error:', error);
    return Response.json({ error: error?.message || 'Builder price revision could not be recorded.' }, { status: 500 });
  }
});