const fs = require('fs');
const p = 'src/components/timeclock/TimeTracker.jsx';
let t = fs.readFileSync(p, 'utf8');
const done = [];
function rep(name, oldS, newS) {
  if (!t.includes(oldS)) { console.log('MISS: ' + name); return; }
  t = t.replace(oldS, newS);
  done.push(name);
}

/* ---- A. Accent system: presets + hex -> derived palette ---- */
const accentsStart = t.indexOf('const ACCENTS = {');
const accentsEnd = t.indexOf('const FONTS = {');
if (accentsStart === -1 || accentsEnd === -1) { console.log('MISS: accents block'); process.exit(1); }
const newAccents = `// Named accent presets keyed to hex; custom hex colors flow through makeAccent.
const ACCENT_PRESETS = {
  indigo: "#6366f1", emerald: "#10b981", amber: "#f59e0b", violet: "#8b5cf6",
  rose: "#f43f5e", sky: "#0ea5e9", cyan: "#06b6d4", teal: "#14b8a6",
  lime: "#84cc16", orange: "#f97316", fuchsia: "#d946ef", slate: "#64748b",
  red: "#ef4444", pink: "#ec4899", purple: "#a855f7", blue: "#3b82f6",
  green: "#22c55e", yellow: "#eab308", mint: "#34d399", coral: "#fb7185",
  gold: "#ca8a04", navy: "#1e40af", plum: "#7e22ce", brick: "#b91c1c",
  seafoam: "#2dd4bf", lavender: "#a78bfa", peach: "#fdba74", charcoal: "#27272a",
};

function hexToHsl(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

function makeAccent(hex) {
  const [h, s, l] = hexToHsl(hex);
  const hsl = (hh, ss, ll) => \`hsl(\${hh} \${ss}% \${ll}%)\`;
  return {
    ring: hex,
    barStart: hsl(h, Math.max(20, s - 10), Math.min(78, l + 16)),
    barEnd: hsl(h, s, Math.max(26, l - 10)),
    soft: hsl(h, Math.max(28, s - 14), 94),
    softBorder: hsl(h, Math.max(18, s - 18), 78),
    text: hsl(h, Math.min(72, s), 24),
  };
}

export function resolveAccent(color) {
  const key = String(color || "indigo");
  const hex = ACCENT_PRESETS[key] || (/^#[0-9a-fA-F]{6}$/.test(key) ? key : ACCENT_PRESETS.indigo);
  return makeAccent(hex);
}
export { ACCENT_PRESETS };

`;
t = t.slice(0, accentsStart) + newAccents + t.slice(accentsEnd);
done.push('accents');

rep('fonts',
  `const FONTS = {
  default: "",
  mono: "font-mono",
  rounded: "tracking-wide",
  serif: "font-serif",
};`,
  `const FONTS = {
  default: "",
  mono: "font-mono",
  rounded: "tracking-wide",
  serif: "font-serif",
  light: "font-light tracking-wide",
  heavy: "font-black tracking-tight",
};

const ANIMATION_CLASSES = new Set([
  "pulse", "glow", "breathe", "sweep", "wave", "sparkle", "float",
  "flicker", "rainbow", "pop", "wobble", "ripple", "shake", "gradient",
]);`);

/* ---- B. reminders + weekly celebrate ---- */
rep('reminders effect',
`    const marks = Array.isArray(prefs?.alert_minutes) ? prefs.alert_minutes : [];
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
    if (next.length !== fired.length) writeMilestones(email, snapshot.company_day, next);`,
`    const source = Array.isArray(prefs?.reminders) && prefs.reminders.length ? prefs.reminders
      : (Array.isArray(prefs?.alert_minutes) ? prefs.alert_minutes : []);
    if (!source.length) return;
    const fired = readMilestones(email, snapshot.company_day);
    const next = [...fired];
    for (const r of source) {
      const minute = Number(typeof r === "object" && r !== null ? r.minutes : r);
      if (!Number.isFinite(minute) || minute <= 0) continue;
      const label = typeof r === "object" && r !== null ? String(r.label || "").trim() : "";
      const marker = 10000 + minute;
      if (displayMinutes >= minute && !next.includes(marker)) {
        next.push(marker);
        toast({ description: \`Time Tracker reminder: \${label || formatClock(minute, "hours_minutes") + " on the clock"}\` });
        if (prefs?.milestone_behavior === "toast_sound") playSoundEffect(prefs?.milestone_sound || "chime");
      }
    }
    if (next.length !== fired.length) writeMilestones(email, snapshot.company_day, next);`);

