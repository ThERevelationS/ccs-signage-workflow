const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
// Schema fields were removed in the cleanup pass - these are open again.
const revert = {
  216: "216. **[F]** Payroll export - reg/OT split per employee/day (backend export exists; certified columns reverted)",
  220: "220. **[F]** Certified payroll - certified_payroll/union_local fields (reverted in cleanup)",
  221: "221. **[F]** Union reporting - union_local field (reverted in cleanup)",
  219: "219. **[F]** Per-diem auto-calculation on qualifying shifts",
  222: "222. **[F]** Shift differential auto-pay for evening/night",
};
for (const [n, line] of Object.entries(revert)) s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
fs.writeFileSync(f, s);
console.log("done");
