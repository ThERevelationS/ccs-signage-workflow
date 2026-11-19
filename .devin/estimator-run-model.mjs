import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const MODULE_QUEUE = Object.freeze(['foundation', 'channel_letters', 'maintenance', 'painting', 'laser', 'cnc', 'metal', 'vinyl']);
export const APPROVED_EFFECTS = Object.freeze(['local_source', 'frontend_sandbox', 'backend_sandbox', 'schema_sandbox', 'checkpoint', 'live_integration']);
export const RUN_STATUSES = Object.freeze(['awaiting_approval', 'awaiting_runtime_binding', 'running', 'waiting_transient', 'paused_user', 'paused_auth', 'paused_permission', 'paused_conflict', 'blocked_no_eligible_work', 'ready_for_user_review', 'completed']);
export const POLICY = Object.freeze({
  schema_version: 1,
  app_id: '68dfcc5e57bbbc35387da97c',
  branch: 'main',
  max_credits: 5,
  max_attempts: 5,
  max_workers: 1,
});
export const CONTINUATION_PROMPT = 'ESTIMATOR_UNATTENDED_CONTINUE: Read the approved run manifest and active-module ledger under section 28. Continue the next eligible owned unit, verify it, review its diff, persist evidence and checkpoint when authorized. Do not ask for routine next-step approval. Honor user stop, ownership, technical gates, permissions, credit limits and all no-release/no-production-data restrictions. If no eligible work remains or safety requires input, preserve resume state and stop honestly; do not loop or declare blocked work complete.';
export const REHYDRATION_PROMPT = 'ESTIMATOR_RUN_REHYDRATE: Read this session-owned approved run state, resume.json and credit receipts before continuing the active-module ledger under section 28. Preserve scope, task identity, outstanding changes, process ownership and cumulative credit limits. Verify fresh source before writing; reuse owned live processes, never duplicate paid attempts or enroll a different session. Continue eligible authorized work without routine next-step questions; honor stop, permission and technical gates. Pending reviews are not passed evidence and release remains unauthorized.';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const rootKey = value => nonempty(value) ? resolve(value).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase() : '';
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((value, i) => value === b[i]);
const failure = reason => ({ ok: false, reason });
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const units = value => {
  if (!Number.isFinite(value) || value < 0 || value > POLICY.max_credits) throw new Error('invalid_credit_bound');
  return Math.ceil(value * 1000);
};

export function scopeFingerprint(approval) {
  const scope = {
    app_id: approval.app_id,
    branch: approval.branch,
    project_root: rootKey(approval.project_root),
    module_queue: approval.module_queue,
    allowed_effects: approval.allowed_effects,
    max_credits: approval.max_credits,
    max_attempts: approval.max_attempts,
    max_workers: approval.max_workers,
  };
  return createHash('sha256').update(JSON.stringify(canonical(scope))).digest('hex');
}

export function createBudget() {
  return { max_credits: POLICY.max_credits, max_attempts: POLICY.max_attempts, reservations: [] };
}

export function inspectBudget(budget) {
  if (!object(budget) || budget.max_credits !== POLICY.max_credits || budget.max_attempts !== POLICY.max_attempts
    || !Array.isArray(budget.reservations) || budget.reservations.length > POLICY.max_attempts) {
    throw new Error('invalid_credit_ledger');
  }
  const ids = new Set();
  let consumed = 0;
  for (const receipt of budget.reservations) {
    if (!object(receipt) || !nonempty(receipt.id) || ids.has(receipt.id)
      || !Number.isSafeInteger(receipt.upper_bound_milli) || receipt.upper_bound_milli <= 0
      || receipt.upper_bound_milli > POLICY.max_credits * 1000
      || !['reserved', 'unknown', 'settled'].includes(receipt.status)) throw new Error('invalid_credit_receipt');
    ids.add(receipt.id);
    if (receipt.status === 'settled') {
      if (!Number.isSafeInteger(receipt.charged_milli) || receipt.charged_milli < 0
        || receipt.charged_milli > receipt.upper_bound_milli) throw new Error('invalid_credit_charge');
      consumed += receipt.charged_milli;
    } else {
      if (receipt.charged_milli !== null) throw new Error('invalid_pending_credit_charge');
      consumed += receipt.upper_bound_milli;
    }
  }
  if (consumed > POLICY.max_credits * 1000) throw new Error('credit_cap_exceeded');
  return { consumed_milli: consumed, remaining_milli: POLICY.max_credits * 1000 - consumed, attempts: ids.size };
}