rep('weekly celebrate',
`    if (next.length !== fired.length || next.some((v, i) => v !== fired[i])) {
      writeMilestones(email, snapshot.company_day, next);
    }`,
`    if (prefs?.weekly_celebrate === true) {
      const weeklyGoal = Math.max(60, Number(prefs?.weekly_goal_minutes) || 2400);
      if (live.weekly >= weeklyGoal && !next.includes(2000)) {
        next.push(2000);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 2400);
        toast({ description: \`Time Tracker: weekly goal reached (\${formatClock(weeklyGoal, "hours_minutes")})\` });
        if (prefs?.milestone_behavior === "toast_sound") playSoundEffect(prefs?.milestone_sound || "chime");
      }
    }
    if (next.length !== fired.length || next.some((v, i) => v !== fired[i])) {
      writeMilestones(email, snapshot.company_day, next);
    }`);

/* ---- C. accent resolution + background class + anim mapping ---- */
rep('accent resolve',
  '  const accent = ACCENTS[prefs?.accent_color] || ACCENTS.indigo;',
  '  const accent = resolveAccent(prefs?.accent_color);');

rep('anim mapping',
`  const animClass = prefs?.animation_style === "pulse"
    ? (pulse ? "tracker-pulse" : "")
    : ["glow", "breathe", "sweep"].includes(prefs?.animation_style)
      ? \`tracker-\${prefs.animation_style}\`
      : "";`,
`  const animClass = prefs?.animation_style === "pulse"
    ? (pulse ? "tracker-pulse" : "")
    : ANIMATION_CLASSES.has(prefs?.animation_style)
      ? \`tracker-\${prefs.animation_style}\`
      : "";`);

rep('hasBubble -> bgClass',
  '  const hasBubble = prefs?.background_style === "glass" || prefs?.background_style === "solid";',
`  const bgStyle = String(prefs?.background_style || "minimal");
  const bgClass = bgStyle === "minimal"
    ? "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"
    : \`tracker-bg-\${bgStyle} rounded-2xl border\`;
  const accentVars = {
    "--tracker-accent": accent.ring,
    "--tracker-accent-soft": accent.soft,
    "--tracker-accent-text": accent.text,
  };`);

/* ---- D. trigger button: className + style vars ---- */
rep('button class + style',
`          className={\`tracker-pill group relative flex items-center gap-2.5 text-left outline-none transition-[transform,opacity] duration-200 focus-visible:ring-4 focus-visible:ring-indigo-300/60 \${hasBubble ? \`rounded-2xl border shadow-sm \${accent.pill} \${prefs?.background_style === "solid" ? "backdrop-blur-none" : "backdrop-blur-md"}\` : "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"} \${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} \${animFor("all")} \${prefs?.goal_celebrate !== false && clockedIn && progress >= 1 ? "tracker-celebrate" : ""}\`}
          style={{
            zoom: prefs?.scale || 1,
            opacity: prefs?.opacity ?? 1,
          }}`,
`          className={\`tracker-pill group relative flex items-center gap-2.5 text-left outline-none transition-[transform,opacity] duration-200 focus-visible:ring-4 focus-visible:ring-indigo-300/60 \${bgClass} \${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} \${animFor("all")} \${prefs?.goal_celebrate !== false && clockedIn && progress >= 1 ? "tracker-celebrate" : ""}\`}
          style={{
            zoom: prefs?.scale || 1,
            opacity: prefs?.opacity ?? 1,
            ...accentVars,
          }}`);

