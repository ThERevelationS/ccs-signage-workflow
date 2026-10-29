const fs = require('fs');
const rep = (t, a, b, name) => { if (!t.includes(a)) { console.log('MISS ' + name + ': ' + a.slice(0, 60)); return t; } return t.replace(a, b); };

// ---------- backend ----------
let be = fs.readFileSync('base44/functions/timeClockAction/entry.ts', 'utf8');
be = rep(be,
  "  animation_target: ['all', 'digits', 'ring', 'icon'],",
  "  animation_target: ['all', 'digits', 'ring', 'icon'],\n  device_scope: ['all', 'desktop_only', 'mobile_only'],",
  'enum');
be = rep(be,
  "'animation_style', 'animation_target', 'time_format'];",
  "'animation_style', 'animation_target', 'time_format', 'device_scope', 'custom_label', 'alert_minutes'];",
  'editable');
be = rep(be,
  "    goal_celebrate: true,\n  };\n}",
  "    goal_celebrate: true,\n    device_scope: 'all',\n    custom_label: '',\n    alert_minutes: [],\n  };\n}",
  'defaults');
be = rep(be,
  "  if (!out.milestone_thresholds.length) out.milestone_thresholds = [...base.milestone_thresholds];\n  return out;",
  `  if (!out.milestone_thresholds.length) out.milestone_thresholds = [...base.milestone_thresholds];
  out.custom_label = String(row.custom_label || '').slice(0, 24).trim();
  out.alert_minutes = (Array.isArray(row.alert_minutes) ? row.alert_minutes : [])
    .map((m: any) => Math.round(Number(m)))
    .filter((m: number) => Number.isFinite(m) && m > 0 && m <= 1440)
    .slice(0, 6);
  return out;`,
  'normalize');
fs.writeFileSync('base44/functions/timeClockAction/entry.ts', be);

// ---------- component ----------
let c = fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8');
c = rep(c,
  'import { useLocation } from "react-router-dom";',
  'import { useLocation, useNavigate } from "react-router-dom";',
  'import');
c = rep(c,
  'const [focused, setFocused] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");',
  `const [focused, setFocused] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const navigate = useNavigate();
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 767px)").matches
      : false);`,
  'state');
c = rep(c,
  'window.addEventListener("blur", mark); window.addEventListener("focus", mark);\n    return () => { document.removeEventListener("visibilitychange", mark); window.removeEventListener("blur", mark); window.removeEventListener("focus", mark); };\n  }, []);',
  `window.addEventListener("blur", mark); window.addEventListener("focus", mark);
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 767px)") : null;
    const onMq = (event) => setIsMobileView(event.matches);
    mq?.addEventListener?.("change", onMq);
    return () => { document.removeEventListener("visibilitychange", mark); window.removeEventListener("blur", mark); window.removeEventListener("focus", mark); mq?.removeEventListener?.("change", onMq); };
  }, []);`,
  'mq-effect');
c = rep(c,
  '!(prefs?.timeclock_page_only === true && !onTimeClock) &&',
  `!(prefs?.timeclock_page_only === true && !onTimeClock) &&
    !(prefs?.device_scope === "desktop_only" && isMobileView) &&
    !(prefs?.device_scope === "mobile_only" && !isMobileView) &&`,
  'device-gate');
c = rep(c,
  `const trackerLabel = clockedIn
    ? (prefs?.direction === "down" && !overtime ? "Remaining" : "Today")
    : "";`,
  `const trackerLabel = clockedIn
    ? (String(prefs?.custom_label || "").trim() || (prefs?.direction === "down" && !overtime ? "Remaining" : "Today"))
    : "";`,
  'label');
// time-based reminders: fire a toast once per alert minute crossed
c = rep(c,
  '  // Location gate: hidden everywhere, or restricted to a bar.',
  `  // Time-of-day reminders: one toast per configured elapsed-minute mark.
  useEffect(() => {
    if (!enabled || !live || !snapshot?.company_day) return;
    const marks = Array.isArray(prefs?.alert_minutes) ? prefs.alert_minutes : [];
    if (!marks.length) return;
    const fired = readMilestones(email, snapshot.company_day);
    const next = [...fired];
    for (const m of marks) {
      const minute = Number(m);
      if (!Number.isFinite(minute) || minute <= 0) continue;
      const marker = 10000 + minute;
      if (displayMinutes >= minute && !next.includes(marker)) {
        next.push(marker);
        toast({ description: \`Time Tracker reminder: \${formatClock(minute, "hours_minutes")} on the clock\` });
        if (prefs?.milestone_behavior === "toast_sound") playSoundEffect(prefs?.milestone_sound || "chime");
      }
    }
    if (next.length !== fired.length) writeMilestones(email, snapshot.company_day, next);
  }, [enabled, live, displayMinutes, prefs, email, snapshot?.company_day, toast]);

  // Location gate: hidden everywhere, or restricted to a bar.`,
  'alert-effect');
// quick link in popover
c = rep(c,
  '<p className="mt-3 text-[10px] leading-relaxed text-slate-400">',
  `<button
              type="button"
              onClick={() => navigate("/TimeClock")}
              className="mt-3 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Open Time Clock
            </button>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">`,
  'quicklink');
fs.writeFileSync('src/components/timeclock/TimeTracker.jsx', c);

// ---------- settings ----------
let s = fs.readFileSync('src/components/timeclock/TimeTrackerSettings.jsx', 'utf8');
s = rep(s,
  '  goal_celebrate: true,',
  '  goal_celebrate: true,\n  device_scope: "all",\n  custom_label: "",\n  alert_minutes: [],',
  'defaults');
s = rep(s,
  '<div>\n              <Label className="text-xs font-semibold">Animate</Label>',
  `<div>
              <Label className="text-xs font-semibold">Show on</Label>
              <Select value={p.device_scope} onValueChange={set("device_scope")} disabled={saving}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  <SelectItem value="desktop_only">Desktop only</SelectItem>
                  <SelectItem value="mobile_only">Mobile only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Animate</Label>`,
  'device-select');
s = rep(s,
  '{/* Placement + sizing */}',
  `{/* Label + reminders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Custom label</Label>
              <Input
                value={p.custom_label || ""}
                onChange={(e) => update("custom_label", e.target.value.slice(0, 24))}
                placeholder='e.g. "On the clock"'
                className="mt-1"
                disabled={saving}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Reminders (minutes on clock)</Label>
              <Input
                value={(p.alert_minutes || []).join(", ")}
                onChange={(e) => update("alert_minutes", e.target.value.split(",").map((v) => parseFloat(v.trim())).filter((v) => Number.isFinite(v) && v > 0).slice(0, 6))}
                placeholder="e.g. 240, 480"
                className="mt-1"
                disabled={saving}
              />
            </div>
          </div>

          {/* Placement + sizing */}`,
  'inputs');
fs.writeFileSync('src/components/timeclock/TimeTrackerSettings.jsx', s);

require('esbuild').transformSync(fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8'), { loader: 'jsx' });
require('esbuild').transformSync(s, { loader: 'jsx' });
require('esbuild').transformSync(be, { loader: 'ts' });
console.log('all ok');