export function reserveCredits({ budget, reservationId, upperBoundCredits }) {
  const totals = inspectBudget(budget);
  if (!nonempty(reservationId)) throw new Error('invalid_reservation_id');
  const upper = units(upperBoundCredits);
  if (upper <= 0) throw new Error('unknown_or_zero_billable_bound');
  const existing = budget.reservations.find(receipt => receipt.id === reservationId);
  if (existing) {
    if (existing.upper_bound_milli !== upper) throw new Error('reservation_bound_mismatch');
    return { budget, reservation: existing, created: false, mayCall: false };
  }
  if (totals.attempts >= POLICY.max_attempts || upper > totals.remaining_milli) throw new Error('integration_budget_exhausted');
  const reservation = { id: reservationId, upper_bound_milli: upper, charged_milli: null, status: 'reserved' };
  return {
    budget: { ...budget, reservations: [...budget.reservations, reservation] },
    reservation,
    created: true,
    mayCall: true,
  };
}

export function settleCredits({ budget, reservationId, chargedCredits = null }) {
  inspectBudget(budget);
  const existing = budget.reservations.find(receipt => receipt.id === reservationId);
  if (!existing) throw new Error('missing_credit_reservation');
  const charge = chargedCredits === null ? null : units(chargedCredits);
  if (charge !== null && charge > existing.upper_bound_milli) throw new Error('charge_exceeds_reserved_bound');
  if (existing.status === 'settled') {
    if (charge !== existing.charged_milli) throw new Error('settled_credit_receipt_is_immutable');
    return budget;
  }
  const next = { ...existing, status: charge === null ? 'unknown' : 'settled', charged_milli: charge };
  return { ...budget, reservations: budget.reservations.map(receipt => receipt.id === reservationId ? next : receipt) };
}

export function validateRunState({ state, approval, sessionId, projectRoot }) {
  if (!object(state) || !object(approval) || state.schema_version !== 1 || approval.schema_version !== 1) return failure('invalid_state_version');
  if (approval.approved !== true || !nonempty(approval.run_id) || state.run_id !== approval.run_id) return failure('approval_required');
  if (!nonempty(sessionId) || state.owner_session_id !== sessionId || approval.owner_session_id !== sessionId) return failure('owner_mismatch');
  if (!rootKey(projectRoot) || rootKey(approval.project_root) !== rootKey(projectRoot)
    || rootKey(state.project_root) !== rootKey(projectRoot)) return failure('project_root_mismatch');
  if (approval.app_id !== POLICY.app_id || state.app_id !== POLICY.app_id
    || approval.branch !== POLICY.branch || state.branch !== POLICY.branch) return failure('app_or_branch_mismatch');
  if (!sameList(approval.module_queue, MODULE_QUEUE) || !sameList(approval.allowed_effects, APPROVED_EFFECTS)
    || approval.max_credits !== POLICY.max_credits || approval.max_attempts !== POLICY.max_attempts
    || approval.max_workers !== POLICY.max_workers) return failure('scope_mismatch');
  const fingerprint = scopeFingerprint(approval);
  if (approval.scope_fingerprint !== fingerprint || state.approved_scope_hash !== fingerprint) return failure('scope_fingerprint_mismatch');
  if (!RUN_STATUSES.includes(state.status) || !MODULE_QUEUE.includes(state.active_module) || !Number.isSafeInteger(state.progress_seq) || state.progress_seq < 0
    || !object(state.module_gate_states) || !Array.isArray(state.tasks)
    || !Number.isSafeInteger(state.phase_gate_index) || state.phase_gate_index < 0
    || !Number.isSafeInteger(state.worker_count) || state.worker_count < 0
    || state.worker_count > POLICY.max_workers) return failure('invalid_progress_state');
  try {
    inspectBudget(state.budget);
  } catch (error) {
    return failure(error.message);
  }
  return { ok: true, reason: 'approved_owner' };
}

