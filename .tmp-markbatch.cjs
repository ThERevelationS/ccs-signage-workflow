const fs = require("fs");
const f = "TIMECLOCK_BACKLOG.md";
let s = fs.readFileSync(f, "utf8");
const marks = {
  2: "2. **[F][DONE]** Face descriptor pre-fetch - roster descriptors load while camera starts",
  19: "19. **[F][DONE]** Break compliance - missed/short lunch flag exists (breakCompliance)",
  27: "27. **[F][DONE]** Job-site transfer - labor switch moves mid-shift between work orders",
  28: "28. **[F][DONE]** Split-shift - clock out + clock back in resumes naturally",
  48: "48. **[F][DONE]** Weather/alert banner - announcements system covers alert banners",
  52: "52. **[F][DONE]** Camera mirror toggle - per-device ccs_kiosk_camera_mirror",
  6: "6. **[F][HOLD]** Second USB camera - browser/hardware limited",
  229: "229. **[F][HOLD]** Printer receipt - thermal printer hardware",
  230: "230. **[F][HOLD]** Label printer - hardware integration",
  231: "231. **[F][HOLD]** Camera health dashboard - hardware telemetry",
  232: "232. **[F][HOLD]** Remote kiosk restart - needs device agent",
  233: "233. **[F][HOLD]** Version pin/rollout - needs device agent",
  234: "234. **[F][HOLD]** Cellular failover - hardware monitoring",
};
for (const [n, line] of Object.entries(marks)) {
  s = s.replace(new RegExp("^" + n + "\\..*$", "m"), line);
}
fs.writeFileSync(f, s);
console.log("marked");