/* ---- E. display styles: ring -> ring/donut, arc, badge ---- */
rep('ring svg -> ring/donut/arc',
`          {prefs?.display_style !== "minimal" && prefs?.display_style !== "flip" && prefs?.display_style !== "bar" && prefs?.display_style !== "roll" && (
            <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className={\`shrink-0 \${animFor("ring")}\`} aria-hidden="true">
              <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="26" />
              <circle
                cx="120" cy="120" r="100" fill="none"
                stroke={ringColor}
                strokeWidth="26" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ringFraction)}
                transform="rotate(-90 120 120)"
                className={prefs?.animation_style === "none" ? "" : "transition-[stroke-dashoffset] duration-700 ease-out"}
              />
            </svg>
          )}`,
`          {(prefs?.display_style === "ring" || prefs?.display_style === "donut") && (
            <span className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
              <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className={animFor("ring")} aria-hidden="true">
                <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={prefs?.display_style === "donut" ? 40 : 26} />
                <circle
                  cx="120" cy="120" r="100" fill="none"
                  stroke={ringColor}
                  strokeWidth={prefs?.display_style === "donut" ? 40 : 26} strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - ringFraction)}
                  transform="rotate(-90 120 120)"
                  className={prefs?.animation_style === "none" ? "" : "transition-[stroke-dashoffset] duration-700 ease-out"}
                />
              </svg>
              {prefs?.display_style === "donut" && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none" style={{ color: ringColor }}>
                  {Math.round(Math.min(1, Math.max(0, ringFraction)) * 100)}%
                </span>
              )}
            </span>
          )}
          {prefs?.display_style === "arc" && (
            <svg viewBox="0 0 120 62" style={{ width: ringSize * 1.5, height: Math.round(ringSize * 0.78) }} className={\`shrink-0 \${animFor("ring")}\`} aria-hidden="true">
              <path d="M10 58 A50 50 0 0 1 110 58" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="11" strokeLinecap="round" />
              <path
                d="M10 58 A50 50 0 0 1 110 58" fill="none"
                stroke={ringColor} strokeWidth="11" strokeLinecap="round"
                strokeDasharray="157.1"
                strokeDashoffset={157.1 * (1 - ringFraction)}
                className={prefs?.animation_style === "none" ? "" : "transition-[stroke-dashoffset] duration-700 ease-out"}
              />
            </svg>
          )}`);

/* ---- F. badge style wraps the time text ---- */
rep('badge digits',
`              {trackerTime}
              {prefs?.show_percent === true && clockedIn && <span className={\`ml-1.5 font-semibold opacity-60 \${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}\`}>{Math.round(Math.min(1, progress) * 100)}%</span>}`,
`              {prefs?.display_style === "badge"
                ? <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: accent.ring }}>{trackerTime}</span>
                : trackerTime}
              {prefs?.show_percent === true && clockedIn && <span className={\`ml-1.5 font-semibold opacity-60 \${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}\`}>{Math.round(Math.min(1, progress) * 100)}%</span>}`);

/* ---- G. gradient bars -> inline styles (hex-safe) ---- */
rep('bar gradient popover',
`                <span
                  className={\`block h-full rounded-full bg-gradient-to-r \${accent.bar} \${prefs?.animation_style === "none" ? "" : "transition-[width] duration-700 ease-out"}\`}
                  style={{ width: \`\${Math.min(100, ringFraction * 100)}%\` }}
                />`,
`                <span
                  className={\`block h-full rounded-full \${prefs?.animation_style === "none" ? "" : "transition-[width] duration-700 ease-out"}\`}
                  style={{ width: \`\${Math.min(100, ringFraction * 100)}%\`, backgroundImage: \`linear-gradient(90deg, \${accent.barStart}, \${accent.barEnd})\` }}
                />`);

rep('week strip gradient',
`                            className={\`w-full rounded-md bg-gradient-to-t \${accent.bar} \${isToday ? "tracker-today-bar" : ""}\`}`,
`                            className={\`w-full rounded-md \${isToday ? "tracker-today-bar" : ""}\`}`);

rep('week strip gradient style',
`                            style={{ height: \`\${Math.max(4, fraction * 100)}%\` }}`,
`                            style={{ height: \`\${Math.max(4, fraction * 100)}%\`, backgroundImage: \`linear-gradient(180deg, \${accent.barStart}, \${accent.barEnd})\` }}`);

rep('milestone bar gradient',
`                  <div className={\`h-full rounded-full bg-gradient-to-r \${accent.bar}\`} style={{ width: \`\${Math.min(100, ringFraction * 100)}%\` }} />`,
`                  <div className="h-full rounded-full" style={{ width: \`\${Math.min(100, ringFraction * 100)}%\`, backgroundImage: \`linear-gradient(90deg, \${accent.barStart}, \${accent.barEnd})\` }} />`);

/* ---- H. preview mirrors everything ---- */
rep('preview accent',
`export function TimeTrackerPreview({ prefs }) {
  const accent = ACCENTS[prefs?.accent_color] || ACCENTS.indigo;
  const hasBubble = prefs?.background_style === "glass" || prefs?.background_style === "solid";`,
`export function TimeTrackerPreview({ prefs }) {
  const accent = resolveAccent(prefs?.accent_color);
  const pvStyle = String(prefs?.background_style || "minimal");
  const pvBg = pvStyle === "minimal"
    ? "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"
    : \`tracker-bg-\${pvStyle} rounded-2xl border\`;
  const pvVars = {
    "--tracker-accent": accent.ring,
    "--tracker-accent-soft": accent.soft,
    "--tracker-accent-text": accent.text,
  };`);

