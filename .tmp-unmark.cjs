const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
// Items whose backend code was reverted - back to open [F].
const revert = {
  30: "30. **[F]** Tip declaration on clock-out for tipped roles",
  31: "31. **[F]** Mileage/drive-time capture on clock-out for field staff",
  33: "33. **[F]** Weather-event flag on punches (snow day audit trail)",
  36: "36. **[F]** Device fingerprint on every punch (which kiosk)",
  65: "65. **[F]** Paid-break daily cap with running tally on the kiosk",
  76: "76. **[F]** Overtime authorization prompt at clock-in when projected week >40h",
  129: "129. **[F]** Delegated approvers per crew/department",
  150: "150. **[F]** Break compliance report - missed/short lunches",
  151: "151. **[F]** Buddy-punch suspicion report",
  152: "152. **[F]** Cost-of-overtime weekly report",
  173: "173. **[F]** Terminated-employee auto-lockout verification",
  183: "183. **[F]** Device usage report (most-punched kiosks)",
  201: "201. **[F]** Punch fraud scoring per entry",
  203: "203. **[F]** Predictive overtime alerts 2 days out",
  212: "212. **[F]** Mileage/expense quick-entry on clock-out",
  218: "218. **[F]** Union-hour tracking per classification",
  226: "226. **[F]** Bulk import punches on migration",
  227: "227. **[F]** Per-employee full data export on request",
  18: "18. **[F]** Max shift length auto clock-out with manager notification",
  243: "243. **[F]** Per-company feature flag for experimental features",
  219: "219. **[F]** Per-diem auto-calculation on qualifying shifts",
  222: "222. **[F]** Shift differential auto-pay for evening/night",
  176: "176. **[F]** Employee nickname display preference",
  177: "177. **[F]** Birthday field on the employee profile",
  178: "178. **[F]** Hire date on the employee profile",
  179: "179. **[F]** Emergency contact on the employee profile",
  180: "180. **[F]** Custom notes field on the employee profile",
};
for (const [n, line] of Object.entries(revert)) s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
fs.writeFileSync(f, s);
console.log("unmarked");
