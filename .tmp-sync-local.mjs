// Pulls remote Base44 copies into the local checkout for files this session
// touched remotely. Skips files the user edits concurrently elsewhere.
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const RUN = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const APP = "68dfcc5e57bbbc35387da97c";
const PATHS = [
  "src/components/timeclock/QuickClockSection.jsx",
  "src/components/timeclock/ClockOutDialog.jsx",
  "src/components/timeclock/GlobalWorkPauseControl.jsx",
  "src/components/timeclock/WorkPauseMenu.jsx",
  "src/components/timeclock/MissedClockInDialog.jsx",
  "src/components/timeclock/TimeTracker.jsx",
  "src/components/timeclock/TimeTrackerSettings.jsx",
  "src/components/timeclock/UserSettingsTab.jsx",
  "src/Layout.jsx",
  "src/index.css",
  "src/components/auth/LoginGate.jsx",
  "src/components/auth/EmailGate.jsx",
  "src/components/announcements/AnnouncementContext.jsx",
  "src/components/announcements/AnnouncementBanner.jsx",
  "src/components/announcements/AnnouncementManager.jsx",
  "src/components/announcements/announcementPersistence.js",
  "base44/functions/timeClockAction/entry.ts",
  "base44/functions/manageAnnouncements/entry.ts",
  "base44/entities/Announcement.jsonc",
  "base44/entities/TimeClockAudit.jsonc",
  "base44/entities/TimeClockWorkPause.jsonc",
  "base44/entities/TimeClockEmployeePreference.jsonc",
  "scripts/validate-timeclock-quickclock-status-ui.mjs",
  "scripts/validate-timeclock-read-scope-fencing.mjs",
  "scripts/validate-timeclock-request-fencing.mjs",
  "scripts/validate-timeclock-session-load-fencing.mjs",
  "scripts/validate-timeclock-work-pause-overlay-ui.mjs",
  "scripts/validate-timeclock-credential-fencing.mjs",
  "scripts/validate-timeclock-employee-today-card.mjs",
  "scripts/validate-timeclock-face-scan.mjs",
  "scripts/validate-timeclock-global-pause-event-ui.mjs",
  "scripts/validate-timeclock-pay-period-recovery.mjs",
];

for (const p of PATHS) {
  const res = spawnSync(process.execPath, [RUN, "api", "fetch", "GET",
    `/api/apps/${APP}/code/content?path=${encodeURIComponent(p)}`,
  ], { encoding: "utf8", timeout: 120000 });
  let content = null;
  try { content = JSON.parse(res.stdout).content; } catch {}
  if (typeof content !== "string" || !content) {
    console.log(`SKIP ${p}: fetch failed`);
    continue;
  }
  const local = existsSync(p) ? readFileSync(p, "utf8") : null;
  if (local === content) { console.log(`SAME ${p}`); continue; }
  writeFileSync(p, content);
  console.log(`SYNCED ${p} (${content.length} bytes)`);
}