export function selectNextTask({ tasks, state, approval, now = Date.now() }) {
  const validation = validateRunState({ state, approval, sessionId: state?.owner_session_id, projectRoot: state?.project_root });
  if (!validation.ok) return { taskId: null, reason: validation.reason };
  if (!Array.isArray(tasks) || !Number.isFinite(now) || state.status !== 'running') return { taskId: null, reason: 'not_running' };
  const active = MODULE_QUEUE.find(key => {
    const gates = state.module_gate_states[key];
    return gates?.technical !== 'passed' || gates?.activation !== 'passed';
  });
  if (!active) return { taskId: null, reason: 'ready_for_user_review' };
  if (state.active_module !== active) return { taskId: null, reason: 'module_transition_required', moduleKey: active };
  const byId = new Map();
  for (const task of tasks) {
    if (!object(task) || !nonempty(task.id) || byId.has(task.id)) return { taskId: null, reason: 'invalid_task_identity' };
    byId.set(task.id, task);
  }
  const totals = inspectBudget(state.budget);
  const candidates = tasks.map((task, order) => ({ task, order })).filter(({ task }) => {
    if (task.module_key !== active || task.status !== 'OPEN' || task.claimed_by
      || !['technical', 'activation'].includes(task.gate_scope)
      || !Array.isArray(task.depends_on) || !task.depends_on.every(id => byId.get(id)?.status === 'DONE' && byId.get(id)?.evidence_passed === true)
      || !Array.isArray(task.allowed_effects) || !task.allowed_effects.every(effect => APPROVED_EFFECTS.includes(effect))
      || !Array.isArray(task.owned_files) || task.owned_files.length === 0 || !task.owned_files.every(file =>
        nonempty(file) && !file.includes('\\') && !file.startsWith('/') && !file.includes(':')
        && !file.split('/').some(part => part === '..' || part === '.' || part === ''))
      || !Number.isSafeInteger(task.phase_index) || task.phase_index < 0 || task.phase_index > state.phase_gate_index
      || !Number.isSafeInteger(task.priority) || task.priority < 0 || task.priority > 2) return false;
    if (task.next_eligible_at !== null && task.next_eligible_at !== undefined) {
      const due = Date.parse(task.next_eligible_at);
      if (!Number.isFinite(due) || due > now) return false;
    }
    if (task.allowed_effects.includes('live_integration')) {
      if (!Number.isFinite(task.credit_upper_bound) || task.credit_upper_bound <= 0
        || task.credit_upper_bound > POLICY.max_credits || units(task.credit_upper_bound) > totals.remaining_milli
        || totals.attempts >= POLICY.max_attempts) return false;
    }
    return true;
  }).sort((a, b) => a.task.phase_index - b.task.phase_index || a.task.priority - b.task.priority || a.order - b.order);
  return candidates.length ? { taskId: candidates[0].task.id, reason: 'eligible_work', moduleKey: active }
    : { taskId: null, reason: 'no_eligible_work', moduleKey: active };
}

export function canContinue({ state, hookState, event, approval, projectRoot }) {
  const validation = validateRunState({ state, approval, sessionId: event?.session_id, projectRoot });
  if (!validation.ok) return { continue: false, reason: validation.reason };
  if (event?.hook_event_name !== 'Stop' || typeof event.stop_hook_active !== 'boolean') return { continue: false, reason: 'invalid_stop_event' };
  if (state.stop_requested === true || state.status !== 'running') return { continue: false, reason: 'paused_or_stopped' };
  if (!object(hookState) || hookState.run_id !== state.run_id || hookState.owner_session_id !== event.session_id
    || !(hookState.last_progress_seq === null || Number.isSafeInteger(hookState.last_progress_seq) && hookState.last_progress_seq >= 0)) {
    return { continue: false, reason: 'invalid_hook_state' };
  }
  const selected = selectNextTask({ tasks: state.tasks, state, approval });
  if (!selected.taskId) return { continue: false, reason: selected.reason };
  if (hookState.last_progress_seq !== null && state.progress_seq <= hookState.last_progress_seq) {
    return { continue: false, reason: 'no_substantive_progress' };
  }
  return { continue: true, reason: CONTINUATION_PROMPT, progress_seq: state.progress_seq, taskId: selected.taskId };
}
