const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const m = {
  151: "151. **[F][DONE]** Buddy-punch report - buddy_punch_report same-device <2min pairs",
  187: "187. **[F][DONE]** Session rotation alerts - session_audit_alerts revoke/rotate/lockout events",
  226: "226. **[F][DONE]** Bulk import - bulk_import_entries admin action",
  227: "227. **[F][DONE]** Employee data export - my_data_export action",
  18: "18. **[F][DONE]** Max shift auto clock-out - auto_clockout_sweep lists stale opens",
  181: "181. **[F][DONE]** Fleet health - device registry + last_seen offline dots",
  182: "182. **[F][DONE]** Per-kiosk config - kiosk_config push methods/quiet/wallpaper",
  148: "148. **[F][DONE]** Missing-punch digest - manager_digest announcement mode",
  185: "185. **[F][DONE]** Conflict resolver - list_pending_requests surfaces in-flight actions",
};
for (const [n, line] of Object.entries(m)) s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
fs.writeFileSync(f, s);
console.log("marked");
