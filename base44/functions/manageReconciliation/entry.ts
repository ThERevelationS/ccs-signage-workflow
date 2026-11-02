import { allocateDocNumber } from '../../shared/docNumberAllocation.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} from '../../shared/opportunityFoundationPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import {
  TENDER_BUCKETS,
  bucketFor,
  toCents,
  fromCents,
  toDay,
  batchCandidates,
  batchTotals,
  normalizeAdjustments,
  closePlan,
  reopenPlan,
} from '../../shared/reconciliationModel.ts';

const clean = (value: any) => String(value ?? '').trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: number) => Math.round(value * 100) / 100;

// Session-authenticated gateway for the Reconciliation module. Both
// ReconciliationBatch and Payment have backend-only RLS, so every staff-facing
// read/write flows through here: a valid sign-shop session is required, batch
// numbers are allocated atomically from DocNumberCounter 'reconciliation', and
// Payment sweeps are CAS-anchored on each row's loaded updated_date so a
// payment concurrently reconciled or voided elsewhere is never double-counted.
//
// Two close contracts live here:
//   - Legacy create_batch (ReconcileWizard): sweeps every unreconciled
//     recorded payment with counted-per-bucket + a single cash adjustment.
//   - I-03 close_batch: selects candidates by explicit payment_ids or
//     location/date/method filters through the shared cent-safe
//     reconciliationModel, writes itemized cash_adjustments[] + the
//     *_amount mirror fields, and stamps payments via the model's close plan.
// Reopen (I-03 reopen_batch) is admin-only + reason-required; it un-stamps the
// payments and leaves the batch as an immutable 'reopened' audit stub so the
// payments re-sweep into a NEW close — never silently re-locks them here.

// Payment.method enum is cash|check|card|ach|financing|other|credit_memo; the
// close counts four CoreBridge-style tender buckets — cash, check, card, and
// other, where other absorbs ach/financing/unknown methods.
const bucketForLocal = (method: any) => bucketFor(method);

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

function paymentSnapshot(row: any, invoiceById: Map<string, any>) {
  const invoice = invoiceById.get(clean(row?.invoice_id));
  return {
    id: clean(row?.id),
    invoice_id: clean(row?.invoice_id),
    invoice_number: clean(invoice?.invoice_number),
    customer_display_name: clean(invoice?.customer_display_name || row?.customer_id),
    work_order_id: clean(row?.work_order_id),
    amount: num(row?.amount),
    method: clean(row?.method) || 'other',
    bucket: bucketForLocal(row?.method),
    reference_number: clean(row?.reference_number),
    paid_date: clean(row?.paid_date || row?.created_date).slice(0, 10),
    status: clean(row?.status),
    // Payment carries no declared location field; the filter axis resolves
    // through the payment's own location_id first, then the linked invoice's.
    location_id: clean(row?.location_id) || clean(invoice?.location_id),
    reconciliation_batch_id: clean(row?.reconciliation_batch_id),
    created_by: clean(row?.created_by),
    updated_date: clean(row?.updated_date),
  };
}

function batchSnapshot(row: any) {
  const adjustments = Array.isArray(row?.adjustments) ? row.adjustments : [];
  return {
    id: clean(row?.id),
    batch_number: clean(row?.batch_number),
    name: clean(row?.name) || clean(row?.batch_number),
    location: clean(row?.location),
    location_id: clean(row?.location_id),
    closed_at: clean(row?.closed_at || row?.created_date),
    created_by: clean(row?.created_by),
    closed_by: clean(row?.closed_by) || clean(row?.created_by),
    expected_total: num(row?.expected_total),
    collected_total: num(row?.collected_total),
    cash_adjustment: num(row?.cash_adjustment),
    adjustment_note: clean(row?.adjustment_note),
    variance: num(row?.variance),
    // I-03 cent-safe mirror fields (dollars, written from integer-cent math).
    expected_amount: row?.expected_amount !== undefined ? num(row?.expected_amount) : num(row?.expected_total),
    collected_amount: row?.collected_amount !== undefined ? num(row?.collected_amount) : num(row?.collected_total),
    adjustments_amount: row?.adjustments_amount !== undefined ? num(row?.adjustments_amount) : num(row?.cash_adjustment),
    variance_amount: row?.variance_amount !== undefined ? num(row?.variance_amount) : num(row?.variance),
    adjustments: adjustments.map((a: any) => ({
      amount: num(a?.amount),
      reason: clean(a?.reason),
      note: clean(a?.note),
    })),
    payment_count: Number.isFinite(Number(row?.payment_count))
      ? Number(row.payment_count)
      : (Array.isArray(row?.payment_ids) ? row.payment_ids.length : 0),
    payment_ids: Array.isArray(row?.payment_ids) ? row.payment_ids.map((id: any) => clean(id)).filter(Boolean) : [],
    method_totals: row?.method_totals && typeof row.method_totals === 'object' ? row.method_totals : {},
    status: clean(row?.status) || 'closed',
    reopened_by: clean(row?.reopened_by),
    reopened_at: clean(row?.reopened_at),
    reopen_reason: clean(row?.reopen_reason),
    notes: clean(row?.notes),
  };
}

