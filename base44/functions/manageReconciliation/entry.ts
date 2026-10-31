import { allocateDocNumber } from '../../shared/docNumberAllocation.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} from '../../shared/opportunityFoundationPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

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

// Payment.method enum is cash|check|card|ach|financing|other; the close counts
// four CoreBridge-style tender buckets — cash, check, card, and other, where
// other absorbs ach/financing/unknown methods.
const TENDER_BUCKETS = ['cash', 'check', 'card', 'other'];
const bucketFor = (method: any) => {
  const m = clean(method).toLowerCase();
  return TENDER_BUCKETS.includes(m) ? m : 'other';
};

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
    bucket: bucketFor(row?.method),
    reference_number: clean(row?.reference_number),
    paid_date: clean(row?.paid_date || row?.created_date).slice(0, 10),
    status: clean(row?.status),
    reconciliation_batch_id: clean(row?.reconciliation_batch_id),
    created_by: clean(row?.created_by),
    updated_date: clean(row?.updated_date),
  };
}

function batchSnapshot(row: any) {
  return {
    id: clean(row?.id),
    batch_number: clean(row?.batch_number),
    location: clean(row?.location),
    closed_at: clean(row?.closed_at || row?.created_date),
    created_by: clean(row?.created_by),
    expected_total: num(row?.expected_total),
    collected_total: num(row?.collected_total),
    cash_adjustment: num(row?.cash_adjustment),
    adjustment_note: clean(row?.adjustment_note),
    variance: num(row?.variance),
    payment_count: Array.isArray(row?.payment_ids) ? row.payment_ids.length : 0,
    method_totals: row?.method_totals && typeof row.method_totals === 'object' ? row.method_totals : {},
    status: clean(row?.status) || 'closed',
    notes: clean(row?.notes),
  };
}

const expectedByBucket = (payments: any[]) => {
  const totals: Record<string, number> = { cash: 0, check: 0, card: 0, other: 0 };
  for (const p of payments) totals[bucketFor(p?.method)] = money(totals[bucketFor(p?.method)] + num(p?.amount));
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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

    if (action === 'bootstrap') {
      const [batches, { payments, invoiceById }] = await Promise.all([
        loadAllEntityRows({ entity: Batch, query: {}, sort: '-created_date', label: 'Reconciliation batches' }).catch(() => []),
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
