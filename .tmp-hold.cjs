const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const holds = {
  14: "14. **[F][HOLD]** Photo capture - punch-photo field was removed in cleanup",
  22: "22. **[F][HOLD]** Minor rules - needs a DOB field (removed in cleanup)",
  30: "30. **[F][HOLD]** Tips - tips_declared field removed in cleanup",
  31: "31. **[F][HOLD]** Mileage - mileage_miles field removed in cleanup",
  32: "32. **[F][HOLD]** Dept labor rate - rate field removed in cleanup",
  33: "33. **[F][HOLD]** Weather flag - weather_event field removed in cleanup",
  36: "36. **[F][HOLD]** Device fingerprint - device_key field removed in cleanup",
  75: "75. **[F][HOLD]** Rest distinction - needs rest-location field",
  81: "81. **[F][HOLD]** Earnings estimate - needs hourly-rate field",
  173: "173. **[F][HOLD]** Terminated lockout - needs an employee-status field",
  176: "176. **[F][HOLD]** Nickname - profile fields removed in cleanup",
  177: "177. **[F][HOLD]** Birthday - profile fields removed in cleanup",
  178: "178. **[F][HOLD]** Hire date - profile fields removed in cleanup",
  179: "179. **[F][HOLD]** Emergency contact - profile fields removed in cleanup",
  180: "180. **[F][HOLD]** Custom notes - profile fields removed in cleanup",
  212: "212. **[F][HOLD]** Mileage/expense - fields removed in cleanup",
  218: "218. **[F][HOLD]** Union tracking - union_local field removed in cleanup",
  219: "219. **[F][HOLD]** Per-diem - field removed in cleanup",
  220: "220. **[F][HOLD]** Certified payroll - fields removed in cleanup",
  221: "221. **[F][HOLD]** Union reporting - field removed in cleanup",
  229: "229. **[F][HOLD]** Printer auto-print - hardware integration needed",
  230: "230. **[F][HOLD]** Label printing - hardware integration needed",
  231: "231. **[F][HOLD]** Remote restart - kiosk OS control, not software",
  232: "232. **[F][HOLD]** Firmware pin - kiosk OS control, not software",
  233: "233. **[F][HOLD]** Cellular failover - hardware/OS feature",
  234: "234. **[F][HOLD]** UPS battery - hardware telemetry",
  235: "235. **[F][DONE]** Boot banner - last-action banner on kiosk idle",
};
for (const [n, line] of Object.entries(holds)) s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
fs.writeFileSync(f, s);
console.log("marked");
