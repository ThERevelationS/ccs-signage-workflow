import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { createFoundationRecordWithRecovery } from '../../shared/opportunityFoundationPersistence.mjs';

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

// A superseded acceptance stays in the audit trail but no longer counts as the
// canonical approval for its quote version — dedupe/convergence checks run on
// active rows only so a fresh acceptance can be recorded after a supersede.
const isActiveAcceptance = (row: any) =>
  String(row?.status || 'accepted') !== 'superseded' && !row?.superseded_at;
const activeAcceptanceRows = (rows: any[] = []) => (Array.isArray(rows) ? rows : []).filter(isActiveAcceptance);

// Mirror the canonical acceptance onto the Estimate record itself so
// accepted_at/accepted_by_* is queryable without joining EstimateAcceptance.
// CAS on the loaded updated_date; failures never fail the acceptance write.
async function patchEstimateAcceptanceFields(Estimate: any, estimateId: string, estimate: any, acceptance: any) {
  if (!acceptance?.id) return;
  const patch = {
    accepted_at: String(acceptance.accepted_at || '').trim() || new Date().toISOString(),
    accepted_by_name: String(acceptance.accepted_by_name || '').trim(),
    accepted_by_email: String(acceptance.accepted_by_email || '').trim(),
  };
  const filter: any = { id: estimateId };
  const version = String(estimate?.updated_date || '').trim();
  if (version) filter.updated_date = version;
  try {
    await Estimate.updateMany(filter, { $set: patch });
  } catch (e: any) {
    console.error('Estimate acceptance field mirror failed:', e?.message || e);
  }
}

/**
 * (#255) Staff-side "reject quote": CAS the estimate to cancelled (the state the
 * codebase treats as customer-lost — the pipeline maps it to `lost`, mirroring
 * the portal decline path and the Cancel Estimate modal's cancelled_at /
 * cancel_reason fields) and queue an idempotent `ready` EstimatingRequest
 * follow-up assigned to the estimate owner with a due date. CAS-anchored on the
 * estimate's updated_date; retries converge instead of double-writing.
 */
