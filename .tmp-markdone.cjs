const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const reps = [
  ["100. **[F]** Named config profiles", "100. **[F][DONE]** Config profiles - clipboard JSON export/import of the full prefs bundle"],
  ["102. **[F]** Export prefs as QR/copyable blob", "102. **[F][DONE]** Export prefs - copy/paste buttons on the settings header"],
  ["125. **[F]** Correction diff view", "125. **[F][DONE]** Correction diff - dialog already shows ORIGINAL vs EMPLOYEE REQUEST side by side"],
  ["127. **[F]** Required approver notes", "127. **[F][DONE]** Approver notes required - review_reason min-3 gate on every decision"],
  ["188. **[F]** Admin action audit", "188. **[F][DONE]** Admin action audit - list_timeclock_audit + panel (actor, request id, time)"],
  ["210. **[F]** Missed-punch guided self-report wizard", "210. **[F][DONE]** Missed-punch wizard - MissedClockInDialog + banner flow exists"],
  ["224. **[F]** Public \"who's in\" API", "224. **[F][DONE]** Who-is-in API - timeClockAction who_is_in function endpoint"],
  ["94. **[F]** Pending-approval dot", "94. **[F][DONE]** Pending-approval dot - amber dot on the tracker when the admin snapshot shows pending reviews"],
  ["106. **[F]** Reminder escalation", "106. **[F][DONE]** Reminder escalation - reminders re-fire once +10min later if ignored"],
  ["186. **[F]** Kiosk clock-drift warning", "186. **[F][DONE]** Clock-drift warning - tracker footer flags when device time is >2min off the server"],
  ["132. **[F]** Rejection with structured reason codes", "132. **[F][DONE]** Rejection reason codes - quick-pick chips fill the manager review reason"],
];
for (const [a, b] of reps) {
  const i = s.indexOf(a);
  if (i < 0) { console.log("MISS", a.slice(0, 45)); continue; }
  const end = s.indexOf("\n", i);
  s = s.slice(0, i) + b + s.slice(end);
  console.log("OK  ", a.slice(0, 45));
}
fs.writeFileSync(f, s);
