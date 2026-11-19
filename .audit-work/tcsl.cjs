var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var timeClockStatusLite_exports = {};
__export(timeClockStatusLite_exports, {
  buildStatusLite: () => buildStatusLite,
  liteSnapshotForState: () => liteSnapshotForState,
  liteStateFingerprint: () => liteStateFingerprint,
  serveLiteSnapshot: () => serveLiteSnapshot,
  snapshotFromLiteResult: () => snapshotFromLiteResult
});
module.exports = __toCommonJS(timeClockStatusLite_exports);
const LITE_SNAPSHOT_V = 1;
const LITE_FP_EXCLUDE = /* @__PURE__ */ new Set(["updated_date", "lite_snapshot"]);
function liteStateFingerprint(state) {
  const src = {};
  for (const key of Object.keys(state || {}).sort()) {
    if (!LITE_FP_EXCLUDE.has(key)) src[key] = state[key];
  }
  return JSON.stringify(src);
}
function liteSnapshotForState(state) {
  const snap = state?.lite_snapshot;
  return snap && snap.v === LITE_SNAPSHOT_V && snap.body?.lite === true ? snap : null;
}
function serveLiteSnapshot({ state, entry, target, helpers, snapshot }) {
  const { publicEmployee, dateKeyInCompanyTime, MISSED_PUNCH_PROMPT_MS, MISSED_PUNCH_REPROMPT_MS } = helpers;
  if (!snapshot || snapshot.v !== LITE_SNAPSHOT_V || snapshot.body?.lite !== true) return null;
  if (snapshot.fp_state !== liteStateFingerprint(state)) return null;
  const freshFields = {
    user: publicEmployee(target),
    work_pause_allowed: target.can_work_pause === true,
    employment_type: target.employment_type || "hourly"
  };
  if (snapshot.body.status === "clocked_out") {
    return { ...snapshot.body, ...freshFields };
  }
  if (snapshot.body.status !== "clocked_in") return null;
  if (!entry?.id || String(entry.updated_date || "") !== String(snapshot.fp_entry || "")) return null;
  const serverNow = /* @__PURE__ */ new Date();
  const clockInMs = new Date(entry.clock_in).getTime();
  const acknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || "")).getTime();
  const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
  const acknowledgementFresh = Number.isFinite(acknowledgedMs) && serverNow.getTime() - acknowledgedMs < MISSED_PUNCH_REPROMPT_MS;
  const requiresPunchResolution = Number.isFinite(clockInMs) && crossedCompanyDate && serverNow.getTime() - clockInMs >= MISSED_PUNCH_PROMPT_MS && !acknowledgementFresh;
  if (requiresPunchResolution) return null;
  return { ...snapshot.body, ...freshFields };
}
function snapshotFromLiteResult({ result, state, entry }) {
  if (!result?.lite || !["clocked_in", "clocked_out"].includes(String(result.status))) return null;
  const { user, ...body } = result;
  return {
    v: LITE_SNAPSHOT_V,
    fp_state: liteStateFingerprint(state),
    fp_entry: entry ? String(entry.updated_date || "") : "",
    built_at: (/* @__PURE__ */ new Date()).toISOString(),
    body
  };
}
async function buildStatusLite({ stateEntity, entryEntity, breakEntity, workPauseEntity, target, helpers, preloadedStateRows, preloadedEntry }) {
  const {
    publicEmployee,
    breakStatusOf,
    workPauseStatusOf,
    laborStatusOf,
    breakSummaryForEntry,
    workPauseSummaryForEntry,
    dateKeyInCompanyTime,
    MISSED_PUNCH_PROMPT_MS,
    MISSED_PUNCH_REPROMPT_MS,
    asEmail
  } = helpers;
  const FULL = { success: true, lite: true, requires_full_status: true, user: publicEmployee(target) };
  const rows = Array.isArray(preloadedStateRows) ? preloadedStateRows : await stateEntity.filter({ user_email: asEmail(target?.email) });
  if (!Array.isArray(rows) || rows.length !== 1) return FULL;
  const state = rows[0];
  if (["clocking_in", "clocking_out"].includes(String(state.status || ""))) return FULL;
  const currentBreakStatus = breakStatusOf(state);
  const currentWorkPauseStatus = workPauseStatusOf(state);
  const currentLaborStatus = laborStatusOf(state);
  if (["starting_break", "ending_break"].includes(currentBreakStatus)) return FULL;
  if (["pausing", "resuming"].includes(currentWorkPauseStatus)) return FULL;
  if (currentLaborStatus !== "idle") return FULL;
  if (String(state.correction_create_status || "") === "creating") return FULL;
  if (state.status === "clocked_out") {
    return {
      success: true,
      lite: true,
      status: "clocked_out",
      entry: null,
      user: publicEmployee(target),
      break_status: "working",
      active_break: null,
      break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
      work_pause_allowed: target.can_work_pause === true,
      employment_type: target.employment_type || "hourly",
      work_pause_status: "working",
      active_work_pause: null,
      work_pause_summary: { count: 0, total_minutes: 0 },
      active_labor: null,
      labor_summary: { count: 0, total_minutes: 0 }
    };
  }
  if (state.status !== "clocked_in" || !state.active_entry_id) return FULL;
  const entry = preloadedEntry !== void 0 ? preloadedEntry : await entryEntity.get(state.active_entry_id).catch(() => null);
  if (!entry?.id || entry.status !== "clocked_in" || asEmail(entry.user_email) !== asEmail(target.email) || entry.archived_test_data || entry.archived_admin) return FULL;
  const [activeBreak, activeWorkPause] = await Promise.all([
    state.active_break_id ? breakEntity.get(state.active_break_id).catch(() => null) : Promise.resolve(null),
    state.active_work_pause_id ? workPauseEntity.get(state.active_work_pause_id).catch(() => null) : Promise.resolve(null)
  ]);
  if (currentBreakStatus === "on_break") {
    if (!activeBreak?.id || activeBreak.status !== "active" || asEmail(activeBreak.user_email) !== asEmail(target.email) || activeBreak.time_entry_id !== entry.id) return FULL;
  } else if (state.active_break_id || activeBreak?.id) return FULL;
  if (currentWorkPauseStatus === "paused") {
    if (!activeWorkPause?.id || activeWorkPause.status !== "active" || asEmail(activeWorkPause.user_email) !== asEmail(target.email) || activeWorkPause.time_entry_id !== entry.id) return FULL;
  } else if (state.active_work_pause_id || activeWorkPause?.id) return FULL;
  const serverNow = /* @__PURE__ */ new Date();
  const clockInMs = new Date(entry.clock_in).getTime();
  const acknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || "")).getTime();
  const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
  const acknowledgementFresh = Number.isFinite(acknowledgedMs) && serverNow.getTime() - acknowledgedMs < MISSED_PUNCH_REPROMPT_MS;
  const requiresPunchResolution = Number.isFinite(clockInMs) && crossedCompanyDate && serverNow.getTime() - clockInMs >= MISSED_PUNCH_PROMPT_MS && !acknowledgementFresh;
  if (requiresPunchResolution) return FULL;
  const [breakSummary, workPauseSummary] = await Promise.all([
    breakSummaryForEntry(breakEntity, entry.id, target.email),
    workPauseSummaryForEntry(workPauseEntity, entry.id, target.email)
  ]);
  return {
    success: true,
    lite: true,
    status: "clocked_in",
    entry,
    user: publicEmployee(target),
    break_status: currentBreakStatus,
    active_break: activeBreak || null,
    break_summary: breakSummary,
    work_pause_allowed: target.can_work_pause === true,
    employment_type: target.employment_type || "hourly",
    work_pause_status: currentWorkPauseStatus,
    active_work_pause: activeWorkPause || null,
    work_pause_summary: workPauseSummary
  };
}
