const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const reps = [
  ["20. **[F]** Rest-period check", "20. **[F][DONE]** Rest-period warning - snapshot returns rest_hours; tracker flags <10h between shifts"],
  ["21. **[F]** Consecutive-days-worked warning", "21. **[F][DONE]** Consecutive-days warning - snapshot counts worked days; tracker flags day 6+"],
  ["80. **[F]** Monthly cumulative option", "80. **[F][DONE]** Monthly cumulative - monthly_paid_minutes in snapshot + 'This month' popover stat"],
  ["93. **[F]** PTO balance chip in expanded view", "93. **[F][DONE]** PTO balance - pto_balance in snapshot + popover stat row"],
  ["205. **[F]** My PTO balance + projected accrual", "205. **[F][DONE]** PTO balance display - available/accrued/pending minutes via snapshot (projection needs accrual rules)"],
];
for (const [a, b] of reps) {
  const i = s.indexOf(a);
  if (i < 0) { console.log("MISS", a.slice(0, 45)); continue; }
  const end = s.indexOf("\n", i);
  s = s.slice(0, i) + b + s.slice(end);
  console.log("OK  ", a.slice(0, 45));
}
fs.writeFileSync(f, s);
