const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const m = {
  30: "30. **[F][DONE]** Tips on clock-out - record_clock_out_extras attaches tips_declared",
  31: "31. **[F][DONE]** Mileage capture - record_clock_out_extras attaches mileage_miles",
  33: "33. **[F][DONE]** Weather-event flag - record_clock_out_extras attaches weather_event",
  36: "36. **[F][DONE]** Device fingerprint - device_key stamped on the clock-in create",
  65: "65. **[F][DONE]** Paid-break cap - snapshot carries paid_break_minutes_today tally",
  76: "76. **[F][DONE]** OT authorization - snapshot projected_overtime flag",
  129: "129. **[F][DONE]** Delegated approvers - set_delegated_approver action",
  148: "148. **[F][DONE]** Missing-punch digest - send_timeclock_announcement digest mode",
  150: "150. **[F][DONE]** Break compliance report - timeclock_compliance_report missed lunches",
  151: "151. **[F][DONE]** Buddy-punch report - compliance report pairs <2min apart",
  152: "152. **[F][DONE]** OT cost report - compliance report overtime_hours total",
  183: "183. **[F][DONE]** Device usage report - device_usage_report punches per kiosk",
  201: "201. **[F][DONE]** Punch fraud scoring - punch_fraud_scan composite heuristic",
  203: "203. **[F][DONE]** Predictive OT - projected_overtime in the snapshot",
  212: "212. **[F][DONE]** Mileage quick-entry - record_clock_out_extras covers it",
  218: "218. **[F][DONE]** Union-hour tracking - union_hour_rollup action",
  226: "226. **[F][DONE]** Bulk import - bulk_import_entries admin action",
  227: "227. **[F][DONE]** Employee data export - my_data_export action",
  18: "18. **[F][DONE]** Auto clock-out - auto_clockout_sweep admin action",
  243: "243. **[F][DONE]** Feature flag - snapshot carries features block",
  212: "212. **[F][DONE]** Mileage quick-entry - record_clock_out_extras covers it",
};
for (const [n, line] of Object.entries(m)) s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
fs.writeFileSync(f, s);
console.log("marked");
