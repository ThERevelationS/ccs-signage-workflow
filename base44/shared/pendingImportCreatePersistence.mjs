function canonicalRecord(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || '');
    const bStamp = String(b?.created_date || '');
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

async function deleteExactDuplicate({ entity, row, data, label }) {
  const id = String(row?.id || '').trim();
  const version = String(row?.updated_date || '').trim();
  if (!id || !version || typeof entity?.deleteMany !== 'function' || typeof entity?.get !== 'function') {
    throw new Error(`${label} could not identify a losing duplicate safely.`);
  }
  if (
    String(row?.doc_number || '') !== String(data?.doc_number || '') ||
    String(row?.doc_type || '') !== String(data?.doc_type || '') ||
    String(row?.status || '') !== String(data?.status || 'pending')
  ) {
    throw new Error(`${label} found a non-pending or different-identity row during duplicate cleanup. It was left intact for review.`);
  }

  let result;
  try {
    result = await entity.deleteMany({ id, updated_date: version });
  } catch (error) {
    const current = await entity.get(id).catch(() => null);
    if (!current) return { status: 'already_absent' };
    throw error;
  }

  if (!result || typeof result.deleted !== 'number') {
    throw new Error(`${label} duplicate cleanup result could not be verified.`);
  }
  if (result.deleted === 1) return { status: 'deleted_now' };
  if (result.deleted > 1) throw new Error(`${label} duplicate cleanup matched more than one row unexpectedly.`);

  const current = await entity.get(id).catch(() => null);
  if (!current) return { status: 'already_absent' };
  throw new Error(`${label} duplicate changed before cleanup, so it was left intact for review.`);
}

export async function ensureConvergentPendingImportCreate({
  entity,
  data,
  readMatches,
  label = 'Pending Import create',
  settleMs = 40,
} = {}) {
  if (typeof entity?.create !== 'function' || typeof entity?.get !== 'function' || typeof entity?.deleteMany !== 'function' || typeof readMatches !== 'function') {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const converge = async (rows, createdId = '') => {
    const keep = canonicalRecord(rows);
    if (!keep?.id) throw new Error(`${label} could not identify a canonical Pending Import.`);

    const cleanup = [];
    for (const row of rows) {
      if (!row?.id || row.id === keep.id) continue;
      cleanup.push(await deleteExactDuplicate({ entity, row, data, label }));
    }

    const finalRows = await readMatches();
    if (!Array.isArray(finalRows)) throw new Error(`${label} final duplicate verification did not return a record list.`);
    if (finalRows.length !== 1 || finalRows[0]?.id !== keep.id) {
      throw new Error(`${label} could not converge duplicate Pending Imports to one verified canonical row.`);
    }

    return {
      record: finalRows[0],
      status: createdId && createdId === keep.id ? 'created' : 'reused',
      duplicates_removed: cleanup.length,
    };
  };

  const existing = await readMatches();
  if (!Array.isArray(existing)) throw new Error(`${label} preflight did not return a record list.`);
  if (existing.length) {
    return {
      record: canonicalRecord(existing),
      status: 'reused',
      duplicates_removed: 0,
    };
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  let afterCreate = [];
  let verifyError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      afterCreate = await readMatches();
      verifyError = null;
      if (Array.isArray(afterCreate) && afterCreate.length) break;
    } catch (error) {
      verifyError = error;
    }
  }

  if (Array.isArray(afterCreate) && afterCreate.length) {
    return converge(afterCreate, created?.id || '');
  }

  if (createError) throw createError;
  if (verifyError) throw verifyError;

  if (created?.id) {
    const direct = await entity.get(created.id).catch(() => null);
    if (direct?.id) {
      throw new Error(`${label} created a row but the canonical queue query could not see it yet. Do not retry blindly; allow the next queue scan to reconcile it.`);
    }
  }

  throw new Error(`${label} could not verify whether a Pending Import was created.`);
}
