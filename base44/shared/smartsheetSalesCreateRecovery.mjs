import { salesSnapshotsEqual } from './smartsheetSalesSafety.mjs';
import { classifySalesCreateReview } from './smartsheetSalesCreateReview.mjs';

const value = x => String(x ?? '').trim();
const numberId = x => /^\d+$/.test(value(x)) && value(x) !== '0';

// Administrator-only caller authenticates the actor and supplies exact,
// verified Smartsheet reads. This function NEVER sends a Smartsheet write.
// The durable recovery attribution is part of the WorkOrder's CAS, even if
// separate user-visible CellHistory persistence subsequently fails.
export async function recoverVerifiedSalesCreateLink({
  entity, historyEntity, workorderId, sheetId, rowId, expectedVersion,
  expectedAttemptId, bindings, readRemoteSnapshot, readCompetingClaims, actor,
  assertRunOwnership, recoveredAt,
}) {
  const fail = message => { throw new Error(message); };
  if (!entity?.get || !entity?.updateMany || !historyEntity?.create || !historyEntity?.get ||
      !readRemoteSnapshot || !readCompetingClaims || typeof assertRunOwnership !== 'function' || !value(workorderId) ||
      !numberId(sheetId) || !numberId(rowId) || !value(expectedVersion) ||
      !value(expectedAttemptId) || !value(actor?.email)) {
    fail('Sales manual recovery requires an authenticated actor and exact versioned permanent identities.');
  }
  await assertRunOwnership();
  const current = await entity.get(value(workorderId));
  if (!current || current.deleted || current.updated_date !== expectedVersion ||
      current.smartsheet_create_attempt?.attempt_id !== expectedAttemptId) {
    fail('Sales WorkOrder or create attempt changed since review. Reload the read-only preflight.');
  }
  // These checks run freshly on the action, not against a saved client preview.
  await assertRunOwnership();
  const claims = await readCompetingClaims();
  if (!claims || !Array.isArray(claims.linked) || !Array.isArray(claims.attempts)) {
    fail('Sales permanent-row ownership could not be completely verified. No recovery was committed.');
  }
  const remote = await readRemoteSnapshot();
  const review = classifySalesCreateReview({
    record: current, sheetId, rowId, bindings,
    remoteSnapshot: remote?.snapshot,
    remoteVerified: remote?.verified === true,
    otherLinkedRecords: claims?.linked,
    otherAttempts: claims?.attempts,
  });
  if (review.classification !== 'verified_candidate' ||
      review.attempt_id !== expectedAttemptId || review.workorder_version !== expectedVersion) {
    fail('Sales create candidate is no longer independently verified (' +
      review.classification + '). No recovery was committed.');
  }
  // Do not mark newer unsynchronized local business edits as synced.
  const snapshot = current.smartsheet_create_attempt.expected_snapshot;
  const local = remote?.localSnapshot;
  if (!local || !salesSnapshotsEqual(snapshot,local,value(bindings.current_task_assigned_to))) {
    fail('Sales fields changed since creation. Preserve local edits; manual recovery is not eligible.');
  }
  await assertRunOwnership();
  const latest = await entity.get(value(workorderId));
  if (!latest || latest.deleted || latest.updated_date !== expectedVersion ||
      latest.smartsheet_create_attempt?.attempt_id !== expectedAttemptId ||
      latest.smartsheet_create_attempt?.status !== 'created_unlinked' ||
      value(latest.smartsheet_create_attempt?.row_id) !== value(rowId) ||
      value(latest.smartsheet_row_id)) {
    fail('WorkOrder changed during recovery checks; refresh and review before proceeding.');
  }
  // A final read narrows (but cannot eliminate) the nontransactional
  // cross-record race. No row ownership is ever inferred from similar values.
  await assertRunOwnership();
  const finalClaims = await readCompetingClaims();
  if (!finalClaims || !Array.isArray(finalClaims.linked) ||
      !Array.isArray(finalClaims.attempts)) {
    fail('Sales permanent-row ownership could not be completely verified immediately before recovery. No link was committed.');
  }
  if ([...finalClaims.linked, ...finalClaims.attempts].some(r =>
      !value(r?.id) || value(r.id) !== value(workorderId))) {
    fail('Another WorkOrder claims this permanent Smartsheet row. No recovery was committed.');
  }
  const at = recoveredAt || new Date().toISOString();
  const nextMarker = {
    ...latest.smartsheet_create_attempt,
    status:'linked', linked_at:at,
    manual_recovery:{
      recovered_at:at, recovered_by_email:value(actor.email),
      reviewed_updated_date:expectedVersion, confirmed_row_id:value(rowId),
      attempt_id:expectedAttemptId,
    },
  };
  // All coordinated Smartsheet mutations share one run coordinator. Losing
  // its ownership immediately before CAS stops this recovery from competing
  // with a newer sync. This is not a global WorkOrder uniqueness constraint.
  await assertRunOwnership();
  const changed = await entity.updateMany(
    {id:value(workorderId),updated_date:expectedVersion},
    {$set:{
      smartsheet_sheet_id:value(sheetId),smartsheet_row_id:value(rowId),
      smartsheet_sync_snapshot:snapshot,smartsheet_last_synced_at:at,
      smartsheet_create_attempt:nextMarker,
    }},
  );
  if (changed?.updated !== 1) {
    fail('Sales recovery failed its final WorkOrder version CAS. Reload; no link was claimed.');
  }
  await assertRunOwnership();
  const persisted = await entity.get(value(workorderId));
  if (value(persisted?.smartsheet_sheet_id) !== value(sheetId) ||
      value(persisted?.smartsheet_row_id) !== value(rowId) ||
      persisted?.smartsheet_create_attempt?.status !== 'linked' ||
      persisted?.smartsheet_create_attempt?.attempt_id !== expectedAttemptId ||
      persisted?.smartsheet_create_attempt?.manual_recovery?.recovered_by_email !== value(actor.email) ||
      persisted?.smartsheet_last_synced_at !== at ||
      !salesSnapshotsEqual(snapshot,persisted?.smartsheet_sync_snapshot,value(bindings.current_task_assigned_to))) {
    fail('Sales permanent link was submitted but cannot be read back. Inspect the original WorkOrder before any retry.');
  }
  // Regular-user provenance: record ONLY the verified link (not private
  // mapped cells or pricing). WorkOrder marker above preserves attribution
  // even if CellHistory is temporarily unavailable.
  let event;
  try {
    event = await historyEntity.create({
      entity_type:'WorkOrder',entity_id:value(workorderId),
      field_name:'smartsheet_row_id',old_value:'',
      new_value:value(rowId),changed_by_email:value(actor.email),
      changed_by_name:value(actor.full_name)||value(actor.email),
    });
    if (!event?.id) throw new Error('History acknowledgement lacked an event ID.');
    const history = await historyEntity.get(event.id);
    if (!history || value(history.entity_id) !== value(workorderId) ||
        value(history.field_name) !== 'smartsheet_row_id' ||
        value(history.new_value) !== value(rowId) ||
        value(history.changed_by_email) !== value(actor.email)) {
      throw new Error('History event could not be independently verified.');
    }
  } catch {
    fail('Sales link is verified on the WorkOrder, but its CellHistory event was not verified. Review the linked record and history; do not retry the link.');
  }
  return {workorder_id:value(workorderId),sheet_id:value(sheetId),row_id:value(rowId),
    recovered:true,remote_writes_attempted:false,history_verified:true,
    history_id:value(event.id),reviewed_workorder_version:expectedVersion};
}
