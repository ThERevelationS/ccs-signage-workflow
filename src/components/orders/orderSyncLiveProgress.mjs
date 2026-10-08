export const ORDER_SYNC_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

export function orderSyncPhaseLabel(phase) {
  return ({
    backup: 'Preparing backup',
    reading: 'Reading Smartsheet',
    matching: 'Matching Order rows',
    applying: 'Applying Base44 updates',
    verifying_base44: 'Verifying Base44 dates',
    confirming_base44: 'Confirming Order snapshots',
    checking: 'Checking Order',
    create: 'Creating Order row',
    writing: 'Writing to Smartsheet',
    waiting_rate_limit: 'Waiting for Smartsheet',
    retrying: 'Retrying Smartsheet',
    verifying: 'Verifying Smartsheet',
    confirming: 'Confirming Base44',
    needs_review: 'Needs review',
    paused: 'Paused safely',
    finishing: 'Finalizing',
  })[String(phase || '')] || '';
}

export function orderSyncLiveProgress(status, { enabled = true, now = Date.now() } = {}) {
  const show = Boolean(enabled && status?.progress_dataset === 'orders');
  const current = show ? Math.max(0, Number(status?.progress_current) || 0) : 0;
  const total = show ? Math.max(0, Number(status?.progress_total) || 0) : 0;
  const itemLabel = show ? String(status?.progress_item_label || '').trim() : '';
  const detail = show ? String(status?.progress_detail || '').trim() : '';
  const phase = show ? String(status?.progress_phase || '').trim() : '';
  const phaseLabel = orderSyncPhaseLabel(phase);

  const totalSteps = Math.max(0, Number(status?.total_steps) || 0);
  const completedSteps = Math.max(0, Number(status?.completed_steps) || 0);
  const running = status?.status === 'running';
  const explicitFraction = Number(status?.progress_fraction);
  const stepFraction = running && Number.isFinite(explicitFraction)
    ? Math.min(0.999, Math.max(0, explicitFraction))
    : running && total > 0 ? Math.min(0.999, current / total) : 0;
  const rawPercent = totalSteps > 0
    ? Math.round(((completedSteps + stepFraction) / totalSteps) * 1000) / 10
    : 0;
  // Order pull has several phases within one coordinator step. Allocate a
  // bounded share to each phase so the overall bar never drops back to zero
  // after downloading the sheet (nor claims 100% before verified completion).
  const pullPhaseRanges = {
    reading: [0, 35], matching: [35, 25], applying: [60, 20],
    verifying_base44: [80, 10], confirming_base44: [90, 9.9],
  };
  const pullPhase = show && running && status?.progress_direction === 'pull'
    ? pullPhaseRanges[phase] : null;
  const pullStage = Boolean(pullPhase);
  const phaseRatio = total > 0 ? Math.min(1, current / total) : 0;
  const weightedPullStep = pullPhase ? (pullPhase[0] + pullPhase[1] * phaseRatio) / 100 : null;
  const weightedPullPercent = weightedPullStep !== null && totalSteps > 0
    ? Math.round(((completedSteps + weightedPullStep) / totalSteps) * 1000) / 10 : 0;
  const percent = running ? Math.min(99.9, pullPhase ? weightedPullPercent : rawPercent) : rawPercent;

  const stamp = Date.parse(status?.progress_updated_at || status?.updated_at || status?.started_at || '');
  const heartbeatAgeMs = Number.isFinite(stamp) ? Math.max(0, now - stamp) : null;
  // The short heartbeat timeout belongs only to active Order row progress.
  // Other sync stages (for example Sales in a combined run) do not emit this
  // heartbeat and must keep the shared widget's normal stale-run policy.
  const stalled = Boolean(show && running &&
    (heartbeatAgeMs === null || heartbeatAgeMs > ORDER_SYNC_HEARTBEAT_STALE_MS));

  // These counts reflect Smartsheet pages downloaded, not Base44 Order writes.
  // A full download is only the first phase of a manual two-way sync.
  const readingPull = show && running && status?.progress_direction === 'pull' && phase === 'reading';
  const readPercent = readingPull && total > 0
    ? Math.min(100, Math.round((Math.min(current, total) / total) * 100)) : null;
  const readCountLabel = readingPull
    ? `${current.toLocaleString()}${total > 0 ? ` / ${total.toLocaleString()}` : ''} rows read`
    : '';
  const readPercentLabel = readingPull
    ? readPercent === null ? 'Reading Smartsheet…' : `${readPercent}% of sheet read`
    : '';

  const stageCountLabel = pullStage ? readingPull ? readCountLabel :
    `${current.toLocaleString()}${total > 0 ? ` / ${total.toLocaleString()}` : ''} ${({
      matching: 'rows compared', applying: 'candidate updates processed',
      verifying_base44: 'date/text checks performed', confirming_base44: 'snapshot writes processed',
    })[phase] || 'items processed'}` : '';
  const stagePercentLabel = pullStage ? readingPull ? readPercentLabel :
    total > 0 ? `${Math.round(phaseRatio * 100)}% of stage processed` : phaseLabel : '';
  return { show, current, total, itemLabel, detail, phase, phaseLabel, percent, stalled, heartbeatAgeMs,
    readingPull, readCountLabel, readPercentLabel, pullStage, stageCountLabel, stagePercentLabel };
}
