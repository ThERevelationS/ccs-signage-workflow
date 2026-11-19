const { spawnSync } = require("child_process");
const fs = require("fs");
const CLI = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const path = "src/components/timeclock/TimeTracker.jsx";

// Pull remote, diff against local, and apply the missing pieces as edits.
const read = spawnSync("node", [CLI, "sandbox", "read", path,
  "--app-id", "68dfcc5e57bbbc35387da97c", "--branch", "main", "--json"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 90000 });
const remote = JSON.parse(read.stdout).files[0].content.replace(/\r\n/g, "\n");
const local = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const edits = [];
const want = [
  // local-side anchor -> replacement to add tranche-2 pieces
  {
    old_text: "      weekly: Number(snapshot.weekly_paid_minutes || 0) + (accruingPaid ? sinceReceipt : 0),\n      frozen:",
    new_text: "      weekly: Number(snapshot.weekly_paid_minutes || 0) + (accruingPaid ? sinceReceipt : 0),\n      unpaidNow: Number(snapshot.live_unpaid_minutes || 0) + (accruingElapsed && !accruingPaid ? sinceReceipt : 0),\n      frozen:",
  },
  {
    old_text: "  const weeklyDaily = Array.isArray(snapshot?.weekly_daily_minutes) ? snapshot.weekly_daily_minutes : [];\n  const weekGoal = Math.max(60, Number(prefs?.weekly_goal_minutes) || 2400);",
    new_text: "  const weeklyDaily = Array.isArray(snapshot?.weekly_daily_minutes) ? snapshot.weekly_daily_minutes : [];\n  const weekGoal = Math.max(60, Number(prefs?.weekly_goal_minutes) || 2400);\n\n  // Goal streak: consecutive days at/above the daily goal, ending today.\n  const goalStreak = useMemo(() => {\n    if (weeklyDaily.length !== 7) return 0;\n    let streak = 0;\n    for (let i = weeklyDaily.length - 1; i >= 0; i -= 1) {\n      const minutes = i === todayIndex && live ? live.paid : Number(weeklyDaily[i] || 0);\n      if (minutes >= goalMinutes) streak += 1;\n      else break;\n    }\n    return streak;\n  }, [weeklyDaily, live, goalMinutes, todayIndex]);\n\n  // Yesterday's total for context, and the trailing average for pace compare.\n  const yesterdayMinutes = todayIndex > 0 ? Number(weeklyDaily[todayIndex - 1] || 0) : null;\n  const weekAvgMinutes = useMemo(() => {\n    const days = weeklyDaily.map(Number).filter((m, i) => i < todayIndex && m > 0);\n    return days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;\n  }, [weeklyDaily, todayIndex]);",
  },
  {
    old_text: '<span>This week</span>\n                  <span>{formatClock(live?.weekly || 0, "hours_minutes")} / {formatClock(weekGoal, "hours_minutes")}</span>',
    new_text: '<span>This week{yesterdayMinutes !== null ? ` - yesterday ${formatClock(yesterdayMinutes, "hours_minutes")}` : ""}{weekAvgMinutes ? ` - avg ${formatClock(weekAvgMinutes, "hours_minutes")}/day` : ""}</span>\n                  <span>{formatClock(live?.weekly || 0, "hours_minutes")} / {formatClock(weekGoal, "hours_minutes")}</span>',
  },
  {
    old_text: 'style={{ height: `${Math.max(4, fraction * 100)}%`, backgroundImage: `linear-gradient(180deg, ${accent.barStart}, ${accent.barEnd})` }}',
    new_text: 'style={{\n                              height: `${Math.max(4, fraction * 100)}%`,\n                              backgroundImage: fraction >= 1\n                                ? "linear-gradient(180deg, #34d399, #059669)"\n                                : `linear-gradient(180deg, ${accent.barStart}, ${accent.barEnd})`,\n                              opacity: fraction < 0.5 && !isToday ? 0.45 : 1,\n                            }}',
  },
  {
    old_text: '                    {formatMinutes(Math.ceil(nextMilestone.remaining))} to {formatClock(nextMilestone.target, prefs?.time_format)}\n                  </p>\n                )}',
    new_text: '                    {formatMinutes(Math.ceil(nextMilestone.remaining))} to {formatClock(nextMilestone.target, prefs?.time_format)}\n                  </p>\n                )}\n                {goalStreak >= 2 && (\n                  <p className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">\n                    {goalStreak}-day goal streak\n                  </p>\n                )}',
  },
];

for (const e of want) {
  if (local.includes(e.new_text) && !remote.includes(e.new_text)) {
    if (!remote.includes(e.old_text)) {
      console.log("ANCHOR-MISS", JSON.stringify(e.old_text.slice(0, 60)));
      process.exitCode = 1;
    } else {
      edits.push(e);
    }
  }
}
if (local === remote) { console.log("remote already current"); process.exit(0); }
if (!edits.length) { console.log("nothing to apply"); process.exit(0); }
const res = spawnSync("node", [CLI, "sandbox", "edit", path,
  "--app-id", "68dfcc5e57bbbc35387da97c", "--branch", "main", "--json"],
  { input: JSON.stringify(edits), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
const out = (res.stdout || "") + (res.stderr || "");
console.log(res.status === 0 && !/"error"/.test(out) ? "EDITED " + edits.length + " hunks" : "FAIL\n" + out.slice(-600));