async function rejectEstimateQuote({ base44, user, body }: any) {
  const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
  const EstimatingRequest = base44.asServiceRole.entities.EstimatingRequest;
  const estimateId = String(body?.estimate_id || '').trim();
  const reason = String(body?.reason || '').trim().slice(0, 500);
  if (!estimateId) {
    return Response.json({ error: 'Estimate is required to reject a quote.' }, { status: 400 });
  }
  if (!reason) {
    return Response.json({ error: 'A rejection reason is required — a lost quote must never be silent.' }, { status: 400 });
  }
  const rawDueDate = String(body?.due_date || '').trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate)
    ? rawDueDate
    : new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const expectedVersion = String(body?.expected_estimate_updated_date || '').trim();

  const estimate = await Estimate.get(estimateId).catch(() => null);
  if (!estimate?.id || estimate?.deleted === true) {
    return Response.json({ error: 'Estimate could not be verified for quote rejection.' }, { status: 404 });
  }
  if (expectedVersion && expectedVersion !== String(estimate.updated_date || '').trim()) {
    return Response.json({ error: 'This estimate changed in another session. Reload before rejecting the quote.' }, { status: 409 });
  }
  if (String(estimate.work_order_id || '').trim()) {
    return Response.json({ error: 'This estimate is already linked to a Work Order. Cancel or close the job from the workflow instead of rejecting its source quote.' }, { status: 409 });
  }

  const status = String(estimate.status || '').trim();
  let saved = estimate;
  let reused = false;
  if (status === 'sent') {
    const anchor = String(estimate.updated_date || '').trim();
    if (!anchor) {
      return Response.json({ error: 'Estimate is missing version metadata and cannot be rejected safely.' }, { status: 409 });
    }
    const result = await Estimate.updateMany(
      { id: estimateId, updated_date: anchor },
      { $set: { status: 'cancelled', cancel_reason: reason, cancelled_at: new Date().toISOString(), edit_reason: '' } },
    );
    if (!result || typeof result.updated !== 'number') {
      throw new Error('Quote rejection conditional-update result could not be verified.');
    }
    if (result.updated !== 1) {
      // CAS lost the race — converge only when the row already reflects THIS
      // rejection (same reason), never paper over a different transition.
      const after = await Estimate.get(estimateId).catch(() => null);
      if (after?.id && String(after?.status || '') === 'cancelled' && String(after?.cancel_reason || '').trim() === reason) {
        saved = after;
        reused = true;
      } else {
        return Response.json({ error: 'Estimate changed while the quote was being rejected. Reload before rejecting again.' }, { status: 409 });
      }
    } else {
      saved = await Estimate.get(estimateId).catch(() => null) || estimate;
    }
  } else if (status === 'cancelled' && String(estimate.cancel_reason || '').trim() === reason) {
    // Replay of this exact rejection — the estimate is already cancelled;
    // converge on the follow-up task below.
    reused = true;
  } else {
    return Response.json({ error: `This quote is ${status || 'not awaiting response'} — only sent quotes can be rejected.` }, { status: 409 });
  }

  // Staff follow-up task: an idempotent queue-visible EstimatingRequest puts
  // the loss on the estimator queue assigned to the estimate owner with a due
  // date (mirrors the portal decline's `ready` follow-up row convention).
  let followUp: any = null;
  let followUpWarning = '';
  const requestKey = `staff-reject-request:${estimateId}`;
  const quoteVersion = Math.max(0, whole(estimate.quote_version));
  const quoteLabel = `Quote Version ${quoteVersion || '?'}${estimate.estimate_number ? ` · ${estimate.estimate_number}` : ''}`;
  try {
    const projectName = String(estimate.project_name || estimate.estimate_number || 'estimate').trim();
    const created = await createFoundationRecordWithRecovery({
      entity: EstimatingRequest,
      data: {
        creation_request_key: requestKey,
        estimate_id: estimateId,
        opportunity_id: String(estimate.opportunity_id || '').trim() || `staff-reject:${estimateId}`,
        customer_id: String(estimate.customer_id || '').trim(),
        // "ready" is the queue-visible status — it lands on the estimator
        // queue and attention feed, unlike the legacy "open" value.
        status: 'ready',
        requested_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        requested_by: String(user.email || user.full_name || user.name || 'staff').trim(),
        assigned_estimator: String(estimate.salesperson_email || estimate.created_by || estimate.salesperson || '').trim(),
        due_date: dueDate,
        priority: 'high',
        request_kind: 'quote_rejection_followup',
        request_notes: `Staff rejected ${quoteLabel} on ${projectName}: ${reason.slice(0, 400)} — follow up with the customer.`,
      },
      readMatches: () => EstimatingRequest.filter({ creation_request_key: requestKey }),
      label: 'Staff quote rejection follow-up task',
    });
    followUp = created?.record || null;
  } catch (error: any) {
    // The rejection itself is durable — a queue failure is surfaced, never
    // silently rolled back or fatal (mirrors the portal decline convention).
    console.error('Quote rejected but its follow-up task failed:', error?.message || error);
    followUpWarning = 'The quote was rejected, but its estimator follow-up task could not be queued. Create the follow-up manually.';
  }

  return Response.json({ success: true, action: 'reject_quote', estimate: saved, follow_up: followUp, follow_up_warning: followUpWarning, reused });
}

/**
 * (#271) Supersede acceptance: mark the canonical EstimateAcceptance row for
 * the current Quote Version as superseded (additive status/superseded_* audit
 * fields, CAS on the row's own updated_date) and CAS the estimate from
 * Approved back to Sent (needs-resend) with the acceptance mirror fields
 * cleared. The lifecycle EstimateRevision is written by the caller through
 * the normal guarded path. Retries converge on either half.
 */