rep('preview anim map',
`  const animClass = prefs?.animation_style === "pulse"
    ? ""
    : ["glow", "breathe", "sweep"].includes(prefs?.animation_style)
      ? \`tracker-\${prefs.animation_style}\`
      : "";`,
`  const animClass = prefs?.animation_style === "pulse"
    ? "tracker-pulse"
    : ANIMATION_CLASSES.has(prefs?.animation_style)
      ? \`tracker-\${prefs.animation_style}\`
      : "";`);

rep('preview button',
`      className={\`tracker-pill group relative flex items-center gap-2.5 text-left outline-none pointer-events-none \${hasBubble ? \`rounded-2xl border shadow-sm \${accent.pill} \${prefs?.background_style === "solid" ? "backdrop-blur-none" : "backdrop-blur-md"}\` : "border-transparent bg-transparent shadow-none text-slate-900 dark:text-slate-100"} \${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} \${animFor("all")}\`}
      style={{ zoom: prefs?.scale || 1, opacity: prefs?.opacity ?? 1 }}`,
`      className={\`tracker-pill group relative flex items-center gap-2.5 text-left outline-none pointer-events-none \${pvBg} \${prefs?.size === "expanded" ? "px-2 py-1" : "px-1.5 py-0.5"} \${animFor("all")}\`}
      style={{ zoom: prefs?.scale || 1, opacity: prefs?.opacity ?? 1, ...pvVars }}`);

rep('preview ring -> ring/donut/arc',
`      {prefs?.display_style !== "minimal" && prefs?.display_style !== "flip" && prefs?.display_style !== "bar" && (
        <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className={\`shrink-0 \${animFor("ring")}\`}>
          <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="26" />
          <circle cx="120" cy="120" r="100" fill="none" stroke={ringColor} strokeWidth="26" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringFraction)} transform="rotate(-90 120 120)" />
        </svg>
      )}`,
`      {(prefs?.display_style === "ring" || prefs?.display_style === "donut") && (
        <span className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
          <svg viewBox="0 0 240 240" style={{ width: ringSize, height: ringSize }} className={animFor("ring")}>
            <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={prefs?.display_style === "donut" ? 40 : 26} />
            <circle cx="120" cy="120" r="100" fill="none" stroke={ringColor} strokeWidth={prefs?.display_style === "donut" ? 40 : 26} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringFraction)} transform="rotate(-90 120 120)" />
          </svg>
          {prefs?.display_style === "donut" && (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none" style={{ color: ringColor }}>63%</span>
          )}
        </span>
      )}
      {prefs?.display_style === "arc" && (
        <svg viewBox="0 0 120 62" style={{ width: ringSize * 1.5, height: Math.round(ringSize * 0.78) }} className={\`shrink-0 \${animFor("ring")}\`}>
          <path d="M10 58 A50 50 0 0 1 110 58" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="11" strokeLinecap="round" />
          <path d="M10 58 A50 50 0 0 1 110 58" fill="none" stroke={ringColor} strokeWidth="11" strokeLinecap="round" strokeDasharray="157.1" strokeDashoffset={157.1 * (1 - ringFraction)} />
        </svg>
      )}`);

rep('preview time text badge',
`          {timeText}
          {prefs?.show_percent === true && <span className={\`ml-1.5 font-semibold opacity-60 \${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}\`}>63%</span>}`,
`          {prefs?.display_style === "badge"
            ? <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: accent.ring }}>{timeText}</span>
            : timeText}
          {prefs?.show_percent === true && <span className={\`ml-1.5 font-semibold opacity-60 \${prefs?.size === "expanded" ? "text-[10px]" : "text-[9px]"}\`}>63%</span>}`);

rep('preview bar gradient',
`            <span className={\`block h-full rounded-full bg-gradient-to-r \${accent.bar}\`} style={{ width: "63%" }} />`,
`            <span className="block h-full rounded-full" style={{ width: "63%", backgroundImage: \`linear-gradient(90deg, \${accent.barStart}, \${accent.barEnd})\` }} />`);

// Preview custom label parity
rep('preview custom label',
  '  const label = prefs?.direction === "down" ? "Remaining" : "Today";',
  '  const label = String(prefs?.custom_label || "").trim() || (prefs?.direction === "down" ? "Remaining" : "Today");');

fs.writeFileSync(p, t);
console.log('applied: ' + done.join(', '));
