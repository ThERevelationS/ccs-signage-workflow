import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { issueQuoteSendGrant } from '../../shared/quoteSendGrant.ts';
import { estimateQuoteIssueKey } from '../../shared/estimateRevisionAudit.ts';
import { createFoundationRecordWithRecovery } from '../../shared/opportunityFoundationPersistence.mjs';
import { ensureQuoteRecipientContact } from '../../shared/quoteRecipientContact.mjs';

const MAX_TEXT = 1000;
const MAX_URL = 4096;

const whole = (value: unknown, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanText = (value: unknown, max = MAX_TEXT) => String(value || '').trim().slice(0, max);

const safeUrl = (value: unknown, max = MAX_URL) => {
  const raw = cleanText(value, max);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['https:'].includes(url.protocol) ? url.toString().slice(0, max) : '';
  } catch {
    return '';
  }
};

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

const QUOTE_APPROVAL_THRESHOLD_KEY = 'quote_approval_threshold';
const DEFAULT_QUOTE_APPROVAL_THRESHOLD = 5000;
const QUOTE_APPROVAL_REQUIRED_MESSAGE = 'This quote exceeds the internal approval threshold â€” a manager must approve it before sending.';

const money = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function loadQuoteApprovalThreshold(Settings: any) {
  const rows = await Settings.filter({ setting_key: QUOTE_APPROVAL_THRESHOLD_KEY });
  if (!Array.isArray(rows)) throw new Error('Quote approval threshold setting could not be verified.');
  const raw = rows[0]?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUOTE_APPROVAL_THRESHOLD;
}

function recordedQuoteApproval(estimate: any) {
  const approval = estimate?.internal_approval;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return null;
  if (!approval.approved_at && !approval.approved_by_email && !approval.approved_by_user_id) return null;
  return approval;
}

function quoteApprovalCovers(estimate: any, quoteTotal: number) {
  const approval = recordedQuoteApproval(estimate);
  if (!approval) return false;
  // An approval recorded at a lower total does not cover a larger quote; the
  // quote needs a fresh approval if its total grew past the approved amount.
  const approvedTotal = Number(approval?.quote_total_at_approval);
  if (Number.isFinite(approvedTotal) && approvedTotal > 0 && quoteTotal > approvedTotal + 0.005) return false;
  return true;
}

async function assertQuoteSendAuthorized({ Settings, estimate, quoteTotal, user }: any) {
  const threshold = await loadQuoteApprovalThreshold(Settings);
  if (!(quoteTotal > threshold)) return { threshold, required: false };
  if (user?.can_approve_quotes === true) return { threshold, required: true, manager_bypass: true };
  if (quoteApprovalCovers(estimate, quoteTotal)) {
    return { threshold, required: true, approval: estimate.internal_approval };
  }
  throw Object.assign(new Error(QUOTE_APPROVAL_REQUIRED_MESSAGE), { status: 403 });
}

