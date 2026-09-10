export class WorkOrderCreateAmbiguityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkOrderCreateAmbiguityError';
    this.code = 'WORK_ORDER_CREATE_AMBIGUOUS';
  }
}

export async function createWorkOrderWithRecovery({
  entity,
  data,
  readMatches,
  label = 'Work Order create',
  settleMs = 50,
} = {}) {
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  if (!payload || typeof entity?.create !== 'function' || typeof entity?.get !== 'function' || typeof readMatches !== 'function') {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const readVerifiedMatches = async (phase) => {
    const rows = await readMatches();
    if (!Array.isArray(rows)) {
      throw new Error(`${label} ${phase} lookup did not return a Work Order list.`);
    }
    const unique = [];
    const seen = new Set();
    for (const row of rows) {
      const id = String(row?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(row);
    }
    return unique;
  };

  const before = await readVerifiedMatches('preflight');
  if (before.length > 1) {
    throw new WorkOrderCreateAmbiguityError(`${label} found multiple existing Work Orders with the same import identity. No new Work Order was created; review the duplicates before retrying.`);
  }
  if (before.length === 1) {
    return { record: before[0], status: 'reused' };
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  let after = [];
  let verificationError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      after = await readVerifiedMatches('recovery');
      verificationError = null;
      if (after.length) break;
    } catch (error) {
      verificationError = error;
    }
  }

  if (after.length > 1) {
    throw new WorkOrderCreateAmbiguityError(`${label} may have been created more than once during concurrent processing or while the create response was unavailable. No Work Orders were deleted; review the matching jobs before retrying.`);
  }

  if (after.length === 1) {
    const record = after[0];
    if (created?.id && String(record.id) !== String(created.id)) {
      const direct = await entity.get(created.id).catch(() => null);
      if (direct?.id) {
        throw new WorkOrderCreateAmbiguityError(`${label} returned one create receipt while a different matching Work Order became visible. No Work Orders were deleted; reload and review before retrying.`);
      }
    }
    return {
      record,
      status: created?.id && String(record.id) === String(created.id) ? 'created' : 'recovered',
    };
  }

  if (created?.id) {
    const direct = await entity.get(created.id).catch(() => null);
    if (direct?.id) {
      return { record: direct, status: 'created' };
    }
  }

  if (verificationError) {
    throw new Error(`${label} create outcome could not be verified because the recovery lookup failed. Do not retry blindly; reload the import state first. ${verificationError?.message || ''}`.trim());
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No matching Work Order was visible after recovery checks. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Do not retry blindly; reload the import state first.`);
}
