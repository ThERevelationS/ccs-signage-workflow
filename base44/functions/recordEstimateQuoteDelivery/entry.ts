import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { estimateQuoteIssueKey } from '../../shared/estimateRevisionAudit.ts';

const MAX_TEXT = 1000;
const MAX_URL = 4096;

const whole = (value: unknown, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanText = (value: unknown, max = MAX_TEXT) => String(value || '').trim().slice(0, max);

const canonicalDelivery = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.sent_at || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.sent_at || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

function sameDelivery(row: any, data: any) {
  return String(row?.estimate_id || '') === String(data?.estimate_id || '') &&
    whole(row?.quote_version) === whole(data?.quote_version) &&
    String(row?.recipient_email || '').trim().toLowerCase() === String(data?.recipient_email || '').trim().toLowerCase() &&
    String(row?.gmail_message_id || '') === String(data?.gmail_message_id || '') &&
    String(row?.attachment_sha256 || '').toLowerCase() === String(data?.attachment_sha256 || '').toLowerCase();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    await authenticateSignShopSession(base44, body?.session_token);

    const input = body?.delivery && typeof body.delivery === 'object' ? body.delivery : {};
    const estimateId = cleanText(input.estimate_id, 128);
    const quoteVersion = Math.max(0, whole(input.quote_version));
    const recipientEmail = cleanText(input.recipient_email, 320).toLowerCase();
    const gmailMessageId = cleanText(input.gmail_message_id, 512);
    const attachmentSha256 = cleanText(input.attachment_sha256, 128).toLowerCase();
    const sentAt = cleanText(input.sent_at, 64);

    if (!estimateId || !recipientEmail || !gmailMessageId || !sentAt) {
      return Response.json({ error: 'Estimate, recipient, Gmail message id, and sent timestamp are required.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return Response.json({ error: 'Quote delivery recipient email is invalid.' }, { status: 400 });
    }
    if (!Number.isFinite(Date.parse(sentAt))) {
      return Response.json({ error: 'Quote delivery sent timestamp is invalid.' }, { status: 400 });
    }
    if (attachmentSha256 && !/^[a-f0-9]{64}$/.test(attachmentSha256)) {
      return Response.json({ error: 'Quote delivery PDF fingerprint is invalid.' }, { status: 400 });
    }

    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Delivery = base44.asServiceRole.entities.EstimateQuoteDelivery;
    const estimate = await Estimate.get(estimateId).catch(() => null);
    if (!estimate?.id) {
      return Response.json({ error: 'Estimate could not be verified for quote delivery history.' }, { status: 404 });
    }

    const idempotencyKey = `quote_delivery:gmail:${gmailMessageId}`;
    const normalized = {
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
      work_order_id: cleanText(input.work_order_id, 128),
      quote_issue_key: estimateQuoteIssueKey(estimateId, quoteVersion),
      quote_version: quoteVersion,
      quote_issue_date: cleanText(input.quote_issue_date, 32),
      quote_valid_days: Math.max(0, whole(input.quote_valid_days, 30)),
      quote_expiration_date: cleanText(input.quote_expiration_date, 32),
      quote_total: Number.isFinite(Number(input.quote_total)) ? Number(input.quote_total) : 0,
      recipient_email: recipientEmail,
      subject: cleanText(input.subject, 998),
      delivery_method: 'email',
      delivery_status: 'sent',
      sent_at: new Date(sentAt).toISOString(),
      gmail_message_id: gmailMessageId,
      attachment_filename: cleanText(input.attachment_filename, 255),
      attachment_file_url: cleanText(input.attachment_file_url, MAX_URL),
      attachment_sha256: attachmentSha256,
      attachment_size_bytes: Math.max(0, whole(input.attachment_size_bytes)),
      is_resend: input.is_resend === true,
      source_status: cleanText(input.source_status, 64),
    };

    let rows = await Delivery.filter({ idempotency_key: idempotencyKey });
    if (!Array.isArray(rows)) throw new Error('Quote delivery audit lookup did not return a delivery list.');
    if (!rows.length) {
      rows = await Delivery.filter({ gmail_message_id: gmailMessageId });
      if (!Array.isArray(rows)) throw new Error('Quote delivery Gmail-id lookup did not return a delivery list.');
    }
    if (rows.length) {
      if (rows.some((row: any) => !sameDelivery(row, normalized))) {
        return Response.json({ error: 'A delivery audit with this Gmail message id conflicts with the supplied Estimate/version/PDF fingerprint.' }, { status: 409 });
      }
      if (rows.length > 1) {
        return Response.json({ error: 'Multiple delivery audit rows already exist for this Gmail message id. No history was changed automatically.' }, { status: 409 });
      }
      return Response.json({ delivery: rows[0], reused: true });
    }

    let created: any = null;
    let createError: any = null;
    try {
      created = await Delivery.create(normalized);
    } catch (error) {
      createError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterCreate = await Delivery.filter({ idempotency_key: idempotencyKey });
    if (!Array.isArray(afterCreate)) throw new Error('Quote delivery create outcome could not be verified safely.');

    if (!created?.id) {
      if (afterCreate.length === 1 && sameDelivery(afterCreate[0], normalized)) {
        return Response.json({ delivery: afterCreate[0], reused: true, recovered_after_create_error: true });
      }
      if (afterCreate.length > 0) {
        throw new Error('Quote delivery creation became ambiguous. No uncertain delivery row was deleted.');
      }
      throw createError || new Error('Quote delivery audit could not be created or verified.');
    }

    const canonical = canonicalDelivery(afterCreate) || created;
    if (!sameDelivery(canonical, normalized)) {
      throw new Error('Quote delivery verification resolved a conflicting audit row.');
    }

    if (afterCreate.length > 1 && canonical?.id === created.id) {
      throw new Error('A concurrent quote delivery audit was detected. The earlier canonical history was preserved and no uncertain row was deleted.');
    }

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const createdVersion = String(created.updated_date || '').trim();
      if (!createdVersion) {
        throw new Error('A duplicate quote delivery audit was detected, but the losing row has no version metadata.');
      }
      const deleted = await Delivery.deleteMany({
        id: created.id,
        estimate_id: estimateId,
        idempotency_key: idempotencyKey,
        updated_date: createdVersion,
      });
      if (!deleted || deleted.deleted !== 1) {
        throw new Error('A duplicate quote delivery audit changed before cleanup. No uncertain row was deleted.');
      }
      return Response.json({ delivery: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ delivery: canonical, reused: false });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 404, 409, 503].includes(status) ? status : 500;
    console.error('recordEstimateQuoteDelivery error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Quote delivery audit could not be recorded safely.' : error?.message,
    }, { status: safeStatus });
  }
});
