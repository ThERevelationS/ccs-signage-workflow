import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { estimateAuditNumber, estimateAuditSnapshot, estimateQuoteIssueKey, summarizeEstimateAuditChanges } from '../../shared/estimateRevisionAudit.ts';

const text = (value: unknown, max = 2000) => String(value || '').trim().slice(0, max);
const whole = (value: unknown, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

function safeDeliveryEvidence(input: any = {}) {
  const sentAt = text(input?.sent_at, 80);
  return {
    delivery_id: text(input?.delivery_id, 128),
    gmail_message_id: text(input?.gmail_message_id, 512),
    recipient_email: text(input?.recipient_email, 320),
    sent_at: sentAt && Number.isFinite(Date.parse(sentAt)) ? new Date(sentAt).toISOString() : '',
    attachment_file_url: text(input?.attachment_file_url, 4000),
    attachment_sha256: text(input?.attachment_sha256, 128),
    attachment_size_bytes: Math.max(0, Number(input?.attachment_size_bytes || 0)),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = text(body?.action, 80);
    const estimateId = text(body?.estimate_id, 128);
    const RevisionService = base44.asServiceRole.entities.EstimateRevision;
    const EstimateUser = base44.entities.AllInOneEstimate;

    if (!estimateId) return Response.json({ error: 'Estimate id is required.' }, { status: 400 });

    if (action === 'complete_manual_revision') {
      const revisionId = text(body?.revision_id, 128);
      const expectedRevisionUpdatedDate = text(body?.expected_revision_updated_date, 100);
      if (!revisionId) return Response.json({ error: 'Revision id is required.' }, { status: 400 });

      const revision = await RevisionService.get(revisionId).catch(() => null);
      if (!revision?.id || String(revision.estimate_id || '') !== estimateId) {
        return Response.json({ error: 'Estimate revision could not be verified.' }, { status: 404 });
      }
      if (revision.revision_status === 'completed') {
        return Response.json({ revision, reused: true });
      }
      if (revision.revision_status !== 'open' || revision.revision_type !== 'manual_revision') {
        return Response.json({ error: 'Only an open manual Estimate revision can be completed.' }, { status: 409 });
      }
      if (expectedRevisionUpdatedDate && revision.updated_date && expectedRevisionUpdatedDate !== revision.updated_date) {
        return Response.json({ error: 'This Estimate revision changed in another session. Reload before completing it.' }, { status: 409 });
      }

      const estimate = await EstimateUser.get(estimateId).catch(() => null);
      if (!estimate?.id) return Response.json({ error: 'Estimate could not be verified before completing its revision.' }, { status: 404 });

      const before = revision.estimate_snapshot_before && typeof revision.estimate_snapshot_before === 'object'
        ? JSON.parse(JSON.stringify(revision.estimate_snapshot_before))
        : {};
      const after = estimateAuditSnapshot(estimate);
      const quoteVersion = Math.max(0, whole(after.quote_version));
      const patch = {
        revision_status: 'completed',
        quote_version: quoteVersion,
        quote_issue_key: estimateQuoteIssueKey(estimateId, quoteVersion),
        new_status: String(after.status || revision.previous_status || 'draft'),
        new_quote_total: estimateAuditNumber(after.quote_total),
        new_total_cost: estimateAuditNumber(after.total_cost),
        change_summary: summarizeEstimateAuditChanges(before, after),
        estimate_snapshot_after: after,
        completed_at: new Date().toISOString(),
        work_order_id: String(estimate.work_order_id || revision.work_order_id || ''),
      };

      const version = String(revision.updated_date || '').trim();
      if (!version) return Response.json({ error: 'Estimate revision version metadata is incomplete.' }, { status: 409 });
      const result = await RevisionService.updateMany(
        { id: revisionId, estimate_id: estimateId, revision_status: 'open', revision_type: 'manual_revision', updated_date: version },
        { $set: patch },
      );
      if (!result || typeof result.updated !== 'number') {
        throw new Error('Estimate revision completion result could not be verified.');
      }
      const current = await RevisionService.get(revisionId).catch(() => null);
      if (result.updated !== 1) {
        if (current?.revision_status === 'completed' && String(current.estimate_id || '') === estimateId) {
          return Response.json({ revision: current, reused: true });
        }
        return Response.json({ error: 'The Estimate revision changed before completion. Reload before retrying.' }, { status: 409 });
      }
      if (!current?.id || current.revision_status !== 'completed') {
        throw new Error('Estimate revision was updated but could not be verified as completed.');
      }
      return Response.json({ revision: current, reused: false });
    }

    if (action === 'attach_delivery_evidence') {
      const quoteVersion = Math.max(0, whole(body?.quote_version));
      if (quoteVersion <= 0) return Response.json({ error: 'Issued Quote Version is required.' }, { status: 400 });
      const issueKey = estimateQuoteIssueKey(estimateId, quoteVersion);
      const rows = await RevisionService.filter({ estimate_id: estimateId, quote_issue_key: issueKey });
      if (!Array.isArray(rows)) throw new Error('Quote issuance revision history could not be verified.');

      const issuanceRevision = rows.find((row: any) => {
        const beforeVersion = Math.max(0, whole(row?.estimate_snapshot_before?.quote_version));
        const afterVersion = Math.max(0, whole(row?.estimate_snapshot_after?.quote_version, row?.quote_version));
        return row?.revision_status === 'completed' && afterVersion === quoteVersion && beforeVersion !== afterVersion;
      }) || null;
      if (!issuanceRevision?.id) {
        return Response.json({ revision: null, warning: `Quote Version ${quoteVersion} was delivered, but its issuance revision could not be located for fallback delivery evidence.` });
      }

      const existing = issuanceRevision.delivery_evidence || {};
      if (existing.gmail_message_id || existing.delivery_id || existing.attachment_file_url) {
        return Response.json({ revision: issuanceRevision, reused: true });
      }

      let evidence = safeDeliveryEvidence(body?.delivery_evidence || {});
      if (evidence.delivery_id) {
        const delivery = await base44.asServiceRole.entities.EstimateQuoteDelivery.get(evidence.delivery_id).catch(() => null);
        if (!delivery?.id || String(delivery.estimate_id || '') !== estimateId || Math.max(0, whole(delivery.quote_version)) !== quoteVersion || delivery.delivery_status !== 'sent') {
          return Response.json({ error: 'The selected quote delivery does not belong to this Estimate/version.' }, { status: 409 });
        }
        evidence = safeDeliveryEvidence({
          delivery_id: delivery.id,
          gmail_message_id: delivery.gmail_message_id,
          recipient_email: delivery.recipient_email,
          sent_at: delivery.sent_at,
          attachment_file_url: delivery.attachment_file_url,
          attachment_sha256: delivery.attachment_sha256,
          attachment_size_bytes: delivery.attachment_size_bytes,
        });
      }

      if (!evidence.gmail_message_id && !evidence.delivery_id && !evidence.attachment_file_url) {
        return Response.json({ error: 'Delivery evidence is incomplete.' }, { status: 400 });
      }

      const version = String(issuanceRevision.updated_date || '').trim();
      if (!version) return Response.json({ error: 'Issuance revision version metadata is incomplete.' }, { status: 409 });
      const result = await RevisionService.updateMany(
        { id: issuanceRevision.id, estimate_id: estimateId, quote_issue_key: issueKey, revision_status: 'completed', updated_date: version },
        { $set: { delivery_evidence: evidence } },
      );
      if (!result || typeof result.updated !== 'number') throw new Error('Quote delivery evidence update result could not be verified.');
      const current = await RevisionService.get(issuanceRevision.id).catch(() => null);
      if (result.updated !== 1) {
        const currentEvidence = current?.delivery_evidence || {};
        if (currentEvidence.gmail_message_id || currentEvidence.delivery_id || currentEvidence.attachment_file_url) {
          return Response.json({ revision: current, reused: true });
        }
        return Response.json({ error: 'The quote issuance revision changed before delivery evidence was attached. Reload before retrying.' }, { status: 409 });
      }
      if (!current?.id) throw new Error('Quote delivery evidence was updated but could not be re-read.');
      return Response.json({ revision: current, reused: false });
    }

    return Response.json({ error: 'Invalid Estimate revision audit action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 404, 409, 503].includes(status) ? status : 500;
    console.error('updateEstimateRevisionAudit error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Estimate revision audit could not be updated safely.' : error.message,
    }, { status: safeStatus });
  }
});