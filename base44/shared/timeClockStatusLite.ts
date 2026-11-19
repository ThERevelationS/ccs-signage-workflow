// Read-only lightweight Time Clock status. Returns a lite response only for
// steady states; anything the full 'status' action would recover, resolve, or
// reject with canonical 409 behavior maps to requires_full_status so the caller
// can fall back. Never performs entity writes.
const LITE_SNAPSHOT_V = 1;
// updated_date churns on every write (including our own snapshot store) and
// lite_snapshot is the cache payload itself — everything else on the state row
// is hashed so ANY semantic field change invalidates the snapshot.
const LITE_FP_EXCLUDE = new Set(['updated_date', 'lite_snapshot']);

export function liteStateFingerprint(state: any): string {
  const src: Record<string, any> = {};
  for (const key of Object.keys(state || {}).sort()) {
    if (!LITE_FP_EXCLUDE.has(key)) src[key] = state[key];
  }
  return JSON.stringify(src);
}

export function liteSnapshotForState(state: any): any | null {
  const snap = state?.lite_snapshot;
  return snap && snap.v === LITE_SNAPSHOT_V && snap.body?.lite === true ? snap : null;
}

// Serves a stored lite_snapshot ONLY when every input it derived from is
// provably unchanged. The time-dependent missed-punch gate is re-evaluated
// with a fresh clock so a cached body can never outlive the moment the live
// path would flip to requires_full_status. Returns null on any doubt.
export function serveLiteSnapshot({ state, entry, target, helpers, snapshot }: any) {
  const { publicEmployee, dateKeyInCompanyTime, MISSED_PUNCH_PROMPT_MS, MISSED_PUNCH_REPROMPT_MS } = helpers;
  if (!snapshot || snapshot.v !== LITE_SNAPSHOT_V || snapshot.body?.lite !== true) return null;
  if (snapshot.fp_state !== liteStateFingerprint(state)) return null;
  const freshFields = {
    user: publicEmployee(target),
    work_pause_allowed: target.can_work_pause === true,
    employment_type: target.employment_type || 'hourly',
  };
  if (snapshot.body.status === 'clocked_out') {
    return { ...snapshot.body, ...freshFields };
  }
  if (snapshot.body.status !== 'clocked_in') return null;
  if (!entry?.id || String(entry.updated_date || '') !== String(snapshot.fp_entry || '')) return null;
  const serverNow = new Date();
  const clockInMs = new Date(entry.clock_in).getTime();
  const acknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || '')).getTime();
  const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
  const acknowledgementFresh = Number.isFinite(acknowledgedMs) && (serverNow.getTime() - acknowledgedMs) < MISSED_PUNCH_REPROMPT_MS;
  const requiresPunchResolution = Number.isFinite(clockInMs) && crossedCompanyDate &&
    (serverNow.getTime() - clockInMs) >= MISSED_PUNCH_PROMPT_MS && !acknowledgementFresh;
  if (requiresPunchResolution) return null;
  return { ...snapshot.body, ...freshFields };
}

// Steady lite results become a versioned snapshot stored back on the state row.
// Transitional/FULL results are never cached — the caller must rebuild live.
export function snapshotFromLiteResult({ result, state, entry }: any): any | null {
  if (!result?.lite || !['clocked_in', 'clocked_out'].includes(String(result.status))) return null;
  const { user, ...body } = result;
  return {
    v: LITE_SNAPSHOT_V,
    fp_state: liteStateFingerprint(state),
    fp_entry: entry ? String(entry.updated_date || '') : '',
    built_at: new Date().toISOString(),
    body,
  };
}

