const fs = require('fs');
const p = 'src/components/timeclock/TimeTracker.jsx';
let t = fs.readFileSync(p, 'utf8');
const rep = (a, b) => { if (!t.includes(a)) { console.log('MISS: ' + a.slice(0, 70)); return; } t = t.replace(a, b); };

rep('import { base44 } from "@/api/base44Client";',
  'import { base44 } from "@/api/base44Client";\nimport { useLocation } from "react-router-dom";');

rep('const { currentUser, sessionToken } = useAuth();',
  'const { currentUser, sessionToken } = useAuth();\n  const location = useLocation();\n  const onTimeClock = String(location?.pathname || "").toLowerCase().includes("timeclock");\n  const [focused, setFocused] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");');

rep('const matchesPref = locationPref === "both"',
  'useEffect(() => {\n    const mark = () => setFocused(document.visibilityState === "visible");\n    document.addEventListener("visibilitychange", mark);\n    window.addEventListener("blur", mark);\n    window.addEventListener("focus", mark);\n    return () => { document.removeEventListener("visibilitychange", mark); window.removeEventListener("blur", mark); window.removeEventListener("focus", mark); };\n  }, []);\n\n  const matchesPref = locationPref === "both"');

rep('const visibleHere = enabled && locationPref !== "hidden" &&\n    !(prefs?.show_only_clocked_in === true && snapshot?.status !== "clocked_in") &&',
  'const visibleHere = enabled && locationPref !== "hidden" &&\n    !(prefs?.show_only_clocked_in === true && snapshot?.status !== "clocked_in") &&\n    !(prefs?.hide_when_unfocused === true && !focused) &&\n    !(prefs?.timeclock_page_only === true && !onTimeClock) &&');

// roll display style: exclude ring, give digits the roll class + ticking key
rep('prefs?.display_style !== "flip" && prefs?.display_style !== "bar"',
  'prefs?.display_style !== "flip" && prefs?.display_style !== "bar" && prefs?.display_style !== "roll"');
rep('prefs?.display_style === "flip" ? "tracker-flip" : ""}',
  'prefs?.display_style === "flip" ? "tracker-flip" : prefs?.display_style === "roll" ? "tracker-roll" : ""}');
rep('key={prefs?.display_style === "flip" ? formatClockSeconds(shown, "hh_mm_ss") : "digits"}',
  'key={["flip","roll"].includes(prefs?.display_style) ? formatClockSeconds(shown, "hh_mm_ss") : "digits"}');

// goal celebration on the whole trigger
rep('${animFor("all")}`}',
  '${animFor("all")} ${prefs?.goal_celebrate !== false && clockedIn && progress >= 1 ? "tracker-celebrate" : ""}`}');

fs.writeFileSync(p, t);
console.log('done');
