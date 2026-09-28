import { deleteFleetRecordIfCurrent, FleetRecordConflictError } from './fleetRecordPersistence.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))[0] || null;
const text = (value: unknown) => String(value ?? '').trim();

const comparable = (row: any) => ({
  name: text(row?.name),
  enabled: row?.enabled !== false,
  minimum_amount: Number(row?.minimum_amount || 0),
  maximum_amount: Number(row?.maximum_amount || 0),
  approval_tier: text(row?.approval_tier || row?.name),
  approval_required: row?.approval_required !== false,
  approver_role: text(row?.approver_role || 'admin'),
  notes: text(row?.notes),
  sort_order: Number(row?.sort_order || 0),
});
const samePolicy = (row: any, desired: any) => JSON.stringify(comparable(row)) === JSON.stringify(comparable(desired));

export async function acquireRepairApprovalPolicyCreateGate({
  gateEntity,
  creationKey,
  payloadFingerprint,
  attempts = 20,
  waitMs = 25,
}: {
  gateEntity: any;
  creationKey: string;
  payloadFingerprint: string;
  attempts?: number;
  waitMs?: number;
}) {
  const key = text(creationKey);
  const fingerprint = text(payloadFingerprint);
  if (!key || !fingerprint || typeof gateEntity?.filter !== 'function' || typeof gateEntity?.get !== 'function' || typeof gateEntity?.updateMany !== 'function') {
    throw new Error('Fleet repair approval policy create gate could not initialize safely.');
  }
  const gates = await gateEntity.filter({ scope: 'fleet_repair_approval_policy' });
  if (!Array.isArray(gates) || gates.length !== 1) {
    throw new FleetRecordConflictError('Fleet repair approval policy creation coordinator is missing or ambiguous. Provision exactly one idle coordinator before creating thresholds.');
  }
  const id = text(gates[0]?.id);
  if (!id) throw new Error('Fleet repair approval policy creation coordinator has no record identity.');
  const claimToken = crypto.randomUUID();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await gateEntity.get(id).catch(() => null);
    if (!current?.id) throw new FleetRecordConflictError('Fleet repair approval policy creation coordinator disappeared. Admin review is required.');
    const status = text(current.status);
    if (status === 'creating') {
      if (text(current.creation_key) === key && text(current.payload_fingerprint) && text(current.payload_fingerprint) !== fingerprint) {
        throw new FleetRecordConflictError('This approval-policy create identity is already in progress with different threshold details. Reopen Add Threshold before trying again.');
      }
      if (attempt + 1 >= attempts) {
        throw new FleetRecordConflictError('Another Fleet repair approval policy creation is still in progress. Check current policy status before retrying.');
      }
      await sleep(waitMs);
      continue;
    }
    if (status !== 'idle') {
      throw new FleetRecordConflictError('Fleet repair approval policy creation coordinator has an invalid state. Admin review is required.');
    }
    const claimed = await gateEntity.updateMany(
      { id, updated_date: current.updated_date, status: 'idle' },
      { $set: {
        status: 'creating',
        creation_key: key,
        payload_fingerprint: fingerprint,
        claim_token: claimToken,
        started_at: new Date().toISOString(),
      } },
    );
    if (!claimed || typeof claimed.updated !== 'number') throw new Error('Fleet repair approval policy create gate claim could not be verified.');
    if (claimed.updated > 1) throw new Error('Fleet repair approval policy create gate returned an impossible multi-record claim.');
    if (claimed.updated === 1) return { id, claim_token: claimToken };
    if (attempt + 1 < attempts) await sleep(waitMs);
  }
  throw new FleetRecordConflictError('Fleet repair approval policy creation coordinator could not be acquired safely.');
}

