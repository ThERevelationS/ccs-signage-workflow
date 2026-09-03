import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const METHODS = new Set(['signed_quote', 'email', 'verbal', 'in_person', 'other']);

const whole = (value: unknown, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const quoteIssueKey = (estimateId: string, quoteVersion: number) =>
  estimateId && quoteVersion > 0 ? `estimate:${estimateId}:quote:v${quoteVersion}` : '';

const quoteExpirationDate = (issueDate: unknown, validDays: unknown) => {
  const text = String(issueDate || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return '';
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + Math.max(0, whole(validDays, 30)));
  return date.toISOString().slice(0, 10);
};

const canonicalAcceptance = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.accepted_at || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.accepted_at || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const estimateId = String(body?.estimate_id || '').trim();
    const quoteVersion = Math.max(0, whole(body?.quote_version));
    const acceptedByName = String(body?.accepted_by_name || '').trim();
    const acceptedByEmail = String(body?.accepted_by_email || '').trim();
    const acceptanceMethod = String(body?.acceptance_method || '').trim();
    const acceptedAt = String(body?.accepted_at || '').trim();
    const deliveryId = String(body?.delivery_id || '').trim();
    const evidenceReference = String(body?.evidence_reference || '').trim();
    const notes = String(body?.notes || '').trim();

    if (!estimateId || quoteVersion <= 0) {
      return Response.json({ error: 'Estimate id and issued Quote Version are required.' }, { status: 400 });
    }
    if (!acceptedByName || !acceptedAt || !METHODS.has(acceptanceMethod)) {
      return Response.json({ error: 'Accepted by, acceptance date/time, and a valid acceptance method are required.' }, { status: 400 });
    }
    if (!Number.isFinite(Date.parse(acceptedAt))) {
      return Response.json({ error: 'Acceptance date/time is invalid.' }, { status: 400 });
    }

    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Acceptance = base44.asServiceRole.entities.EstimateAcceptance;
    const Delivery = base44.asServiceRole.entities.EstimateQuoteDelivery;

    const estimate = await Estimate.get(estimateId);
    if (!estimate || !['sent', 'approved'].includes(String(estimate.status || ''))) {
      return Response.json({ error: 'Customer acceptance can only be recorded for a Sent or Approved estimate.' }, { status: 409 });
    }
    const currentVersion = Math.max(0, whole(estimate.quote_version));
    if (!currentVersion || currentVersion !== quoteVersion) {
      return Response.json({ error: 'The issued Quote Version changed. Reload the estimate before recording acceptance.' }, { status: 409 });
    }

    const existing = canonicalAcceptance(await Acceptance.filter({
      estimate_id: estimateId,
      quote_version: quoteVersion,
    }));
    if (existing) return Response.json({ acceptance: existing, reused: true });
    if (estimate.status === 'approved') {
      return Response.json({ error: 'This estimate is already Approved, but no immutable acceptance record exists for the current Quote Version. Acceptance cannot be reconstructed automatically.' }, { status: 409 });
    }

    let delivery: any = null;
    if (deliveryId) {
      delivery = await Delivery.get(deliveryId);
      if (
        !delivery ||
        delivery.estimate_id !== estimateId ||
        Math.max(0, whole(delivery.quote_version)) !== quoteVersion ||
        delivery.delivery_status !== 'sent'
      ) {
        return Response.json({ error: 'The selected quote delivery does not belong to this estimate/version.' }, { status: 409 });
      }
    }

    const created = await Acceptance.create({
      estimate_id: estimateId,
      work_order_id: estimate.work_order_id || '',
      delivery_id: delivery?.id || '',
      quote_issue_key: quoteIssueKey(estimateId, quoteVersion),
      quote_version: quoteVersion,
      quote_issue_date: estimate.quote_issue_date || '',
      quote_expiration_date: quoteExpirationDate(estimate.quote_issue_date, estimate.quote_valid_days ?? 30),
      quote_total: Number(estimate.quote_total || 0),
      accepted_at: new Date(acceptedAt).toISOString(),
      accepted_by_name: acceptedByName,
      accepted_by_email: acceptedByEmail,
      acceptance_method: acceptanceMethod,
      evidence_reference: evidenceReference,
      notes,
      recorded_by_email: String(user.email || ''),
      recorded_by_name: String(user.full_name || user.name || user.email || ''),
    });

    // Re-read after create to collapse the practical two-session race without
    // requiring unsupported database unique-index behavior. Only this request's
    // losing insert is removed; an already-canonical immutable row is never edited.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const canonical = canonicalAcceptance(await Acceptance.filter({
      estimate_id: estimateId,
      quote_version: quoteVersion,
    })) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      await Acceptance.delete(created.id).catch(() => null);
      return Response.json({ acceptance: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ acceptance: canonical, reused: false });
  } catch (error) {
    console.error('recordEstimateAcceptance error:', error);
    return Response.json({ error: error?.message || 'Customer acceptance could not be recorded.' }, { status: 500 });
  }
});
