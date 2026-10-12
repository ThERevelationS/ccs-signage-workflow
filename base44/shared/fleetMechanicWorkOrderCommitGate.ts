import { buildMechanicRecoveryPatch, mechanicGrantAllowsMutation } from './fleetMechanicMutationRecovery.ts';

const deny = (detail:string) => {
  const error:any = new Error(`Fleet mechanic update was blocked before the work-order write: ${detail}. Review the receipt and current work order before retrying.`);
  error.code = 'FLEET_RECORD_CONFLICT';
  return error;
};

function validReusedPhotoSource(source:any, receipt:any, grantId:string, workOrderId:string, requestId:string, expectedUpdatedAt:string) {
  const sourceSummary = source?.result_summary || {};
  const sourceUrls = sourceSummary.uploaded_photo_urls;
  const retryUrls = receipt?.result_summary?.uploaded_photo_urls;
  return source?.status === 'started' &&
    source.operation_type === 'mechanic_progress_save' &&
    source.target_entity === 'FleetMaintenanceWorkOrder' &&
    String(source.target_id || '') === workOrderId &&
    String(source.actor_user_id || '') === grantId &&
    String(source.payload_fingerprint || '') === String(receipt?.payload_fingerprint || '') &&
    String(sourceSummary.grant_id || '') === grantId &&
    sourceSummary.action === 'save' &&
    String(sourceSummary.expected_updated_date || '') === expectedUpdatedAt &&
    String(sourceSummary.retry_reserved_by_request_id || '') === requestId &&
    Array.isArray(sourceUrls) && Array.isArray(retryUrls) &&
    sourceUrls.length <= retryUrls.length &&
    sourceUrls.every((url:any,index:number)=>url === retryUrls[index]);
}

