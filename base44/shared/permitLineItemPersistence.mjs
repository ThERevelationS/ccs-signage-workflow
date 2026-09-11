export class PermitLineItemConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermitLineItemConflictError';
    this.code = 'PERMIT_LINE_ITEM_CONFLICT';
  }
}

const PERMIT_EVENT_CLAIMS = Object.freeze({
  permit_submitted: {
    eventField: 'submitted_date',
    claimField: 'last_submitted_trigger_date',
  },
  permit_received: {
    eventField: 'permit_received_date',
    claimField: 'last_permit_received_trigger_date',
  },
});

export async function claimPermitWorkflowEvent({
  entity,
  lineId,
  eventType,
  label = 'Permit workflow event',
  maxAttempts = 3,
} = {}) {
  const id = String(lineId || '').trim();
  const kind = String(eventType || '').trim();
  const claimConfig = PERMIT_EVENT_CLAIMS[kind];
  if (!id || !claimConfig || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe event claim.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) return { claimed: false, reason: 'missing' };

    const eventValue = String(current?.[claimConfig.eventField] || '').trim();
    if (!eventValue) return { claimed: false, reason: 'event_not_durable', record: current };
    if (String(current?.[claimConfig.claimField] || '').trim() === eventValue) {
      return { claimed: false, reason: 'already_claimed', eventType: kind, eventValue, record: current };
    }

    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current Permit line version.`);

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: version },
        { $set: { [claimConfig.claimField]: eventValue } },
      );
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its claim outcome could not be verified. ${verificationError?.message || ''}`.trim());
      }
      if (String(afterError?.[claimConfig.claimField] || '').trim() === eventValue) {
        return { claimed: true, eventType: kind, eventValue, record: afterError, convergedAfterResponseLoss: true };
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') {
      throw new Error(`${label} conditional claim result could not be verified.`);
    }
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record claim count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id || String(saved?.[claimConfig.claimField] || '').trim() !== eventValue) {
        throw new Error(`${label} succeeded but the claimed Permit line could not be verified.`);
      }
      return { claimed: true, eventType: kind, eventValue, record: saved };
    }
  }

  throw new PermitLineItemConflictError(`${label} changed repeatedly while its workflow-event claim was being saved.`);
}

export async function claimPermitFollowupForToday({
  entity,
  lineId,
  today,
  label = 'Permit follow-up reminder',
  maxAttempts = 3,
} = {}) {
  const id = String(lineId || '').trim();
  const claimDate = String(today || '').trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(claimDate) || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe daily claim.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) return { claimed: false, reason: 'missing' };
    if (current.status !== 'active') return { claimed: false, reason: 'not_active', record: current };
    if (!current.next_followup_date) return { claimed: false, reason: 'no_followup_date', record: current };
    if (current.next_followup_date > claimDate) return { claimed: false, reason: 'not_due', record: current };
    if (current.last_followup_fired_date === claimDate) return { claimed: false, reason: 'already_claimed', record: current };

    const eventType = current.next_followup_date === claimDate ? 'permit_followup_due' : 'permit_followup_overdue';
    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current Permit line version.`);

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: version },
        { $set: { last_followup_fired_date: claimDate } },
      );
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its claim outcome could not be verified. ${verificationError?.message || ''}`.trim());
      }
      if (afterError?.last_followup_fired_date === claimDate) {
        return { claimed: true, eventType, record: afterError, convergedAfterResponseLoss: true };
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') {
      throw new Error(`${label} conditional claim result could not be verified.`);
    }
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record claim count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id || saved.last_followup_fired_date !== claimDate) {
        throw new Error(`${label} succeeded but the claimed Permit line could not be verified.`);
      }
      return { claimed: true, eventType, record: saved };
    }
  }

  throw new PermitLineItemConflictError(`${label} changed repeatedly while its daily reminder claim was being saved.`);
}
