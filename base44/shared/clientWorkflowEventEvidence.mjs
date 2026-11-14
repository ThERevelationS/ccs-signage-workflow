// Browser-reported automation events are claims, not facts. Before a client
// event may run admin-configured rules, the re-read record must show a fresh
// write and the state the event describes, each (event, record version) pair
// may fire at most once, and only server-derivable extras reach the engine.

export const CLIENT_EVENT_FRESHNESS_MS = 10 * 60 * 1000;

const STAGES = new Set(['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation', 'completed']);
const TEXT_ARRAYS = ['notes', 'work_notes', 'follow_up', 'sip_checklist', 'mmm_checklist', 'mmm_sip_checklist', 'mmm_tasks', 'milestones'];

const conflict = (message) => Object.assign(new Error(message), { status: 409 });
const present = (value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '';
const items = (value) => (Array.isArray(value) ? value : []).filter((item) => item && typeof item === 'object');

function timestampMs(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  return Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);
}

function isFresh(value, now) {
  const at = timestampMs(value);
  return Number.isFinite(at) && now - at <= CLIENT_EVENT_FRESHNESS_MS && at - now <= 60 * 1000;
}

function recordStrings(record) {
  const found = new Set();
  const walk = (value, depth) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (typeof value === 'string') { if (value.trim()) found.add(value.trim()); return; }
    if (Array.isArray(value)) { value.forEach((item) => walk(item, depth + 1)); return; }
    if (typeof value === 'object') Object.values(value).forEach((item) => walk(item, depth + 1));
  };
  for (const field of TEXT_ARRAYS) walk(record?.[field], 0);
  return found;
}

const riderOnly = (check) => (wo, ctx) => wo?.is_rider === true && check(wo, ctx);
const fieldSet = (field) => (wo) => present(wo?.[field]);
const createdFresh = (wo, ctx) => isFresh(wo?.created_date, ctx.now);
const stageMatches = (expected) => (wo, ctx) => {
  const stage = ctx.newStage;
  if (!stage || (expected && stage !== expected)) return false;
  return wo?.current_stage === stage || (wo?.is_rider === true && wo?.rider_stage === stage);
};
const allTasksDone = (wo) => items(wo?.notes).length > 0 && items(wo?.notes).every((task) => task.completed === true);

// Durable state each Work Order event requires on the re-read record. Events
// not listed here describe edits with no single resulting state (text edits,
// deletions of an item); they still require a fresh, unclaimed write.
const WORK_ORDER_EVIDENCE = {
  work_order_created: createdFresh,
  rider_created: riderOnly(createdFresh),
  work_order_completed: (wo) => wo?.completed === true,
  rider_completed: riderOnly((wo) => wo?.completed === true),
  work_order_deleted: (wo) => wo?.deleted === true,
  rider_deleted: riderOnly((wo) => wo?.deleted === true),
  work_order_restored: (wo) => wo?.deleted !== true,
  stage_changed: stageMatches(),
  stage_entered: stageMatches(),
  stage_exited: stageMatches(),
  rider_stage_changed: riderOnly(stageMatches()),
  stage_estimating_entered: stageMatches('estimating'),
  stage_sales_entered: stageMatches('sales'),
  stage_permitting_entered: stageMatches('permitting'),
  stage_design_entered: stageMatches('design'),
  stage_production_entered: stageMatches('production'),
  stage_fabrication_entered: stageMatches('fabrication'),
  stage_installation_entered: stageMatches('installation'),
  stage_completed_entered: stageMatches('completed'),
  asap_toggled_on: (wo) => wo?.asap === true,
  asap_toggled_off: (wo) => wo?.asap !== true,
  assigned_to_changed: (wo, ctx) => String(wo?.assigned_to || '') === ctx.newAssignee,
  rider_assigned_to_changed: riderOnly((wo, ctx) => String(wo?.assigned_to || '') === ctx.newAssignee),
  work_order_permit_number_set: fieldSet('permit_number'),
  work_order_permit_approved: fieldSet('permit_approved_date'),
  permit_approved: fieldSet('permit_approved_date'),
  work_order_permit_submitted: fieldSet('permit_submitted_date'),
  permit_receipt_confirmed: fieldSet('permit_receipt_confirmed_date'),
  work_order_est_inv_set: fieldSet('est_inv_at'),
  work_order_install_date_set: fieldSet('project_install_date'),
  start_date_set: fieldSet('start_date'),
  site_survey_scheduled: fieldSet('site_survey_date'),
  google_drive_linked: fieldSet('google_drive_folder_url'),
  due_date_set: fieldSet('due_date'),
  due_date_cleared: (wo) => !present(wo?.due_date),
  sip_item_revisit_set: fieldSet('sip_revisit_date'),
  designer_assigned: fieldSet('designer'),
  surveyor_assigned: fieldSet('surveyor'),
  project_manager_assigned: fieldSet('project_manager'),
  estimator_assigned: fieldSet('estimator'),
  project_health_on_track: (wo) => wo?.project_health === 'on_track',
  project_health_at_risk: (wo) => wo?.project_health === 'at_risk',
  project_health_delayed: (wo) => wo?.project_health === 'delayed',
  project_health_blocked: (wo) => wo?.project_health === 'blocked',
  work_order_file_uploaded: fieldSet('files'),
  file_attached: fieldSet('files'),
  all_tasks_completed: allTasksDone,
  rider_all_tasks_completed: riderOnly(allTasksDone),
  note_completed: (wo) => items(wo?.notes).some((task) => task.completed === true),
  task_due_date_set: (wo) => items(wo?.notes).some((task) => present(task.due_date)),
  task_assigned: (wo) => items(wo?.notes).some((task) => present(task.assigned_to)),
  follow_up_added: fieldSet('follow_up'),
  follow_up_completed: (wo) => items(wo?.follow_up).some((item) => item.completed === true),
};

