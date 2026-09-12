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
const ALLOWED_REASONS = new Set(['update_price', 'initial_freeze', 'manual_adjustment', 'reattach']);

async function settleRevisionNumber(RevisionService: any, builderProductId: string, created: any) {
  let current = created;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await RevisionService.filter({ builder_product_id: builderProductId });
    if (!Array.isArray(rows)) throw new Error('Builder price revision history could not be verified after creation.');
    const live = rows.find((row) => String(row?.id || '') === String(current?.id || ''));
    if (!live) throw new Error('The newly created Builder price revision disappeared before its sequence number could be verified.');
    current = { ...current, ...live };

    const revisionNumber = num(current.revision_number);
    const collisions = rows.filter((row) => row?.id !== current.id && num(row?.revision_number) === revisionNumber);
    if (!collisions.length) return current;

    const winner = [current, ...collisions].slice().sort((a, b) => {
      const aTime = Date.parse(a?.created_date || '') || 0;
      const bTime = Date.parse(b?.created_date || '') || 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    })[0];
    if (winner?.id === current.id) {
      if (attempt < 4) continue;
      throw new Error('A later concurrent Builder price revision still shares this revision number. The earlier canonical row was not renumbered; reload the pricing history before retrying.');
    }

    const nextNumber = Math.max(0, ...rows.map((row) => num(row?.revision_number))) + 1;
    const version = String(current?.updated_date || '').trim();
    if (!version) throw new Error('Builder price revision version metadata is incomplete; concurrent-safe renumbering was blocked.');

    let result;
    try {
      result = await RevisionService.updateMany(
        { id: current.id, builder_product_id: builderProductId, updated_date: version },
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
      throw new Error('Builder price revision conditional renumber result could not be verified.');
    }
    if (result.updated !== 1) continue;
    const updated = await RevisionService.get(current.id).catch(() => null);
    if (!updated?.id) throw new Error('Builder price revision was renumbered but could not be re-read.');
    current = updated;
  }

  const finalRows = await RevisionService.filter({ builder_product_id: builderProductId });
  if (!Array.isArray(finalRows)) throw new Error('Builder price revision history could not be verified after renumbering.');
  const finalCurrent = finalRows.find((row) => String(row?.id || '') === String(current?.id || '')) || current;
  const collision = finalRows.some((row) => row?.id !== finalCurrent.id && num(row?.revision_number) === num(finalCurrent.revision_number));
  if (collision) throw new Error('Concurrent Builder price revisions could not settle on unique revision numbers. No duplicate number was accepted silently.');
  return finalCurrent;
}

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

    // Before creating immutable pricing history, verify the caller-supplied IDs
    // still describe a real Product attached to this Estimate. Existing audit
    // retries above remain reusable even if the Product is removed later.
    const [builder, estimate] = await Promise.all([
      base44.entities.BuilderProduct.get(builderProductId).catch(() => null),
      base44.entities.AllInOneEstimate.get(estimateId).catch(() => null),
    ]);
    if (!builder?.id) return Response.json({ error: 'Builder Product could not be verified for this pricing revision.' }, { status: 404 });
    if (!estimate?.id) return Response.json({ error: 'Estimate could not be verified for this pricing revision.' }, { status: 404 });
    if (String(builder.estimate_id || '') !== estimateId) {
      return Response.json({ error: 'Builder Product does not belong to the supplied Estimate.' }, { status: 409 });
    }
    const estimateLine = (estimate.line_items || []).find((line: any) => String(line?.builder_product_id || '') === builderProductId);
    if (!estimateLine) {
      return Response.json({ error: 'Builder Product is no longer attached to the supplied Estimate.' }, { status: 409 });
    }

    const allRows = await RevisionService.filter({ builder_product_id: builderProductId });
    const revisionNumber = Math.max(0, ...(allRows || []).map((row) => num(row?.revision_number))) + 1;
    const created = await RevisionService.create({
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
      const createdVersion = String(created.updated_date || '').trim();
      if (!createdVersion) {
        throw new Error('A duplicate Builder price revision was detected, but the losing row has no version metadata. No uncertain revision was deleted.');
      }
      const deleted = await RevisionService.deleteMany({
        id: created.id,
        builder_product_id: builderProductId,
        idempotency_key: idempotencyKey,
        updated_date: createdVersion,
      });
      if (!deleted || deleted.deleted !== 1) {
        throw new Error('A duplicate Builder price revision changed before cleanup. No uncertain revision was deleted; reload the Builder pricing history before retrying.');
      }
      return Response.json({ revision: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    const settled = await settleRevisionNumber(RevisionService, builderProductId, canonical || created);
    return Response.json({ revision: settled, reused: false });
  } catch (error) {
    console.error('ensureBuilderPriceRevision error:', error);
    return Response.json({ error: 'Builder price revision could not be recorded safely.' }, { status: 500 });
  }
});