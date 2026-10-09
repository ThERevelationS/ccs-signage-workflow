export const ORDER_SYNC_RECOVERY_STALE_MS = 5 * 60 * 1000;

function parsedTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyRecoverableStaleOrderSync(status, now = Date.now()) {
  if (!status || status.status !== 'running') {
    return { recoverable: false, reason: 'not_running', age_ms: null };
  }

  const isOrderStage =
    status?.progress_dataset === 'orders' ||
    /^Order Form\b/.test(String(status?.current_step_label || '').trim());
  if (!isOrderStage) {
    return { recoverable: false, reason: 'not_order_stage', age_ms: null };
  }

  const stamp = parsedTime(status?.progress_updated_at) ??
    parsedTime(status?.updated_at) ??
    parsedTime(status?.started_at);
  if (stamp === null) {
    return { recoverable: false, reason: 'missing_timestamp', age_ms: null };
  }

  const ageMs = Math.max(0, now - stamp);
  if (ageMs <= ORDER_SYNC_RECOVERY_STALE_MS) {
    return { recoverable: false, reason: 'heartbeat_fresh', age_ms: ageMs };
  }

  return {
    recoverable: true,
    reason: 'stale_order_run',
    age_ms: ageMs,
    heartbeat_at: new Date(stamp).toISOString(),
    started_at: String(status?.started_at || ''),
  };
}

// Verify that close-for-review did not silently drop the permanent-ID
// evidence of an uncertain in-flight Order write. Object key ordering is not
// meaningful; array ordering (batch order and mapped IDs) is meaningful.
function canonicalEvidence(value) {
  if (Array.isArray(value)) return value.map(canonicalEvidence);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((record, key) => {
    record[key] = canonicalEvidence(value[key]);
    return record;
  }, {});
}

export function orderStaleBatchEvidencePreserved(before, after) {
  if (!before?.order_pull_batch_evidence) return true;
  return JSON.stringify(canonicalEvidence(before.order_pull_batch_evidence)) ===
    JSON.stringify(canonicalEvidence(after?.order_pull_batch_evidence));
}

export function recoveredStaleOrderSyncValue(status, recoveredAt = new Date().toISOString()) {
  const results = Array.isArray(status?.results) ? [...status.results] : [];
  const progressCurrent = Math.max(0, Number(status?.progress_current) || 0);
  const progressTotal = Math.max(0, Number(status?.progress_total) || 0);
  const remaining = progressTotal > 0 ? Math.max(0, progressTotal - progressCurrent) : null;
  const priorLabel = String(status?.current_step_label || 'Order Form → Smartsheet').trim();
  const attemptedPullBatches = Math.max(0, Number(status?.order_pull_batch_evidence?.attempted_batches) || 0);
  const hasUnverifiedPullWrites = attemptedPullBatches > 0;
  const direction = String(status?.progress_direction || '').trim() || (hasUnverifiedPullWrites ? 'pull' : 'push');

  results.push({
    dataset: 'orders',
    direction,
    skipped: true,
    partial: true,
    stalled: true,
    outcome_unverified: true,
    ...(progressTotal > 0 ? {
      processed_records: progressCurrent,
      remaining_records: remaining,
    } : {}),
    errors: 0,
    conflicts: 0,
    ...(hasUnverifiedPullWrites ? {
      order_pull_batch_evidence_requires_review: true,
      attempted_order_pull_batches: attemptedPullBatches,
    } : {}),
    reason: hasUnverifiedPullWrites
      ? 'The Order pull stopped after write attempts. Some Base44 changes may have applied without verified sync snapshots. Closing this run does not retry writes. Review the recorded permanent Order and Smartsheet row IDs before starting another sync.'
      : 'The Order sync stopped reporting progress. Its final write outcome is unverified; review the run before starting another sync. Closing does not retry writes.',
  });

  return {
    ...status,
    status: 'needs_review',
    needs_review: true,
    completed_at: recoveredAt,
    current_step_label: '',
    recovered_stale_run: true,
    stale_recovered_at: recoveredAt,
    stale_recovered_from_step: priorLabel,
    progress_phase: 'stalled',
    progress_item_label: 'Stalled Order sync closed for review',
    progress_detail: hasUnverifiedPullWrites
      ? `${attemptedPullBatches.toLocaleString()} Order pull batch${attemptedPullBatches === 1 ? '' : 'es'} attempted. Final write and snapshot outcomes require permanent-ID review; no automatic retry.`
      : remaining === null
        ? 'The previous run stopped reporting progress; its final outcome is unverified.'
        : `${remaining.toLocaleString()} line item${remaining === 1 ? '' : 's'} were not confirmed complete.`,
    progress_updated_at: recoveredAt,
    results,
  };
}