export async function releaseRepairApprovalPolicyCreateGate({ gateEntity, gate }: { gateEntity: any; gate: any }) {
  const id = text(gate?.id);
  const claimToken = text(gate?.claim_token);
  if (!id || !claimToken || typeof gateEntity?.updateMany !== 'function' || typeof gateEntity?.get !== 'function') {
    throw new Error('Fleet repair approval policy create gate release could not initialize safely.');
  }
  const released = await gateEntity.updateMany(
    { id, status: 'creating', claim_token: claimToken },
    { $set: { status: 'idle', creation_key: '', payload_fingerprint: '', claim_token: '' } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Fleet repair approval policy create gate release could not be verified.');
  if (released.updated > 1) throw new Error('Fleet repair approval policy create gate returned an impossible multi-record release.');
  if (released.updated === 1) return true;
  const current = await gateEntity.get(id).catch(() => null);
  if (current?.status === 'idle') return true;
  throw new FleetRecordConflictError('Fleet repair approval policy creation coordinator could not be released. Admin review is required before another create.');
}

async function reconcilePolicyIdentity({
  policyEntity,
  creationKey,
  desired,
  created,
}: {
  policyEntity: any;
  creationKey: string;
  desired: any;
  created?: any;
}) {
  const rows = await policyEntity.filter({ creation_key: creationKey });
  if (!Array.isArray(rows)) throw new Error('Fleet repair approval policy create identity could not be re-read.');
  if (!rows.length) return null;

  const mismatched = rows.filter(row => !samePolicy(row, desired));
  if (mismatched.length) {
    if (created?.id && rows.some(row => row.id === created.id) && rows.some(row => row.id !== created.id)) {
      await deleteFleetRecordIfCurrent({
        entity: policyEntity,
        id: created.id,
        expectedUpdatedAt: created.updated_date,
        label: 'Concurrent Fleet repair approval policy duplicate',
      });
    }
    throw new FleetRecordConflictError('This approval-policy create identity belongs to different threshold details. Current records were preserved for review.');
  }

  const winner = canonical(rows);
  if (!winner?.id) throw new Error('Fleet repair approval policy create identity has no canonical record.');
  for (const duplicate of rows) {
    if (duplicate.id === winner.id) continue;
    await deleteFleetRecordIfCurrent({
      entity: policyEntity,
      id: duplicate.id,
      expectedUpdatedAt: duplicate.updated_date,
      label: 'Duplicate Fleet repair approval policy',
    });
  }

  const finalRows = await policyEntity.filter({ creation_key: creationKey });
  if (!Array.isArray(finalRows) || finalRows.length !== 1 || !samePolicy(finalRows[0], desired)) {
    throw new FleetRecordConflictError('Fleet repair approval policy create identity could not converge to one unchanged threshold. Review duplicates before retrying.');
  }
  return finalRows[0];
}

export async function createFleetRepairApprovalPolicySafely({
  policyEntity,
  gateEntity,
  creationKey,
  desired,
  gateAttempts = 20,
  gateWaitMs = 25,
}: {
  policyEntity: any;
  gateEntity: any;
  creationKey: string;
  desired: any;
  gateAttempts?: number;
  gateWaitMs?: number;
}) {
  const key = text(creationKey);
  if (!key || typeof policyEntity?.filter !== 'function' || typeof policyEntity?.create !== 'function') {
    throw new Error('Fleet repair approval policy creation could not initialize safely.');
  }
  const fingerprint = JSON.stringify(comparable(desired));
  const gate = await acquireRepairApprovalPolicyCreateGate({
    gateEntity,
    creationKey: key,
    payloadFingerprint: fingerprint,
    attempts: gateAttempts,
    waitMs: gateWaitMs,
  });
  try {
    const existing = await reconcilePolicyIdentity({ policyEntity, creationKey: key, desired });
    if (existing) return { policy: existing, reused: true };

    const created = await policyEntity.create({ ...desired, creation_key: key });
    if (!created?.id || !created?.updated_date) throw new Error('Fleet repair approval policy was created but its persisted identity/version could not be verified.');
    const resolved = await reconcilePolicyIdentity({ policyEntity, creationKey: key, desired, created });
    if (!resolved) throw new Error('Fleet repair approval policy was created but could not be re-read by its creation identity.');
    return { policy: resolved, reused: resolved.id !== created.id };
  } finally {
    await releaseRepairApprovalPolicyCreateGate({ gateEntity, gate });
  }
}
