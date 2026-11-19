import { deleteFleetRecordIfCurrent, FleetRecordConflictError } from './fleetRecordPersistence.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const norm = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const parts = (lines: any) => Array.isArray(lines) ? lines.map((line: any) => ({
  description: norm(line?.description),
  quantity: number(line?.quantity),
  estimated_cost: number(line?.estimated_cost),
})) : [];
const fluids = (lines: any) => Array.isArray(lines) ? lines.map((line: any) => ({
  description: norm(line?.description),
  quantity: number(line?.quantity),
  unit: norm(line?.unit),
  estimated_cost: number(line?.estimated_cost),
})) : [];

const comparable = (row: any) => ({
  work_order_id: norm(row?.work_order_id),
  equipment_id: norm(row?.equipment_id),
  estimated_labor_hours: number(row?.estimated_labor_hours),
  labor_rate: number(row?.labor_rate),
  estimated_parts_total: number(row?.estimated_parts_total),
  estimated_fluids_total: number(row?.estimated_fluids_total),
  misc_total: number(row?.misc_total),
  estimated_total: number(row?.estimated_total),
  estimated_completion_date: norm(row?.estimated_completion_date),
  parts_estimate: parts(row?.parts_estimate),
  fluids_estimate: fluids(row?.fluids_estimate),
  notes: norm(row?.notes),
  status: norm(row?.status || 'draft'),
  approval_required: row?.approval_required === true,
  approval_tier: norm(row?.approval_tier),
  estimate_source: norm(row?.estimate_source || 'ccs_admin'),
  mechanic_name: norm(row?.mechanic_name),
  mechanic_access_id: norm(row?.mechanic_access_id),
});
const sameEstimate = (row: any, desired: any) => JSON.stringify(comparable(row)) === JSON.stringify(comparable(desired));

export async function acquireFleetRepairEstimateCreateGate({
  gateEntity,
  workOrderId,
  creationKey,
  ownerSource,
  ownerKey,
  payloadFingerprint,
  attempts = 40,
  waitMs = 25,
}: {
  gateEntity: any;
  workOrderId: string;
  creationKey: string;
  ownerSource: string;
  ownerKey: string;
  payloadFingerprint: string;
  attempts?: number;
  waitMs?: number;
}) {
  const workOrder = norm(workOrderId);
  const key = norm(creationKey);
  const source = norm(ownerSource);
  const owner = norm(ownerKey);
  const fingerprint = norm(payloadFingerprint);
  if (!workOrder || !key || !source || !fingerprint ||
      typeof gateEntity?.filter !== 'function' ||
      typeof gateEntity?.get !== 'function' ||
      typeof gateEntity?.updateMany !== 'function') {
    throw new Error('Fleet repair estimate create gate could not initialize safely.');
  }

  const gates = await gateEntity.filter({ scope: 'fleet_repair_estimate' });
  if (!Array.isArray(gates) || gates.length !== 1) {
    throw new FleetRecordConflictError('Fleet repair estimate creation coordinator is missing or ambiguous. Provision exactly one idle coordinator before creating repair estimates.');
  }
  const id = norm(gates[0]?.id);
  if (!id) throw new Error('Fleet repair estimate creation coordinator has no record identity.');
  const claimToken = crypto.randomUUID();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await gateEntity.get(id).catch(() => null);
    if (!current?.id) throw new FleetRecordConflictError('Fleet repair estimate creation coordinator disappeared. Admin review is required.');
    const status = norm(current.status);
    if (status === 'creating') {
      const sameWorkOrder = norm(current.work_order_id) === workOrder;
      if (sameWorkOrder && norm(current.payload_fingerprint) && norm(current.payload_fingerprint) !== fingerprint) {
        throw new FleetRecordConflictError('Another first repair-estimate save is in progress for this work order with different details or ownership. Refresh before retrying.');
      }
      if (attempt + 1 >= attempts) {
        throw new FleetRecordConflictError('Another Fleet repair estimate creation is still in progress. Check the current estimate before retrying.');
      }
      await sleep(waitMs);
      continue;
    }
    if (status !== 'idle') {
      throw new FleetRecordConflictError('Fleet repair estimate creation coordinator has an invalid state. Admin review is required.');
    }

    const claimed = await gateEntity.updateMany(
      { id, updated_date: current.updated_date, status: 'idle' },
      { $set: {
        status: 'creating',
        work_order_id: workOrder,
        creation_key: key,
        owner_source: source,
        owner_key: owner,
        payload_fingerprint: fingerprint,
        claim_token: claimToken,
        started_at: new Date().toISOString(),
      } },
    );
    if (!claimed || typeof claimed.updated !== 'number') throw new Error('Fleet repair estimate create gate claim could not be verified.');
    if (claimed.updated > 1) throw new Error('Fleet repair estimate create gate returned an impossible multi-record claim.');
    if (claimed.updated === 1) return { id, claim_token: claimToken };
    if (attempt + 1 < attempts) await sleep(waitMs);
  }

  throw new FleetRecordConflictError('Fleet repair estimate creation coordinator could not be acquired safely.');
}