export async function buildStatusLite({ stateEntity, entryEntity, breakEntity, workPauseEntity, target, helpers, preloadedStateRows, preloadedEntry }: any) {
  const {
    publicEmployee, breakStatusOf, workPauseStatusOf, laborStatusOf,
    breakSummaryForEntry, workPauseSummaryForEntry, dateKeyInCompanyTime,
    MISSED_PUNCH_PROMPT_MS, MISSED_PUNCH_REPROMPT_MS, asEmail,
  } = helpers;

  const FULL = { success: true, lite: true, requires_full_status: true, user: publicEmployee(target) };

  const rows = Array.isArray(preloadedStateRows) ? preloadedStateRows
    : await stateEntity.filter({ user_email: asEmail(target?.email) });
  if (!Array.isArray(rows) || rows.length !== 1) return FULL;
  const state = rows[0];

  // Matches recoverTransition: any clock transition may need recovery or a
  // canonical transitional response.
  if (['clocking_in', 'clocking_out'].includes(String(state.status || ''))) return FULL;

  const currentBreakStatus = breakStatusOf(state);
  const currentWorkPauseStatus = workPauseStatusOf(state);
  const currentLaborStatus = laborStatusOf(state);
  // Matches recoverBreakTransition / recoverWorkPauseTransition / the full
  // status branch's shift-subtransition handling.
  if (['starting_break', 'ending_break'].includes(currentBreakStatus)) return FULL;
  if (['pausing', 'resuming'].includes(currentWorkPauseStatus)) return FULL;
  // Matches recoverLaborTransition / the full status branch's labor sub-transition.
  if (currentLaborStatus !== 'idle') return FULL;
  // Matches recoverCompletedClockInMutationGate: a held clock-in mutation gate
  // requires the full recovery path before status can be trusted.
  if (String(state.correction_create_status || '') === 'creating') return FULL;

  if (state.status === 'clocked_out') {
    return {
      success: true, lite: true, status: 'clocked_out', entry: null, user: publicEmployee(target),
      break_status: 'working', active_break: null,
      break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
      work_pause_allowed: target.can_work_pause === true,
      employment_type: target.employment_type || 'hourly',
      work_pause_status: 'working', active_work_pause: null,
      work_pause_summary: { count: 0, total_minutes: 0 },
      active_labor: null, labor_summary: { count: 0, total_minutes: 0 },
    };
  }

  if (state.status !== 'clocked_in' || !state.active_entry_id) return FULL;

  const entry = preloadedEntry !== undefined ? preloadedEntry
    : await entryEntity.get(state.active_entry_id).catch(() => null);
  if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== asEmail(target.email) ||
      entry.archived_test_data || entry.archived_admin) return FULL;

  const [activeBreak, activeWorkPause] = await Promise.all([
    state.active_break_id ? breakEntity.get(state.active_break_id).catch(() => null) : Promise.resolve(null),
    state.active_work_pause_id ? workPauseEntity.get(state.active_work_pause_id).catch(() => null) : Promise.resolve(null),
  ]);

  if (currentBreakStatus === 'on_break') {
    if (!activeBreak?.id || activeBreak.status !== 'active' || asEmail(activeBreak.user_email) !== asEmail(target.email) ||
        activeBreak.time_entry_id !== entry.id) return FULL;
  } else if (state.active_break_id || activeBreak?.id) return FULL;

  if (currentWorkPauseStatus === 'paused') {
    if (!activeWorkPause?.id || activeWorkPause.status !== 'active' || asEmail(activeWorkPause.user_email) !== asEmail(target.email) ||
        activeWorkPause.time_entry_id !== entry.id) return FULL;
  } else if (state.active_work_pause_id || activeWorkPause?.id) return FULL;

  // Missed-clock-out resolution is handled by the full status branch.
  const serverNow = new Date();
  const clockInMs = new Date(entry.clock_in).getTime();
  const acknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || '')).getTime();
  const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
  const acknowledgementFresh = Number.isFinite(acknowledgedMs) && (serverNow.getTime() - acknowledgedMs) < MISSED_PUNCH_REPROMPT_MS;
  const requiresPunchResolution = Number.isFinite(clockInMs) && crossedCompanyDate &&
    (serverNow.getTime() - clockInMs) >= MISSED_PUNCH_PROMPT_MS && !acknowledgementFresh;
  if (requiresPunchResolution) return FULL;

  const [breakSummary, workPauseSummary] = await Promise.all([
    breakSummaryForEntry(breakEntity, entry.id, target.email),
    workPauseSummaryForEntry(workPauseEntity, entry.id, target.email),
  ]);

  return {
    success: true, lite: true, status: 'clocked_in', entry, user: publicEmployee(target),
    break_status: currentBreakStatus, active_break: activeBreak || null, break_summary: breakSummary,
    work_pause_allowed: target.can_work_pause === true,
    employment_type: target.employment_type || 'hourly',
    work_pause_status: currentWorkPauseStatus,
    active_work_pause: activeWorkPause || null,
    work_pause_summary: workPauseSummary,
  };
}