async function approveEstimateQuote({ Estimate, Settings, user, body }: any) {
  if (user?.can_approve_quotes !== true) {
    return Response.json({ error: 'This account is not authorized to approve customer quotes.' }, { status: 403 });
  }
  const estimateId = cleanText(body?.estimate_id, 128);
  if (!estimateId) {
    return Response.json({ error: 'Estimate is required for quote approval.' }, { status: 400 });
  }
  const estimate = await Estimate.get(estimateId).catch(() => null);
  if (!estimate?.id) {
    return Response.json({ error: 'Estimate could not be verified for quote approval.' }, { status: 404 });
  }
  const threshold = await loadQuoteApprovalThreshold(Settings);
  const quoteTotal = Math.max(money(body?.quote_total), money(estimate.quote_total));
  if (quoteApprovalCovers(estimate, quoteTotal)) {
    return Response.json({ success: true, estimate_id: estimate.id, internal_approval: estimate.internal_approval, reused: true });
  }
  const approval = {
    approved_by_user_id: String(user.id || ''),
    approved_by_email: String(user.email || '').trim().toLowerCase(),
    approved_at: new Date().toISOString(),
    threshold_at_approval: threshold,
    quote_total_at_approval: quoteTotal,
    quote_version: Math.max(0, whole(estimate.quote_version)),
  };
  const expectedVersion = String(estimate.updated_date || '').trim();
  if (!expectedVersion) {
    return Response.json({ error: 'Estimate is missing version metadata and cannot be approved safely.' }, { status: 409 });
  }
  const result = await Estimate.updateMany(
    { id: estimate.id, updated_date: expectedVersion },
    { $set: { internal_approval: approval } },
  );
  if (!result || typeof result.updated !== 'number') {
    throw new Error('Quote approval conditional-update result could not be verified.');
  }
  if (result.updated !== 1) {
    // The estimate changed between the read and the CAS write. If a concurrent
    // manager already recorded a covering approval, adopt it; otherwise make
    // the conflict explicit so a stale session never silently double-approves.
    const after = await Estimate.get(estimate.id).catch(() => null);
    if (after?.id && quoteApprovalCovers(after, quoteTotal)) {
      return Response.json({ success: true, estimate_id: estimate.id, internal_approval: after.internal_approval, reused: true });
    }
    return Response.json({ error: 'Estimate changed while the approval was being recorded. Reload before approving again.' }, { status: 409 });
  }
  const saved = await Estimate.get(estimate.id).catch(() => null);
  if (String(saved?.internal_approval?.approved_at || '') !== approval.approved_at) {
    throw new Error('Quote approval was written but could not be verified.');
  }
  return Response.json({ success: true, estimate_id: estimate.id, internal_approval: approval });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);

    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Settings = base44.asServiceRole.entities.GlobalSettings;
    const action = cleanText(body?.action, 64);

    if (action === 'approve_quote') {
      return await approveEstimateQuote({ Estimate, Settings, user, body });
    }
    if (action === 'authorize_send') {
      const authorizeEstimateId = cleanText(body?.estimate_id, 128);
      if (!authorizeEstimateId) {
        return Response.json({ error: 'Estimate is required for send authorization.' }, { status: 400 });
      }
      const authorizeEstimate = await Estimate.get(authorizeEstimateId).catch(() => null);
      if (!authorizeEstimate?.id) {
        return Response.json({ error: 'Estimate could not be verified for quote sending.' }, { status: 404 });
      }
      const authorizeTotal = Math.max(money(body?.quote_total), money(authorizeEstimate.quote_total));
      const gate = await assertQuoteSendAuthorized({ Settings, estimate: authorizeEstimate, quoteTotal: authorizeTotal, user });
      const sendGrant = await issueQuoteSendGrant({
        user,
        estimateId: authorizeEstimate.id,
        to: body?.recipient_email,
        cc: body?.cc_emails,
        bcc: body?.bcc_emails,
      });
      return Response.json({
        success: true,
        allowed: true,
        ...gate,
        internal_approval: recordedQuoteApproval(authorizeEstimate),
        quote_send_grant: sendGrant.token,
        quote_send_grant_expires_at: sendGrant.expiresAt,
      });
    }

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

    const Delivery = base44.asServiceRole.entities.EstimateQuoteDelivery;
    const CustomerContact = base44.asServiceRole.entities.CustomerContact;
    const estimate = await Estimate.get(estimateId).catch(() => null);
    if (!estimate?.id) {
      return Response.json({ error: 'Estimate could not be verified for quote delivery history.' }, { status: 404 });
    }
    // The recorded delivery must describe the estimate's current issued quote â€”
    // an arbitrary version or foreign work order would let a session forge the
    // immutable delivery/audit trail.
    const issuedVersion = Math.max(0, whole(estimate.quote_version));
    if (!quoteVersion || quoteVersion !== issuedVersion) {
      return Response.json({ error: 'Quote delivery does not match the issued quote version.' }, { status: 409 });
    }
    const claimedWo = cleanText(input.work_order_id, 128);
    if (claimedWo && String(estimate.work_order_id || '') !== claimedWo) {
      return Response.json({ error: 'Quote delivery work order does not match the estimate.' }, { status: 409 });
    }

    const idempotencyKey = `quote_delivery:gmail:${gmailMessageId}`;
    const normalized = {
      estimate_id: estimateId,
      idempotency_key: idempotencyKey,
      work_order_id: cleanText(estimate.work_order_id || input.work_order_id, 128),
      quote_issue_key: estimateQuoteIssueKey(estimateId, quoteVersion),
      quote_version: quoteVersion,
      quote_issue_date: cleanText(input.quote_issue_date, 32),
      quote_valid_days: Math.max(0, whole(input.quote_valid_days, 30)),
      quote_expiration_date: cleanText(input.quote_expiration_date, 32),
      quote_total: Number.isFinite(Number(input.quote_total)) ? Number(input.quote_total) : 0,
      recipient_email: recipientEmail,
      cc_emails: cleanText(input.cc_emails, 998),
      bcc_emails: cleanText(input.bcc_emails, 998),
      subject: cleanText(input.subject, 998),
      delivery_method: 'email',
      delivery_status: 'sent',
      sent_at: new Date(sentAt).toISOString(),
      gmail_message_id: gmailMessageId,
      attachment_filename: cleanText(input.attachment_filename, 255),
      attachment_file_url: safeUrl(input.attachment_file_url),
      attachment_sha256: attachmentSha256,
      attachment_size_bytes: Math.max(0, whole(input.attachment_size_bytes)),
      is_resend: input.is_resend === true,
      source_status: cleanText(input.source_status, 64),
    };

    // Per-version delivery counter â€” 1 for the first send of this quote issue,
    // then 2, 3... on resends so the audit reads 'sent 3 times' not just 'resent'.
    const prior = await Delivery.filter({ quote_issue_key: estimateQuoteIssueKey(estimateId, quoteVersion) }).catch(() => []);
    normalized.delivery_n = (Array.isArray(prior) ? prior.filter((r: any) => r?.deleted !== true).length : 0) + 1;

    const respondWithDelivery = async (payload: Record<string, unknown>) => {
      try {
        await ensureQuoteRecipientContact({
          customerContact: CustomerContact,
          estimate,
          delivery: normalized,
          createWithRecovery: createFoundationRecordWithRecovery,
        });
      } catch (error: any) {
        // Delivery is already verified; a contact-sync failure must not make a sent quote appear unsent.
        console.error("Quote recipient CustomerContact sync failed:", error?.message || error);
        payload.contact_warning = "Quote delivery is recorded, but the recipient could not be added to Customer Contacts.";
      }
      // last_contacted_at tracks real customer contact (quote sent) for reporting.
      const customerId = clean(estimate?.customer_id);
      if (customerId) {
        await base44.asServiceRole.entities.Customer.updateMany(
          { id: customerId },
          { last_contacted_at: new Date().toISOString() }
        ).catch(() => null);
      }
      return Response.json(payload);
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
      return await respondWithDelivery({ delivery: rows[0], reused: true });
    }

    // Internal approval gate: a quote above the configured threshold cannot be
    // recorded as sent until a manager approves it â€” either live (the session
    // user carries can_approve_quotes) or through a recorded internal_approval.
    // The pre-send authorize_send action runs the same check before Gmail is
    // invoked, so this write is the enforcement backstop.
    await assertQuoteSendAuthorized({
      Settings,
      estimate,
      quoteTotal: Math.max(normalized.quote_total, money(estimate.quote_total)),
      user,
    });

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
        return await respondWithDelivery({ delivery: afterCreate[0], reused: true, recovered_after_create_error: true });
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
      return await respondWithDelivery({ delivery: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return await respondWithDelivery({ delivery: canonical, reused: false });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('recordEstimateQuoteDelivery error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Quote delivery audit could not be recorded safely.' : error?.message,
    }, { status: safeStatus });
  }
});