export async function verifyFleetMechanicWorkOrderCommit({
  Access, Receipt, workOrder, patch, expectedUpdatedAt, nowMs,
}: {
  Access:any; Receipt:any; workOrder:any; patch:Record<string,any>;
  expectedUpdatedAt:string; nowMs?:number;
}) {
  const markerFields = ['mechanic_operation_key','mechanic_operation_fingerprint','mechanic_operation_applied_at'];
  if (!markerFields.some(field=>Object.prototype.hasOwnProperty.call(patch,field))) return;

  const key = String(patch.mechanic_operation_key || '');
  const match = /^mechanic:([^:]+):([^:]+):(start|save):([A-Za-z0-9_-]{16,120})$/.exec(key);
  if (!match || !String(patch.mechanic_operation_fingerprint || '') ||
      !Number.isFinite(Date.parse(String(patch.mechanic_operation_applied_at || '')))) {
    throw deny('the operation marker is invalid');
  }
  const [,grantId,workOrderId,action,requestId] = match;
  if (workOrderId !== String(workOrder?.id || '') ||
      !String(expectedUpdatedAt || '') ||
      String(workOrder?.updated_date || '') !== String(expectedUpdatedAt || '') ||
      !['open','assigned','in_progress'].includes(String(workOrder?.status || ''))) {
    throw deny('the work order identity, version, or active status changed');
  }
  const rows = await Receipt.filter({operation_key:key});
  if (!Array.isArray(rows) || rows.length !== 1) throw deny('the receipt is missing or ambiguous');
  const receipt = rows[0];
  const summary = receipt?.result_summary || {};
  if (receipt?.status !== 'started' ||
      receipt?.operation_type !== (action === 'start' ? 'mechanic_start' : 'mechanic_progress_save') ||
      receipt?.target_entity !== 'FleetMaintenanceWorkOrder' ||
      String(receipt?.target_id || '') !== workOrderId ||
      String(receipt?.actor_user_id || '') !== grantId ||
      String(receipt?.payload_fingerprint || '') !== String(patch.mechanic_operation_fingerprint || '') ||
      String(summary.grant_id || '') !== grantId ||
      String(summary.action || '') !== action ||
      String(summary.request_id || '') !== requestId ||
      String(summary.expected_updated_date || '') !== String(expectedUpdatedAt || '')) {
    throw deny('the durable receipt is no longer authorized for this operation');
  }

  if (action === 'save' && summary.retry_reservation_required === true) {
    const sourceId = String(summary.reused_upload_receipt_id || '');
    const source = sourceId ? await Receipt.get(sourceId).catch(()=>null) : null;
    if (!validReusedPhotoSource(source,receipt,grantId,workOrderId,requestId,String(expectedUpdatedAt || ''))) {
      throw deny('the reused-photo reservation is no longer owned by this request');
    }
  }

  const recovery = buildMechanicRecoveryPatch(workOrder,receipt,String(patch.mechanic_operation_applied_at));
  if (recovery.recoverable !== true) throw deny('the saved mutation plan or photo evidence is incomplete');
  const planned = recovery.patch;
  const actualFields = Object.keys(patch).sort();
  const plannedFields = Object.keys(planned).sort();
  if (JSON.stringify(actualFields) !== JSON.stringify(plannedFields) ||
      plannedFields.some(field=>JSON.stringify(patch[field]) !== JSON.stringify(planned[field]))) {
    throw deny('the requested work-order fields differ from the durable mechanic plan');
  }

  // An admin can cancel the receipt while the grant read is in flight. Verify
  // the durable receipt and recovery plan again after that asynchronous read.
  // This narrows the window, but does not make two entities transactional.
  const grant = await Access.get(grantId).catch(()=>null);
  const permission = mechanicGrantAllowsMutation(grant,action,String(workOrder.equipment_id || ''),nowMs ?? Date.now());
  if (!permission.allowed) throw deny(`the mechanic link is ${permission.reason || 'not authorized'}`);

  const finalReceipt = await Receipt.get(receipt.id).catch(()=>null);
  const finalSummary = finalReceipt?.result_summary || {};
  if (!finalReceipt || finalReceipt.status !== 'started' ||
      String(finalReceipt.operation_key || '') !== key ||
      String(finalReceipt.payload_fingerprint || '') !== String(patch.mechanic_operation_fingerprint || '') ||
      String(finalReceipt.actor_user_id || '') !== grantId ||
      finalReceipt.operation_type !== receipt.operation_type ||
      finalReceipt.target_entity !== receipt.target_entity ||
      String(finalReceipt.target_id || '') !== workOrderId ||
      String(finalSummary.grant_id || '') !== grantId ||
      String(finalSummary.request_id || '') !== requestId ||
      String(finalSummary.action || '') !== action ||
      String(finalSummary.expected_updated_date || '') !== String(expectedUpdatedAt || '') ||
      finalSummary.retry_reservation_required !== summary.retry_reservation_required ||
      String(finalSummary.reused_upload_receipt_id || '') !== String(summary.reused_upload_receipt_id || '') ||
      finalSummary.photo_count !== summary.photo_count) {
    throw deny('the mechanic receipt changed during authorization');
  }
  const finalRecovery = buildMechanicRecoveryPatch(workOrder,finalReceipt,String(patch.mechanic_operation_applied_at));
  if (!finalRecovery.recoverable ||
      JSON.stringify(Object.keys(finalRecovery.patch).sort()) !== JSON.stringify(actualFields) ||
      actualFields.some(field=>JSON.stringify(patch[field]) !== JSON.stringify(finalRecovery.patch[field]))) {
    throw deny('the mechanic mutation plan or photo evidence changed during authorization');
  }
  if (action === 'save' && finalSummary.retry_reservation_required === true) {
    const source = await Receipt.get(String(finalSummary.reused_upload_receipt_id || '')).catch(()=>null);
    if (!validReusedPhotoSource(source,finalReceipt,grantId,workOrderId,requestId,String(expectedUpdatedAt || ''))) {
      throw deny('the photo reservation changed during authorization');
    }
  }
  // Keep the grant read last after the receipt/source rechecks. Revocation
  // after this read and before WorkOrder.updateMany remains a cross-entity gap.
  const finalGrant = await Access.get(grantId).catch(()=>null);
  const finalPermission = mechanicGrantAllowsMutation(finalGrant,action,String(workOrder.equipment_id || ''),nowMs ?? Date.now());
  if (!finalPermission.allowed) throw deny(`the mechanic link changed to ${finalPermission.reason || 'not authorized'}`);
}
