const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const m = {
  35: "35. **[F][DONE]** GPS mismatch - punch_velocity_scan flags impossible travel",
  37: "37. **[F][DONE]** Punch velocity - geo scan flags >100km/h sustained",
  150: "150. **[F][DONE]** Break compliance report - break_compliance_report missed lunches",
  183: "183. **[F][DONE]** Device usage - device_usage_report punches per kiosk",
  189: "189. **[F][DONE]** Punch rate-limit - device_rate_limit_check bursts per device",
  190: "190. **[F][DONE]** Suspicious login - suspicious_login_scan audit heuristic",
  201: "201. **[F][DONE]** Punch fraud scoring - punch_fraud_scan composite heuristic",
  202: "202. **[F][DONE]** Staffing rec - staffing_recommendation scheduled vs clocked",
  214: "214. **[F][DONE]** Crew view - department-scoped who-is-in action",
  243: "243. **[F][DONE]** Feature flag - GlobalSettings timeclockFeatures read",
  67: "67. **[F][DONE]** Pause analytics - pause_reason_rollup by reason",
};
for (const [n, line] of Object.entries(m)) s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
fs.writeFileSync(f, s);
console.log("marked");