const expectedByBucket = (payments: any[]) => {
  const totals: Record<string, number> = { cash: 0, check: 0, card: 0, other: 0 };
  for (const p of payments) totals[bucketForLocal(p?.method)] = money(totals[bucketForLocal(p?.method)] + num(p?.amount));
  return totals;
};

async function nextBatchNumber(Batch: any, svc: any) {
  const raw = await allocateDocNumber({ svc, configName: 'reconciliation', prefix: 'REC-', seedEntity: Batch, seedField: 'batch_number' });
  const seq = parseInt(String(raw).replace(/^REC-/, ''), 10);
  return `REC-${String(Number.isFinite(seq) ? seq : 1).padStart(4, '0')}`;
}

async function sweepPayments({ Payment, batchId, candidates }: any) {
  // CAS on the loaded updated_date: a payment voided, refunded, or swept by a
  // racing close since the candidate list was read fails the anchor and is
  // simply left unreconciled rather than silently double-counted.
  const results = await Promise.all((candidates || []).map(async (p: any) => {
    const id = clean(p?.id);
    const version = clean(p?.updated_date);
    if (!id || !version) return { id, swept: false };
    const result = await Payment.updateMany(
      { id, updated_date: version },
      { $set: { reconciliation_batch_id: batchId } },
    ).catch(() => null);
    return { id, swept: Number(result?.updated) === 1 };
  }));
  const sweptIds = new Set(results.filter((r: any) => r.swept).map((r: any) => r.id));
  return { sweptIds, skipped: results.filter((r: any) => !r.swept).map((r: any) => r.id) };
}