export async function releaseFleetRepairEstimateCreateGate({ gateEntity, gate }: { gateEntity: any; gate: any }) {
  const id = norm(gate?.id);
  const claimToken = norm(gate?.claim_token);
  if (!id || !claimToken || typeof gateEntity?.updateMany !== 'function' || typeof gateEntity?.get !== 'function') {
    throw new Error('Fleet repair estimate create gate release could not initialize safely.');
  }
  const released = await gateEntity.updateMany(
    { id, status: 'creating', claim_token: claimToken },
    { $set: {
      status: 'idle',
      work_order_id: '',
      creation_key: '',
      owner_source: 'ccs_admin',
      owner_key: '',
      payload_fingerprint: '',
      claim_token: '',
    } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Fleet repair estimate create gate release could not be verified.');
  if (released.updated > 1) throw new Error('Fleet repair estimate create gate returned an impossible multi-record release.');
  if (released.updated === 1) return true;
  const current = await gateEntity.get(id).catch(() => null);
  if (current?.status === 'idle') return true;
  throw new FleetRecordConflictError('Fleet repair estimate creation coordinator could not be released. Admin review is required before another first estimate save.');
}

export async function createFleetRepairEstimateSafely({
  estimateEntity,
  gateEntity,
  workOrderId,
  creationKey,
  desired,
  ownerSource,
  ownerKey = '',
  beforeCreate = null,
  gateAttempts = 40,
  gateWaitMs = 25,
}: {
  estimateEntity: any;
  gateEntity: any;
  workOrderId: string;
  creationKey: string;
  desired: any;
  ownerSource: 'ccs_admin' | 'mechanic_portal';
  ownerKey?: string;
  beforeCreate?: (() => Promise<unknown> | unknown) | null;
  gateAttempts?: number;
  gateWaitMs?: number;
}) {
  const workOrder = norm(workOrderId);
  const key = norm(creationKey);
  const source = norm(ownerSource);
  const owner = norm(ownerKey);
  if (!workOrder || !key || !source ||
      typeof estimateEntity?.filter !== 'function' ||
      typeof estimateEntity?.create !== 'function') {
    throw new Error('Fleet repair estimate creation could not initialize safely.');
  }

  const record = {
    ...desired,
    work_order_id: workOrder,
    status: 'draft',
    estimate_source: source,
    mechanic_access_id: source === 'mechanic_portal' ? owner : '',
    creation_key: key,
  };
  const fingerprint = JSON.stringify(comparable(record));
  const gate = await acquireFleetRepairEstimateCreateGate({
    gateEntity,
    workOrderId: workOrder,
    creationKey: key,
    ownerSource: source,
    ownerKey: owner,
    payloadFingerprint: fingerprint,
    attempts: gateAttempts,
    waitMs: gateWaitMs,
  });

  try {
    const existingRows = await estimateEntity.filter({ work_order_id: workOrder });
    if (!Array.isArray(existingRows)) throw new Error('Fleet repair estimates could not be re-read before creation.');
    if (existingRows.length > 1) {
      throw new FleetRecordConflictError('Multiple Fleet repair estimates already exist for this work order. Existing records were preserved; CCS must review them before another save.');
    }
    if (existingRows[0]) {
      const existing = existingRows[0];
      if (norm(existing.creation_key) === key && sameEstimate(existing, record)) {
        return { estimate: existing, reused: true };
      }
      throw new FleetRecordConflictError('A Fleet repair estimate already exists for this work order with different details or ownership. Reload the current estimate before making another change.');
    }

    if (beforeCreate) await beforeCreate();
    const created = await estimateEntity.create(record);
    if (!created?.id || !created?.updated_date) {
      throw new Error('Fleet repair estimate was created but its persisted identity/version could not be verified.');
    }

    const contenders = await estimateEntity.filter({ work_order_id: workOrder });
    if (!Array.isArray(contenders)) throw new Error('Fleet repair estimate creation could not be re-read.');
    if (contenders.length === 1 && contenders[0]?.id === created.id && sameEstimate(contenders[0], record)) {
      return { estimate: contenders[0], reused: false };
    }

    // A bypassing/older writer raced this new gate. Never delete the other row:
    // discard only this function's own just-created row, and only at its exact
    // persisted version. If that row changed, preserve it and fail closed.
    if (contenders.length > 1 && contenders.some(row => row.id === created.id)) {
      await deleteFleetRecordIfCurrent({
        entity: estimateEntity,
        id: created.id,
        expectedUpdatedAt: created.updated_date,
        label: 'Losing concurrent Fleet repair estimate',
      });
      const survivors = await estimateEntity.filter({ work_order_id: workOrder });
      if (!Array.isArray(survivors)) throw new Error('Fleet repair estimate race recovery could not be verified.');
      if (survivors.length === 1 &&
          norm(survivors[0]?.creation_key) === key &&
          sameEstimate(survivors[0], record)) {
        return { estimate: survivors[0], reused: true };
      }
      throw new FleetRecordConflictError('Another repair estimate was created at the same time. This function discarded only its unchanged losing draft; refresh and review the surviving estimate before continuing.');
    }

    throw new FleetRecordConflictError('Fleet repair estimate creation did not converge to exactly one verified draft. Existing records were preserved for CCS review.');
  } finally {
    await releaseFleetRepairEstimateCreateGate({ gateEntity, gate });
  }
}
