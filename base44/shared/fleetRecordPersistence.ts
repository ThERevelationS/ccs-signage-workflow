export class FleetRecordConflictError extends Error {
  code = 'FLEET_RECORD_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'FleetRecordConflictError';
  }
}

export async function updateFleetRecordIfCurrent({
  entity,
  id,
  expectedUpdatedAt,
  patch,
  label = 'Fleet record',
}: {
  entity: any;
  id: string;
  expectedUpdatedAt: string;
  patch: Record<string, any>;
  label?: string;
}) {
  const recordId = String(id || '').trim();
  const expected = String(expectedUpdatedAt || '').trim();
  if (!recordId || !expected || !patch || typeof patch !== 'object' || Array.isArray(patch) || typeof entity?.updateMany !== 'function' || typeof entity?.get !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }

  const result = await entity.updateMany(
    { id: recordId, updated_date: expected },
    { $set: patch },
  );
  if (!result || typeof result.updated !== 'number') {
    throw new Error(`${label} update result could not be verified.`);
  }
  if (result.updated > 1) {
    throw new Error(`${label} returned an impossible multi-record update count.`);
  }
  if (result.updated === 0) {
    throw new FleetRecordConflictError(`${label} changed after it was opened. Reload it and reapply your edit; newer data was not overwritten.`);
  }
  const saved = await entity.get(recordId);
  if (!saved?.id) throw new Error(`${label} was updated but could not be re-read.`);
  return saved;
}

export async function deleteFleetRecordIfCurrent({
  entity,
  id,
  expectedUpdatedAt,
  label = 'Fleet record',
}: {
  entity: any;
  id: string;
  expectedUpdatedAt: string;
  label?: string;
}) {
  const recordId = String(id || '').trim();
  const expected = String(expectedUpdatedAt || '').trim();
  if (!recordId || !expected || typeof entity?.deleteMany !== 'function' || typeof entity?.get !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe delete.`);
  }

  const result = await entity.deleteMany({ id: recordId, updated_date: expected });
  if (!result || typeof result.deleted !== 'number') {
    throw new Error(`${label} delete result could not be verified.`);
  }
  if (result.deleted > 1) {
    throw new Error(`${label} returned an impossible multi-record delete count.`);
  }
  if (result.deleted === 0) {
    const current = await entity.get(recordId).catch(() => null);
    if (!current) return { deleted: true, reused: true };
    throw new FleetRecordConflictError(`${label} changed after the delete confirmation opened. Reload it before deleting; newer data was preserved.`);
  }
  return { deleted: true, reused: false };
}
