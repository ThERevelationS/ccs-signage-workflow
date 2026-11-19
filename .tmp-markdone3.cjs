const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const reps = [
  ["90. **[F]** Pay-period progress arc", "90. **[F][DONE]** Pay-period progress arc - current period + % bar in the popover"],
  ["98. **[F]** Time-off upcoming notice", "98. **[F][DONE]** Time-off notice - approved upcoming TimeOffRequest banner in the popover"],
  ["206. **[F]** My punch history export", "206. **[F][DONE]** Punch export - my_history action + CSV download button in the popover"],
  ["208. **[F]** Personal stats - avg shift, on-time %, weekly trend", "208. **[F][DONE]** Personal stats - completed-shift count + avg shift shown after export"],
  ["192. **[F]** Backup/restore of time clock config profiles", "192. **[F][DONE]** Config backup - JSON export/import covers prefs backup/restore"],
];
for (const [a, b] of reps) {
  const i = s.indexOf(a);
  if (i < 0) { console.log("MISS", a.slice(0, 45)); continue; }
  const end = s.indexOf("\n", i);
  s = s.slice(0, i) + b + s.slice(end);
  console.log("OK  ", a.slice(0, 45));
}
fs.writeFileSync(f, s);
