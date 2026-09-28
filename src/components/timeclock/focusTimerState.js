// A personal planning timer: NEVER an official Time Clock punch, payroll break,
// Work Pause, labor segment or approved time record. Uses device time only.
export const FOCUS_CHOICES = [10, 15, 25, 45, 60];
export const BREAK_CHOICES = [3, 5, 10, 15];
const MODES = ["focus", "break"];
const STATUSES = ["idle", "running", "paused", "finished"];
export function timerStorageKey(identity) {
  const id = String(identity || "").trim().toLowerCase();
  return id ? `ccs_focus_timer:v1:${encodeURIComponent(id)}` : "";
}
export function freshTimer() {
  return { mode: "focus", status: "idle", focusMinutes: 25, breakMinutes: 5,
    durationSeconds: 1500, remainingSeconds: 1500, deadlineMs: null,
    task: "", finishedFocusBlocks: 0 };
}
function clampMinutes(input, values, fallback) {
  return values.includes(Number(input)) ? Number(input) : fallback;
}
export function normalizeTimer(input, now = Date.now()) {
  const defaults = freshTimer();
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaults;
  const focusMinutes = clampMinutes(input.focusMinutes, FOCUS_CHOICES, 25);
  const breakMinutes = clampMinutes(input.breakMinutes, BREAK_CHOICES, 5);
  const mode = MODES.includes(input.mode) ? input.mode : defaults.mode;
  const durationSeconds = (mode === "focus" ? focusMinutes : breakMinutes) * 60;
  const initialRemaining = Number(input.remainingSeconds);
  const remainingSeconds = Number.isFinite(initialRemaining)
    ? Math.max(0, Math.min(durationSeconds, Math.ceil(initialRemaining))) : durationSeconds;
  const finishedFocusBlocks = Number.isSafeInteger(input.finishedFocusBlocks)
    ? Math.max(0, Math.min(9999, input.finishedFocusBlocks)) : 0;
  const task = typeof input.task === "string" ? input.task.slice(0, 120) : "";
  const status = STATUSES.includes(input.status) ? input.status : "idle";
  const base = { mode, status, focusMinutes, breakMinutes, durationSeconds,
    remainingSeconds, deadlineMs: null, task, finishedFocusBlocks };
  if (status === "finished") return { ...base, remainingSeconds: 0 };
  if (status === "idle") return { ...base, remainingSeconds: durationSeconds };
  if (status === "paused") return { ...base, remainingSeconds: Math.max(1, remainingSeconds) };
  const deadlineMs = Number(input.deadlineMs);
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    // An invalid clock must not silently count a focus block.
    return { ...base, status: "paused", remainingSeconds: Math.max(1, remainingSeconds) };
  }
  if (deadlineMs <= now) {
    return { ...base, status: "finished", remainingSeconds: 0,
      finishedFocusBlocks: finishedFocusBlocks + (mode === "focus" ? 1 : 0) };
  }
  const actualRemaining = Math.min(durationSeconds, Math.max(1, Math.ceil((deadlineMs - now) / 1000)));
  return { ...base, remainingSeconds: actualRemaining, deadlineMs };
}
export function timerAction(input, action, now = Date.now(), value) {
  const state = normalizeTimer(input, now);
  if (action === "task") return { ...state, task: String(value || "").slice(0, 120) };
  if (action === "start" && state.status !== "running") {
    const remainingSeconds = state.status === "finished" ? state.durationSeconds : state.remainingSeconds;
    return { ...state, status: "running", remainingSeconds,
      deadlineMs: now + remainingSeconds * 1000 };
  }
  if (action === "pause" && state.status === "running") {
    return { ...state, status: "paused", deadlineMs: null };
  }
  if (action === "reset") return { ...state, status: "idle",
    remainingSeconds: state.durationSeconds, deadlineMs: null };
  if ((action === "focusMinutes" || action === "breakMinutes" || action === "mode")
    && state.status !== "running") {
    const next = { ...state };
    if (action === "mode" && MODES.includes(value)) next.mode = value;
    if (action === "focusMinutes") next.focusMinutes = clampMinutes(value, FOCUS_CHOICES, state.focusMinutes);
    if (action === "breakMinutes") next.breakMinutes = clampMinutes(value, BREAK_CHOICES, state.breakMinutes);
    next.durationSeconds = (next.mode === "focus" ? next.focusMinutes : next.breakMinutes) * 60;
    return { ...next, status: "idle", remainingSeconds: next.durationSeconds, deadlineMs: null };
  }
  return state;
}
export function displayTimer(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? Math.ceil(seconds) : 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
