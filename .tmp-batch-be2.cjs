const fs = require("fs");
const f = "base44/functions/timeClockAction/entry.ts";
let s = fs.readFileSync(f, "utf8");
let applied = 0;

// payroll_export: add differential_hours + per_diem + audit columns
const rowMap = "        entries: r.entries,\n        cost_code: [...r.cost_codes].join(', '),";
if (s.includes(rowMap) && !s.includes("differential_hours:")) {
  s = s.replace(rowMap, `        entries: r.entries,
        differential_hours: (() => { const e = included.find((x: any) => asEmail(x.user_email) === r.user_email && dateKeyInCompanyTime(x.clock_in) === r.date); if (!e?.clock_in || !e?.clock_out) return 0; const ci = new Date(e.clock_in), co = new Date(e.clock_out); const diff = new Date(ci); diff.setHours(18, 0, 0, 0); return co > diff ? Math.round(((co.getTime() - Math.max(diff.getTime(), ci.getTime())) / 3600000) * 100) / 100 : 0; })(),
        per_diem_eligible: r.total_hours >= 10,
        minor_flag: false,
` + "        cost_code: [...r.cost_codes].join(', '),");
  applied += 1;
}

// Lockout check: verify_session/status paths should already check is_active -
// confirm by looking for it; if absent, mark for manual wiring.
const lockout = s.includes("is_active") && s.includes("terminated");
console.log("lockout-check-present:" + lockout);

fs.writeFileSync(f, s);
console.log("applied " + applied);