// Un-stamp: anchor on the batch-id VALUE so a payment a racing close already
// re-swept elsewhere is never stripped of its new lock.
async function unstampPayments({ Payment, batchId, ids }: any) {
  const results = await Promise.all((ids || []).map(async (rawId: any) => {
    const id = clean(rawId);
    if (!id) return { id, unstamped: false };
    const result = await Payment.updateMany(
      { id, reconciliation_batch_id: batchId },
      { $set: { reconciliation_batch_id: '' } },
    ).catch(() => null);
    return { id, unstamped: Number(result?.updated) === 1 };
  }));
  return {
    unstampedIds: new Set(results.filter((r: any) => r.unstamped).map((r: any) => r.id)),
    skipped: results.filter((r: any) => !r.unstamped).map((r: any) => r.id),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';
    const action = clean(body?.action);
    if (!action) throw bad('An action is required.');

    const Batch = base44.asServiceRole.entities.ReconciliationBatch;
    const Payment = base44.asServiceRole.entities.Payment;
    const Invoice = base44.asServiceRole.entities.Invoice;

    const loadContext = async () => {
      const [payments, invoices] = await Promise.all([
        loadAllEntityRows({ entity: Payment, query: {}, sort: null, label: 'Reconciliation payments' }),
        loadAllEntityRows({ entity: Invoice, query: {}, sort: null, label: 'Reconciliation invoices' }).catch(() => []),
      ]);
      if (!Array.isArray(payments)) throw bad('Payment lookup failed.', 500);
      const invoiceById = new Map((Array.isArray(invoices) ? invoices : []).map((i: any) => [clean(i?.id), i]));
      return { payments, invoiceById };
    };

    const loadBatches = async () => {
      const batches = await loadAllEntityRows({ entity: Batch, query: {}, sort: '-created_date', label: 'Reconciliation batches' });
      if (!Array.isArray(batches)) throw bad('Batch lookup failed.', 500);
      return batches;
    };

    // Ids already spoken for by a live close — the defensive sweep guard the
    // frontend model applies. Reopened batches are excluded: their members
    // were un-stamped and are legitimately batchable again.
    const sweptIdsOf = (batches: any[]) => {
      const ids = new Set<string>();
      for (const b of batches || []) {
        if (clean(b?.status).toLowerCase() === 'reopened') continue;
        for (const id of Array.isArray(b?.payment_ids) ? b.payment_ids : []) {
          const key = clean(id);
          if (key) ids.add(key);
        }
      }
      return ids;
    };

    if (action === 'bootstrap') {
      const [batches, { payments, invoiceById }] = await Promise.all([
        loadBatches().catch(() => []),
        loadContext(),
      ]);
      if (!Array.isArray(batches)) throw bad('Batch lookup failed.', 500);
      const unreconciled = payments
        .filter((p: any) => clean(p?.status) === 'recorded' && !clean(p?.reconciliation_batch_id))
        .map((p: any) => paymentSnapshot(p, invoiceById))
        .sort((a: any, b: any) => a.paid_date.localeCompare(b.paid_date));
      const locations = [...new Set(batches.map((b: any) => clean(b?.location)).filter(Boolean))].sort();
      const lastClosed = batches
        .map((b: any) => clean(b?.closed_at))
        .filter(Boolean)
        .sort()
        .pop() || '';
      return Response.json({
        success: true,
        action,
        batches: batches.slice(0, 250).map(batchSnapshot),
        unreconciled,
        locations,
        last_closed_at: lastClosed,
      });
    }

    if (action === 'get_batch') {
      const batchId = clean(body?.batch_id);
      const batch = await Batch.get(batchId).catch(() => null);
      if (!batch?.id) throw bad('Reconciliation batch not found.', 404);
      const { invoiceById } = await loadContext();
      const ids = new Set((Array.isArray(batch.payment_ids) ? batch.payment_ids : []).map((id: any) => clean(id)));
      const payments = ids.size
        ? (await Payment.filter({ reconciliation_batch_id: batchId }).catch(() => []))
            .filter((p: any) => ids.has(clean(p?.id)))
            .map((p: any) => paymentSnapshot(p, invoiceById))
            .sort((a: any, b: any) => a.paid_date.localeCompare(b.paid_date))
        : [];
      return Response.json({ success: true, action, batch: batchSnapshot(batch), payments });
    }

    if (action === 'create_batch') {
      const location = clean(body?.location).slice(0, 120);
      const cashAdjustment = money(num(body?.cash_adjustment));
      const adjustmentNote = clean(body?.adjustment_note).slice(0, 500);
      const notes = clean(body?.notes).slice(0, 1000);
      if (cashAdjustment !== 0 && !adjustmentNote) {
        throw bad('A cash adjustment needs an explanation note.');
      }
      const countedRaw = body?.counted && typeof body.counted === 'object' ? body.counted : {};
      const counted: Record<string, number> = {};
      for (const bucket of TENDER_BUCKETS) {
        const value = money(Math.max(0, num((countedRaw as any)[bucket])));
        counted[bucket] = value;
      }
      const collectedTotal = money(TENDER_BUCKETS.reduce((s, b) => s + counted[b], 0));

      const creationKey = clean(body?.creation_request_key) || `reconciliation:${actor}:${Date.now()}`;
      const { payments, invoiceById } = await loadContext();
      const candidates = payments
        .filter((p: any) => clean(p?.status) === 'recorded' && !clean(p?.reconciliation_batch_id));
      if (!candidates.length) throw bad('There are no recorded payments waiting to be reconciled.', 409);

      const expected = expectedByBucket(candidates);
      const expectedTotal = money(TENDER_BUCKETS.reduce((s, b) => s + expected[b], 0));
      const variance = money(collectedTotal + cashAdjustment - expectedTotal);
      const batchNumber = await nextBatchNumber(Batch, base44.asServiceRole);
      const closedAt = new Date().toISOString();

      const createdResult = await createFoundationRecordWithRecovery({
        entity: Batch,
        data: {
          creation_request_key: creationKey,
          schema_version: 1,
          batch_number: batchNumber,
          location,
          closed_at: closedAt,
          created_by: actor,
          expected_total: expectedTotal,
          collected_total: collectedTotal,
          cash_adjustment: cashAdjustment,
          adjustment_note: adjustmentNote,
          variance,
          payment_ids: candidates.map((p: any) => clean(p?.id)).filter(Boolean),
          method_totals: Object.fromEntries(TENDER_BUCKETS.map((b) => [b, { expected: expected[b], counted: counted[b] }])),
          status: 'closed',
          notes,
        },
        readMatches: () => Batch.filter({ creation_request_key: creationKey }),
        label: 'Reconciliation batch',
      });
      const batch = createdResult.record;

      // On a retried create the batch already exists but some payments may be
      // unswept — the CAS sweep below is idempotent and converges either way.
      const { sweptIds, skipped } = await sweepPayments({ Payment, batchId: batch.id, candidates });
      const swept = candidates.filter((p: any) => sweptIds.has(clean(p?.id)));

      // Recompute the batch truth over what was actually swept: a payment
      // concurrently voided/reconciled elsewhere shrinks expected_total and the
      // variance honestly reflects the mismatch against the counted money.
      const sweptExpected = expectedByBucket(swept);
      const sweptExpectedTotal = money(TENDER_BUCKETS.reduce((s, b) => s + sweptExpected[b], 0));
      const finalVariance = money(collectedTotal + cashAdjustment - sweptExpectedTotal);
      const desired = {
        expected_total: sweptExpectedTotal,
        variance: finalVariance,
        payment_ids: swept.map((p: any) => clean(p.id)),
        method_totals: Object.fromEntries(TENDER_BUCKETS.map((b) => [b, { expected: sweptExpected[b], counted: counted[b] }])),
      };
      const expectedFields = expectedFoundationFields(batch, desired);
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Batch,
        recordId: batch.id,
        expectedFields,
        nextFields: desired,
        label: 'Reconciliation batch totals',
      });

      return Response.json({
        success: true,
        action,
        batch: batchSnapshot(saved),
        swept_count: swept.length,
        skipped_payment_ids: skipped,
        reused: createdResult.status === 'reused',
      });
    }

    // ------------------------------------------------------------------
    // I-03 contract: filtered/selected close + admin reopen, all math through
    // the shared cent-safe reconciliationModel.
    // ------------------------------------------------------------------

    if (action === 'list_candidates') {
      const [{ payments, invoiceById }, batches] = await Promise.all([loadContext(), loadBatches().catch(() => [])]);
      const filters = body?.filters && typeof body.filters === 'object' ? body.filters : body;
      const { candidates, count, expected_cents, groups, applied_filters } = batchCandidates({
        payments: payments.map((p: any) => ({
          ...p,
          location_id: clean(p?.location_id) || clean(invoiceById.get(clean(p?.invoice_id))?.location_id),
        })),
        filters: { ...filters, exclude_ids: [...sweptIdsOf(batches)] },
      });
      return Response.json({
        success: true,
        action,
        candidates: candidates.map((p: any) => paymentSnapshot(p, invoiceById)),
        count,
        expected_cents,
        expected: fromCents(expected_cents),
        groups,
        applied_filters,
      });
    }

    if (action === 'list_batches') {
      const status = clean(body?.status).toLowerCase();
      const locationId = clean(body?.location_id).toLowerCase();
      const dateStart = toDay(body?.date_start);
      const dateEnd = toDay(body?.date_end);
      const limit = Math.max(1, Math.min(500, num(body?.limit, 250) || 250));
      const batches = (await loadBatches())
        .filter((b: any) => {
          if (status && clean(b?.status).toLowerCase() !== status) return false;
          if (locationId && clean(b?.location_id).toLowerCase() !== locationId && clean(b?.location).toLowerCase() !== locationId) return false;
          const day = toDay(b?.closed_at) || toDay(b?.created_date);
          if (dateStart && (!day || day < dateStart)) return false;
          if (dateEnd && (!day || day > dateEnd)) return false;
          return true;
        })
        .slice(0, limit)
        .map(batchSnapshot);
      return Response.json({ success: true, action, batches, count: batches.length });
    }

    if (action === 'close_batch') {
      const creationKey = clean(body?.creation_request_key) || `reconciliation:${actor}:${Date.now()}`;
      const targetBatchId = clean(body?.batch_id);
      const filtersRaw = body?.filters && typeof body.filters === 'object' ? body.filters : body;
      const paymentIdsRaw = Array.isArray(body?.payment_ids)
        ? body.payment_ids.map((id: any) => clean(id)).filter(Boolean)
        : null;

      const [{ payments, invoiceById }, batches] = await Promise.all([loadContext(), loadBatches()]);
      const byId = new Map(payments.map((p: any) => [clean(p?.id), p]));

      // Resolve the batch location label: explicit location/location_name wins,
      // then a SalesLocation row matching location_id (id, code, or name).
      const locationId = clean(body?.location_id).slice(0, 120);
      let locationName = clean(body?.location ?? body?.location_name).slice(0, 120);
      if (locationId && !locationName) {
        const locs = await base44.asServiceRole.entities.SalesLocation.filter({}).catch(() => []);
        const hit = (Array.isArray(locs) ? locs : []).find((l: any) =>
          [clean(l?.id), clean(l?.code), clean(l?.name)].filter(Boolean).includes(locationId));
        if (hit) locationName = clean(hit?.name);
      }
      if (!locationName) locationName = locationId;

      // Selection: explicit payment_ids win; otherwise filter-driven
      // candidates. Without either, every unbatched recorded payment is in
      // scope (legacy close-all semantics).
      let selected: any[];
      if (paymentIdsRaw && paymentIdsRaw.length) {
        const missing = paymentIdsRaw.filter((id: string) => !byId.has(id));
        if (missing.length) throw bad(`Unknown payment id(s): ${missing.slice(0, 5).join(', ')}.`, 404);
        selected = paymentIdsRaw.map((id: string) => byId.get(id));
      } else {
        const { candidates } = batchCandidates({
          payments: payments.map((p: any) => ({
            ...p,
            location_id: clean(p?.location_id) || clean(invoiceById.get(clean(p?.invoice_id))?.location_id),
          })),
          filters: { ...filtersRaw, exclude_ids: [...sweptIdsOf(batches)] },
        });
        selected = candidates;
      }
      if (!selected.length) throw bad('No recorded payments matched this close.', 409);

      // Converge mode: batch_id — or an existing row under this
      // creation_request_key — names an existing batch (a retry completing a
      // partially-swept close, or a client-side retry of the same request).
      // Resolving the key's batch BEFORE planning is what makes an idempotent
      // re-close a no-op: payments already stamped to that batch land in the
      // plan's `already` bucket instead of reading as foreign conflicts.
      const keyMatches = await Batch.filter({ creation_request_key: creationKey }).catch(() => []);
      const existingByKey = Array.isArray(keyMatches) && keyMatches.length === 1 ? keyMatches[0] : null;
      let targetBatch: any = null;
      if (targetBatchId) {
        targetBatch = await Batch.get(targetBatchId).catch(() => null);
        if (!targetBatch?.id) throw bad('Reconciliation batch not found.', 404);
        if (existingByKey?.id && clean(existingByKey.id) !== clean(targetBatch.id)) {
          throw bad('That creation_request_key already belongs to a different batch.', 409);
        }
      } else if (existingByKey?.id) {
        targetBatch = existingByKey;
      }
      if (targetBatch) {
        const targetKey = clean(targetBatch?.creation_request_key);
        const status = clean(targetBatch?.status).toLowerCase() || 'closed';
        if (status === 'reopened') {
          throw bad('This batch was reopened and is a read-only audit stub — close a new batch instead.', 409);
        }
        if (status === 'closed' && targetKey && targetKey !== creationKey) {
          throw bad('This reconciliation batch is closed; reopen it before adding payments.', 409);
        }
      }

      // Adjustments: itemized cash_adjustments[] wins; the legacy scalar pair
      // (cash_adjustment + adjustment_note) folds in as one row. The model
      // rejects any non-zero adjustment lacking an explanation.
      const adjustments = normalizeAdjustments(
        Array.isArray(body?.cash_adjustments) && body.cash_adjustments.length
          ? body.cash_adjustments
          : (num(body?.cash_adjustment) !== 0
              ? [{ amount: body?.cash_adjustment, reason: body?.adjustment_note }]
              : []),
      );

      const now = new Date().toISOString();
      const batchIdForPlan = targetBatch?.id || 'pending';
      const plan = closePlan({
        batch_id: batchIdForPlan,
        batch: targetBatch,
        payments: selected,
        authorized_ids: targetBatch ? (Array.isArray(targetBatch.payment_ids) ? targetBatch.payment_ids : []) : null,
        now,
        actor: user,
      });
      if (plan.conflicts.length) {
        throw bad(`${plan.conflicts.length} payment(s) already belong to another reconciliation batch.`, 409);
      }
      const stampable = selected.filter((p: any) => plan.to_stamp.includes(clean(p?.id)) || plan.already.includes(clean(p?.id)));
      const members = targetBatch
        ? [...new Set([...(Array.isArray(targetBatch.payment_ids) ? targetBatch.payment_ids : []).map((id: any) => clean(id)).filter(Boolean), ...plan.member_ids])]
        : plan.member_ids;

      // Totals over the model in integer cents: collected comes from a
      // per-bucket `counted` map or a scalar `collected_amount`; omitted =
      // expected (the wizard's blank-counted convention).
      const countedRaw = body?.counted && typeof body.counted === 'object' ? body.counted : null;
      const collectedCents = body?.collected_amount !== undefined && body?.collected_amount !== null
        ? toCents(body?.collected_amount)
        : (countedRaw ? TENDER_BUCKETS.reduce((s: number, b: string) => s + toCents(countedRaw[b]), 0) : null);
      const totals = batchTotals({
        payments: stampable,
        adjustments,
        counted: countedRaw,
        collected_cents: collectedCents,
      });
      const adjustmentsCents = totals.adjustments_cents;
      const adjustmentNote = adjustments.map((a: any) => a.reason || a.note).filter(Boolean).join('; ').slice(0, 500);
      const methodTotals = Object.fromEntries(TENDER_BUCKETS.map((b) => [b, {
        expected: fromCents(totals.by_method[b].expected_cents),
        counted: fromCents(totals.by_method[b].collected_cents),
      }]));
      const batchFields = (batchNumber: string, closedAt: string) => ({
        schema_version: 1,
        batch_number: batchNumber,
        name: clean(body?.name).slice(0, 160) || batchNumber,
        location: locationName,
        location_id: locationId,
        closed_at: closedAt,
        created_by: actor,
        closed_by: actor,
        expected_total: fromCents(totals.expected_cents),
        collected_total: fromCents(totals.collected_cents),
        cash_adjustment: fromCents(adjustmentsCents),
        adjustment_note: adjustmentNote,
        variance: fromCents(totals.variance_cents),
        expected_amount: fromCents(totals.expected_cents),
        collected_amount: fromCents(totals.collected_cents),
        adjustments_amount: fromCents(adjustmentsCents),
        variance_amount: fromCents(totals.variance_cents),
        adjustments: adjustments.map((a: any) => ({ amount: a.amount, reason: a.reason, note: a.note })),
        payment_count: members.length,
        payment_ids: members,
        method_totals: methodTotals,
        status: 'closed',
        notes: clean(body?.notes).slice(0, 1000),
      });

      let batch: any;
      let reused = false;
      if (targetBatch) {
        batch = targetBatch;
        reused = true;
      } else {
        const batchNumber = await nextBatchNumber(Batch, base44.asServiceRole);
        const createdResult = await createFoundationRecordWithRecovery({
          entity: Batch,
          data: { creation_request_key: creationKey, ...batchFields(batchNumber, now) },
          readMatches: () => Batch.filter({ creation_request_key: creationKey }),
          label: 'Reconciliation batch',
        });
        batch = createdResult.record;
        reused = createdResult.status === 'reused';
      }

      // CAS-stamp only what the plan says still needs it — already-stamped
      // members make a retried close a literal no-op.
      const toSweep = selected.filter((p: any) => plan.to_stamp.includes(clean(p?.id)));
      const { sweptIds, skipped } = await sweepPayments({ Payment, batchId: batch.id, candidates: toSweep });

      // Authoritative membership = what is actually locked to this batch now
      // (the in-memory payment rows predate the sweep). Covers freshly-swept,
      // previously-stamped, and stray rows pointing here alike; a payment that
      // failed CAS (voided/re-swept mid-close) simply isn't locked → excluded.
      const lockedRows = await Payment.filter({ reconciliation_batch_id: batch.id }).catch(() => null);
      const finalRows = Array.isArray(lockedRows)
        ? lockedRows
        : payments.filter((p: any) => sweptIds.has(clean(p?.id)) || plan.already.includes(clean(p?.id)));
      const finalMembers = [...new Set(finalRows.map((p: any) => clean(p?.id)).filter(Boolean))];
      const finalTotals = batchTotals({ payments: finalRows, adjustments, counted: countedRaw, collected_cents: collectedCents });
      const desired = {
        expected_total: fromCents(finalTotals.expected_cents),
        collected_total: fromCents(finalTotals.collected_cents),
        cash_adjustment: fromCents(finalTotals.adjustments_cents),
        adjustment_note: adjustmentNote,
        variance: fromCents(finalTotals.variance_cents),
        expected_amount: fromCents(finalTotals.expected_cents),
        collected_amount: fromCents(finalTotals.collected_cents),
        adjustments_amount: fromCents(finalTotals.adjustments_cents),
        variance_amount: fromCents(finalTotals.variance_cents),
        adjustments: adjustments.map((a: any) => ({ amount: a.amount, reason: a.reason, note: a.note })),
        payment_count: finalMembers.length,
        payment_ids: finalMembers,
        method_totals: Object.fromEntries(TENDER_BUCKETS.map((b) => [b, {
          expected: fromCents(finalTotals.by_method[b].expected_cents),
          counted: fromCents(finalTotals.by_method[b].collected_cents),
        }])),
        name: clean(body?.name).slice(0, 160) || clean(batch?.name) || clean(batch?.batch_number),
        location: locationName || clean(batch?.location),
        location_id: locationId || clean(batch?.location_id),
        closed_by: clean(batch?.closed_by) || actor,
        status: 'closed',
      };
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Batch,
        recordId: batch.id,
        expectedFields: expectedFoundationFields(batch, desired),
        nextFields: desired,
        label: 'Reconciliation batch close',
      });

      return Response.json({
        success: true,
        action,
        batch: batchSnapshot(saved),
        swept_count: sweptIds.size,
        already_count: plan.already.length,
        skipped_payment_ids: skipped,
        skipped: plan.skipped,
        reused,
      });
    }

    if (action === 'reopen_batch') {
      const batchId = clean(body?.batch_id);
      if (!batchId) throw bad('batch_id is required.', 400);
      const batch = await Batch.get(batchId).catch(() => null);
      if (!batch?.id) throw bad('Reconciliation batch not found.', 404);

      // Rows currently locked to this batch (the value-anchored un-stamp below
      // never touches a payment a later close re-swept elsewhere).
      const stamped = await Payment.filter({ reconciliation_batch_id: batchId }).catch(() => []);
      if (!Array.isArray(stamped)) throw bad('Payment lookup failed.', 500);

      // Model guards throw status-tagged errors: batch must be 'closed',
      // actor must be admin, reason ≥ 3 chars.
      let plan: any;
      try {
        plan = reopenPlan({ batch, payments: stamped, actor: user, reason: body?.reason, now: new Date().toISOString() });
      } catch (e: any) {
        throw bad(e?.message || 'This batch cannot be reopened.', Number(e?.status) || 400);
      }

      // The batch's recorded snapshot may include ids whose back-link was
      // lost — include them so the audit trail reports what was released;
      // the value anchor still only clears rows stamped HERE.
      const unstampIds = [...new Set([...plan.unstamp_ids, ...plan.snapshot_only])];
      const { unstampedIds, skipped } = await unstampPayments({ Payment, batchId, ids: unstampIds });

      const priorNotes = clean(batch?.notes);
      const appended = plan.audit_note;
      const desired = {
        status: 'reopened',
        reopened_by: plan.actor,
        reopened_at: plan.now,
        reopen_reason: clean(body?.reason).slice(0, 500) || plan.batch_update.reopen_reason,
        notes: priorNotes ? `${priorNotes}\n${appended}` : appended,
      };
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Batch,
        recordId: batchId,
        expectedFields: expectedFoundationFields(batch, desired),
        nextFields: desired,
        label: 'Reconciliation batch reopen',
      });

      return Response.json({
        success: true,
        action,
        batch: batchSnapshot(saved),
        unstamped_count: unstampedIds.size,
        skipped_payment_ids: skipped,
        audit_note: appended,
      });
    }

    throw bad('Unknown reconciliation action.');
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Reconciliation failed.' }, { status });
    }
    console.error('manageReconciliation error:', error);
    return Response.json({ error: 'The reconciliation could not be completed. Try again.' }, { status });
  }
});