const ORDER_EVIDENCE = {
  order_created: createdFresh,
  order_ordered: (order) => order?.status === 'ordered' || present(order?.date_ordered),
  order_received: (order) => order?.status === 'received' || present(order?.date_received),
  order_cancelled: (order) => order?.status === 'cancelled',
};

const RECORD_EVIDENCE = {
  jurisdiction_profile_created: createdFresh,
  user_face_enrolled: fieldSet('face_descriptors'),
};

const EVIDENCE = { WorkOrder: WORK_ORDER_EVIDENCE, Order: ORDER_EVIDENCE };

// Returns the only extras the engine may see for this client event. Stage and
// assignee values come from the record; task/note text is kept only when that
// exact text is stored on the record, so callers cannot inject email copy.
export function verifyClientWorkflowEvent({ eventType, entityType, record, extras, now = Date.now() } = {}) {
  if (!record?.id) throw conflict('Automation event record could not be verified.');
  if (record.deleted === true && entityType !== 'WorkOrder') throw conflict('Automation event record is deleted.');
  if (!isFresh(record.updated_date, now)) {
    throw conflict('Automation event has no recent durable write on its record.');
  }
  const claimed = extras && typeof extras === 'object' ? extras : {};
  const ctx = { now, newStage: '', newAssignee: '' };
  const sanitized = {};

  if (entityType === 'WorkOrder') {
    const claimedNewStage = String(claimed.newStage || '').trim();
    if (STAGES.has(claimedNewStage)) ctx.newStage = claimedNewStage;
    ctx.newAssignee = String(record.assigned_to || '');
    if (eventType === 'assigned_to_changed' || eventType === 'rider_assigned_to_changed') {
      ctx.newAssignee = String(claimed.newAssignee ?? '');
    }
    if (ctx.newStage) {
      sanitized.newStage = ctx.newStage;
      const previousStage = String(claimed.previousStage || '').trim();
      if (STAGES.has(previousStage) && previousStage !== ctx.newStage) sanitized.previousStage = previousStage;
    }
    const stored = recordStrings(record);
    for (const key of ['taskText', 'noteText']) {
      const text = typeof claimed[key] === 'string' ? claimed[key].trim() : '';
      if (text && stored.has(text)) sanitized[key] = text;
    }
    const noteType = typeof claimed.noteType === 'string' ? claimed.noteType.trim() : '';
    if (sanitized.noteText && /^[A-Za-z][A-Za-z _-]{0,39}$/.test(noteType)) sanitized.noteType = noteType;
  }

  const check = (EVIDENCE[entityType] || RECORD_EVIDENCE)[eventType];
  if (check && !check(record, ctx)) {
    throw conflict('Automation event is not durable on its record.');
  }
  return sanitized;
}

export function clientWorkflowEventClaimKey({ eventType, entityType, record }) {
  return ['client-event', 'v1', eventType, entityType, record?.id, record?.updated_date].map((part) => String(part ?? '')).join(':');
}

// One claim per (event, record, record version): a replay of the same write,
// or a burst against one fresh write, fires rules once. Concurrent claims are
// settled by the earliest stored row so exactly one caller proceeds.
export async function claimClientWorkflowEvent({ entity, eventType, entityType, record, claimedBy = '' } = {}) {
  if (typeof entity?.filter !== 'function' || typeof entity?.create !== 'function') {
    throw Object.assign(new Error('Automation event claims are unavailable.'), { status: 503 });
  }
  const claimKey = clientWorkflowEventClaimKey({ eventType, entityType, record });
  const existing = await entity.filter({ claim_key: claimKey });
  if (!Array.isArray(existing)) throw Object.assign(new Error('Automation event claim could not be verified.'), { status: 503 });
  if (existing.length > 0) throw conflict('Automation event was already processed for this record version.');
  const created = await entity.create({
    claim_key: claimKey,
    event_type: eventType,
    entity_type: entityType,
    record_id: String(record.id),
    record_version: String(record.updated_date || ''),
    claimed_by: String(claimedBy || ''),
  });
  const rows = await entity.filter({ claim_key: claimKey });
  if (!Array.isArray(rows) || !created?.id) throw Object.assign(new Error('Automation event claim could not be verified.'), { status: 503 });
  const winner = [...rows].sort((a, b) =>
    String(a?.created_date || '').localeCompare(String(b?.created_date || '')) || String(a?.id || '').localeCompare(String(b?.id || '')))[0];
  if (winner?.id !== created.id) throw conflict('Automation event was already processed for this record version.');
  return claimKey;
}
