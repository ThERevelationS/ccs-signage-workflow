const fs = require("fs");
const f = "base44/entities/TimeClockShiftTemplate.jsonc";
const j = JSON.parse(fs.readFileSync(f, "utf8"));
const rls = { user_condition: { role: "timeclock_backend_only" } };
j.rls = { create: rls, read: rls, update: rls, delete: rls };
fs.writeFileSync(f, JSON.stringify(j, null, 2));
console.log("fixed");
