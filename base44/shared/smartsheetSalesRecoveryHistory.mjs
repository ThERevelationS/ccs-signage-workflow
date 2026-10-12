const str = x => String(x ?? '').trim();
const numberId = x => /^\d+$/.test(str(x)) && str(x) !== '0';

function recoveredIdentity(record) {
  const marker = record?.smartsheet_create_attempt;
  const recovery = marker?.manual_recovery;
  if (!record?.id || record.deleted || marker?.status !== 'linked' || !recovery ||
      !str(record.updated_date) || !str(marker.attempt_id) ||
      !numberId(record.smartsheet_sheet_id) ||
      !numberId(record.smartsheet_row_id) ||
      str(marker.sheet_id) !== str(record.smartsheet_sheet_id) ||
      str(marker.row_id) !== str(record.smartsheet_row_id) ||
      str(recovery.attempt_id) !== str(marker.attempt_id) ||
      str(recovery.confirmed_row_id) !== str(record.smartsheet_row_id) ||
      !str(recovery.recovered_by_email) || !str(recovery.recovered_at)) {
    throw new Error('WorkOrder does not have one verified manual Sales create recovery identity.');
  }
  return {marker,recovery};
}

function matchesRecoveryHistory(record, event) {
  const {recovery} = recoveredIdentity(record);
  const eventTime = Date.parse(str(event?.created_date));
  const recoveryTime = Date.parse(str(recovery.recovered_at));
  return str(event?.entity_type) === 'WorkOrder' &&
    str(event?.entity_id) === str(record.id) &&
    str(event?.field_name) === 'smartsheet_row_id' &&
    str(event?.old_value) === '' &&
    str(event?.new_value) === str(record.smartsheet_row_id) &&
    str(event?.changed_by_email).toLowerCase() === str(recovery.recovered_by_email).toLowerCase() &&
    Number.isFinite(eventTime) && Number.isFinite(recoveryTime) &&
    eventTime >= recoveryTime;
}

export function classifySalesRecoveryHistory(record, events = []) {
  const {marker,recovery} = recoveredIdentity(record);
  if (!Array.isArray(events)) throw new Error('Sales history read was incomplete.');
  const matching = events.filter(event => matchesRecoveryHistory(record,event));
  const matched = matching.length === 1 ? matching[0] : null;
  const previous = recovery.history_reconciliation;
  const already = !!(matched && previous?.event_id === str(matched.id));
  return {
    workorder_id:str(record.id),sheet_id:str(record.smartsheet_sheet_id),
    row_id:str(record.smartsheet_row_id),attempt_id:str(marker.attempt_id),
    workorder_version:str(record.updated_date),
    recorded_recovery_at:str(recovery.recovered_at),
    history_matching_count:matching.length,
    history_event_id:matched ? str(matched.id) : '',
    status:matching.length > 1 ? 'ambiguous_history' :
      matching.length === 0 ? 'history_not_confirmed' :
      already ? 'already_reconciled' : 'verified_event_ready',
    safe_to_acknowledge:!!matched && !already,
    no_history_events_created:true,
  };
}

// This mutation only records that an existing, independently verified
// CellHistory event was seen. Never creates another history event, relinks a
// WorkOrder or writes to Smartsheet. CAS protects unrelated WorkOrder edits.
export async function acknowledgeVerifiedSalesRecoveryHistory({
  entity,historyEntity,workorderId,expectedVersion,expectedAttemptId,
  expectedEventId,actor,readEvents,reconciledAt,
}) {
  if (!entity?.get || !entity?.updateMany || !historyEntity?.get ||
      typeof readEvents !== 'function' || !str(actor?.email) ||
      !str(workorderId) || !str(expectedVersion) ||
      !str(expectedAttemptId) || !str(expectedEventId)) {
    throw new Error('An authenticated admin and exact reviewed recovery history IDs are required.');
  }
  const current = await entity.get(str(workorderId));
  if (!current || str(current.updated_date) !== str(expectedVersion)) {
    throw new Error('WorkOrder changed since history review; reload before reconciliation.');
  }
  const evidence = classifySalesRecoveryHistory(current,await readEvents(str(workorderId)));
  if (evidence.status !== 'verified_event_ready' ||
      evidence.attempt_id !== str(expectedAttemptId) ||
      evidence.history_event_id !== str(expectedEventId)) {
    throw new Error('Recovery history evidence is missing, ambiguous, already recorded or stale.');
  }
  const event = await historyEntity.get(str(expectedEventId));
  if (!event || !matchesRecoveryHistory(current,event)) {
    throw new Error('The exact CellHistory event could not be independently verified.');
  }
  const latest = await entity.get(str(workorderId));
  if (!latest || str(latest.updated_date) !== str(expectedVersion) ||
      classifySalesRecoveryHistory(latest,[event]).status !== 'verified_event_ready') {
    throw new Error('The WorkOrder changed during history reconciliation.');
  }
  const date = reconciledAt || new Date().toISOString();
  const marker = latest.smartsheet_create_attempt;
  const repair = {...marker.manual_recovery,
    history_reconciliation:{event_id:str(event.id),verified_at:date,
      verified_by_email:str(actor.email)}};
  const updated = await entity.updateMany({
    id:str(workorderId),updated_date:str(expectedVersion)},
    {$set:{smartsheet_create_attempt:{...marker,manual_recovery:repair}}});
  if (updated?.updated !== 1) {
    throw new Error('WorkOrder revision changed before the history acknowledgment could be saved.');
  }
  const saved = await entity.get(str(workorderId));
  if (!saved || str(saved.smartsheet_create_attempt?.manual_recovery?.history_reconciliation?.event_id) !== str(event.id) ||
      str(saved.smartsheet_create_attempt?.manual_recovery?.history_reconciliation?.verified_at) !== date ||
      str(saved.smartsheet_create_attempt?.manual_recovery?.history_reconciliation?.verified_by_email) !== str(actor.email) ||
      str(saved.smartsheet_row_id) !== evidence.row_id ||
      str(saved.smartsheet_sheet_id) !== evidence.sheet_id) {
    throw new Error('History acknowledgment may have been saved but could not be verified. Reload, never repeat blindly.');
  }
  return {workorder_id:str(workorderId),history_event_id:str(event.id),
    reconciled:true,history_created:false,smartsheet_writes_attempted:false,
    workorder_link_unchanged:true,verified_at:date};
}
