// Pure personal focus-timer regression checks; no Base44 connection or writes.
import assert from "node:assert/strict";
import {
  BREAK_CHOICES, FOCUS_CHOICES, displayTimer, freshTimer,
  normalizeTimer, timerAction, timerStorageKey,
} from "../src/components/timeclock/focusTimerState.js";

const now = 100_000;
const cases = [];
const test = (title, run) => cases.push([title, run]);

test("default is one 25-minute focus block and a 5-minute break", () => {
  const s = freshTimer();
  assert.equal(s.mode, "focus");
  assert.equal(s.remainingSeconds, 1500);
  assert.equal(s.breakMinutes, 5);
  assert.equal(s.status, "idle");
});
test("start uses a deadline instead of counting browser interval ticks", () => {
  const s = timerAction(freshTimer(), "start", now);
  assert.equal(s.deadlineMs, now + 1500_000);
  assert.equal(normalizeTimer(s, now + 70_000).remainingSeconds, 1430);
});
test("pause freezes the actual remainder, resume gets a new deadline", () => {
  const running = timerAction(freshTimer(), "start", now);
  const paused = timerAction(running, "pause", now + 30_000);
  assert.equal(paused.remainingSeconds, 1470);
  assert.equal(paused.deadlineMs, null);
  assert.equal(normalizeTimer(paused, now + 120_000).remainingSeconds, 1470);
  const resumed = timerAction(paused, "start", now + 120_000);
  assert.equal(resumed.deadlineMs, now + 120_000 + 1470_000);
});
test("refresh after deadline completes exactly one focus block", () => {
  const s = timerAction(freshTimer(), "start", now);
  const finished = normalizeTimer(s, now + 1500_010);
  assert.equal(finished.status, "finished");
  assert.equal(finished.finishedFocusBlocks, 1);
  assert.equal(finished.remainingSeconds, 0);
  assert.equal(normalizeTimer(finished, now + 2500_000).finishedFocusBlocks, 1);
});
test("finished focus waits for explicit user action before starting a break", () => {
  const done = normalizeTimer(timerAction(freshTimer(), "start", now), now + 1500_001);
  const breakTimer = timerAction(done, "mode", now + 1500_002, "break");
  assert.equal(breakTimer.status, "idle");
  assert.equal(breakTimer.remainingSeconds, 300);
  assert.equal(breakTimer.finishedFocusBlocks, 1);
});
test("a completed break does not change focus-block count or auto start", () => {
  const s = timerAction(freshTimer(), "mode", now, "break");
  const done = normalizeTimer(timerAction(s, "start", now), now + 300_001);
  assert.equal(done.status, "finished");
  assert.equal(done.finishedFocusBlocks, 0);
});
test("custom durations remain bounded to supported presets", () => {
  for (const value of FOCUS_CHOICES) {
    const s = timerAction(freshTimer(), "focusMinutes", now, value);
    assert.equal(s.durationSeconds, value * 60);
  }
  for (const value of BREAK_CHOICES) {
    const s = timerAction(timerAction(freshTimer(), "mode", now, "break"), "breakMinutes", now, value);
    assert.equal(s.durationSeconds, value * 60);
  }
});
test("running timers cannot silently change their mode or duration", () => {
  const s = timerAction(freshTimer(), "start", now);
  assert.equal(timerAction(s, "mode", now, "break").mode, "focus");
  assert.equal(timerAction(s, "focusMinutes", now, 60).focusMinutes, 25);
});
test("reset stops the timer without losing task or preferences", () => {
  let s = timerAction(freshTimer(), "task", now, "Finish customer estimate");
  s = timerAction(s, "focusMinutes", now, 45);
  s = timerAction(s, "start", now);
  s = timerAction(s, "reset", now + 300_000);
  assert.equal(s.status, "idle");
  assert.equal(s.deadlineMs, null);
  assert.equal(s.remainingSeconds, 2700);
  assert.equal(s.task, "Finish customer estimate");
});
test("corrupted running state pauses safely and does not manufacture completions", () => {
  const s = normalizeTimer({ ...freshTimer(), status: "running", deadlineMs: "bad-date" }, now);
  assert.equal(s.status, "paused");
  assert.equal(s.finishedFocusBlocks, 0);
});
test("malformed preferences, task and statuses are bounded", () => {
  const s = normalizeTimer({
    focusMinutes: -4, breakMinutes: 100000, status: "clocked_in", mode: "unknown",
    remainingSeconds: -200, task: "X".repeat(500), finishedFocusBlocks: -20,
  }, now);
  assert.equal(s.focusMinutes, 25);
  assert.equal(s.breakMinutes, 5);
  assert.equal(s.status, "idle");
  assert.equal(s.mode, "focus");
  assert.equal(s.task.length, 120);
  assert.equal(s.finishedFocusBlocks, 0);
});
test("stored data is scoped separately for each account", () => {
  assert.notEqual(timerStorageKey("staff1@example.com"), timerStorageKey("staff2@example.com"));
  assert.equal(timerStorageKey(""), "");
  assert.equal(timerStorageKey(" A@EXAMPLE.COM "), timerStorageKey("a@example.com"));
});
test("display remains predictable and accessible", () => {
  assert.equal(displayTimer(1500), "25:00");
  assert.equal(displayTimer(9), "00:09");
  assert.equal(displayTimer(-1), "00:00");
});
test("explicit start from finished begins a fresh block, never modifies payroll", () => {
  const done = normalizeTimer(timerAction(freshTimer(), "start", now), now + 1500_001);
  const next = timerAction(done, "start", now + 1600_000);
  assert.equal(next.status, "running");
  assert.equal(next.remainingSeconds, 1500);
  assert.equal(next.finishedFocusBlocks, 1);
  assert.deepEqual(Object.keys(next).sort(), Object.keys(freshTimer()).sort());
});

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log("PASS " + name); }
  catch (error) { console.error("FAIL " + name, error); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`PASS ${passed}/${cases.length} Focus Timer synthetic scenarios`);
