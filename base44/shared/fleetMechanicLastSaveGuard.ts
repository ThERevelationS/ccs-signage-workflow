// Recognize only the latest durably applied, unchanged Save Progress mutation.
// A fresh request id after a tab closes must not append an identical note/photo twice.
export function isIdenticalLastAppliedMechanicSave(
  workOrder: any,
  receipt: any,
  grantId: string,
  workOrderId: string,
  payloadFingerprint: string,
): boolean {
  const key = String(workOrder?.mechanic_operation_key || '');
  const expectedPrefix = `mechanic:${grantId}:${workOrderId}:save:`;
  const version = String(workOrder?.updated_date || '');
  if (!key.startsWith(expectedPrefix) || !version || !payloadFingerprint) return false;
  return String(workOrder?.mechanic_operation_fingerprint || '') === payloadFingerprint &&
    receipt?.status === 'applied' &&
    receipt?.operation_type === 'mechanic_progress_save' &&
    receipt?.target_entity === 'FleetMaintenanceWorkOrder' &&
    String(receipt?.target_id || '') === workOrderId &&
    String(receipt?.operation_key || '') === key &&
    String(receipt?.payload_fingerprint || '') === payloadFingerprint &&
    String(receipt?.result_summary?.grant_id || '') === grantId &&
    String(receipt?.result_summary?.work_order_updated_date || '') === version;
}