async function supersedeEstimateAcceptance({ base44, user, body }: any) {
  const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
  const Acceptance = base44.asServiceRole.entities.EstimateAcceptance;
  const estimateId = String(body?.estimate_id || '').trim();
  const acceptanceId = String(body?.acceptance_id || '').trim();
  const reason = String(body?.reason || '').trim().slice(0, 500) || 'Customer acceptance superseded by staff.';
  const expectedVersion = String(body?.expected_estimate_updated_date || '').trim();
  if (!estimateId) {
    return Response.json({ error: 'Estimate is required to supersede an acceptance.' }, { status: 400 });
  }

  const estimate = await Estimate.get(estimateId).catch(() => null);
  if (!estimate?.id || estimate?.deleted === true) {
    return Response.json({ error: 'Estimate could not be verified for acceptance supersede.' }, { status: 404 });
  }
  if (expectedVersion && expectedVersion !== String(estimate.updated_date || '').trim()) {
    return Response.json({ error: 'This estimate changed in another session. Reload before superseding the acceptance.' }, { status: 409 });
  }
  const status = String(estimate.status || '').trim();
  if (!['approved', 'sent'].includes(status)) {
    return Response.json({ error: `Only an Approved estimate's customer acceptance can be superseded.` }, { status: 409 });
  }
  const quoteVersion = Math.max(0, whole(estimate.quote_version));
  const rows = await Acceptance.filter({ estimate_id: estimateId, quote_version: quoteVersion });
  if (!Array.isArray(rows)) {
    throw new Error('Acceptance history could not be verified safely.');
  }
  const activeRows = activeAcceptanceRows(rows);
  const target = (acceptanceId ? activeRows.find((row: any) => String(row?.id || '') === acceptanceId) : null)
    || canonicalAcceptance(activeRows);
  if (!target?.id) {
    return Response.json({ error: 'No active customer acceptance exists for the current Quote Version.' }, { status: 409 });
  }

  // Return the estimate to Sent (the needs-resend state) first; the mirror
  // fields are cleared so lists stop showing the stale customer approval.
  let saved = estimate;
  let reused = false;
  if (status === 'approved') {
    const anchor = String(estimate.updated_date || '').trim();
    if (!anchor) {
      return Response.json({ error: 'Estimate is missing version metadata and cannot be superseded safely.' }, { status: 409 });
    }
    const result = await Estimate.updateMany(
      { id: estimateId, updated_date: anchor },
      { $set: { status: 'sent', accepted_at: '', accepted_by_name: '', accepted_by_email: '', edit_reason: '' } },
    );
    if (!result || typeof result.updated !== 'number') {
      throw new Error('Acceptance supersede conditional-update result could not be verified.');
    }
    if (result.updated !== 1) {
      const after = await Estimate.get(estimateId).catch(() => null);
      if (after?.id && String(after?.status || '') === 'sent') {
        saved = after;
        reused = true;
      } else {
        return Response.json({ error: 'Estimate changed while the acceptance was being superseded. Reload before superseding again.' }, { status: 409 });
      }
    } else {
      saved = await Estimate.get(estimateId).catch(() => null) || estimate;
    }
  } else {
    // Already Sent — a prior attempt CAS'd the estimate before failing on the
    // acceptance mark; converge on the acceptance update below.
    reused = true;
  }

  const targetVersion = String(target.updated_date || '').trim();
  if (!targetVersion) {
    throw new Error('The acceptance record is missing version metadata and cannot be superseded safely.');
  }
  const patch = {
    status: 'superseded',
    superseded_at: new Date().toISOString(),
    superseded_by_email: String(user.email || '').trim(),
    superseded_by_name: String(user.full_name || user.name || user.email || '').trim(),
    supersede_reason: reason,
  };
  const result = await Acceptance.updateMany({ id: target.id, updated_date: targetVersion }, { $set: patch });
  if (!result || typeof result.updated !== 'number') {
    throw new Error('Acceptance supersede conditional-update result could not be verified.');
  }
  let superseded: any = target;
  if (result.updated === 1) {
    superseded = await Acceptance.get(target.id).catch(() => null) || { ...target, ...patch };
  } else {
    const after = await Acceptance.get(target.id).catch(() => null);
    if (after?.id && !isActiveAcceptance(after)) {
      superseded = after;
      reused = true;
    } else {
      return Response.json({ error: 'Acceptance changed while it was being superseded. Reload before superseding again.' }, { status: 409 });
    }
  }

  return Response.json({ success: true, action: 'supersede_acceptance', estimate: saved, acceptance: superseded, reused });
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const action = String(body?.action || 'record').trim();
    if (action === 'reject_quote') return await rejectEstimateQuote({ base44, user, body });
    if (action === 'supersede_acceptance') return await supersedeEstimateAcceptance({ base44, user, body });
    const estimateId = String(body?.estimate_id || '').trim();
    const quoteVersion = Math.max(0, whole(body?.quote_version));
    const acceptedByName = String(body?.accepted_by_name || '').trim();
    const acceptedByEmail = String(body?.accepted_by_email || '').trim();
    if (acceptedByEmail && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(acceptedByEmail)) {
      return Response.json({ error: 'accepted_by_email is not a valid email address.' }, { status: 400 });
    }
    const acceptanceMethod = String(body?.acceptance_method || '').trim();
    const acceptedAt = String(body?.accepted_at || '').trim();
    const deliveryId = String(body?.delivery_id || '').trim();
    const rawEvidence = String(body?.evidence_reference || '').trim();
    // evidence_reference is free text (PO number, "signed quote", etc.), but a
    // javascript:/data:/vbscript: scheme must never be persisted as a reference.
    const evidenceReference = /^(javascript|data|vbscript)[ ]*:/i.test(rawEvidence) ? '' : rawEvidence;
    const notes = String(body?.notes || '').trim();

    if (!estimateId || quoteVersion <= 0) {
      return Response.json({ error: 'Estimate id and issued Quote Version are required.' }, { status: 400 });
    }
    if (!acceptedAt || !METHODS.has(acceptanceMethod)) {
      return Response.json({ error: 'Acceptance date/time and a valid acceptance method are required.' }, { status: 400 });
    }
    if (!Number.isFinite(Date.parse(acceptedAt))) {
      return Response.json({ error: 'Acceptance date/time is invalid.' }, { status: 400 });
    }
    const acceptedMs = Date.parse(acceptedAt);
    const nowMs = Date.now();
    if (acceptedMs > nowMs + 15 * 60 * 1000) {
      return Response.json({ error: 'Acceptance date/time cannot be in the future.' }, { status: 400 });
    }
    if (acceptedMs < nowMs - 10 * 365 * 24 * 60 * 60 * 1000) {
      return Response.json({ error: 'Acceptance date/time is unreasonably old.' }, { status: 400 });
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
    // Expired-quote gate: acceptance is disabled once the quote's validity
    // window has passed — issue a revised quote (new quote_version) instead.
    const expirationDate = quoteExpirationDate(estimate.quote_issue_date, estimate.quote_valid_days ?? 30);
    if (expirationDate && expirationDate < new Date().toISOString().slice(0, 10)) {
      return Response.json({ error: 'This quote is expired. Issue a revised quote before recording acceptance.' }, { status: 409 });
    }
    // accepted_by fallback: when the caller omits the name, resolve it from the
    // estimate's customer contact (first+last, then order_contact/contact_name).
    const resolvedByName = acceptedByName
      || [estimate.contact_first_name, estimate.contact_last_name].map((v: any) => String(v || '').trim()).filter(Boolean).join(' ')
      || String(estimate.order_contact || estimate.contact_name || '').trim();
    if (!resolvedByName) {
      return Response.json({ error: 'Accepted by is required and no customer contact name is on file.' }, { status: 400 });
    }

    // Dedupe/convergence considers ACTIVE acceptances only — a superseded row
    // must not block a fresh acceptance on the same quote version.
    const existingRowsRaw = await Acceptance.filter({
      estimate_id: estimateId,
      quote_version: quoteVersion,
    });
    if (!Array.isArray(existingRowsRaw)) {
      throw new Error('Acceptance history could not be verified safely.');
    }
    const existingRows = activeAcceptanceRows(existingRowsRaw);
    if (existingRows.length > 1) {
      throw new Error('Multiple immutable acceptance records already exist for this Quote Version. No acceptance was changed; review the acceptance history before continuing.');
    }
    const existing = canonicalAcceptance(existingRows);
    if (existing) {
      await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, existing);
      return Response.json({ acceptance: existing, reused: true });
    }
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

    let created: any = null;
    let createError: any = null;
    try {
      created = await Acceptance.create({
        estimate_id: estimateId,
        work_order_id: estimate.work_order_id || '',
        delivery_id: delivery?.id || '',
        quote_issue_key: quoteIssueKey(estimateId, quoteVersion),
        quote_version: quoteVersion,
        quote_issue_date: estimate.quote_issue_date || '',
        quote_expiration_date: quoteExpirationDate(estimate.quote_issue_date, estimate.quote_valid_days ?? 30),
        quote_total: Number(estimate.quote_total || 0),
        accepted_at: new Date(acceptedAt).toISOString(),
        accepted_by_name: resolvedByName,
        accepted_by_email: acceptedByEmail,
        acceptance_method: acceptanceMethod,
        evidence_reference: evidenceReference,
        notes,
        recorded_by_email: String(user.email || ''),
        recorded_by_name: String(user.full_name || user.name || user.email || ''),
      });
    } catch (error) {
      createError = error;
    }

    // Re-read after create to collapse the practical two-session race without
    // requiring unsupported database unique-index behavior. Only this request's
    // losing insert is removed; an already-canonical immutable row is never edited.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterCreateRowsRaw = await Acceptance.filter({
      estimate_id: estimateId,
      quote_version: quoteVersion,
    });
    if (!Array.isArray(afterCreateRowsRaw)) {
      throw new Error('Acceptance create outcome could not be verified safely.');
    }
    const afterCreateRows = activeAcceptanceRows(afterCreateRowsRaw);
    if (!created?.id) {
      if (afterCreateRows.length === 1) {
        await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, afterCreateRows[0]);
        return Response.json({ acceptance: afterCreateRows[0], reused: true, recovered_after_create_error: true });
      }
      if (afterCreateRows.length > 1) {
        throw new Error('Acceptance creation became ambiguous and multiple immutable records are now visible. No uncertain acceptance was deleted; review the acceptance history before retrying.');
      }
      throw createError || new Error('Acceptance could not be created or verified.');
    }

    const canonical = canonicalAcceptance(afterCreateRows) || created;

    if (afterCreateRows.length > 1 && canonical?.id === created.id) {
      throw new Error('A concurrent acceptance record was detected after this acceptance was created. The earlier canonical row was preserved and no uncertain concurrent record was deleted; review the acceptance history before continuing.');
    }

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const createdVersion = String(created.updated_date || '').trim();
      if (!createdVersion) {
        throw new Error('A duplicate acceptance record was detected, but the losing row has no version metadata. No uncertain acceptance was deleted.');
      }
      const deleted = await Acceptance.deleteMany({
        id: created.id,
        estimate_id: estimateId,
        quote_version: quoteVersion,
        updated_date: createdVersion,
      });
      if (!deleted || deleted.deleted !== 1) {
        throw new Error('A duplicate acceptance record changed before cleanup. No uncertain acceptance was deleted; reload the acceptance history before retrying.');
      }
      // Mirror the canonical (earliest-created) acceptance, not the duplicate
      // this request is about to discard — the estimate must reflect the row
      // that actually survives dedupe.
      await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, canonical);
      return Response.json({ acceptance: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    // Notify the estimate owner (salesperson) that the customer accepted —
    // fire-and-forget so a Gmail outage never blocks the acceptance write.
    try {
      const ownerEmail = String(estimate.created_by || estimate.salesperson_email || '').trim();
      if (ownerEmail && ownerEmail !== String(user.email || '').trim()) {
        const projectName = String(estimate.project_name || estimate.estimate_number || 'estimate').trim();
        await base44.asServiceRole.functions.invoke('sendGmail', {
          to: ownerEmail,
          subject: `Quote accepted: ${projectName}`,
          body: `${acceptedByName} accepted quote version ${quoteVersion} on ${projectName}

Total: $${Number(estimate.quote_total || 0).toFixed(2)}
Method: ${acceptanceMethod}
${notes ? `Notes: ${notes}` : ''}`.trim(),
          _workflow_capability: 'ccs-sendGmail-acceptance-notify',
        });
      }
    } catch (notifyError) {
      console.error('Acceptance salesperson notify failed:', notifyError?.message || notifyError);
    }
    // Confirmation to the customer that their acceptance was recorded —
    // same fire-and-forget pattern; a Gmail outage never blocks the write.
    try {
      if (acceptedByEmail) {
        const custProject = String(estimate.project_name || estimate.estimate_number || 'your estimate').trim();
        await base44.asServiceRole.functions.invoke('sendGmail', {
          to: acceptedByEmail,
          subject: `Quote acceptance confirmed: ${custProject}`,
          body: `Thank you${acceptedByName ? `, ${acceptedByName}` : ''} — your approval of quote version ${quoteVersion} for ${custProject} ($${Number(estimate.quote_total || 0).toFixed(2)}) has been recorded. We'll be in touch about next steps.`,
          _workflow_capability: 'ccs-sendGmail-acceptance-confirm',
        });
      }
    } catch (confirmError) {
      console.error('Acceptance customer confirm failed:', confirmError?.message || confirmError);
    }
    await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, canonical);
    return Response.json({ acceptance: canonical, reused: false });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 409, 429, 503].includes(status) ? status : 500;
    console.error('recordEstimateAcceptance error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Customer acceptance could not be recorded safely.' : error.message,
    }, { status: safeStatus });
  }
});